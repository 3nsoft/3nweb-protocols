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
 * This creates a public key login 'complete-login-exchange' route handler
 * for POST method.
 */

import express = require('express');
import nacl = require('ecma-nacl');
import base64 = require('../../../lib-common/base64');
import pklSess = require('./start-exchange');
import api = require('../../../lib-common/service-api/pub-key-login');

var SC = api.complete.SC;

export function makeHandler(): express.RequestHandler {
	return (req: pklSess.Request, res: express.Response, next: Function) => {
		
		var session = req.session;
		
		// bounce off already authorized session
		if (session.isAuthorized) {
			res.status(api.ERR_SC.duplicate).json( <api.ErrorReply> {
				error: "Repeated call: "+
					"this session has already been authorized."
			});
			return;
		}

		try {
			var c = new Uint8Array(req.body);
			var decryptedKey = session.params.encryptor.open(c);
			var key = session.params.sessionKey;
			if (!nacl.compareVectors(decryptedKey, key)) { throw new Error(); }
			session.isAuthorized = true;
			res.status(SC.ok).send(new Buffer(
				session.params.serverVerificationBytes));
		} catch (err) {
			session.close();
			res.status(SC.authFailed).json( <api.ErrorReply> {
				error: "Forbidden."
			});
		} finally {
			nacl.arrays.wipe(session.params.sessionKey);
			delete session.params.sessionKey;
			delete session.params.serverVerificationBytes;
		}
	};
};

Object.freeze(exports);