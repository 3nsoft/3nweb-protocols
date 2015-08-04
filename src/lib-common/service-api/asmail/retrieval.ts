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
import deliveryApi = require('./delivery');
var Uri = require('jsuri');

export var ERR_SC = {
	malformed: 400,
	needAuth: 401,
	server: 500
};
Object.freeze(ERR_SC);

export module midLogin {
	
	export var MID_URL_PART = 'login/mailerid/';
	export var START_URL_END = MID_URL_PART + midApi.startSession.URL_END;
	export var AUTH_URL_END = MID_URL_PART + midApi.authSession.URL_END;

}
Object.freeze(midLogin);

export module closeSession {
	
	export var URL_END = 'close-session';
	
}
Object.freeze(closeSession);

export module listMsgs {
	
	export var URL_END = 'msg/ids';
	
	export interface Reply extends Array<string> {}
	
}
Object.freeze(listMsgs);

export module rmMsg {
	
	export var EXPRESS_URL_END = 'msg/:msgId';
	
	export function genUrlEnd(msgId: string): string {
		return 'msg/'+msgId;
	}
	
	export var SC = {
		ok: 200,
		unknownMsg: 474
	};
	Object.freeze(SC);
	
}
Object.freeze(rmMsg);

export module msgMetadata {
	
	export var EXPRESS_URL_END = 'msg/:msgId/meta';
	
	export function genUrlEnd(msgId: string): string {
		return 'msg/'+msgId+'/meta';
	}
	
	export interface Reply {
		extMeta: deliveryApi.msgMeta.Request;
		deliveryStart: number;
		authSender: string;
		deliveryCompletion?: number;
		objSizes?: {
			[objId: string]: {
				segments: number;
				header: number;
			};
		};
	}
	
	export var SC = {
		ok: 200,
		unknownMsg: 474
	};
	Object.freeze(SC);
	
}
Object.freeze(msgMetadata);

export interface BlobQueryOpts {
	/**
	 * Offset in a blob. It must be present with length parameter.
	 */
	ofs?: number;
	/**
	 * Length in a blob's chunk. It must be present with offset parameter.
	 */
	len?: number;
}

function optsToString(opts: BlobQueryOpts): string {
	if (!opts) { return ''; }
	var url = new Uri();
	if ('number' === typeof opts.ofs) {
		url.addQueryParam('ofs', ''+opts.ofs);
	}
	if ('number' === typeof opts.len) {
		url.addQueryParam('len', ''+opts.len);
	}
	return url.toString();
}

export module msgObjHeader {
	
	export var EXPRESS_URL_END = 'msg/:msgId/obj/:objId/header';
	
	export function genUrlEnd(msgId: string, objId: string,
			opts?: BlobQueryOpts): string {
		return 'msg/'+msgId+'/obj/'+objId+'/header'+optsToString(opts);
	}
	
	export var SC = {
		ok: 200,
		unknownMsgOrObj: 474
	};
	Object.freeze(SC);
	
}
Object.freeze(msgObjHeader);

export module msgObjSegs {
	
	export var EXPRESS_URL_END = 'msg/:msgId/obj/:objId/segments';
	
	export function genUrlEnd(msgId: string, objId: string,
			opts?: BlobQueryOpts): string {
		return 'msg/'+msgId+'/obj/'+objId+'/segments'+optsToString(opts);
	}
	
	export var SC = msgObjHeader.SC;
	
}
Object.freeze(msgObjSegs);

export interface ErrorReply {
	error: string;
}

Object.freeze(exports);