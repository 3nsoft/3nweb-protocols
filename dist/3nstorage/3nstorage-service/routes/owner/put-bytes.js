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
var usersMod = require('../../../resources/users');
var api = require('../../../../lib-common/service-api/3nstorage/owner');
var confUtil = require('../../../../lib-server/conf-util');
var saveSC = usersMod.SC;
var SC = api.objSegs.SC;
function replyOnError(res, transactionId, append, offset) {
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
        }
        else {
            if (offset === null) {
                throw "Offset parameter is missing.";
            }
        }
        return false;
    }
    catch (errMsg) {
        res.status(api.ERR_SC.malformed).send(errMsg);
        return true;
    }
}
function getContentLen(req, res, maxChunkSize) {
    var contentLength = parseInt(req.get(api.HTTP_HEADER.contentLength), 10);
    if (isNaN(contentLength)) {
        res.status(api.ERR_SC.contentLenMissing).send("Content-Length header is required with proper number.");
    }
    else if (contentLength === 0) {
        res.status(api.ERR_SC.malformed).send("No bytes given.");
    }
    else if (contentLength > maxChunkSize) {
        res.status(api.ERR_SC.contentTooLong).send("Request body is too long.");
    }
    else {
        return contentLength;
    }
}
function makeHandler(root, saveBytesFunc, chunkLimit) {
    if ('function' !== typeof saveBytesFunc) {
        throw new TypeError("Given argument 'saveBytesFunc' must be function, but is not.");
    }
    var maxChunkSize = confUtil.stringToNumOfBytes(chunkLimit);
    return function (req, res, next) {
        if (!req.is(api.BIN_TYPE)) {
            res.status(api.ERR_SC.wrongContentType).send("Content-Type must be " + api.BIN_TYPE + " for this call.");
            return;
        }
        var session = req.session;
        var userId = session.params.userId;
        var objId = req.params.objId;
        var qOpts = req.query;
        var transactionId = qOpts.trans;
        var append = (qOpts.append === 'true');
        var offset = ('string' === typeof qOpts.ofs) ?
            parseInt(qOpts.ofs) : null;
        // get and check Content-Length
        var chunkLen = getContentLen(req, res, maxChunkSize);
        if ('number' !== typeof chunkLen) {
            return;
        }
        if (replyOnError(res, transactionId, append, offset)) {
            return;
        }
        var opts = {
            objId: objId,
            appendMode: append,
            transactionId: transactionId,
            chunkLen: chunkLen
        };
        saveBytesFunc(userId, req, opts)
            .then(function () {
            res.status(SC.okPut).end();
        })
            .fail(function (err) {
            if ("string" !== typeof err) {
                next(err);
            }
            else if (err === saveSC.USER_UNKNOWN) {
                res.status(api.ERR_SC.server).send("Recipient disappeared from the system.");
                session.close();
            }
            else if (err === saveSC.WRITE_OVERFLOW) {
                res.status(api.ERR_SC.malformed).send("Attempt to write outside of set limits.");
            }
            else if (err === saveSC.NOT_ENOUGH_SPACE) {
                res.status(api.ERR_SC.noSpace).send("Reached storage limits.");
            }
            else {
                next(new Error("Unhandled storage error code: " + err));
            }
        })
            .done();
    };
}
exports.makeHandler = makeHandler;
Object.freeze(exports);
