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
 * This defines interfaces for mail delivery requests.
 */

import jwk = require('../../jwkeys');
import config = require('./config');
var Uri = require('jsuri');

export var ERR_SC = {
	duplicateReq: 475,
	earlyReq: 476,
	malformed: 400,
	server: 500,
	contentTooLong: 413,
	contentLenMissing: 411,
	wrongContentType: 415
};
Object.freeze(ERR_SC);

export module preFlight {
	
	export var URL_END = 'pre-flight';
	
	export interface Request extends sessionStart.Request { }
	
	export interface Reply {
		maxMsgLength: number;
	}
	
	export interface RedirectReply {
		redirect: string;
	}
	
	export var SC = {
		ok: 200,
		unknownRecipient: 474,
		senderNotAllowed: 403,
		inboxFull: 480,
		redirect: 373
	};
	Object.freeze(SC);
	
}
Object.freeze(preFlight);

export module sessionStart {
	
	export var URL_END = 'start-session';
	
	export interface Request {
		sender: string;
		recipient: string;
		invitation: string;
	}
	
	export interface Reply extends preFlight.Reply {
		sessionId: string;
	}
	
	export interface RedirectReply extends preFlight.RedirectReply {}
	
	export var SC = preFlight.SC;
	
}
Object.freeze(sessionStart);

export module authSender {
	
	export var URL_END = 'authorize-sender';
	
	export interface Request {
		assertion: jwk.SignedLoad;
		userCert: jwk.SignedLoad;
		provCert: jwk.SignedLoad;
	}
	
	export var SC = {
		ok: 200,
		authFailed: 403
	};
	Object.freeze(SC);
	
}
Object.freeze(authSender);

export module initPubKey {
	
	export var URL_END = 'init-pub-key';
	
	export interface Reply extends config.p.initPubKey.Certs {}
	
	export var SC = {
		ok: 200,
		unknownKey: 474
	};
	Object.freeze(SC);
	
}
Object.freeze(initPubKey);

export module msgMeta {
	
	export var URL_END = 'msg/meta';
	
	export interface CryptoInfo {
		pid?: string;
		recipientKid?: string;
		senderPKey?: string;
	}
	
	export interface Request extends CryptoInfo {
		objIds: string[];
	}
	
	export interface Reply {
		msgId: string;
		maxChunkSize? : number;
	}
	
	export var SC = {
		ok: 201
	};
	
}
Object.freeze(msgMeta);

export interface BlobQueryOpts {
	/**
	 * Indicates that bytes in this request should be appended to the blob.
	 */
	append: boolean;
	/**
	 * Total number of bytes that need to be transferred, marking this
	 * request as the first one in sending a blob. If more than one request
	 * is required to transfer a blob, subsequent request should not have
	 * this option parameter in the request. In other words, this parameter
	 * indicates the first request in blob transfer.
	 * When blob's length is not yet known, and a blob is written in an
	 * appending mode, this parameter must be set to -1.
	 */
	total?: number;
	/**
	 * Offset in a blob. It must be present with in an not appending mode.
	 */
	ofs?: number;
}

function optsToString(opts: BlobQueryOpts): string {
	var url = new Uri();
	if ('number' === typeof opts.total) {
		url.addQueryParam('total', ''+opts.total);
	}
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

export module msgObjHeader {
	
	export var EXPRESS_URL_END = 'msg/obj/:objId/header';
	
	export function genUrlEnd(objId: string, opts: BlobQueryOpts): string {
		return 'msg/obj/'+objId+'/header'+optsToString(opts);
	}
	
	export var SC = {
		ok: 201,
		objAlreadyExists: 473,
		unknownObj: 474
	};
	Object.freeze(SC);
	
}
Object.freeze(msgObjHeader);

export module msgObjSegs {
	
	export var EXPRESS_URL_END = 'msg/obj/:objId/segments';
	
	export function genUrlEnd(objId: string, opts: BlobQueryOpts): string {
		return 'msg/obj/'+objId+'/segments'+optsToString(opts);
	}
	
	export var SC = msgObjHeader.SC;
	
}
Object.freeze(msgObjSegs);

export module completion {
	
	export var URL_END = 'msg-complete';
	
}
Object.freeze(completion);

export interface ErrorReply {
	error: string;
}

Object.freeze(exports);