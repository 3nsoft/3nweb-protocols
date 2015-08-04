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
 * Everything in this module is assumed to be inside of a storage reliance set.
 * 
 * Store files are laid out on disk in the following way:
 * (a) store is just a folder with stuff inside;
 * (b) main store folder contains following folders:
 * (b.1) objects - is a folder for object folders;
 * (b.2) archived - is a folder for archived object folders;
 * (b.3) rmdir - is a folder for folders that are in a process of being
 *               recursively removed;
 * (b.4) info - is a folder for information files about this storage;
 * (c) object folder's name is object's id;
 * (d) object folder contains:
 * (d.1) current.v - is a file with the current version of an object;
 * (d.2) N.hsxp - is a file with an N'th version object's header;
 * (d.3) N.sxsp - is a file with an N'th version object's segments;
 *                this file is present only if this N'th version is not expressed
 *                with a diff, relative to another version;
 * (d.4) N.diff - is a json file that describes diff, which will recreate N'th
 *                version;
 *                this file is present only when N'th version is expressed with
 *                a diff, relative to some other version;
 * (d.5) N.sxsp.diff - is a file with diff's bytes;
 *                this file is present only when N'th version is expressed with
 *                a diff, relative to some other version;
 * (d.6) transaction - is a json file with current transaction's info;
 *                     this file is present only for duration of a transaction,
 *                     and also acts as a transaction lock;
 * (d.7) new.hxsp - is a transaction file for new header;
 * (d.8) new.sxsp - is a transaction file for new segments, when a new version is
 *                  sent as is, and not as a diff, relative to some other version;
 * (d.9) new.diff - is a transaction json file with diff, that represents a new
 *                  version, relative to some other version;
 * (d.10) new.sxsp.diff - is a transaction file with diff bytes.
 *                 
 */

import Q = require('q');
import fs = require('fs');
import stream = require('stream');
import ChildProcMod = require('child_process')
var exec = ChildProcMod.exec;
import storage = require('./storage-factory');
import ownerApi = require('../../lib-common/service-api/3nstorage/owner');
import fops = require('../../lib-server/resources/file_ops');
import base64 = require('../../lib-common/base64');
import random = require('../../lib-server/random');
import fErrMod = require('../../lib-common/file-err');
import nacl = require('ecma-nacl');
var xsp = nacl.fileXSP;
import confUtil = require('../../lib-server/conf-util');

export var SC = {
	USER_UNKNOWN: 'user-unknown',
	OBJ_EXIST: 'obj-already-exist',
	OBJ_UNKNOWN: 'obj-unknown',
	WRONG_OBJ_STATE: 'wrong-obj-state',
	WRITE_OVERFLOW: 'write-overflow',
	CONCURRENT_TRANSACTION: "concurrent-transactions",
	TRANSACTION_UNKNOWN: "transactions-unknown",
	INCOMPATIBLE_TRANSACTION: "incompatible-transaction",
	NOT_ENOUGH_SPACE: "not-enough-space"
};
Object.freeze(SC);

var SPECIAL_VERSION = {
	NEW: 'new'
}
Object.freeze(SPECIAL_VERSION);

export enum BytesPlace {
	Header, Segments, Diff
}
Object.freeze(BytesPlace);

var FNAME_END: string[] = [];
FNAME_END[BytesPlace.Header] = '.hxsp';
FNAME_END[BytesPlace.Segments] = '.sxsp';
FNAME_END[BytesPlace.Diff] = '.sxsp.diff';
Object.freeze(FNAME_END);

var DEFAULT_FILE_WRITE_BUFFER_SIZE = 4*1024;
var DEFAULT_FILE_READ_BUFFER_SIZE = 64*1024;

export interface DiffInfo extends ownerApi.DiffInfo {}

export interface TransactionParams extends ownerApi.TransactionParams {
	transactionId: string;
	version?: number;
}

export interface ObjReader {
	len: number;
	pipeTo: (sink: stream.Writable) => Q.Promise<void>;
	version: number;
}

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

function setDefaultParameters(store: Store): Q.Promise<void> {
	var filePromises = [];
	// space quota
	filePromises.push(Store.setSpaceQuota(store, null, true));
	return <Q.Promise<any>> Q.all(filePromises);
}

interface SpaceInfo {
	free: number;
	used: number;
}

// This is a memoizer for space usage with a little extra.
class SpaceTracker {
	
	private space: {
		[userId: string]: SpaceInfo;
	} = {};
	
	constructor() {
		Object.freeze(this);
	}

