/*
 Copyright (C) 2015 3NSoft Inc.
 
 This program is free software: you can redistribute it and/or modify it under
 the terms of the GNU General Public License as published by the Free Software
 Foundation, either version 3 of the License, or (at your option) any later
 version.
 
 This program is distributed in the hope that it will be useful, but
 WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 See the GNU General Public License for more details.
 
 You should have received a copy of the GNU General Public License along with
 this program. If not, see <http://www.gnu.org/licenses/>. */

/**
 * Inbox files are laid out on disk in the following way:
 * (a) store is just a folder with stuff inside;
 * (b) main store folder contains following folders:
 * (b.1) messages - is a folder for message folders,
 * (b.2) delivery - is a folder for messages, that are in a process of
 *                  being delivered; complete messages are moved to
 *                  'messages' folder.
 * (b.3) info - is a place for information files about this storage;
 * (c) message folder's name is message's id
 * (d) message folder contains file 'meta' with plain-text JSON-form metadata
 *     for this particular message.
 * (e) message folder contains folder 'objects' with all object files, that
 *     are part of this particular message.
 */

import Q = require('q');
import fs = require('fs');
import stream = require('stream');
import ChildProcMod = require('child_process')
var exec = ChildProcMod.exec;
import base64 = require('../../lib-common/base64');
import fErrMod = require('../../lib-common/file-err');
import jwk = require('../../lib-common/jwkeys');
import random = require('../../lib-server/random');
import fops = require('../../lib-server/resources/file_ops');
import confUtil = require('../../lib-server/conf-util');
import deliveryApi = require('../../lib-common/service-api/asmail/delivery');
import configApi = require('../../lib-common/service-api/asmail/config');
import retrievalApi = require('../../lib-common/service-api/asmail/retrieval');

interface AnonSenderPolicy extends configApi.p.anonSenderPolicy.Policy {}
interface AuthSenderPolicy extends configApi.p.authSenderPolicy.Policy {}
interface Whitelist extends configApi.p.authSenderWhitelist.List {} 
interface Blacklist extends configApi.p.authSenderBlacklist.List {} 
interface AuthSenderInvites extends configApi.p.authSenderInvites.List {}
interface AnonSenderInvites extends configApi.p.anonSenderInvites.List {}

export var SC = {
	OBJ_EXIST: 'obj-already-exist',
	USER_UNKNOWN: 'user-unknown',
	MSG_UNKNOWN: 'msg-unknown',
	OBJ_UNKNOWN: 'obj-unknown',
	WRITE_OVERFLOW: 'write-overflow'
};
Object.freeze(SC);

var DEFAULT_FILE_WRITE_BUFFER_SIZE = 4*1024;
var DEFAULT_FILE_READ_BUFFER_SIZE = 64*1024;

var XSP_HEADER_FILE_NAME_END = '.hxsp';
var XSP_SEGS_FILE_NAME_END = '.sxsp';

interface MsgObjSizes {
	[objId: string]: {
		segments: number;
		header: number;
	};
}

export interface ObjReader {
	len: number;
	pipeTo: (sink: stream.Writable) => Q.Promise<void>;
}

export class Inbox {
	
	userId: string;
	path: string;
	fileWritingBufferSize: number;
	fileReadingBufferSize: number;
	
	constructor(userId: string, inboxPath: string,
			writeBufferSize: string|number, readBufferSize: string|number) {
		this.userId = userId;
		this.path = inboxPath;
		this.fileWritingBufferSize = (writeBufferSize ?
			confUtil.stringToNumOfBytes(writeBufferSize) :
			DEFAULT_FILE_WRITE_BUFFER_SIZE);
		this.fileReadingBufferSize = (readBufferSize ?
			confUtil.stringToNumOfBytes(readBufferSize) :
			DEFAULT_FILE_READ_BUFFER_SIZE);
		Object.freeze(this);
	}

