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

import express = require('express');
import Q = require('q');

//Internal libs
import bodyParsers = require('../../lib-server/middleware/body-parsers');

import sessionsMod = require('../../lib-server/resources/sessions');
import users = require('../resources/users');

// Modules setting and viewing user info on this test server
import startSession = require('../../lib-server/routes/sessions/start');
import authorize = require('../../lib-server/routes/sessions/mid-auth');
import closeSession = require('../../lib-server/routes/sessions/close');
import makeAccount = require('./routes/make-account');
import existAccount = require('./routes/exist-account');

import midLoginApi = require('../../lib-common/service-api/mailer-id/login');

export function makeApp(sessions: sessionsMod.Factory, users: users.Factory,
		midAuthorizer: authorize.IMidAuthorizer): express.Express {
	
	var app = express();
	
	// static pages 
	app.use(express.static(__dirname + '/public-content'));
	app.use('/scripts',
		express.static(__dirname + '/../../browser-scripts'));
	
	var loginPath = '/login/mailerid/';
	app.post(loginPath+midLoginApi.startSession.URL_END,
			sessions.checkSession(),
			bodyParsers.json('1kb'),
			startSession.makeHandler(
				// start sessions for all in this test app
				(uid) => { return Q.when(true); },
				sessions.generate));
	app.post(loginPath+midLoginApi.authSession.URL_END,
			sessions.ensureOpenedSession(),
			bodyParsers.json('4kb'),
			authorize.makeHandler(midAuthorizer));
	
	// *** Require authorized session for everything below ***
	app.use(sessions.ensureAuthorizedSession());
	
	app.post('/close-session',
			closeSession.makeHandler());
	
	app.get('/exists-account',
			existAccount.makeHandler(users.exists));
	
	app.post('/make-account',
			bodyParsers.json('4kb'),
			makeAccount.makeHandler(users.add));
	
	
	return app;
}
Object.freeze(exports);