	// XXX this is a hack, which should be replaced when sqlite is used.
	//		This hack is needed as du fails when files disappear have way
	//		in its processing. In other words du is not concurrency tollerant
	//		thing. Thus, we try call a few times here, and this simple approach
	//		is a good enough for the demo, but may not be ok for production.
	private diskUsed(path: string, runNum = 0): Q.Promise<number> {
		return Q.nfcall<string>(exec, "du -k -s "+path)
		.then((stdOut) => {
			var kUsed = parseInt(stdOut);
			if (isNaN(kUsed)) { throw new Error(
					"Shell utility du outputs a string, "+
					"which cannot be parsed as an integer."); }
			return kUsed*1024;
		}, (err) => {
			if (runNum < 5) {
				return this.diskUsed(path, runNum+1);
			} else {
				console.warn("\n3NStorage service ("+Date()+"):\n"+
					"\twas not capable to properly estimate disk usage of "+
					path+"\n");
				return Q.when(0);
			}
		});
	}
	
	/**
	 * @param store
	 * @return a promise, resolvable to space info object.
	 */
	private updateSpaceInfo(store: Store): Q.Promise<SpaceInfo> {
		var usedSpace = 0
		var promise = this.diskUsed(store.path)
		.then((bUsed) => {
			usedSpace = bUsed;
			return store.getSpaceQuota();
		})
		.then((quota) => {
			return {
				free: Math.max(0, quota-usedSpace),
				used: usedSpace
			};
		});
		return promise;
	}
	
	change(store: Store, delta: number): Q.Promise<void> {
		var s = this.space[store.userId];
		function changeS() {
			if ((delta > 0) && ((s.free - delta) < 0)) {
				throw SC.NOT_ENOUGH_SPACE; }
			s.free -= delta;
			s.used += delta;
		}
		if (s) {
			changeS();
		} else {
			return this.updateSpaceInfo(store)
			.then((spaceInfo) => {
				s = spaceInfo;
				changeS();
			});
		}
	}
	
	reset(userId: string): void {
		delete this.space[userId];
	}
	
}
Object.freeze(SpaceTracker.prototype);
Object.freeze(SpaceTracker);

var spaceTracker = new SpaceTracker();

export class Store {
	
	userId: string;
	path: string;
	fileWritingBufferSize: number;
	fileReadingBufferSize: number;
	
	constructor(userId: string, storePath: string,
			writeBufferSize: string|number, readBufferSize: string|number) {
		this.userId = userId;
		this.path = storePath;
		this.fileWritingBufferSize = (writeBufferSize ?
			confUtil.stringToNumOfBytes(writeBufferSize) :
			DEFAULT_FILE_WRITE_BUFFER_SIZE);
		this.fileReadingBufferSize = (readBufferSize ?
			confUtil.stringToNumOfBytes(readBufferSize) :
			DEFAULT_FILE_READ_BUFFER_SIZE);
		Object.freeze(this);
	}
	/**
	 * Creates on a disk a directory and file structure for a given store
	 * object.
	 * @param store
	 * @return a promise, resolvable, when store's disk structure has been
	 * constructed.
	 */
	static initStore(store: Store): Q.Promise<void> {
		var promise = Q.all(
				[ Q.nfcall(fs.mkdir, store.path+'/objects'),
				  Q.nfcall(fs.mkdir, store.path+'/transactions'),
				  Q.nfcall(fs.mkdir, store.path+'/root'),
				  Q.nfcall(fs.mkdir, store.path+'/info') ])
		.then(() => {
			return Q.nfcall<void>(fs.writeFile, store.path+'/info/userid',
					store.userId, { encoding: 'utf8',flag: 'wx' });
		})
		.then(() => {
			return setDefaultParameters(store);
		});
		return promise;
	}
	
	private objFolder(objId: string): string {
		return (objId ? this.path+'/objects/'+objId : this.path+'/root');
	}

	/**
	 * @param objId
	 * @return a promise, resolvable to version number for currently existing
	 * object, or resolvable to string for special states, like being new, etc.
	 */
	private getObjVersion(objId: string): Q.Promise<number|string> {
		var filePath = this.objFolder(objId)+'/current.v';
		var promise = Q.nfcall<Buffer>(fs.readFile, filePath)
		.then((buf) => {
			var str = buf.toString('utf8');
			var v = parseInt(str);
			if (isNaN(v)) {
				return str;
			} else {
				return v;
			}
		})
		.fail((err: fErrMod.FileError) => {
			if (err.code === fErrMod.Code.noFile) { throw SC.OBJ_UNKNOWN; }
			else { throw err; }
			return null;	// this unreachable code is to please compiler
		});
		return promise;
	}

