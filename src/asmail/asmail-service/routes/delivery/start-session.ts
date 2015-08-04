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
import sessions = require('../../../../lib-server/resources/sessions');
import recipMod = require('../../../resources/recipients');
import api = require('../../../../lib-common/service-api/asmail/delivery');

var SC = api.sessionStart.SC;

export interface IRedirect {
	(userId: string): Q.Promise<string>;
}

export interface SessionParams {
	recipient: string;
	sender: string;
	maxMsgLength: number;
	currentMsgLength: number;
	msgId: string;
}

export interface Request extends sessions.Request<SessionParams> {}

/**
 * This creates a start-session route handler.
 * @param allowedMsgSizeFunc is a function returning promises, that may resolve to
 * (1) undefined, if recipient is unknown,
 * (2) zero (0), if leaving mail is forbidden,
 * (3) greater than zero maximum message length, and
 * (4) -1, if mail cannot be accepted due to full mail box.
 * @param sessionGenFunc is a promise returning function that generates new
 * session objects.
 * @param redirectFunc is an optional function that returns a promise,
 * resolvable to
 * (1) string with URI for ASMail service, which is serving given recipient,
 * (2) undefined, if it is this server should service given recipient. 
 */
export function makeHandler(allowedMsgSizeFunc: recipMod.IAllowedMaxMsgSize,
		sessionGenFunc: sessions.IGenerateSession<SessionParams>,
		redirectFunc?: IRedirect): express.RequestHandler {
	if ('function' !== typeof allowedMsgSizeFunc) { throw new TypeError(
			"Given argument 'allowedMsgSizeFunc' must be function, but is not."); }
	if ('function' !== typeof sessionGenFunc) { throw new TypeError(
			"Given argument 'sessionGenFunc' must be function, but is not."); }
	if (('undefined' !== typeof redirectFunc) &&
			('function' !== typeof redirectFunc)) { throw new TypeError(
			"Given argument 'redirectFunc' must either be function, " +
			"or be undefined, but it is neither."); }
	
	return (req: Request, res: express.Response, next: Function) => {
		
		var rb: api.sessionStart.Request = req.body;
		var recipient = rb.recipient;
		var sender = (rb.sender ? rb.sender : null);
		var invitation = (rb.invitation ? rb.invitation : null);
		var session = req.session;
		
		// already existing session indicates repeated call, which should be bounced off
		if (session) {
			res.status(api.ERR_SC.duplicateReq).json( <api.ErrorReply> {
				error: "This protocol request has already been served."
			});
			return;
		}
		
		// missing recipient makes a bad request
		if (!recipient) {
			res.status(api.ERR_SC.malformed).json( <api.ErrorReply> {
				error: "Recipient is not named in the request."
			});
			return;
		}
		
		function serveRequestHere(): Q.Promise<void> {
			return allowedMsgSizeFunc(recipient, sender, invitation)
			.then((msgSize: number) => {
				if ('undefined' === typeof msgSize) {
					res.status(SC.unknownRecipient).json( <api.ErrorReply> {
						error: "Recipient "+recipient+" is unknown."
					});
				} else if (msgSize > 0) {
					return sessionGenFunc()
					.then((session) => {
						session.params.recipient = recipient;
						session.params.sender = sender;
						session.params.maxMsgLength = msgSize;
						if (!sender) {
							// message delivery is allowed for anonymous
							// sender, thus, we set isAuthorized flag here
							session.isAuthorized = true;
						}
						res.status(SC.ok).json( <api.sessionStart.Reply> {
							sessionId: session.id,
							maxMsgLength: msgSize
						});
					});
				} else if (msgSize === 0) {
					res.status(SC.senderNotAllowed).json( <api.ErrorReply> {
						error: (!!sender ? sender : "Anonymous sender ")+
						" is not allowed to leave mail for "+recipient
					});
				} else if (msgSize === -1) {
					res.status(SC.inboxFull).json( <api.ErrorReply> {
						error: "Mail box for "+recipient+" is full."
					});
				} else {
					throw new Error("Unrecognized code "+msgSize+
							" for message size limits.");
				}
			});
		}
		
		var promise = null;
		
		if (redirectFunc) {
			promise = redirectFunc(recipient)
			.then((redirectTo) => {
				if (redirectTo) {
					res.status(SC.redirect).json(
						<api.sessionStart.RedirectReply> {
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