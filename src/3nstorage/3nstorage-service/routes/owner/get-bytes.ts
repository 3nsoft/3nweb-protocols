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

var EMPTY_BUFFER = new Buffer(0);

export function makeHandler(root: boolean, getObjFunc: usersMod.IGetBytes):
		express.RequestHandler {
	if ('function' !== typeof getObjFunc) { throw new TypeError(
			"Given argument 'getObjFunc' must be function, but is not."); }

	return (req: userFromMid.Request, res: express.Response, next: Function) => {
		
		var userId = req.session.params.userId;
		var objId: string = (root ? null : req.params.objId);
		
		var query: api.GetBlobQueryOpts = req.query;
		var maxLen = parseInt(<any> query.len);
		var bytesOffset = parseInt(<any> query.ofs);
		var version = parseInt(<any> query.ver);
		
		if (isNaN(version)) {
			version = null;
		}
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
		
		var opts: usersMod.BlobGetOpts = {
			objId: objId,
			offset: bytesOffset,
			maxLen: maxLen,
			version: version
		};
		
		getObjFunc(userId, opts)
		.then((objReader) => {
			if (objReader) {
				res.status(api.objSegs.SC.okGet);
				res.set(api.HTTP_HEADER.contentType, api.BIN_TYPE);
				res.set(api.HTTP_HEADER.contentLength, ''+objReader.len);
				res.set(api.HTTP_HEADER.objVersion, ''+objReader.version);
				return objReader.pipeTo(res)
				.fin(() => {
					res.end();
				});
			} else {
				res.status(api.objSegs.SC.okGet).send(EMPTY_BUFFER);
			}
		})
		.fail((err) => {
			if ("string" !== typeof err) {
				next(err);
			} else if (err === usersMod.SC.OBJ_UNKNOWN) {
				res.status(api.objSegs.SC.unknownObj).send(
					"Object "+opts.objId+" is unknown.");
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