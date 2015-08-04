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
 * This module is a function that constructs test-grade recipient boxes
 * factories.
 */

import fs = require('fs');
import stream = require('stream');
import Q = require('q');
import inboxFactoryMod = require('./inbox-factory');
import inboxMod = require('./inbox');
import deliveryApi = require('../../lib-common/service-api/asmail/delivery');
import configApi = require('../../lib-common/service-api/asmail/config');
import retrievalApi = require('../../lib-common/service-api/asmail/retrieval');

interface AddressToSizeMap {
	[address: string]: number;
}

/**
 * @param lst is a map from addresses to numeric values
 * @param address
 * @return numeric value found in the list, or undefined,
 * if neither address, nor its domain can be matched in the list.
 */
function findMatchIn(lst: AddressToSizeMap, address: string): number {
	// check address as a whole
	var v = lst[address];
	if ('undefined' !== typeof v) { return v; }
	// check address' own domain
	var ind = address.indexOf('@');
	if (ind < 0) { return; }
	address = address.substring(ind+1);
	if (address.length === 0) { return; }
	v = lst['@'+address];
	if ('undefined' !== typeof v) { return v; }
	// check parent domains
	while (true) {
		var ind = address.indexOf('.');
		if (ind < 0) { return; }
		address = address.substring(ind+1);
		if (address.length === 0) { return; }
		v = lst['@*.'+address];
		if ('undefined' !== typeof v) { return v; }
	}
}
	
/**
 * @param inbox
 * @param msgSize is a number of message bytes
 * @returns a promise, resolvable to
 * (1) least number between given number of bytes, and free space of
 *     a given inbox;
 * (2) -1 (less than zero), if there is no free space in the inbox.
 */
function adaptToFreeSpaceLeft(inbox: inboxMod.Inbox, msgSize: number):
		Q.Promise<number> {
	if (msgSize <= 0) { return Q.when(msgSize); }
	return inbox.freeSpace()
	.then((bytesFree: number) => {
		if (bytesFree > 0) { return Math.min(bytesFree, msgSize); }
		else { return -1; }
	});
}

/**
 * @param inbox
 * @param invitation is a string invitation token, or null.
 * @returns a promise, resolvable to
 * (1) zero (0), if leaving mail is forbidden,
 * (2) greater than zero maximum message length, and
 * (3) -1 (less than zero), if mail cannot be accepted due to full
 *     mail box.
 */
function allowedMsgSizeForAnonSender(
		inbox: inboxMod.Inbox, invitation: string): Q.Promise<number> {
	return inbox.getAnonSenderPolicy()
	.then((policy) => {
		if (!policy.accept) { return 0; }
		if (!invitation) {
			return (policy.acceptWithInvitesOnly ?
					0 : policy.defaultMsgSize);
		}
		return inbox.getAnonSenderInvites()
		.then((invites) => {
			var msgSize = invites[invitation];
			return (msgSize ? msgSize : 0);
		});
	})
	.then((msgSize: number) => {
		return adaptToFreeSpaceLeft(inbox, msgSize);
	});
}

/**
 * @param inbox
 * @param sender is sender string address
 * @param invitation is a string invitation token, or null.
 * @returns a promise, resolvable to
 * (1) zero (0), if leaving mail is forbidden,
 * (2) greater than zero maximum message length, and
 * (3) -1 (less than zero), if mail cannot be accepted due to full mail
 *     box.
 */
function allowedMsgSizeForAuthSender(inbox: inboxMod.Inbox, sender: string,
		invitation: string): Q.Promise<number> {
	var promise = Q.all([ inbox.getAuthSenderPolicy(),
	                      inbox.getAuthSenderWhitelist()])
	.then((results) => {
		var policy: any = results[0];
		var sizeFromWL = findMatchIn(<AddressToSizeMap> results[1], sender);
		// check whitelist for specific size
		if ('number' === typeof sizeFromWL) {
			return sizeFromWL;
		} else if ('undefined' !== typeof sizeFromWL) {
			return policy.defaultMsgSize;
		}
		// exit if only whitelist contacts are allowed
		if (policy.acceptFromWhiteListOnly) { return 0; }
		// if needed, apply blacklist
		if (policy.applyBlackList) {
			return inbox.getAuthSenderBlacklist()
			.then(function(bList){
				if ('undefined' === typeof findMatchIn(bList, sender)) {
					return policy.defaultMsgSize;
				} else {
					return 0;
				}
			});
		}
		return policy.defaultMsgSize;
	})
	.then((msgSize) => {
		return adaptToFreeSpaceLeft(inbox, msgSize);
	});
	return promise;
}

