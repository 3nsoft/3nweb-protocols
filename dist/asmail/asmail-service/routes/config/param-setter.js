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
var api = require('../../../../lib-common/service-api/asmail/config');
function makeHandler(paramSetter) {
    if ('function' !== typeof paramSetter) {
        throw new TypeError("Given argument 'paramSetter' must be function, but is not.");
    }
    return function (req, res, next) {
        var session = req.session;
        var userId = session.params.userId;
        var pValue = req.body;
        paramSetter(userId, pValue).then(function (valChanged) {
            if (valChanged) {
                res.status(api.PARAM_SC.ok).end();
            }
            else {
                res.status(api.PARAM_SC.malformed).send('Malformed parameter value.');
            }
        }).fail(function (err) {
            if ("string" !== typeof err) {
                next(err);
            }
            else if (err === recipMod.SC.USER_UNKNOWN) {
                res.status(api.ERR_SC.server).send("Recipient disappeared from the system.");
                session.close();
            }
        }).done();
    };
}
exports.makeHandler = makeHandler;
;
