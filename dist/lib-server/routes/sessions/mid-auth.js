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
var api = require('../../../lib-common/service-api/mailer-id/login');
var SC = api.authSession.SC;
/**
 * This creates an authorize-sender route handler.
 */
function makeHandler(midAuthorizingFunc) {
    if ('function' !== typeof midAuthorizingFunc) {
        throw new TypeError("Given argument 'midAuthorizingFunc' must be function, but is not.");
    }
    return function (req, res, next) {
        if (req.session.isAuthorized) {
            res.status(api.ERR_SC.duplicate).send("This protocol request has already been served.");
            return;
        }
        var rb = req.body;
        var sessionId = req.session.id;
        if (!rb.assertion || !rb.userCert || !rb.provCert) {
            res.status(api.ERR_SC.malformed).send("No credentials given.");
            req.session.close();
            return;
        }
        midAuthorizingFunc(req.hostname, sessionId, rb.assertion, rb.userCert, rb.provCert)
            .then(function (userId) {
            if (!userId || (userId !== req.session.params.userId)) {
                req.session.close();
                res.status(SC.authFailed).send("Server is not accepting provided credentials.");
            }
            else {
                req.session.isAuthorized = true;
                res.status(SC.ok).end();
            }
        })
            .fail(function (err) {
            next(err);
        })
            .done();
    };
}
exports.makeHandler = makeHandler;
Object.freeze(exports);
