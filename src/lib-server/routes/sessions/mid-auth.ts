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
import sessStart = require('./start');
import Q = require('q');
import jwk = require('../../../lib-common/jwkeys');
import api = require('../../../lib-common/service-api/mailer-id/login');

/**
 * This function returns a promise, which resolves into principal's address for
 * authorization passing, and undefined for failed authorization.
 * Autherization failure may be due to either, invalid MailerId credentials, or
 * due to other service's restriction(s) on users.
 */
export interface IMidAuthorizer {
	(rpDomain: string, sessionId: string, mailerIdAssertion: jwk.SignedLoad,
		userCert: jwk.SignedLoad, provCert: jwk.SignedLoad): Q.Promise<string>;
}

var SC = api.authSession.SC;

/**
 * This creates an authorize-sender route handler.
 */
export function makeHandler(midAuthorizingFunc: IMidAuthorizer):
		express.RequestHandler {
	if ('function' !== typeof midAuthorizingFunc) { throw new TypeError(
			"Given argument 'midAuthorizingFunc' must be function, but is not."); }
	
	return (req: sessStart.Request, res: express.Response, next: Function) => {
		
		if (req.session.isAuthorized) {
			res.status(api.ERR_SC.duplicate).send(
				"This protocol request has already been served.");
			return;
		}
		
		var rb: api.authSession.Request = req.body;
		var sessionId = req.session.id;
		
		if (!rb.assertion || !rb.userCert || !rb.provCert) {
			res.status(api.ERR_SC.malformed).send("No credentials given.");
			req.session.close();
			return;
		}
		
		midAuthorizingFunc(req.hostname, sessionId,
			rb.assertion, rb.userCert, rb.provCert)
		.then((userId) => {
			if (!userId || (userId !== req.session.params.userId)) {
				req.session.close();
				res.status(SC.authFailed).send(
					"Server is not accepting provided credentials.");
			} else {
				req.session.isAuthorized = true;
				res.status(SC.ok).end();
			}
		})
		.fail((err) => {
			next(err);
		})
		.done();
		
	};
}
Object.freeze(exports);