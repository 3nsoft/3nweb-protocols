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
import confUtil = require('../../../../lib-server/conf-util');
import userFromMid = require('../../../../lib-server/routes/sessions/start');

var saveSC = usersMod.SC;
var SC = api.objSegs.SC;

function replyOnError(res: express.Response, transactionId: string,
		append: boolean, offset: number): boolean {
	try {
		if ('string' !== typeof transactionId) {
			throw "Missing transaction id";
		}
		if (offset !== null) {
			if (isNaN(offset) || (offset < 0)) {
				throw "Bad chunk offset parameter";
			}
		}
		if (append) {
			if (offset !== null) {
				throw "When appending file, offset parameter is illegal.";
			}
		} else {
			if (offset === null) {
				throw "Offset parameter is missing.";
			}
		}
		return false;
	} catch (errMsg) {
		res.status(api.ERR_SC.malformed).send(errMsg);
		return true;
	}
}

function getContentLen(req: express.Request, res: express.Response,
		maxChunkSize: number): number {
	var contentLength = parseInt(req.get(api.HTTP_HEADER.contentLength), 10);
	if (isNaN(contentLength)) {
		res.status(api.ERR_SC.contentLenMissing).send(
			"Content-Length header is required with proper number.");
	} else if (contentLength === 0) {
		res.status(api.ERR_SC.malformed).send("No bytes given.");
	} else if (contentLength > maxChunkSize) {
		res.status(api.ERR_SC.contentTooLong).send("Request body is too long.");
	} else {
		return contentLength;
	}
}

export function makeHandler(root: boolean, saveBytesFunc: usersMod.ISaveBytes,
		chunkLimit: string|number): express.RequestHandler {
	if ('function' !== typeof saveBytesFunc) { throw new TypeError(
			"Given argument 'saveBytesFunc' must be function, but is not."); }
	var maxChunkSize = confUtil.stringToNumOfBytes(chunkLimit);

	return (req: userFromMid.Request, res: express.Response, next: Function) => {
		
		if (!req.is(api.BIN_TYPE)) {
			res.status(api.ERR_SC.wrongContentType).send(
				"Content-Type must be "+api.BIN_TYPE+" for this call.");
			return;
		}
	
		var session = req.session;
		var userId = session.params.userId;
		
		var objId: string = req.params.objId;
		
		var qOpts: api.PutBlobQueryOpts = req.query;
		
		var transactionId = qOpts.trans;
		var append = ((<any> qOpts.append) === 'true');
		var offset = ('string' === typeof qOpts.ofs) ?
			parseInt(<any> qOpts.ofs) : null;
		// get and check Content-Length
		var chunkLen = getContentLen(req, res, maxChunkSize);
		if ('number' !== typeof chunkLen) { return; }
		
		if (replyOnError(res, transactionId, append, offset)) { return; }
		
		var opts: usersMod.BlobSaveOpts = {
				objId: objId,
				appendMode: append,
				transactionId: transactionId,
				chunkLen: chunkLen
		};
		
		saveBytesFunc(userId, req, opts)
		.then(() => {
			res.status(SC.okPut).end();
		})
		.fail((err) => {
			if ("string" !== typeof err) {
				next(err);
			} else if (err === saveSC.USER_UNKNOWN) {
				res.status(api.ERR_SC.server).send(
					"Recipient disappeared from the system.");
				session.close();
			} else if (err === saveSC.WRITE_OVERFLOW) {
				res.status(api.ERR_SC.malformed).send(
					"Attempt to write outside of set limits.");
			} else if (err === saveSC.NOT_ENOUGH_SPACE) {
				res.status(api.ERR_SC.noSpace).send(
					"Reached storage limits.");
			} else {
				next(new Error("Unhandled storage error code: "+err));
			}
		})
		.done();
	};
}

Object.freeze(exports);