	/**
	 * Creates on a disk a directory and file structure for a given inbox object.
	 * It returns a promise, resolvable, when inbox store's disk structure has
	 * been constructed.
	 */
	static initInbox(inbox: Inbox): Q.Promise<void> {
		var promise = Q.all(
				[ Q.nfcall(fs.mkdir, inbox.path+'/messages'),
				  Q.nfcall(fs.mkdir, inbox.path+'/delivery'),
				  Q.nfcall(fs.mkdir, inbox.path+'/info') ])
		.then(() => {
			return Q.nfcall<void>(fs.writeFile, inbox.path+'/info/userid',
					inbox.userId, { encoding: 'utf8', flag: 'wx' });
		})
		.then(() => {
			return setDefaultParameters(inbox);
		});
		return promise;
	}
	
	/**
	 * @return a promise, resolvable to number bytes used by this inbox.
	 */
	usedSpace(): Q.Promise<number> {
		var promise = Q.nfcall<string>(exec, "du -k -s "+this.path)
		.then((stdOut) => {
			var kUsed = parseInt(stdOut);
			if (isNaN(kUsed)) { throw new Error(
					"Shell utility du outputs a string, "+
					"which cannot be parsed as integer."); }
			return kUsed*1024;
		});
		return promise;
	}

	/**
	 * @return a promise, resolvable to free space in bytes.
	 */
	freeSpace(): Q.Promise<number> {
		var usedSpace = 0
		var promise = this.usedSpace()
		.then((bUsed) => {
			usedSpace = bUsed;
			return this.getSpaceQuota();
		})
		.then((quota) => {
			return Math.max(0, quota-usedSpace);
		});
		return promise;
	}

	/**
	 * @param msgMeta is json object with message's meta info directly from sender.
	 * @param authSender is an address of sender, if such was authenticated.
	 * @return a promise, resolvable to message id, when a folder for new
	 * message has been created.
	 */
	recordMsgMeta(msgMeta: deliveryApi.msgMeta.Request,
			authSender: string): Q.Promise<string> {
		var delivPath = this.path+'/delivery'
		var promise = genMsgIdAndMakeFolder(delivPath)
		.then((msgId) => {
			var meta: retrievalApi.msgMetadata.Reply = {
				extMeta: msgMeta,
				deliveryStart: Date.now(),
				authSender: authSender
			};
			return Q.nfcall<void>(fs.writeFile, delivPath+'/'+msgId+'/meta.json',
					JSON.stringify(meta), { encoding: 'utf8', flag: 'wx' })
			.then(() => { return msgId; });
		});
		return promise;
	}

	/**
	 * @param msgId
	 * @param incompleteMsg flag, true for incomplete (in-delivery) messages,
	 * and false (or undefined) for complete messages.
	 * @return a promise, resolvable to message metadata from disk, when it has
	 * been found on the disk.
	 * Rejected promise may pass a string error code from SC.
	 */
	getMsgMeta(msgId: string, incompleteMsg?: boolean):
			Q.Promise<retrievalApi.msgMetadata.Reply> {
		var msgFolder = this.path+(incompleteMsg ? '/delivery' : '/messages');
		return Q.nfcall<string>(fs.readFile,
				msgFolder+'/'+msgId+'/meta.json',
				{ encoding: 'utf8', flag: 'r' })
		.then((str) => {
			return JSON.parse(str);
		}, (err: fErrMod.FileError) => {
			if (err.code === fErrMod.Code.noFile) { throw SC.MSG_UNKNOWN; }
			else { throw err; }
		});
	}

	/**
	 * @param msgId
	 * @param objId
	 * @return a promise, resolvable to undefined, when given pair of message
	 * and object ids is correct, otherwise, rejected with a string error status,
	 * found in SC of this object.
	 */
	checkIds(msgId: string, objId: string): Q.Promise<void> {
		return this.getMsgMeta(msgId, true)
		.then((msgMeta) => {
			if (msgMeta.extMeta.objIds.indexOf(objId) < 0) {
				throw SC.OBJ_UNKNOWN;
			}
		}, (err: fErrMod.FileError) => {
			if ('string' === typeof err) { throw err; }
			else if (err.code === fErrMod.Code.noFile) { throw SC.MSG_UNKNOWN; }
			else { throw err; }
		});
	}

