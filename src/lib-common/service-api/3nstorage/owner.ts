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
 * This defines interfaces for mail retrieval requests.
 */

import midApi = require('../mailer-id/login');
var Uri = require('jsuri');

export var ERR_SC = {
	malformed: 400,
	needAuth: 401,
	server: 500,
	contentTooLong: 413,
	contentLenMissing: 411,
	wrongContentType: 415,
	noSpace: 480
};
Object.freeze(ERR_SC);

export var HTTP_HEADER = {
	contentType: 'Content-Type',
	contentLength: 'Content-Length',
	objVersion: 'X-Version'
}
Object.freeze(HTTP_HEADER);

export var BIN_TYPE = 'application/octet-stream';

export module midLogin {
	
	export var MID_URL_PART = 'login/mailerid/';
	export var START_URL_END = MID_URL_PART + midApi.startSession.URL_END;
	export var AUTH_URL_END = MID_URL_PART + midApi.authSession.URL_END;

}
Object.freeze(midLogin);

export module closeSession {
	
	export var URL_END = 'session/close';
	
}
Object.freeze(closeSession);

export module sessionParams {
	
	export var URL_END = 'session/params';
	
	export interface Reply {
		keyDerivParams: any;
		maxChunkSize: number;
	}
	
}
Object.freeze(sessionParams);

export interface GetBlobQueryOpts {
	/**
	 * Offset in a blob. It must be present with length parameter.
	 */
	ofs?: number;
	/**
	 * Length in a blob's chunk. It must be present with offset parameter.
	 */
	len?: number;
	/**
	 * Object's version. If missing, current version is assumed.
	 */
	ver?: number;
}

function getOptsToString(opts: GetBlobQueryOpts): string {
	if (!opts) { return ''; }
	var url = new Uri();
	if ('number' === typeof opts.ofs) {
		url.addQueryParam('ofs', ''+opts.ofs);
	}
	if ('number' === typeof opts.len) {
		url.addQueryParam('len', ''+opts.len);
	}
	if ('number' === typeof opts.ver) {
		url.addQueryParam('ver', ''+opts.ver);
	}
	return url.toString();
}

export interface PutBlobQueryOpts {
	/**
	 * Transaction id, in which these bytes are absorbed.
	 */
	trans: string;
	/**
	 * Indicates that bytes in this request should be appended to the blob.
	 */
	append: boolean;
	/**
	 * Offset in a blob. It must be present in a not appending mode.
	 */
	ofs?: number;
}

function putOptsToString(opts: PutBlobQueryOpts): string {
	var url = new Uri();
	url.addQueryParam('trans', ''+opts.trans);
	if (opts.append) {
		url.addQueryParam('append', 'true');
		return url.toString();
	} else {
		if ('number' === typeof opts.ofs) {
			url.addQueryParam('ofs', opts.ofs);
			return url.toString();
		} else {
			throw new Error('Incorrect options are given.');
		}
	}
}

export module rootHeader {
	
	export var EXPRESS_URL_END = 'root/header';
	
	export function getReqUrlEnd(opts?: GetBlobQueryOpts): string {
		return EXPRESS_URL_END+getOptsToString(opts);
	}
	
	export function putReqUrlEnd(opts?: PutBlobQueryOpts): string {
		return EXPRESS_URL_END+putOptsToString(opts);
	}
	
	export var SC = {
		okGet: 200,
		okPut: 201,
		missing: 474
	};
	Object.freeze(SC);
	
}
Object.freeze(rootHeader);

export module rootSegs {
	
	export var EXPRESS_URL_END = 'root/segments';
	
	export function getReqUrlEnd(opts?: GetBlobQueryOpts): string {
		return EXPRESS_URL_END+getOptsToString(opts);
	}
	
	export function putReqUrlEnd(opts?: PutBlobQueryOpts): string {
		return EXPRESS_URL_END+putOptsToString(opts);
	}
	