export var SC = inboxMod.SC;

interface IGetParam<T> {
	(userId: string): Q.Promise<T>;
}
interface ISetParam<T> {
	(userId: string, param: T): Q.Promise<boolean>;
}

/**
 * This creates a new inbox, returning a promise, resolvable either to true,
 * when a new account has been created for a given user id, or to false,
 * if an inbox already exists.
 */
export interface IAdd {
	(userId: string): Q.Promise<boolean>;
}
/**
 * This checks existence of a given user, returning a promise, resolvable
 * either to true, when given user id is known, or to false, when it is not.
 */
export interface IExists {
	(userId: string): Q.Promise<boolean>;
}
/**
 * This reads all user's parameters, and puts them into one object.
 * This function is here temporary, as initial simple setting
 * needs it, and we should move away from this setting. 
 */
export interface IGetInfo {
	(userId: string): Q.Promise<any>;
}
/**
 * This tells what is an allowable maximum message size for a given recipient,
 * for a given sender and/or under a given invitation token.
 * Function returns a promise, resolvable to
 * (1) undefined, if recipient is unknown,
 * (2) zero (0), if leaving mail is forbidden,
 * (3) greater than zero maximum message length, and
 * (4) -1 (less than zero), if mail cannot be accepted due to full mail
 *     box.
 */
export interface IAllowedMaxMsgSize {
	(recipient: string, sender: string, invitation: string): Q.Promise<number>;
}
/**
 * This allocates storage for a message returning a promise, resolvable to
 * (1) message id, when a folder for new message has been created,
 * (2) undefined, if recipient is unknown.
 */
export interface ISetMsgStorage {
	(recipient: string, msgMeta: deliveryApi.msgMeta.Request,
		authSender: string): Q.Promise<string>;
}
/**
 * This saves given object's bytes, returning a promise, resolvable when saving
 * is OK, otherwise, promise rejected with string error code from SC.
 */
export interface ISaveBytes {
	(recipient: string, bytes: stream.Stream,
		opts: BlobSaveOpts): Q.Promise<void>;
}
/**
 * This finalizes delivery of a message, returning a promise.
 * Rejected promise may have a string error code from SC.
 */
export interface IFinalizeDelivery {
	(recipient: string, msgId: string): Q.Promise<void>;
}
/**
 * This returns a promise, resolvable to array with ids of available messages.
 * Rejected promise may have a string error code from SC.
 */
export interface IGetMsgIds {
	(userId: string): Q.Promise<retrievalApi.listMsgs.Reply>;
}
/**
 * This returns a promise, resolvable to message meta.
 * Rejected promise may have a string error code from SC.
 */
export interface IGetMsgMeta {
	(userId: string, msgId: string): Q.Promise<retrievalApi.msgMetadata.Reply>;
}
/**
 * This deletes a message returning a promise, resolvable when message is
 * removed.
 * Rejected promise may have a string error code from SC.
 */
export interface IDeleteMsg {
	(userId: string, msgId: string): Q.Promise<void>;
}
export interface ObjReader extends inboxMod.ObjReader {}
/**
 * This returns a promise, resolvable to readable stream of bytes.
 * Rejected promise may be passing string error code from SC.
 */
export interface IGetBytes {
	(userId: string, opts: BlobGetOpts): Q.Promise<ObjReader>;
}
export interface IGetPubKey extends IGetParam<configApi.p.initPubKey.Certs> {}
export interface ISetPubKey extends ISetParam<configApi.p.initPubKey.Certs> {}
export interface IGetSpaceQuota extends IGetParam<number> {}
export interface IGetAnonSenderInvites
	extends IGetParam<configApi.p.anonSenderInvites.List> {}