	/**
	 * @param msgId
	 * @param objId
	 * @param fileHeader
	 * @param allocateFile
	 * @param totalSize
	 * @param offset
	 * @param chunkLen
	 * @param chunk
	 * @return a promise, resolvable when all bytes are written to the file.
	 * Rejected promise may pass a string error code from SC.
	 */
	saveObjChunk(msgId: string, objId: string, fileHeader: boolean,
			allocateFile: boolean, totalSize: number, offset: number,
			chunkLen: number, chunk: stream.Readable): Q.Promise<void> {
		var filePath = this.path+'/delivery/'+msgId+'/'+objId+
			(fileHeader ? XSP_HEADER_FILE_NAME_END : XSP_SEGS_FILE_NAME_END);
		var promise = this.checkIds(msgId, objId)
		.then(() => {
			if (allocateFile) {
				if ((offset + chunkLen) > totalSize) {
					throw SC.WRITE_OVERFLOW;
				}
				return fops.createEmptyFile(filePath, totalSize);
			} else {
				return fops.getFileSize(filePath)
				.then((fileSize: number) => {
					if ((offset + chunkLen) > fileSize) {
						throw SC.WRITE_OVERFLOW;
					}
				});
			}
		})
		.then(() => {
			return fops.streamToExistingFile(filePath, offset,
				chunkLen, chunk, this.fileWritingBufferSize)
			.fail((err) => {
				if (!allocateFile) { throw err; }
				return Q.nfcall<void>(fs.unlink, filePath)
				.then(() => { throw err; }, () => { throw err; });
				
			});
		});
		return promise;
	}

	/**
	 * @param msgId
	 * @param objId
	 * @param fileHeader
	 * @param allocateFile
	 * @param bytes
	 * @param bytesLen
	 * @return a promise, resolvable when all bytes are written to the file.
	 * Rejected promise may pass a string error code from SC.
	 */
	appendObj(msgId: string, objId: string, fileHeader: boolean,
			allocateFile: boolean, bytes: stream.Readable, bytesLen: number):
			Q.Promise<void> {
		var filePath = this.path+'/delivery/'+msgId+'/'+objId+
			(fileHeader ? XSP_HEADER_FILE_NAME_END : XSP_SEGS_FILE_NAME_END);
		var promise = this.checkIds(msgId, objId)
		.then(() => {
			if (allocateFile) {
				return fops.createEmptyFile(filePath, 0)
				.then(() => { return 0; });
			} else {
				return fops.getFileSize(filePath);
			}
		})
		.then((initFileSize: number) => {
			return fops.streamToExistingFile(filePath, initFileSize,
				bytesLen, bytes, this.fileWritingBufferSize)
			.fail((err) => {
				return (allocateFile ?
					Q.nfcall<void>(fs.unlink, filePath) :
					Q.nfcall<void>(fs.truncate, filePath, initFileSize))
					.then(() => { throw err; }, () => { throw err; });
			});
		});
		return promise;
	}
	
	/**
	 * @param msgId
	 * @param objIds
	 * @return a promise for sizes of all objects that are present on the disk,
	 * out of given ones.
	 */
	private getMsgObjSizes(msgId: string, objIds: string[]):
			Q.Promise<MsgObjSizes> {
		var sizes: MsgObjSizes = {};
		if (objIds.length === 0) { return Q.when(sizes); }
		var getSize = (i: number, head: boolean): Q.Promise<void> => {
			var objId = objIds[i];
			var fName = this.path+'/delivery/'+msgId+'/'+objId+
				(head ? XSP_HEADER_FILE_NAME_END : XSP_SEGS_FILE_NAME_END);
			return fops.getFileSize(fName)
			.then((size) => {
				if (head) {
					sizes[objId] = {
						header: size,
						segments: 0
					};
					return getSize(i, false);
				} else {
					sizes[objId].segments = size;
					if ((i+1) < objIds.length) {
						return getSize(i+1, true);
					}
				}
			}, (err) => {
				if ((i+1) < objIds.length) {
					return getSize(i+1, true);
				}
			});
		}
		return getSize(0, true)
		.then(() => { return sizes; });
	}

