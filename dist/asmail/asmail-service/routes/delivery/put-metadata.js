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
var SC = api.msgMeta.SC;
function findProblemWithObjIds(ids) {
    if (!Array.isArray(ids)) {
        return {
            error: "Object ids are missing."
        };
    }
    var objIdsMap = {};
    var objId;
    for (var i = 0; i < ids.length; i += 1) {
        objId = ids[i];
        if (objIdsMap[objId]) {
            return {
                error: "Duplication of object ids."
            };
        }
        objIdsMap[objId] = true;
    }
}
function makeHandler(setMsgStorageFunc, maxChunk) {
    if ('function' !== typeof setMsgStorageFunc) {
        throw new TypeError("Given argument 'setMsgStorageFunc' must " +
            "be function, but is not.");
    }
    var maxChunkSize = confUtil.stringToNumOfBytes(maxChunk);
    return function (req, res, next) {
        var session = req.session;
        var msgMeta = req.body;
        var recipient = session.params.recipient;
        var sender = session.params.sender;
        var objIds = msgMeta.objIds;
        if (session.params.msgId) {
            res.status(api.ERR_SC.duplicateReq).json({
                error: "This protocol request has already been served."
            });
            return;
        }
        if (findProblemWithObjIds(objIds)) {
            res.status(api.ERR_SC.malformed).json(findProblemWithObjIds(objIds));
            return;
        }
        setMsgStorageFunc(recipient, msgMeta, sender)
            .then(function (msgId) {
            session.params.msgId = msgId;
            res.status(SC.ok).json({
                msgId: msgId,
                maxChunkSize: maxChunkSize
            });
        })
            .fail(function (err) {
            if ("string" !== typeof err) {
                next(err);
            }
            else if (err === recipMod.SC.USER_UNKNOWN) {
                res.status(api.ERR_SC.server).send("Recipient disappeared from the system.");
                session.close();
            }
        })
            .done();
    };
}
exports.makeHandler = makeHandler;
Object.freeze(exports);