export interface ISetAnonSenderInvites
	extends ISetParam<configApi.p.anonSenderInvites.List> {}
export interface Factory {
	add: IAdd;
	exists: IExists;
	getInfo: IGetInfo;
	allowedMaxMsgSize: IAllowedMaxMsgSize;
	setMsgStorage: ISetMsgStorage;
	saveObjSegments: ISaveBytes;
	saveObjHeader: ISaveBytes;
	finalizeDelivery: IFinalizeDelivery;
	getMsgIds: IGetMsgIds;
	getMsgMeta: IGetMsgMeta;
	deleteMsg: IDeleteMsg;
	getObjHeader: IGetBytes;
	getObjSegments: IGetBytes;
	getPubKey: IGetPubKey;
	setPubKey: ISetPubKey;
	getSpaceQuota: IGetSpaceQuota;
	getAnonSenderInvites: IGetAnonSenderInvites;
	setAnonSenderInvites: ISetAnonSenderInvites;
}

export interface BlobSaveOpts {
	msgId: string;
	objId: string;
	appendMode: boolean;
	isFirstReq: boolean;
	totalSize?: number;
	chunkLen: number;
	offset?: number;
}

export interface BlobGetOpts {
	msgId: string;
	objId: string;
	offset: number;
	maxLen?: number;
}

