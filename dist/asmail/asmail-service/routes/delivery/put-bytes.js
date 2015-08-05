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
var recipMod = require('../../../resources/recipients');
var api = require('../../../../lib-common/service-api/asmail/delivery');
var confUtil = require('../../../../lib-server/conf-util');
var saveSC = recipMod.SC;
var SC = api.msgObjSegs.SC;
var CONTENT_TYPE = 'application/octet-stream';
function replyOnError(res, total, append, offset) {
    try {
        if (total !== null) {
            if (isNaN(total) || (total === 0)) {
                throw "Bad total parameter";
            }
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
            if ((total !== null) && (total > 0)) {
                throw "Appending must be used only for blob of unknown size.";
            }
        }
        else {
            if (offset === null) {
                throw "Offset parameter is missing.";
            }
            if ((total === null) && (total < 0)) {
                throw "Total size must be known in non-appending mode.";
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
    var contentLength = parseInt(req.headers['content-length'], 10);
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
function makeHandler(saveBytesFunc, chunkLimit) {
    if ('function' !== typeof saveBytesFunc) {
        throw new TypeError("Given argument 'saveBytesFunc' must be function, but is not.");
    }
    var maxChunkSize = confUtil.stringToNumOfBytes(chunkLimit);
    return function (req, res, next) {
        if (!req.is(CONTENT_TYPE)) {
            res.status(api.ERR_SC.wrongContentType).send("Content-Type must be " + CONTENT_TYPE + " for this call.");
            return;
        }
        var session = req.session;
        var recipient = session.params.recipient;
        var msgId = session.params.msgId;
        if (!msgId) {
            res.status(api.ERR_SC.earlyReq).send("Metadata has not been sent, yet.");
            return;
        }
        var objId = req.params.objId;
        var qOpts = req.query;
        var total = ('string' === typeof qOpts.total) ?
            parseInt(qOpts.total) : null;
        var append = (qOpts.append === 'true');
        var offset = ('string' === typeof qOpts.ofs) ?
            parseInt(qOpts.ofs) : null;
        // get and check Content-Length
        var chunkLen = getContentLen(req, res, maxChunkSize);
        if ('number' !== typeof chunkLen) {
            return;
        }
        if (replyOnError(res, total, append, offset)) {
            return;
        }
        var opts = {
            msgId: msgId,
            objId: objId,
            appendMode: append,
            chunkLen: chunkLen,
            isFirstReq: (total !== null)
        };
        if (opts.isFirstReq && (total > 0)) {
            opts.totalSize = total;
        }
        var extraSpaceUsed = (opts.appendMode || opts.isFirstReq);
        if (extraSpaceUsed && (opts.chunkLen >
            session.params.maxMsgLength - session.params.currentMsgLength)) {
            res.status(api.ERR_SC.contentTooLong).send("This request goes over the message limit.");
            return;
        }
        if (extraSpaceUsed) {
            session.params.currentMsgLength += opts.chunkLen;
        }
        saveBytesFunc(recipient, req, opts)
            .then(function () {
            res.status(SC.ok).end();
        })
            .fail(function (err) {
            if (extraSpaceUsed) {
                session.params.currentMsgLength -= opts.chunkLen;
            }
            if ("string" !== typeof err) {
                next(err);
            }
            else if (err === saveSC.USER_UNKNOWN) {
                res.status(api.ERR_SC.server).send("Recipient disappeared from the system.");
                session.close();
            }
            else if (err === saveSC.OBJ_EXIST) {
                res.status(SC.objAlreadyExists).send("Object " + opts.objId + " already exists.");
            }
            else if (err === saveSC.MSG_UNKNOWN) {
                res.status(api.ERR_SC.server).send("Message disappeared from the system.");
                session.close();
            }
            else if (err === saveSC.OBJ_UNKNOWN) {
                res.status(SC.unknownObj).send("Object " + opts.objId + " is unknown.");
            }
            else if (err === saveSC.WRITE_OVERFLOW) {
                res.status(api.ERR_SC.malformed).send("Attempt to write outside of set limits.");
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
