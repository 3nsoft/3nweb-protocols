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
import jwk = require('../../../../lib-common/jwkeys');
import recipMod = require('../../../resources/recipients');
import api = require('../../../../lib-common/service-api/asmail/delivery');
import delivSess = require('./start-session');

var SC = api.authSender.SC;

export interface IMidAuthorizer {
	(rpDomain: string, sessionId: string, mailerIdAssertion: jwk.SignedLoad,
		userCert: jwk.SignedLoad, provCert: jwk.SignedLoad): Q.Promise<string>;
}

/**
 * This creates an authorize-sender route handler.
 * @param mailerIdAuthorizingFunc is a function returning promise, which resolves into
 * boolean flag, with true value for authorization passing, and false for failed
 * authorization. 
 */
export function makeHandler(midAuthorizingFunc: IMidAuthorizer):
		express.RequestHandler {
	if ('function' !== typeof midAuthorizingFunc) { throw new TypeError(
			"Given argument 'midAuthorizingFunc' must be function, but is not."); }
	
	return (req: delivSess.Request, res: express.Response, next: Function) => {
		
		if (req.session.isAuthorized) {
			res.status(api.ERR_SC.duplicateReq).send(
				"This protocol request has already been served.");
			return;
		}
		
		var rb: api.authSender.Request = req.body;
		var sender = req.session.params.sender;
		var sessionId = req.session.id;

		if (!sender) {
			// This case must be rejected, because place for authorizing
			// anonymous connection is at the session start.
			res.status(SC.authFailed).send(
				"Server is not accepting provided credentials.");
			req.session.close();
			return;
		}
		
		if (!rb.assertion || !rb.userCert || !rb.provCert) {
			res.status(api.ERR_SC.malformed).send("No credentials given.");
			req.session.close();
			return;
		}
		
		try {
			if (sender !== jwk.getPrincipalAddress(rb.userCert)) {
				res.status(SC.authFailed).send(
					"Certificate is for a wrong sender.");
				req.session.close();
				return;
			}
		} catch (e) {
			res.status(api.ERR_SC.malformed).send(
				"Malformed sender certificate.");
			req.session.close();
			return;
		}
		
		midAuthorizingFunc(req.hostname, sessionId,
			rb.assertion, rb.userCert, rb.provCert)
		.then((sender) => {
			if (sender) {
				req.session.isAuthorized = true;
				res.status(SC.ok).end();
			} else {
				res.status(SC.authFailed).send(
					"Server is not accepting provided credentials.");
				req.session.close();
			}
		})
		.fail((err) => {
			next(err);
		})
		.done();
		
	};
}
Object.freeze(exports);