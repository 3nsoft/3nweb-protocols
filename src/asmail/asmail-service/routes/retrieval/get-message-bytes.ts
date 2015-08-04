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

var EMPTY_BUFFER = new Buffer(0);

export function makeHandler(getMsgObjFunc: recipMod.IGetBytes):
		express.RequestHandler {
	if ('function' !== typeof getMsgObjFunc) { throw new TypeError(
			"Given argument 'getMsgObjFunc' must be function, but is not."); }

	return (req: userFromMid.Request, res: express.Response, next: Function) => {
		
		var userId = req.session.params.userId;
		var msgId: string = req.params.msgId;
		var objId: string = req.params.objId;
		
		var query: api.BlobQueryOpts = req.query;
		var maxLen = parseInt(<any> query.len);
		var bytesOffset = parseInt(<any> query.ofs);
		
		if (isNaN(bytesOffset)) {
			bytesOffset = 0;
		}
		if (isNaN(maxLen)) {
			maxLen = null;
		}
		if ((bytesOffset < 0) || ((maxLen !== null) && (maxLen < 1))) {
			res.status(api.ERR_SC.malformed).send("Bad numeric parameters");
			return;
		}
		
		var opts: recipMod.BlobGetOpts = {
				msgId: msgId,
				objId: objId,
				offset: bytesOffset
		};
		if (maxLen) {
			opts.maxLen = maxLen;
		}
		
		getMsgObjFunc(userId, opts)
		.then((objReader) => {
			if (objReader) {
				res.status(api.msgObjSegs.SC.ok);
				res.set({
					'Content-Type': 'application/octet-stream',
					'Content-Length': ''+objReader.len
				});
				return objReader.pipeTo(res)
				.fin(() => {
					res.end();
				});
			} else {
				res.status(api.msgObjSegs.SC.ok).send(EMPTY_BUFFER);
			}
		})
		.fail((err) => {
			if ("string" !== typeof err) {
				next(err);
			} else if (err === recipMod.SC.OBJ_UNKNOWN) {
				res.status(api.msgObjSegs.SC.unknownMsgOrObj).send(
					"Object "+opts.objId+" is unknown.");
			} else if (err === recipMod.SC.MSG_UNKNOWN) {
				res.status(api.msgObjSegs.SC.unknownMsgOrObj).send(
					"Message "+msgId+" is unknown.");
			} else if (err === recipMod.SC.USER_UNKNOWN) {
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