	export var SC = rootHeader.SC;
	
}
Object.freeze(rootHeader);

export module objHeader {
	
	export var EXPRESS_URL_END = 'obj/:objId/header';
	
	export function getReqUrlEnd(objId: string, opts?: GetBlobQueryOpts): string {
		return 'obj/'+objId+'/header'+getOptsToString(opts);
	}
	
	export function putReqUrlEnd(objId: string, opts?: PutBlobQueryOpts): string {
		return 'obj/'+objId+'/header'+putOptsToString(opts);
	}
	
	export var SC = {
		okGet: 200,
		okPut: 201,
		unknownObj: 474
	};
	Object.freeze(SC);
	
}
Object.freeze(objHeader);

export module objSegs {
	
	export var EXPRESS_URL_END = 'obj/:objId/segments';
	
	export function getReqUrlEnd(objId: string, opts?: GetBlobQueryOpts): string {
		return 'obj/'+objId+'/segments'+getOptsToString(opts);
	}
	
	export function putReqUrlEnd(objId: string, opts?: PutBlobQueryOpts): string {
		return 'obj/'+objId+'/segments'+putOptsToString(opts);
	}
	
	export var SC = objHeader.SC;
	
}
Object.freeze(objSegs);

export interface DiffInfo {}

export interface TransactionParams {
	isNewObj?: boolean;
	sizes?: {
		header: number;
		segments: number;
	};
	diff?: DiffInfo;
}

export module startTransaction {
	
	export var EXPRESS_URL_END = 'obj/:objId/transaction/start';
	
	export function getReqUrlEnd(objId: string): string {
		return 'obj/'+objId+'/transaction/start';
	}
	
	export interface Request extends TransactionParams {}
	
	export interface Reply {
		transactionId: string;
	}
	
	export var SC = {
		ok: 200,
		unknownObj: 474,
		objAlreadyExists: 473,
		concurrentTransaction: 483,
		incompatibleObjState: 484
	};
	Object.freeze(SC);
	
}
Object.freeze(startTransaction);

export module startRootTransaction {
	
	export var URL_END = 'root/transaction/start';
	
	export interface Request extends startTransaction.Request {}
	
	export interface Reply extends startTransaction.Reply {}
	
}
Object.freeze(startRootTransaction);

export module finalizeTransaction {
	
	export var EXPRESS_URL_END =
		'obj/:objId/transaction/finalize/:transactionId';
	
	export function getReqUrlEnd(objId: string, transactionId: string): string {
		return 'obj/'+objId+'/transaction/finalize/'+transactionId;
	}
	
	export var SC = {
		ok: 200,
		unknownObj: 474,
		unknownTransaction: 484
	};
	Object.freeze(SC);
	
}
Object.freeze(finalizeTransaction);

export module cancelTransaction {
	
	export var EXPRESS_URL_END = 'obj/:objId/transaction/cancel/:transactionId';
	
	export function getReqUrlEnd(objId: string, transactionId: string): string {
		return 'obj/'+objId+'/transaction/cancel/'+transactionId;
	}
	
	export var SC = finalizeTransaction.SC;
	
}
Object.freeze(cancelTransaction);

export module finalizeRootTransaction {
	
	export var EXPRESS_URL_END = 'root/transaction/finalize/:transactionId';
	
	export function getReqUrlEnd(transactionId: string): string {
		return 'root/transaction/finalize/'+transactionId;
	}
	
	export var SC = finalizeTransaction.SC;
	
}
Object.freeze(finalizeRootTransaction);

export module cancelRootTransaction {
	
	export var EXPRESS_URL_END = 'root/transaction/cancel/:transactionId';
	
	export function getReqUrlEnd(transactionId: string): string {
		return 'root/transaction/cancel/'+transactionId;
	}
	
	export var SC = finalizeTransaction.SC;
	
}
Object.freeze(cancelRootTransaction);


export interface ErrorReply {
	error: string;
}

Object.freeze(exports);