	/**
	 * @param msgId
	 * @param attempt is a resursion counter, that gets appended to the message
	 * folder name, in the event of a name collision.
	 * @return a promise, resolvable when a message has been moved from delivery
	 * to messages storing folder.
	 */
	private moveMsgFromDeliveryToMessagesFolder(
			msgId: string, attempt?: number): Q.Promise<void> {
		var srcFolder = this.path+'/delivery/'+msgId+'/';
		var dstFolder = this.path+'/messages/'+msgId+
			(!attempt ? '' : ''+attempt)+'/';
		return Q.nfcall<void>(fs.stat, dstFolder)
		.then(() => {
			if (attempt) { attempt += 1; }
			else { attempt = 1; }
			return this.moveMsgFromDeliveryToMessagesFolder(msgId, attempt);
		}, (err: fErrMod.FileError) => {
			if (err.code !== fErrMod.Code.noFile) { throw err; }
			return Q.nfcall<void>(fs.rename, srcFolder, dstFolder);
		});
	}

	/**
	 * @param msgId
	 * @return a promise, resolvable, when a message has been moved from
	 * delivery to messages storing folder.
	 * Rejected promise may pass string error code from SC.
	 */
	completeMsgDelivery(msgId: string): Q.Promise<void> {
		var promise = this.getMsgMeta(msgId, true)
		.then((msgMeta) => {
			msgMeta.deliveryCompletion = Date.now();
			return this.getMsgObjSizes(msgId, msgMeta.extMeta.objIds)
			.then((objSizes) => {
				msgMeta.objSizes = objSizes;
			})
			.then(() => {
				return Q.nfcall<void>(fs.writeFile,
					this.path+'/delivery/'+msgId+'/meta.json',
					JSON.stringify(msgMeta), { encoding: 'utf8', flag: 'r+' });
			})
		})
		.then(() => {
			return this.moveMsgFromDeliveryToMessagesFolder(msgId);
		});
		return promise;
	}

	/**
	 * @return a promise, resolvable to a list of available message ids.
	 */
	getMsgIds(): Q.Promise<retrievalApi.listMsgs.Reply> {
		return Q.nfcall<string[]>(fs.readdir, this.path+'/messages');
	}

	/**
	 * This method removes message folder from the disk.
	 * @param msgId is an id of a message, that needs to be removed.
	 * @return promise, resolvable when a message folder is removed from
	 * the disk.
	 * Rejected promise may pass string error code from SC.
	 */
	rmMsg(msgId: string): Q.Promise<void> {
		var msgPath = this.path+'/messages/'+msgId
		var rmPath = msgPath+'~remove';
		return Q.nfcall<void>(fs.rename, msgPath, rmPath)
		.then(() => {
			return fops.rmdir(rmPath);
		}, (err: fErrMod.FileError) => {
			if (err.code === fErrMod.Code.noFile) { throw SC.MSG_UNKNOWN; }
			else { throw err; }
		});
	}

