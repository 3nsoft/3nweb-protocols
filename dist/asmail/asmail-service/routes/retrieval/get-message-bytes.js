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
var api = require('../../../../lib-common/service-api/asmail/retrieval');
var EMPTY_BUFFER = new Buffer(0);
function makeHandler(getMsgObjFunc) {
    if ('function' !== typeof getMsgObjFunc) {
        throw new TypeError("Given argument 'getMsgObjFunc' must be function, but is not.");
    }
    return function (req, res, next) {
        var userId = req.session.params.userId;
        var msgId = req.params.msgId;
        var objId = req.params.objId;
        var query = req.query;
        var maxLen = parseInt(query.len);
        var bytesOffset = parseInt(query.ofs);
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
        var opts = {
            msgId: msgId,
            objId: objId,
            offset: bytesOffset
        };
        if (maxLen) {
            opts.maxLen = maxLen;
        }
        getMsgObjFunc(userId, opts).then(function (objReader) {
            if (objReader) {
                res.status(api.msgObjSegs.SC.ok);
                res.set({
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': '' + objReader.len
                });
                return objReader.pipeTo(res).fin(function () {
                    res.end();
                });
            }
            else {
                res.status(api.msgObjSegs.SC.ok).send(EMPTY_BUFFER);
            }
        }).fail(function (err) {
            if ("string" !== typeof err) {
                next(err);
            }
            else if (err === recipMod.SC.OBJ_UNKNOWN) {
                res.status(api.msgObjSegs.SC.unknownMsgOrObj).send("Object " + opts.objId + " is unknown.");
            }
            else if (err === recipMod.SC.MSG_UNKNOWN) {
                res.status(api.msgObjSegs.SC.unknownMsgOrObj).send("Message " + msgId + " is unknown.");
            }
            else if (err === recipMod.SC.USER_UNKNOWN) {
                res.status(api.ERR_SC.server).send("Recipient disappeared from the system.");
                req.session.close();
            }
            else {
                next(new Error("Unhandled storage error code: " + err));
            }
        }).done();
    };
}
exports.makeHandler = makeHandler;
;
