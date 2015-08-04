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
import sessions = require('../../resources/sessions');
import Q = require('q');
import api = require('../../../lib-common/service-api/mailer-id/login');

export interface SessionParams {
	userId: string;
}

export interface Request extends sessions.Request<SessionParams> {}

export interface IUserExists {
	(userId: string): Q.Promise<boolean>;
}

export interface IRedirect {
	(userId: string): Q.Promise<string>;
}

var SC = api.startSession.SC;

/**
 * @param allowUserFunc
 * @param sessionGenFunc
 * @param redirectFunc (optional)
 * @return route handler that creates sessions for a given userId, with
 * potential redirect for a named user.
 */
export function makeHandler(userExistsFunc: IUserExists,
		sessionGenFunc: sessions.IGenerateSession<any>,
		redirectFunc?: IRedirect): express.RequestHandler {
	if ('function' !== typeof userExistsFunc) { throw new TypeError(
			"Given argument 'userExistsFunc' must be function, but is not."); }
	if ('function' !== typeof sessionGenFunc) { throw new TypeError(
			"Given argument 'sessionGenFunc' must be function, but is not."); }
	if (('undefined' !== typeof redirectFunc) &&
			('function' !== typeof redirectFunc)) { throw new TypeError(
			"Given argument 'redirectFunc' must either be function, " +
			"or be undefined, but it is neither."); }
	
	return (req: Request, res: express.Response, next: Function) => {
		
		var session = req.session;
		var userId = (<api.startSession.Request> req.body).userId;
		
		if (!userId) {
			res.status(api.ERR_SC.malformed).json( <api.ErrorReply> {
				error: "User id is missing."
			});
			return;
		}
		
		// already existing session indicates repeated call, which
		// should be bounced off
		if (session) {
			res.status(api.ERR_SC.duplicate).json( <api.ErrorReply> {
				error: "This protocol request has already been served."
			});
			return;
		}
		
		function serveRequestHere(): Q.Promise<void> {
			return userExistsFunc(userId)
			.then((userExists) => {
				if (userExists) {
					return sessionGenFunc()
					.then((session) => {
						(<SessionParams> session.params).userId = userId;
						res.status(SC.ok).json( <api.startSession.Reply> {
							sessionId: session.id,
						});
					});
				} else {
					res.status(SC.unknownUser).json( <api.ErrorReply> {
						error: "User "+userId+" is unknown."
					});
				}
			});
		}
		
		var promise = null;
		
		if (redirectFunc) {
			promise = redirectFunc(userId)
			.then((redirectTo) => {
				if (redirectTo) {
					res.status(SC.redirect).json(
						<api.startSession.RedirectReply> {
							redirect: redirectTo
						});
				} else {
					return serveRequestHere();
				}
			});
		} else {
			promise = serveRequestHere();
		}
		
		promise
		.fail((err) => {
			next(err);
		})
		.done();
	};
}
Object.freeze(exports);