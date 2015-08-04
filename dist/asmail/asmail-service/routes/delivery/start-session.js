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
var api = require('../../../../lib-common/service-api/asmail/delivery');
var SC = api.sessionStart.SC;
/**
 * This creates a start-session route handler.
 * @param allowedMsgSizeFunc is a function returning promises, that may resolve to
 * (1) undefined, if recipient is unknown,
 * (2) zero (0), if leaving mail is forbidden,
 * (3) greater than zero maximum message length, and
 * (4) -1, if mail cannot be accepted due to full mail box.
 * @param sessionGenFunc is a promise returning function that generates new
 * session objects.
 * @param redirectFunc is an optional function that returns a promise,
 * resolvable to
 * (1) string with URI for ASMail service, which is serving given recipient,
 * (2) undefined, if it is this server should service given recipient.
 */
function makeHandler(allowedMsgSizeFunc, sessionGenFunc, redirectFunc) {
    if ('function' !== typeof allowedMsgSizeFunc) {
        throw new TypeError("Given argument 'allowedMsgSizeFunc' must be function, but is not.");
    }
    if ('function' !== typeof sessionGenFunc) {
        throw new TypeError("Given argument 'sessionGenFunc' must be function, but is not.");
    }
    if (('undefined' !== typeof redirectFunc) && ('function' !== typeof redirectFunc)) {
        throw new TypeError("Given argument 'redirectFunc' must either be function, " + "or be undefined, but it is neither.");
    }
    return function (req, res, next) {
        var rb = req.body;
        var recipient = rb.recipient;
        var sender = (rb.sender ? rb.sender : null);
        var invitation = (rb.invitation ? rb.invitation : null);
        var session = req.session;
        // already existing session indicates repeated call, which should be bounced off
        if (session) {
            res.status(api.ERR_SC.duplicateReq).json({
                error: "This protocol request has already been served."
            });
            return;
        }
        // missing recipient makes a bad request
        if (!recipient) {
            res.status(api.ERR_SC.malformed).json({
                error: "Recipient is not named in the request."
            });
            return;
        }
        function serveRequestHere() {
            return allowedMsgSizeFunc(recipient, sender, invitation).then(function (msgSize) {
                if ('undefined' === typeof msgSize) {
                    res.status(SC.unknownRecipient).json({
                        error: "Recipient " + recipient + " is unknown."
                    });
                }
                else if (msgSize > 0) {
                    return sessionGenFunc().then(function (session) {
                        session.params.recipient = recipient;
                        session.params.sender = sender;
                        session.params.maxMsgLength = msgSize;
                        if (!sender) {
                            // message delivery is allowed for anonymous
                            // sender, thus, we set isAuthorized flag here
                            session.isAuthorized = true;
                        }
                        res.status(SC.ok).json({
                            sessionId: session.id,
                            maxMsgLength: msgSize
                        });
                    });
                }
                else if (msgSize === 0) {
                    res.status(SC.senderNotAllowed).json({
                        error: (!!sender ? sender : "Anonymous sender ") + " is not allowed to leave mail for " + recipient
                    });
                }
                else if (msgSize === -1) {
                    res.status(SC.inboxFull).json({
                        error: "Mail box for " + recipient + " is full."
                    });
                }
                else {
                    throw new Error("Unrecognized code " + msgSize + " for message size limits.");
                }
            });
        }
        var promise = null;
        if (redirectFunc) {
            promise = redirectFunc(recipient).then(function (redirectTo) {
                if (redirectTo) {
                    res.status(SC.redirect).json({
                        redirect: redirectTo
                    });
                }
                else {
                    return serveRequestHere();
                }
            });
        }
        else {
            promise = serveRequestHere();
        }
        promise.fail(function (err) {
            next(err);
        }).done();
    };
}
exports.makeHandler = makeHandler;
Object.freeze(exports);