	/**
	 * @param msgId
	 * @param objId
	 * @param fileHeader
	 * @param offset
	 * @param maxLen
	 * @param sink
	 * @param signalSize
	 * @return a promise, resolvable when all bytes a pumped into a given
	 * sink.
	 */
	getObj(msgId: string, objId: string, fileHeader: boolean,
			offset: number, maxLen?: number): Q.Promise<ObjReader> {
		var filePath = this.path+'/messages/'+msgId+'/'+objId+
			(fileHeader ? XSP_HEADER_FILE_NAME_END : XSP_SEGS_FILE_NAME_END);
		var promise = fops.getFileSize(filePath)
		.then((objSize) => {
			if (objSize <= offset) { return; }
			if ('number' !== typeof maxLen) {
				maxLen = objSize;
			} else if ((offset+maxLen) >= objSize) {
				maxLen = objSize - offset;
			}
			if (maxLen <= 0) { return; }
			var reader: ObjReader = {
				len: maxLen,
				pipeTo: (sink: stream.Writable): Q.Promise<void> => {
					return fops.streamFromFile(filePath, offset, maxLen,
						sink, this.fileReadingBufferSize);
				}
			}
			Object.freeze(reader);
			return reader;
		}, <any> ((err: fErrMod.FileError) => {
			if (err.code === fErrMod.Code.noFile) { throw SC.OBJ_UNKNOWN; }
			else { throw err; }
		}));
		return promise;
	}
	
	/**
	 * @param inbox
	 * @param initKeyCerts
	 * @param setDefault when it is true, sets default values -- null --
	 * in place of an object with certs.
	 * @return a promise, resolvable to true, when certs are set, or
	 * resolvable to false, when given certs do not pass sanitization. 
	 */
	static setPubKey(inbox: Inbox, initKeyCerts: deliveryApi.initPubKey.Reply,
			setDefault: boolean): Q.Promise<boolean> {
		if (setDefault) {
			initKeyCerts = null;
		} else {
			var isOK = 
				('object' === typeof initKeyCerts) && !!initKeyCerts &&
				jwk.isLikeSignedKeyCert(initKeyCerts.pkeyCert) &&
				jwk.isLikeSignedKeyCert(initKeyCerts.userCert) &&
				jwk.isLikeSignedKeyCert(initKeyCerts.provCert);
			if (!isOK) { return Q.when(false); }
		}
		return writeJSONFile(initKeyCerts, inbox.path+'/info/pubkey');
	}

	/**
	 * @return a promise, either resolvable to object with certificates,
	 * or resolvable to null (default), if key certs were not set by the user.
	 */
	static getPubKey(inbox: Inbox): Q.Promise<deliveryApi.initPubKey.Reply> {
		return readJSONFile(inbox.path+'/info/pubkey');
	}
	
	static getSpaceQuota(inbox: Inbox): Q.Promise<number> {
		return readJSONFile(inbox.path+'/info/quota');
	}
	static setSpaceQuota(inbox: Inbox, numOfBytes: number, setDefault: boolean):
			Q.Promise<boolean> {
		if (setDefault) {
			numOfBytes = 10*1024*1024*1024;
		} else {
			var isOK =
				('number' === typeof numOfBytes) && (numOfBytes >= 50*1024*1024);
			if (!isOK) { return Q.when(false); }
			numOfBytes = Math.floor(numOfBytes);
		}
		return writeJSONFile(numOfBytes, inbox.path+'/info/quota');
	}
	getSpaceQuota(): Q.Promise<number> {
		return Inbox.getSpaceQuota(this);
	}
	
	static getAnonSenderPolicy(inbox: Inbox):
			Q.Promise<AnonSenderPolicy> {
		return readJSONFile(inbox.path+'/info/anonymous/policy');
	}
	static setAnonSenderPolicy(inbox: Inbox,
			policy: AnonSenderPolicy, setDefault: boolean):
			Q.Promise<boolean> {
		if (setDefault) {
			policy = {
				accept: true,
				acceptWithInvitesOnly: true,
				defaultMsgSize: 1024*1024
			};
		} else {
			var isOK =
				('object' === typeof policy) && !!policy &&
				('boolean' === typeof policy.accept) &&
				('boolean' === typeof policy.acceptWithInvitesOnly) &&
				('number' === typeof policy.defaultMsgSize) &&
				(policy.defaultMsgSize > 500);
			if (!isOK) { return Q.when(false); }
		}
		return writeJSONFile(policy, inbox.path+'/info/anonymous/policy');
	}
	getAnonSenderPolicy(): Q.Promise<AnonSenderPolicy> {
		return Inbox.getAnonSenderPolicy(this);
	}
	
