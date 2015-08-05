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
function makeHandler(getMsgMetaFunc) {
    if ('function' !== typeof getMsgMetaFunc) {
        throw new TypeError("Given argument 'getMsgMetaFunc' must be function, but is not.");
    }
    return function (req, res, next) {
        var userId = req.session.params.userId;
        var msgId = req.params.msgId;
        getMsgMetaFunc(userId, msgId)
            .then(function (meta) {
            res.status(api.msgMetadata.SC.ok).json(meta);
        })
            .fail(function (err) {
            if ("string" !== typeof err) {
                next(err);
            }
            else if (err === recipMod.SC.MSG_UNKNOWN) {
                res.status(api.msgMetadata.SC.unknownMsg).json({
                    error: "Message " + msgId + " is unknown."
                });
            }
            else if (err === recipMod.SC.USER_UNKNOWN) {
                res.status(api.ERR_SC.server).json({
                    error: "Recipient disappeared from the system."
                });
                req.session.close();
            }
            else {
                next(new Error("Unhandled storage error code: " + err));
            }
        })
            .done();
    };
}
exports.makeHandler = makeHandler;
;
