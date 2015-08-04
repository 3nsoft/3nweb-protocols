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

var SC = api.finalizeTransaction.SC;

export function makeHandler(root: boolean, normalClosing: boolean,
		closeTransFunc: usersMod.ICompleteTransaction): express.RequestHandler {
	if ('function' !== typeof closeTransFunc) { throw new TypeError(
			"Given argument 'closeTransFunc' must be function, but is not."); }

	return (req: userFromMid.Request, res: express.Response, next: Function) => {
		
		var userId = req.session.params.userId;
		var objId: string = (root ? null : req.params.objId);
		var transactionId: string = req.params.transactionId;
		
		closeTransFunc(userId, objId, transactionId)
		.then(() => {
			res.status(SC.ok).end();
		})
		.fail((err) => {
			if ("string" !== typeof err) {
				next(err);
			} else if (err === usersMod.SC.TRANSACTION_UNKNOWN) {
				res.status(SC.unknownTransaction).send(
					"Object "+objId+" is currently under a transaction.");
			} else if (err === usersMod.SC.OBJ_UNKNOWN) {
				res.status(SC.unknownObj).send(
					"Object "+objId+" is unknown.");
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