export function makeFactory(rootFolder) {
	
	var ibf = inboxFactoryMod.makeFactory(rootFolder);
	
	function makeParamGetter<T>(staticGetter:
			(inbox: inboxMod.Inbox) => Q.Promise<T>):
			(userId: string) => Q.Promise<T> {
		return (userId: string) => {
			return ibf.getInbox(userId)
			.then((inbox) => {
				if (!inbox) { throw SC.USER_UNKNOWN; }
				return staticGetter(inbox);
			});
		};		
	}
	
	function makeParamSetter<T>(staticSetter:
			(inbox: inboxMod.Inbox, param: T,
				setDefault: boolean) => Q.Promise<boolean>):
			(userId: string, param: T,
				setDefault?: boolean) => Q.Promise<boolean> {
		return (userId: string, param: T, setDefault?: boolean) => {
			return ibf.getInbox(userId)
			.then((inbox) => {
				if (!inbox) { throw SC.USER_UNKNOWN; }
				return staticSetter(inbox, param, setDefault);
			});
		};		
	}
	
	function makeBlobSaver(fileHeader: boolean): ISaveBytes {
		return (recipient: string, bytes: stream.Readable,
				opts: BlobSaveOpts): Q.Promise<void> => {
			return ibf.getInbox(recipient)
			.then((inbox: inboxMod.Inbox) => {
				if (!inbox) { throw SC.USER_UNKNOWN; }
				if (opts.appendMode) {
					return inbox.appendObj(opts.msgId, opts.objId,
						fileHeader, opts.isFirstReq, bytes, opts.chunkLen);
				} else {
					return inbox.saveObjChunk(opts.msgId, opts.objId,
						fileHeader, opts.isFirstReq, opts.totalSize,
						opts.offset, opts.chunkLen, bytes);
				}
			});
		};
	}
	
	function makeBlobGetter(fileHeader: boolean): IGetBytes {
		return (userId: string, opts: BlobGetOpts): Q.Promise<ObjReader> => {
			return ibf.getInbox(userId)
			.then((inbox: inboxMod.Inbox) => {
				if (!inbox) { throw SC.USER_UNKNOWN; }
				return inbox.getObj(opts.msgId, opts.objId, fileHeader,
					opts.offset, opts.maxLen);
			});
		};
	}
	
	var recipients: Factory = {

		add(userId: string): Q.Promise<boolean> {
			return ibf.makeNewInboxFor(userId)
			.then((inbox) => {
				return !!inbox;
			});
		},
	
		exists(userId: string): Q.Promise<boolean> {
			return ibf.getInbox(userId)
			.then((inbox) => {
				return !!inbox;
			});
		},
	
		getInfo(userId: string): Q.Promise<any> {
			return ibf.getInbox(userId)
			.then((inbox) => {
				if (!inbox) { return; }
				var info = {
					email: inbox.userId,
					pubKey: null,
					anonSenders: null,
					authSenders: null
				};
				return inboxMod.Inbox.getPubKey(inbox)
				.then((pkey) => {
					info.pubKey = pkey;
					return inbox.getAnonSenderPolicy();
				})
				.then((policy) => {
					info.anonSenders = policy;
					return inbox.getAnonSenderInvites();
				})
				.then((invites) => {
					info.anonSenders.inviteTokens = invites;
					return inbox.getAuthSenderPolicy();
				})
				.then((policy) => {
					info.authSenders = policy;
					return inbox.getAuthSenderBlacklist();
				})
				.then((blacklist) => {
					info.authSenders.blackList = blacklist;
					return inbox.getAuthSenderWhitelist();
				})
				.then((whitelist) => {
					info.authSenders.whiteList = whitelist;
					return inbox.getAuthSenderInvites();
				})
				.then((invites) => {
					info.authSenders.inviteTokens = invites;
					return info;
				});
			});
		},
		
		getPubKey: makeParamGetter(inboxMod.Inbox.getPubKey),
		setPubKey: makeParamSetter(inboxMod.Inbox.setPubKey),
		
		getSpaceQuota: makeParamGetter(inboxMod.Inbox.getSpaceQuota),
		
		getAnonSenderInvites: makeParamGetter(
			inboxMod.Inbox.getAnonSenderInvites),
		setAnonSenderInvites: makeParamSetter(
			inboxMod.Inbox.setAnonSenderInvites),

	
		allowedMaxMsgSize(recipient: string, sender: string,
				invitation: string): Q.Promise<number> {
			return ibf.getInbox(recipient)
			.then((inbox: inboxMod.Inbox) => {
				if (!inbox) { return; }	// undefined for unknown recipient
				return (sender ?
						allowedMsgSizeForAuthSender(inbox, sender, invitation) :
						allowedMsgSizeForAnonSender(inbox, invitation));
			});
		},
	
		setMsgStorage(recipient: string, msgMeta: deliveryApi.msgMeta.Request,
				authSender: string): Q.Promise<string> {
			return ibf.getInbox(recipient)
			.then((inbox: inboxMod.Inbox) => {
				if (!inbox) { throw SC.USER_UNKNOWN; }
				return inbox.recordMsgMeta(msgMeta, authSender);
			});
		},
		
		saveObjSegments: makeBlobSaver(false),
		saveObjHeader: makeBlobSaver(true),
	
		finalizeDelivery(recipient: string, msgId: string): Q.Promise<void> {
			return ibf.getInbox(recipient)
			.then((inbox: inboxMod.Inbox) => {
				if (!inbox) { throw SC.USER_UNKNOWN; }
				return inbox.completeMsgDelivery(msgId);
			});
		},
	
		getMsgIds(userId: string): Q.Promise<string[]> {
			return ibf.getInbox(userId)
			.then((inbox: inboxMod.Inbox) => {
				if (!inbox) { throw SC.USER_UNKNOWN; }
				return inbox.getMsgIds();
			});
		},
	
		getMsgMeta(userId: string, msgId: string):
				Q.Promise<retrievalApi.msgMetadata.Reply> {
			return ibf.getInbox(userId)
			.then((inbox: inboxMod.Inbox) => {
				if (!inbox) { throw SC.USER_UNKNOWN; }
				return inbox.getMsgMeta(msgId);
			});
		},
	
		deleteMsg(userId: string, msgId: string): Q.Promise<void> {
			return ibf.getInbox(userId)
			.then((inbox: inboxMod.Inbox) => {
				if (!inbox) { throw SC.USER_UNKNOWN; }
				return inbox.rmMsg(msgId);
			});
		},
		
		getObjSegments: makeBlobGetter(false),
		getObjHeader: makeBlobGetter(true)
		
	};
	Object.freeze(recipients);
	
	return recipients;
}

Object.freeze(exports);