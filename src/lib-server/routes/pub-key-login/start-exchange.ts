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
 * This creates a public key login 'start-login-exchange' route handler
 * for POST method.
 */

import express = require('express');
import nacl = require('ecma-nacl');
import Q = require('q');
import base64 = require('../../../lib-common/base64');
import random = require('../../../lib-server/random');
import sessions = require('../../resources/sessions');
import sessionEncr = require('../../../lib-common/session-encryptor');
import api = require('../../../lib-common/service-api/pub-key-login');

var boxWN = nacl.secret_box.formatWN;
var NONCE_LENGTH = nacl.secret_box.NONCE_LENGTH;
var KEY_LENGTH = nacl.secret_box.KEY_LENGTH;
var POLY_LENGTH = nacl.secret_box.POLY_LENGTH;

var SC = api.start.SC;

export interface SessionParams {
	encryptor: sessionEncr.SessionEncryptor;
	userId: string;
	sessionKey: Uint8Array;
	serverVerificationBytes: Uint8Array;
}

export interface Request extends sessions.Request<SessionParams> {}

function addEncryptorToSession(session: sessions.Session<SessionParams>,
		sessionKey: Uint8Array, nonce: Uint8Array) {
	var encryptor = sessionEncr.makeSessionEncryptor(sessionKey, nonce);
	session.params.encryptor = encryptor;
	session.addCleanUp(function() {
		encryptor.destroy();
		if (session.params.encryptor === encryptor) {
			session.params.encryptor = null;
		}
	});
}

export interface IGetUserPKeyAndKeyGenParams {
	(userId: string): {
		key: Uint8Array;
		params: any;
	};
}

export interface IComputeDHSharedKey {
	(userKey: Uint8Array): {
		dhsharedKey: Uint8Array;
		serverPubKey: Uint8Array;
	};
}

export function makeHandler(findUserParamsAndKeyFunc: IGetUserPKeyAndKeyGenParams,
		sessionGenFunc: sessions.IGenerateSession<SessionParams>,
		computeDHSharedKeyFunc: IComputeDHSharedKey):
		express.RequestHandler {
	if ('function' !== typeof findUserParamsAndKeyFunc) { throw new TypeError(
			"Given argument 'findUserParamsAndKeyFunc' must be function, but is not."); }
	if ('function' !== typeof sessionGenFunc) { throw new TypeError(
			"Given argument 'sessionGenFunc' must be function, but is not."); }
	if ('function' !== typeof computeDHSharedKeyFunc) { throw new TypeError(
			"Given argument 'computeDHSharedKeyFunc' must be function, but is not."); }

	return (req: Request, res: express.Response, next: Function) => {

		var userId = (<api.start.Request> req.body).userId;
		var session = req.session;
		
		// missing userId makes a bad request
		if ('string' !== typeof userId) {
			res.status(api.ERR_SC.malformed).json( <api.ErrorReply> {
				error: "User id is missing in the request."
			});
			return;
		}
		
		// find user info
		var userParamsAndKey = findUserParamsAndKeyFunc(userId);
		if (!userParamsAndKey) {
			res.status(SC.unknownUser).json( <api.ErrorReply> {
				error: "User "+userId+" is unknown."
			});
			return;
		}
		
		// bounce off existing and already authorized session
		if (session && session.isAuthorized) {
			res.status(api.ERR_SC.duplicate).json( <api.ErrorReply> {
				error: "Repeated call: "+
					"this session has already been authorized."
			});
			return;
		}

		// generate session, if it is not present
		Q.fcall(() => {
			if (session) {
				return session;
			} else {
				return sessionGenFunc()
				.then((s) => {
					session = s;
					session.params.userId = userId;
				});
			}
		})
		.then(() => {
			
			// get random bytes for session key and nonce
			var nonce = random.bytes(NONCE_LENGTH);
			var sessionKey = random.bytes(KEY_LENGTH);
			
			// compute DH-shared key for encrypting a challenge
			var compRes = computeDHSharedKeyFunc(userParamsAndKey.key)
			var dhsharedKey = compRes.dhsharedKey
			var serverPubKey = compRes.serverPubKey
			// make challenge with session key, removing and saving poly part
			// for sending it later as a server verification at the end
			var encryptedSessionKey = boxWN.pack(sessionKey, nonce, dhsharedKey)
			var serverVerificationBytes = encryptedSessionKey.subarray(
					NONCE_LENGTH, NONCE_LENGTH + POLY_LENGTH)
			var challengeWithSessionKey = new Uint8Array(NONCE_LENGTH + KEY_LENGTH);
			challengeWithSessionKey.set(
					encryptedSessionKey.subarray(0, NONCE_LENGTH));
			challengeWithSessionKey.set(
					encryptedSessionKey.subarray(NONCE_LENGTH + POLY_LENGTH),
					NONCE_LENGTH);
			
			// wipe the DH-shared key
			nacl.arrays.wipe(dhsharedKey);

			// add to session a corresponding encryptor for login completion, and,
			// may be for further use
			nacl.nonce.advanceEvenly(nonce);
			addEncryptorToSession(session, sessionKey, nonce);
			session.params.sessionKey = sessionKey;
			session.params.serverVerificationBytes = serverVerificationBytes;

			// send out reply
			res.status(SC.ok).json( <api.start.Reply> {
				sessionId: session.id,
				sessionKey: base64.pack(challengeWithSessionKey),
				serverPubKey: base64.pack(serverPubKey),
				keyDerivParams: userParamsAndKey.params
			});

		})
		.fail(function(err){
			next(err);
		})
		.done();

	};
}

Object.freeze(exports);