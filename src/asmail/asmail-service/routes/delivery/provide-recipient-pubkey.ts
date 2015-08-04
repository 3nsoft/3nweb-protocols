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
import Q = require('q');
import recipMod = require('../../../resources/recipients');
import jwk = require('../../../../lib-common/jwkeys');
import api = require('../../../../lib-common/service-api/asmail/delivery');
import delivSess = require('./start-session');

var SC = api.initPubKey.SC;

/**
 * This creates a get-init-pub-key route handler.
 * @param pkeyProvidingFunc is a function that provides recipient's public key
 * for use in this communication. 
 */
export function makeHandler(pkeyProvidingFunc: recipMod.IGetPubKey):
		express.RequestHandler {
	if ('function' !== typeof pkeyProvidingFunc) { throw new TypeError(
			"Given argument 'pkeyProvidingFunc' must be function, but is not."); }
	
	return (req: delivSess.Request, res: express.Response, next: Function) => {
		
		var session = req.session;
		
		pkeyProvidingFunc(session.params.recipient)
		.then((certs) => {
			res.status(SC.ok).json(certs);
		})
		.fail((err) => {
			if ("string" !== typeof err) {
				next(err);
			} else if (err === recipMod.SC.USER_UNKNOWN) {
				res.status(api.ERR_SC.server).send(
					"Recipient disappeared from the system.");
				session.close();
			}
		})
		.done();
		
	};
}
Object.freeze(exports);