	/**
	 * @param objId
	 * @param ver is a number for a regular available version, which is current
	 * now, or it can be a string for states of object like being archived, etc.
	 * @return a promise, resolvable when a new version is set.
	 */
	private setObjVersion(objId: string, ver: number|string): Q.Promise<void> {
		var filePath = this.objFolder(objId)+'/current.v';
		return Q.nfcall<void>(fs.writeFile, filePath,
			''+ver, { encoding: 'utf8', flag: 'w' });
	}
	
	private makeNewObj(objId: string): Q.Promise<void> {
		if (!objId) { throw new Error("Missing object id."); }
		var promise = Q.nfcall<void>(fs.mkdir, this.objFolder(objId))
		.fail((err: fErrMod.FileError) => {
			if (err.code === fErrMod.Code.fileExists) { throw SC.OBJ_EXIST; }
			throw err;
		})
		.then(() => {
			return this.setObjVersion(objId, SPECIAL_VERSION.NEW)
		});
		return promise;
	}
	
	private transactionFolder(objId: string): string {
		return (objId ?
			this.path+'/transactions/'+objId : this.path+'/root/transaction');
	}
	
	private saveTransactionParams(objId: string,
			transaction: TransactionParams): Q.Promise<void> {
		return Q.nfcall<void>(fs.writeFile,
			this.transactionFolder(objId)+'/transaction',
			JSON.stringify(transaction), { encoding: 'utf8', flag: 'w' });
	}
	
	private getTransactionParams(objId: string): Q.Promise<TransactionParams> {
		var promise = readJSONFile(this.transactionFolder(objId)+'/transaction')
		.fail((err: fErrMod.FileError) => {
			if (err.code === fErrMod.Code.noFile) {
				throw SC.TRANSACTION_UNKNOWN;
			}
			throw err;
		})
		return <Q.Promise<any>> promise;
	}
	
	private allocateHeaderAndSegsFiles(objId: string, version: number,
			headerSize: number, segsSize: number): Q.Promise<any>[] {
		return [ fops.createEmptyFile(this.transactionFolder(objId)+
					'/new'+FNAME_END[BytesPlace.Header], headerSize),
				 fops.createEmptyFile(this.transactionFolder(objId)+
					'/new'+FNAME_END[BytesPlace.Segments], segsSize) ]
	}
	
	startTransaction(objId: string, reqTrans: ownerApi.TransactionParams):
			Q.Promise<string> {
		if (reqTrans.diff) { throw new Error(
			"Processing diffs is not implemented, yet."); }
		var trans: TransactionParams = {
			transactionId: random.stringOfB64UrlSafeChars(10),
			isNewObj: !!reqTrans.isNewObj,
			sizes: reqTrans.sizes
		};
		var promise = Q.nfcall<void>(fs.mkdir, this.transactionFolder(objId))
		.fail((err: fErrMod.FileError) => {
			if (err.code === fErrMod.Code.fileExists) {
				throw SC.CONCURRENT_TRANSACTION;
			}
			throw err;
		})
		.then(() => {
			var tasks: Q.Promise<any>[] = [];
			if (trans.isNewObj) {
				trans.version = 1;
				if (objId !== null) {
					tasks.push(this.makeNewObj(objId));
				}
			} else {
				// get current version, and set new one to be v+1
				tasks.push(this.getObjVersion(objId)
					.then((currentVersion) => {
						if ('number' !== typeof currentVersion) {
							throw SC.WRONG_OBJ_STATE;
						}
						trans.version = (<number> currentVersion) + 1;
					}));
			}
			if (trans.isNewObj || !trans.diff) {
				// create empty files of appropriate size, if space allows
				var headerSize = ((trans.sizes.header > 0) ?
					trans.sizes.header : 0);
				var segsSize = ((trans.sizes.segments > 0) ?
					trans.sizes.segments : 0);
				var t = spaceTracker.change(this, headerSize+segsSize);
				if (t) {
					tasks.push(t.then(() => {
						return Q.all(this.allocateHeaderAndSegsFiles(
							objId, trans.version, headerSize, segsSize));
					}));
				} else {
					tasks = tasks.concat(this.allocateHeaderAndSegsFiles(
						objId, trans.version, headerSize, segsSize));
				}
			} else {
				// save diff info, create header and segs-diff files
				// according to diff info
				// TODO diffs need implementation
				throw new Error("Processing diffs is not implemented, yet.");
			}
			return Q.all(tasks);
		})
		.then(() => {
			return this.saveTransactionParams(objId, trans);
		})
		.fail((err) => {
			return this.completeTransaction(objId, trans.transactionId, true)
			.fail((err2) => {})	// swallow errors here
			.then(() => { throw err; });
		})
		.then(() => {
			return trans.transactionId;
		});
		return promise;
	}
	
