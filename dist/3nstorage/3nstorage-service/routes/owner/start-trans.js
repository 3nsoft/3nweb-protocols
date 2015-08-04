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
var SC = api.startTransaction.SC;
function replyOnError(res, trans) {
    try {
        if ((trans.sizes && trans.diff) || (!trans.sizes && !trans.diff)) {
            throw "Missing both sizes and diff, or both are present";
        }
        if (trans.sizes) {
            if (('number' !== typeof trans.sizes.header) || (trans.sizes.header < 1)) {
                throw "Bad or missing header length";
            }
            if (('number' !== typeof trans.sizes.segments) || (trans.sizes.segments < 0)) {
                throw "Bad or missing segments length";
            }
        }
        return false;
    }
    catch (errMsg) {
        res.status(api.ERR_SC.malformed).json({
            error: errMsg
        });
        return true;
    }
}
function makeHandler(root, startTransFunc) {
    if ('function' !== typeof startTransFunc) {
        throw new TypeError("Given argument 'startTransFunc' must be function, but is not.");
    }
    return function (req, res, next) {
        var userId = req.session.params.userId;
        var objId = (root ? null : req.params.objId);
        var trans = req.body;
        if (replyOnError(res, trans)) {
            return;
        }
        startTransFunc(userId, objId, trans).then(function (transactionId) {
            res.status(SC.ok).json({
                transactionId: transactionId
            });
        }).fail(function (err) {
            if ("string" !== typeof err) {
                next(err);
            }
            else if (err === usersMod.SC.CONCURRENT_TRANSACTION) {
                res.status(SC.concurrentTransaction).send("Object " + objId + " is currently under a transaction.");
            }
            else if (err === usersMod.SC.OBJ_UNKNOWN) {
                res.status(SC.unknownObj).send("Object " + objId + " is unknown.");
            }
            else if (err === usersMod.SC.OBJ_EXIST) {
                res.status(SC.objAlreadyExists).send("Object " + objId + " already exists.");
            }
            else if (err === usersMod.SC.WRONG_OBJ_STATE) {
                res.status(SC.incompatibleObjState).send("Object " + objId + " is in a state, that does not allow " + "to procede with this request.");
            }
            else if (err === usersMod.SC.USER_UNKNOWN) {
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
