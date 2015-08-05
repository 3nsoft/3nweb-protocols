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
 * express application to set user accounts for this 3NStorage test service.
 */
var express = require('express');
var Q = require('q');
//Internal libs
var bodyParsers = require('../../lib-server/middleware/body-parsers');
// Modules setting and viewing user info on this test server
var startSession = require('../../lib-server/routes/sessions/start');
var authorize = require('../../lib-server/routes/sessions/mid-auth');
var closeSession = require('../../lib-server/routes/sessions/close');
var makeAccount = require('./routes/make-account');
var existAccount = require('./routes/exist-account');
var midLoginApi = require('../../lib-common/service-api/mailer-id/login');
function makeApp(sessions, users, midAuthorizer) {
    var app = express();
    // static pages 
    app.use(express.static(__dirname + '/public-content'));
    app.use('/scripts', express.static(__dirname + '/../../browser-scripts'));
    var loginPath = '/login/mailerid/';
    app.post(loginPath + midLoginApi.startSession.URL_END, sessions.checkSession(), bodyParsers.json('1kb'), startSession.makeHandler(
    // start sessions for all in this test app
    // start sessions for all in this test app
    function (uid) { return Q.when(true); }, sessions.generate));
    app.post(loginPath + midLoginApi.authSession.URL_END, sessions.ensureOpenedSession(), bodyParsers.json('4kb'), authorize.makeHandler(midAuthorizer));
    // *** Require authorized session for everything below ***
    app.use(sessions.ensureAuthorizedSession());
    app.post('/close-session', closeSession.makeHandler());
    app.get('/exists-account', existAccount.makeHandler(users.exists));
    app.post('/make-account', bodyParsers.json('4kb'), makeAccount.makeHandler(users.add));
    return app;
}
exports.makeApp = makeApp;
Object.freeze(exports);