	private applyNonDiffTransactionFiles(transFolder: string, objFolder: string,
			trans: TransactionParams, objId: string): Q.Promise<void> {
		// move header and segments files from transaction folder to
		// obj's one, setting proper current version
		var promise = Q.all(
			[ Q.nfcall(fs.rename,
					transFolder+'/new'+FNAME_END[BytesPlace.Header],
					objFolder+'/'+trans.version+FNAME_END[BytesPlace.Header]),
			  Q.nfcall(fs.rename,
					transFolder+'/new'+FNAME_END[BytesPlace.Segments],
					objFolder+'/'+trans.version+FNAME_END[BytesPlace.Segments]) ])
		.then(() => {
			return this.setObjVersion(objId, trans.version);
		});
		return promise;
	}
	
	private applyDiffTransactionFiles(transFolder: string, objFolder: string,
			trans: TransactionParams, objId: string): Q.Promise<void> {
		// create new header and segments files, applying diff;
		// make reverse diff and save it instead of previous segments
		// and header
		// TODO diffs need implementation
		throw new Error("Processing diffs is not implemented, yet.");
	}
	
	completeTransaction(objId: string, transactionId: string, cancel: boolean):
			Q.Promise<void> {
		var transFolder = this.transactionFolder(objId);
		var objFolder = this.objFolder(objId);
		var promise = this.getTransactionParams(objId)
		.then((trans) => {
			if (trans.transactionId !== transactionId) {
				throw SC.TRANSACTION_UNKNOWN;
			}
			if (cancel) {
				if (trans.isNewObj && (objId !== null)) {
					return fops.rmdir(objFolder)
					.fail((err) => {});	// swallow errors here
				}
			} else if (trans.diff) {
				return this.applyDiffTransactionFiles(
					transFolder, objFolder, trans, objId);
			} else {
				return this.applyNonDiffTransactionFiles(
					transFolder, objFolder, trans, objId);
			}
		})
		.then(() => {
			return fops.rmdir(transFolder)
			.fail((err) => {});	// swallow errors here
		});
		return promise;
	}
	
	appendObj(objId: string, transactionId: string, ftype: BytesPlace,
			bytes: stream.Readable, bytesLen: number): Q.Promise<void> {
		var filePath: string = null;
		var promise = this.getTransactionParams(objId)
		.then((trans) => {
			if (trans.transactionId !== transactionId) {
				throw SC.TRANSACTION_UNKNOWN;
			}
			filePath = this.transactionFolder(objId)+'/new'+FNAME_END[ftype];
			if (trans.sizes) {
				if (ftype === BytesPlace.Segments) {
					if (trans.sizes.segments < 0) {
						return fops.getFileSize(filePath);
					} else {
						throw SC.INCOMPATIBLE_TRANSACTION;
					}
				} else if (ftype === BytesPlace.Header) {
					if (trans.sizes.header < 0) {
						return fops.getFileSize(filePath);
					} else {
						throw SC.INCOMPATIBLE_TRANSACTION;
					}
				} else if (ftype === BytesPlace.Diff) {
					throw SC.INCOMPATIBLE_TRANSACTION;
				} else {
					throw new Error("Unknown destination for bytes.");
				}
			} else if (trans.diff) {
				if (ftype === BytesPlace.Diff) {
					// TODO diffs need implementation
					throw new Error("Processing diffs is not implemented, yet.");
				} else if ((ftype === BytesPlace.Header) ||
						(ftype === BytesPlace.Segments)) {
					throw SC.INCOMPATIBLE_TRANSACTION;
				} else {
					throw new Error("Unknown destination for bytes.");
				}
			} else {
				throw new Error("Illegal transaction: no file sizes, no diff.");
			}
		})
		.then((initFileSize: number) => {
			return spaceTracker.change(this, bytesLen)
			.then(() => {
				return fops.streamToExistingFile(filePath, initFileSize,
					bytesLen, bytes, this.fileWritingBufferSize)
				.fail((err) => {
					return Q.nfcall<void>(fs.truncate, filePath, initFileSize)
					.then(() => { throw err; }, () => { throw err; });
				});
			});
		});
		return promise;
	}
	
