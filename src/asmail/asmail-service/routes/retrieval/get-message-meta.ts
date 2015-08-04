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
import recipMod = require('../../../resources/recipients');
import api = require('../../../../lib-common/service-api/asmail/retrieval');
import userFromMid = require('../../../../lib-server/routes/sessions/start');

export function makeHandler(getMsgMetaFunc: recipMod.IGetMsgMeta):
		express.RequestHandler {
	if ('function' !== typeof getMsgMetaFunc) { throw new TypeError(
			"Given argument 'getMsgMetaFunc' must be function, but is not."); }

	return (req: userFromMid.Request, res: express.Response, next: Function) => {
		var userId = req.session.params.userId;
		var msgId: string = req.params.msgId;
		
		getMsgMetaFunc(userId, msgId)
		.then((meta) => {
			res.status(api.msgMetadata.SC.ok).json(meta);
		})
		.fail((err) => {
			if ("string" !== typeof err) {
				next(err);
			} else if (err === recipMod.SC.MSG_UNKNOWN) {
				res.status(api.msgMetadata.SC.unknownMsg).json(<api.ErrorReply> {
					error: "Message "+msgId+" is unknown."
				});
			} else if (err === recipMod.SC.USER_UNKNOWN) {
				res.status(api.ERR_SC.server).json( <api.ErrorReply> {
					error: "Recipient disappeared from the system."
				});
				req.session.close();
			} else {
				next(new Error("Unhandled storage error code: "+err));
			}
		})
		.done();
		
	};
};