	static getAnonSenderInvites(inbox: Inbox): Q.Promise<AnonSenderInvites> {
		return readJSONFile(inbox.path+'/info/anonymous/invites');
	}
	static setAnonSenderInvites(inbox: Inbox, invites: AnonSenderInvites,
			setDefault: boolean): Q.Promise<boolean> {
		if (setDefault) {
			invites = {};
		} else {
			var isOK = ('object' === typeof invites) && !!invites;
			if (!isOK) { return Q.when(false); }
			var msgMaxSize: number;
			for (var invite in invites) {
				msgMaxSize = invites[invite];
				isOK = ('number' === typeof msgMaxSize) && (msgMaxSize > 500);
				if (!isOK) { return Q.when(false); }
			}
		}
		return writeJSONFile(invites, inbox.path+'/info/anonymous/invites');
	}
	getAnonSenderInvites(): Q.Promise<AnonSenderInvites> {
		return Inbox.getAnonSenderInvites(this);
	}
	
	static getAuthSenderPolicy(inbox: Inbox):
			Q.Promise<AuthSenderPolicy> {
		return readJSONFile(inbox.path+'/info/authenticated/policy');
	}
	static setAuthSenderPolicy(inbox: Inbox,
			policy: AuthSenderPolicy, setDefault: boolean):
			Q.Promise<boolean> {
		if (setDefault) {
			policy = {
				acceptWithInvitesOnly: false,
				acceptFromWhiteListOnly: false,
				applyBlackList: true,
				defaultMsgSize: 100*1024*1024,
			};
		} else {
			var isOK =
				('object' === typeof policy) && !!policy &&
				('boolean' === typeof policy.applyBlackList) &&
				('boolean' === typeof policy.acceptFromWhiteListOnly) &&
				('boolean' === typeof policy.acceptWithInvitesOnly) &&
				('number' === typeof policy.defaultMsgSize) &&
				(policy.defaultMsgSize > 500);
			if (!isOK) { return Q.when(false); }
		}
		return writeJSONFile(policy, inbox.path+'/info/authenticated/policy');
	}
	getAuthSenderPolicy(): Q.Promise<AuthSenderPolicy> {
		return Inbox.getAuthSenderPolicy(this);
	}
	
	static getAuthSenderBlacklist(inbox: Inbox): Q.Promise<Blacklist> {
		return readJSONFile(inbox.path+'/info/authenticated/blacklist');
	}
	static setAuthSenderBlacklist(inbox: Inbox, list: Blacklist,
			setDefault: boolean): Q.Promise<boolean> {
		if (setDefault) {
			list = {};
		} else {
			var isOK = ('object' === typeof list) && !!list;
			if (!isOK) { return Q.when(false); }
		}
		return writeJSONFile(list, inbox.path+'/info/authenticated/blacklist');
	}
	getAuthSenderBlacklist(): Q.Promise<Blacklist> {
		return Inbox.getAuthSenderBlacklist(this);
	}
	
	static getAuthSenderWhitelist(inbox: Inbox): Q.Promise<Whitelist> {
		return readJSONFile(inbox.path+'/info/authenticated/whitelist');
	}
	static setAuthSenderWhitelist(inbox: Inbox, list: Whitelist,
			setDefault: boolean): Q.Promise<boolean> {
		if (setDefault) {
			list = {};
		} else {
			var isOK = ('object' === typeof list) && !!list;
			if (!isOK) { return Q.when(false); }
			var msgMaxSize: number;
			for (var addr in list) {
				msgMaxSize = list[addr];
				isOK = ('number' === typeof msgMaxSize) && (msgMaxSize > 500);
				if (!isOK) { return Q.when(false); }
			}
		}
		return writeJSONFile(list, inbox.path+'/info/authenticated/whitelist');
	}
	getAuthSenderWhitelist(): Q.Promise<Whitelist> {
		return Inbox.getAuthSenderWhitelist(this);
	}
	
