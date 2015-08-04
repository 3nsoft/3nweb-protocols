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
/**
 * This module gives a function that creates a mountable, or app.use()-able,
 * express MailerId application.
 */
var express = require('express');
// Internal libs
var cors = require('../../lib-server/middleware/allow-cross-domain');
var bodyParsers = require('../../lib-server/middleware/body-parsers');
// Modules for certificate provisioning part of MailerId protocol
var startPKeyLogin = require('../../lib-server/routes/pub-key-login/start-exchange');
var completePKeyLogin = require('../../lib-server/routes/pub-key-login/complete-exchange');
var certify = require('./routes/certify');
var api = require('../../lib-common/service-api/mailer-id/provisioning');
// Constant url parts of MailerId provisioning requests
var PROVISIONING_PATH = '/prov/';
function provisioningApp(sessions, users, certifier, computeDHSharedKey) {
    var app = express();
    app.disable('etag');
    // MailerId certificate provisioning routes
    app.post('/' + api.pkl.START_URL_END, sessions.checkSession(), bodyParsers.json('1kb'), startPKeyLogin.makeHandler(users.getUserParamsAndKey, sessions.generate, computeDHSharedKey));
    app.post('/' + api.pkl.COMPL_URL_END, sessions.ensureOpenedSession(), bodyParsers.binary('1kb'), completePKeyLogin.makeHandler());
    app.post('/' + api.certify.URL_END, sessions.ensureAuthorizedSession(), bodyParsers.binary('16kb'), certify.makeHandler(certifier.certify));
    return app;
}
/**
 * @param sessions is a resource object, providing different functionality,
 * related to sessions management.
 * @param users is a resource object, providing functionality, related to users'
 * settings, like login public keys.
 * @param certifier creates certificates, using service's key.
 * @param computeDHSharedKey is a function used in login
 * @return express app, providing MailerId service.
 * This app can either be mounted in the other app, or be given directly,
 * when creating node's server.
 */
function makeApp(sessions, users, certifier, computeDHSharedKey) {
    var app = express();
    // Make display of service parameters CORS-available
    app.use('/', cors.allowCrossDomain(["Content-Type"], ['GET']));
    // Make certificate provisioning CORS-available
    app.use(PROVISIONING_PATH, cors.allowCrossDomain(["Content-Type", "X-Session-Id"], ['POST']));
    // MailerId display of service parameters, as per protocol
    app.get('/', function (req, res) {
        var path = req.originalUrl;
        if (path[path.length - 1] !== '/') {
            path = path + '/';
        }
        var json = {
            "current-cert": certifier.getRootCert(),
            "previous-certs": certifier.getPrevCerts(),
            "provisioning": path + PROVISIONING_PATH.substring(1)
        };
        res.status(200).json(json); // content type application/json
    });
    app.use(PROVISIONING_PATH, provisioningApp(sessions, users, certifier, computeDHSharedKey));
    return app;
}
exports.makeApp = makeApp;
Object.freeze(exports);
