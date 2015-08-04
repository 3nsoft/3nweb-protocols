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
 * express application to set user accounts for this MailerId test service.
 */

import express = require('express');

//Internal libs
import bodyParsers = require('../../lib-server/middleware/body-parsers');

// Modules setting and viewing user info on this test server
import startPKeyLogin =
		require('../../lib-server/routes/pub-key-login/start-exchange');
import completePKeyLogin =
	require('../../lib-server/routes/pub-key-login/complete-exchange');
import addUser = require('./routes/add-user');
import getUserInfo = require('./routes/get-user-info');

// resources
import usersMod = require('../resources/users');
import sessionsMod = require('../../lib-server/resources/sessions');

import pklApi = require('../../lib-common/service-api/pub-key-login');

// Parts of url's
var PUB_KEY_LOGIN_URL = '/login/pub-key/';

/**
 * @param sessions is a resource object, providing different functionality,
 * related to sessions management.
 * @param users is a resource object, providing functionality, related to users'
 * settings, like login public keys.
 * @param computeDHSharedKey is a function used in login
 * @return express app for setting up test accounts.
 * Besides its purpose for populating test db, this page will show in
 * details a process of Public Key Login.
 */
export function makeApp(sessions: sessionsMod.Factory,
		users: usersMod.Factory,
		computeDHSharedKey: startPKeyLogin.IComputeDHSharedKey):
		express.Express {
	
	var app = express();
	
	// static page 
	app.use(express.static(__dirname + '/public-content'));
	app.use('/scripts',
		express.static(__dirname + '/../../browser-scripts'));

	app.put('/add-user',
			sessions.checkSession(),
			bodyParsers.json('1kb'),
			addUser.makeHandler(users.add));
	
	app.post(PUB_KEY_LOGIN_URL + pklApi.start.URL_END,
			sessions.checkSession(),
			bodyParsers.json('1kb'),
			startPKeyLogin.makeHandler(users.getUserParamsAndKey,
					sessions.generate, computeDHSharedKey));
	app.post(PUB_KEY_LOGIN_URL + pklApi.complete.URL_END,
			sessions.ensureOpenedSession(),
			bodyParsers.binary('1kb'),
			completePKeyLogin.makeHandler());
	
	app.get('/get-user-info',
			sessions.ensureAuthorizedSession(),
			getUserInfo.makeHandler(users.getInfo));
	
	return app;
}

Object.freeze(exports);