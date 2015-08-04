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

import express = require('express');
import users  = require('../../resources/users');
import base64 = require('../../../lib-common/base64');
import jwk = require('../../../lib-common/jwkeys');
import nacl = require('ecma-nacl');
var KEY_USE = 'login-pub-key';

function throwupOnBadPKeyJSON(pkey: jwk.JsonKey): void {
	if (pkey.use !== KEY_USE) { throw new Error(
			"Given key is not indicated as public use."); }
	if (pkey.alg === nacl.box.JWK_ALG_NAME) {
		if ("string" !== typeof pkey.k) { throw new Error(
				"NaCl-box key is missing 'k' field with key in base64 encoding."); }
		var keyBytes: Uint8Array;
		try {
			keyBytes = base64.open(pkey.k);
		} catch (err) {
			throw new Error("Given key string value cannot be interpreted as base64.");
		}
		if (keyBytes.length !== nacl.box.KEY_LENGTH) { throw new Error(
				"Given key length is incorrect for NaCl-box."); }
	} else {
		throw new Error("Given key algorithm '"+pkey.alg+"' is not supported.");
	}
}

export function makeHandler(userCreatingFunc: users.IAdd):
		express.RequestHandler {
	if ('function' !== typeof userCreatingFunc) { throw new TypeError(
			"Given argument 'userCreatingFunc' must be function, but is not."); }
	
	return (req: express.Request, res: express.Response) => {
		
		var id: string = req.body.id;
		var pkey: jwk.JsonKey = req.body.pkey;
		var params: any = req.body.params;
		
		// check for missing things
		if (!id || !pkey || !params) {
			res.status(400).send("Missing user info fields.");
			return;
		}
		
		// verify that public key json is ok
		try {
			throwupOnBadPKeyJSON(pkey);
		} catch (err) {
			res.status(400).send(err.message);
			return;
		}
		
		var newUserCreated = userCreatingFunc({
			id: id,
			pkey: pkey,
			params: params
		});
		
		if (newUserCreated) {
			res.status(201).end();
		} else {
			res.status(473).send("Account with id '"+id+"' already exists.");
		}
		
	};
};