	static getAuthSenderInvites(inbox: Inbox): Q.Promise<AuthSenderInvites> {
		return readJSONFile(inbox.path+'/info/authenticated/invites');
	}
	static setAuthSenderInvites(inbox: Inbox, invites: AuthSenderInvites,
			setDefault: boolean): Q.Promise<boolean> {
		if (setDefault) {
			invites = {};
		} else {
			var isOK = ('object' === typeof invites) && !!invites;
			if (!isOK) { return Q.when(false); }
			var msgMaxSize: number;
			for (var invite in invites) {
				msgMaxSize = invites[invite];
				isOK = ('number' === typeof msgMaxSize) && (msgMaxSize > 500);
				if (!isOK) { return Q.when(false); }
			}
		}
		return writeJSONFile(invites, inbox.path+'/info/authenticated/invites');
	}
	getAuthSenderInvites(): Q.Promise<AuthSenderInvites> {
		return Inbox.getAuthSenderInvites(this);
	}

}

Object.freeze(Inbox.prototype);
Object.freeze(Inbox);

/**
 * @param json
 * @param path
 * @return a promise, resolvable, when given json object has been written to
 * named file.
 */
function writeJSONFile(json, path: string): Q.Promise<boolean> {
	return Q.nfcall<void>(fs.writeFile, path,
			JSON.stringify(json),
			{ encoding: 'utf8', flag: 'w' })
	.then(() => {
		return true;
	});
}

/**
 * @param path
 * @return a promise, resolvable to json object, read from the named file.
 */
function readJSONFile(path: string): Q.Promise<any> {
	var promise = Q.nfcall<Buffer>(fs.readFile, path)
	.then((buf) => {
		return JSON.parse(buf.toString('utf8'));
	});
	return promise;
}

function setDefaultParameters(inbox: Inbox): Q.Promise<void> {
	var promise = Q.all(
			[ Q.nfcall(fs.mkdir, inbox.path+'/info/anonymous'),
			  Q.nfcall(fs.mkdir, inbox.path+'/info/authenticated') ]);
	var filePromises = [];
	// public key
	filePromises.push(Inbox.setPubKey(inbox, null, true));
	// space quota
	filePromises.push(Inbox.setSpaceQuota(inbox, null, true));
	// policy for anonymous senders
	filePromises.push(Inbox.setAnonSenderPolicy(inbox, null, true));
	// anonymous senders invitation tokens
	filePromises.push(Inbox.setAnonSenderInvites(inbox, null, true));
	// policy for authenticated senders
	filePromises.push(Inbox.setAuthSenderPolicy(inbox, null, true));
	// authenticated senders white-list
	filePromises.push(Inbox.setAuthSenderWhitelist(inbox, null, true));
	// authenticated senders black-list
	filePromises.push(Inbox.setAuthSenderBlacklist(inbox, null, true));
	// authenticated senders invitation tokens
	filePromises.push(Inbox.setAuthSenderInvites(inbox, null, true));
	promise.then(() => {
		return Q.all(filePromises);
	});
	return <Q.Promise<any>> promise;
}

/**
 * @param inboxPath
 * @param msgId
 * @return a promise, resolvable to generated msg id, when folder for a message
 * is created in the delivery folder.
 */
function genMsgIdAndMakeFolder(delivPath: string): Q.Promise<string> {
	var msgId = base64.urlSafe.pack(random.bytes(32));
	var promise = Q.nfcall<void>(fs.mkdir, delivPath+'/'+msgId)
	.then(() => {
		return msgId;
	}, (err) => {
		if (err.code === fErrMod.Code.fileExists) {
			return genMsgIdAndMakeFolder(delivPath);
		} else { throw err; }
	});
	return promise;
}

Object.freeze(exports);