	saveObjChunk(objId: string, transactionId: string, ftype: BytesPlace,
			offset: number, chunkLen: number, chunk: stream.Readable):
			Q.Promise<void> {
		var filePath: string = null;
		var promise = this.getTransactionParams(objId)
		.then((trans) => {
			if (trans.transactionId !== transactionId) {
				throw SC.TRANSACTION_UNKNOWN;
			}
			filePath = this.transactionFolder(objId)+'/new'+FNAME_END[ftype];
			if (trans.sizes) {
				if (ftype === BytesPlace.Segments) {
					if (trans.sizes.segments < 0) {
						throw SC.INCOMPATIBLE_TRANSACTION;
					} else if ((offset + chunkLen) > trans.sizes.segments) {
						throw SC.WRITE_OVERFLOW;
					} else {
						return trans.sizes.segments;
					}
				} else if (ftype === BytesPlace.Header) {
					if (trans.sizes.header < 0) {
						throw SC.INCOMPATIBLE_TRANSACTION;
					} else if ((offset + chunkLen) > trans.sizes.header) {
						throw SC.WRITE_OVERFLOW;
					} else {
						return trans.sizes.header;
					}
				} else if (ftype === BytesPlace.Diff) {
					throw SC.INCOMPATIBLE_TRANSACTION;
				} else {
					throw new Error("Unknown destination for bytes.");
				}
			} else if (trans.diff) {
				if (ftype === BytesPlace.Diff) {
					// TODO diffs need implementation
					throw new Error("Processing diffs is not implemented, yet.");
				} else if ((ftype === BytesPlace.Header) ||
						(ftype === BytesPlace.Segments)) {
					throw SC.INCOMPATIBLE_TRANSACTION;
				} else {
					throw new Error("Unknown destination for bytes.");
				}
			} else {
				throw new Error("Illegal transaction: no file sizes, no diff.");
			}
		})
		.then(() => {
			return fops.streamToExistingFile(filePath, offset,
				chunkLen, chunk, this.fileWritingBufferSize);
		});
		return promise;
	}
	
	/**
	 * @param objId is a string object id for non-root objects, and null for
	 * root object.
	 * @param ftype 
	 * @param version is an integer version, or null, for current version.
	 * @param offset is a read start point.
	 * @param maxLen is a maximum number of bytes to read. Null indicates that
	 * all bytes can be read.
	 * @return
	 */
	getObj(objId: string, ftype: BytesPlace, version: number, offset: number,
			maxLen: number): Q.Promise<ObjReader> {
		var filePath: string;
		var promise: Q.Promise<any>;
		if (version === null) {
			promise = this.getObjVersion(objId)
			.then((v) => {
				if ('number' !== typeof v) { throw SC.WRONG_OBJ_STATE; }
				version = <number> v;
				filePath = this.objFolder(objId)+'/'+version+FNAME_END[ftype];
				return fops.getFileSize(filePath);
			});
		} else {
			filePath = this.objFolder(objId)+'/'+version+FNAME_END[ftype];
			promise = fops.getFileSize(filePath);
		}
		promise = promise
		.then((objSize) => {
			if (objSize <= offset) { return; }
			if (maxLen === null) {
				maxLen = objSize;
			} else if ((offset+maxLen) >= objSize) {
				maxLen = objSize - offset;
			}
			if (maxLen <= 0) { return; }
			var reader: ObjReader = {
				len: maxLen,
				version: version,
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
	
	static getSpaceQuota(store: Store): Q.Promise<number> {
		return readJSONFile(store.path+'/info/quota');
	}
	static setSpaceQuota(store: Store, numOfBytes: number, setDefault: boolean):
			Q.Promise<boolean> {
		if (setDefault) {
			numOfBytes = 10*1024*1024*1024;
		} else {
			var isOK =
				('number' === typeof numOfBytes) && (numOfBytes >= 50*1024*1024);
			if (!isOK) { return Q.when(false); }
			numOfBytes = Math.floor(numOfBytes);
			spaceTracker.reset(store.userId);
		}
		return writeJSONFile(numOfBytes, store.path+'/info/quota');
	}
	getSpaceQuota(): Q.Promise<number> {
		return Store.getSpaceQuota(this);
	}
	
	static getKeyDerivParams(store: Store): Q.Promise<any> {
		return readJSONFile(store.path+'/info/key-deriv-params');
	}
	static setKeyDerivParams(store: Store, params: any, setDefault: boolean):
			Q.Promise<boolean> {
		if (setDefault) {
			params = {};
		} else if ('object' !== typeof params) {
			return Q.when(false);
		}
		return writeJSONFile(params, store.path+'/info/key-deriv-params');
	}
	getKeyDerivParams(): Q.Promise<any> {
		return Store.getSpaceQuota(this);
	}
		
}
Object.freeze(Store.prototype);
Object.freeze(Store);

Object.freeze(exports);