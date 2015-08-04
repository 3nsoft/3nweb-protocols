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
 * This defines interfaces for mail configuration requests.
 */

import jwk = require('../../jwkeys');
import midApi = require('../mailer-id/login');

export var ERR_SC = {
	server: 500
};
Object.freeze(ERR_SC);

export var PARAM_SC = {
	malformed: 400,
	ok: 200
};
Object.freeze(PARAM_SC);

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

export module p.initPubKey {
	
	export var URL_END = 'param/init-pub-key';
	
	export interface Certs {
		pkeyCert: jwk.SignedLoad;
		userCert: jwk.SignedLoad;
		provCert: jwk.SignedLoad;
	}
	
}
Object.freeze(p.initPubKey);

export module p.authSenderPolicy {
	
	export var URL_END = 'param/auth-sender/policy';
	
	export interface Policy {
		acceptWithInvitesOnly: boolean;
		acceptFromWhiteListOnly: boolean;
		applyBlackList: boolean;
		defaultMsgSize: number;
	}
	
}
Object.freeze(p.authSenderPolicy);

export module p.authSenderWhitelist {
	
	export var URL_END = 'param/auth-sender/whitelist';
	
	export interface List {
		[address: string]: number;
	}
	
}
Object.freeze(p.authSenderWhitelist);

export module p.authSenderBlacklist {
	
	export var URL_END = 'param/auth-sender/blacklist';
	
	export interface List {
		[address: string]: number;
	}
	
}
Object.freeze(p.authSenderBlacklist);

export module p.authSenderInvites {
	
	export var URL_END = 'param/auth-sender/invites';
	
	export interface List {
		[invite: string]: number;
	}
	
}
Object.freeze(p.authSenderInvites);

export module p.anonSenderPolicy {
	
	export var URL_END = 'param/anon-sender/policy';
	
	export interface Policy {
		accept: boolean;
		acceptWithInvitesOnly: boolean;
		defaultMsgSize: number;
	}
	
}
Object.freeze(p.anonSenderPolicy);

export module p.anonSenderInvites {
	
	export var URL_END = 'param/anon-sender/invites';
	
	export interface List {
		[invite: string]: number;
	}
	
}
Object.freeze(p.anonSenderInvites);


Object.freeze(p);

export interface ErrorReply {
	error: string;
}

Object.freeze(exports);