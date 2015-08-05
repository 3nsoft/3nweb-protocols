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
var saveSC = recipMod.SC;
function makeHandler(finDelivFunc) {
    if ('function' !== typeof finDelivFunc) {
        throw new TypeError("Given argument 'finDelivFunc' must be function, but is not.");
    }
    return function (req, res, next) {
        var session = req.session;
        var recipient = session.params.recipient;
        var msgId = session.params.msgId;
        finDelivFunc(recipient, msgId)
            .then(function (resFlag) {
            session.close();
            res.status(200).end();
        })
            .fail(function (err) {
            if ('string' !== typeof err) {
                next(err);
            }
            else if (err === saveSC.USER_UNKNOWN) {
                session.close();
                res.status(api.ERR_SC.server).send("Recipient disappeared from the system.");
            }
            else if (err === saveSC.MSG_UNKNOWN) {
                session.close();
                res.status(api.ERR_SC.server).send("Message disappeared from the system.");
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
