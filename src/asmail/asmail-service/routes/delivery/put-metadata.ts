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
import api = require('../../../../lib-common/service-api/asmail/delivery');
import confUtil = require('../../../../lib-server/conf-util');
import delivSess = require('./start-session');

var SC = api.msgMeta.SC;

function findProblemWithObjIds(ids: string[]): api.ErrorReply {
	if (!Array.isArray(ids)) {
		return {
			error: "Object ids are missing."
		};
	}
	var objIdsMap = {};
	var objId;
	for (var i=0; i<ids.length; i+=1) {
		objId = ids[i];
		if (objIdsMap[objId]) {
			return {
				error: "Duplication of object ids."
			};
		}
		objIdsMap[objId] = true;
	}
}

export function makeHandler(setMsgStorageFunc: recipMod.ISetMsgStorage,
		maxChunk: string|number): express.RequestHandler {
	if ('function' !== typeof setMsgStorageFunc) { throw new TypeError(
			"Given argument 'setMsgStorageFunc' must "+
			"be function, but is not."); }
	var maxChunkSize = confUtil.stringToNumOfBytes(maxChunk);

	return (req: delivSess.Request, res: express.Response, next: Function) => {
		var session = req.session;
		var msgMeta: api.msgMeta.Request = req.body;
		var recipient = session.params.recipient;
		var sender = session.params.sender;
		var objIds = msgMeta.objIds;
		
		if (session.params.msgId) {
			res.status(api.ERR_SC.duplicateReq).json( <api.ErrorReply> {
				error: "This protocol request has already been served."
			});
			return;
		}
		
		if (findProblemWithObjIds(objIds)) {
			res.status(api.ERR_SC.malformed).json(findProblemWithObjIds(objIds));
			return;
		}
		
		setMsgStorageFunc(recipient, msgMeta, sender)
		.then((msgId) => {
			session.params.msgId = msgId;
			res.status(SC.ok).json( <api.msgMeta.Reply> {
				msgId: msgId,
				maxChunkSize: maxChunkSize
			});
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