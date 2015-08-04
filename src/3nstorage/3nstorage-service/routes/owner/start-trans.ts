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
import usersMod = require('../../../resources/users');
import api = require('../../../../lib-common/service-api/3nstorage/owner');
import userFromMid = require('../../../../lib-server/routes/sessions/start');

var SC = api.startTransaction.SC;

function replyOnError(res: express.Response,
		trans: api.startTransaction.Request): boolean {
	try {
		if ((trans.sizes && trans.diff) || (!trans.sizes && !trans.diff)) {
			throw "Missing both sizes and diff, or both are present";
		}
		if (trans.sizes) {
			if (('number' !== typeof trans.sizes.header) ||
					(trans.sizes.header < 1)) {
				throw "Bad or missing header length";
			}
			if (('number' !== typeof trans.sizes.segments) ||
					(trans.sizes.segments < 0)) {
				throw "Bad or missing segments length";
			}
		}
		return false;
	} catch (errMsg) {
		res.status(api.ERR_SC.malformed).json(<api.ErrorReply> {
			error: errMsg
		});
		return true;
	}
}

export function makeHandler(root: boolean,
		startTransFunc: usersMod.IStartTransaction): express.RequestHandler {
	if ('function' !== typeof startTransFunc) { throw new TypeError(
			"Given argument 'startTransFunc' must be function, but is not."); }

	return (req: userFromMid.Request, res: express.Response, next: Function) => {
		
		var userId = req.session.params.userId;
		var objId: string = (root ? null : req.params.objId);
		var trans = <api.startTransaction.Request> req.body;
		
		if (replyOnError(res, trans)) { return; }
		
		startTransFunc(userId, objId, trans)
		.then((transactionId) => {
			res.status(SC.ok).json( <api.startTransaction.Reply> {
				transactionId: transactionId
			});
		})
		.fail((err) => {
			if ("string" !== typeof err) {
				next(err);
			} else if (err === usersMod.SC.CONCURRENT_TRANSACTION) {
				res.status(SC.concurrentTransaction).send(
					"Object "+objId+" is currently under a transaction.");
			} else if (err === usersMod.SC.OBJ_UNKNOWN) {
				res.status(SC.unknownObj).send(
					"Object "+objId+" is unknown.");
			} else if (err === usersMod.SC.OBJ_EXIST) {
				res.status(SC.objAlreadyExists).send(
					"Object "+objId+" already exists.");
			} else if (err === usersMod.SC.WRONG_OBJ_STATE) {
				res.status(SC.incompatibleObjState).send(
					"Object "+objId+" is in a state, that does not allow "+
					"to procede with this request.");
			} else if (err === usersMod.SC.USER_UNKNOWN) {
				res.status(api.ERR_SC.server).send(
					"Recipient disappeared from the system.");
				req.session.close();
			} else {
				next(new Error("Unhandled storage error code: "+err));
			}
		})
		.done();
		
	};
};