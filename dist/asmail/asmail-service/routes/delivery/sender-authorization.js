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
var jwk = require('../../../../lib-common/jwkeys');
var api = require('../../../../lib-common/service-api/asmail/delivery');
var SC = api.authSender.SC;
/**
 * This creates an authorize-sender route handler.
 * @param mailerIdAuthorizingFunc is a function returning promise, which resolves into
 * boolean flag, with true value for authorization passing, and false for failed
 * authorization.
 */
function makeHandler(midAuthorizingFunc) {
    if ('function' !== typeof midAuthorizingFunc) {
        throw new TypeError("Given argument 'midAuthorizingFunc' must be function, but is not.");
    }
    return function (req, res, next) {
        if (req.session.isAuthorized) {
            res.status(api.ERR_SC.duplicateReq).send("This protocol request has already been served.");
            return;
        }
        var rb = req.body;
        var sender = req.session.params.sender;
        var sessionId = req.session.id;
        if (!sender) {
            // This case must be rejected, because place for authorizing
            // anonymous connection is at the session start.
            res.status(SC.authFailed).send("Server is not accepting provided credentials.");
            req.session.close();
            return;
        }
        if (!rb.assertion || !rb.userCert || !rb.provCert) {
            res.status(api.ERR_SC.malformed).send("No credentials given.");
            req.session.close();
            return;
        }
        try {
            if (sender !== jwk.getPrincipalAddress(rb.userCert)) {
                res.status(SC.authFailed).send("Certificate is for a wrong sender.");
                req.session.close();
                return;
            }
        }
        catch (e) {
            res.status(api.ERR_SC.malformed).send("Malformed sender certificate.");
            req.session.close();
            return;
        }
        midAuthorizingFunc(req.hostname, sessionId, rb.assertion, rb.userCert, rb.provCert)
            .then(function (sender) {
            if (sender) {
                req.session.isAuthorized = true;
                res.status(SC.ok).end();
            }
            else {
                res.status(SC.authFailed).send("Server is not accepting provided credentials.");
                req.session.close();
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
