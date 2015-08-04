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
 * express 3NStorage owners' application.
 */

import express = require('express');

// Internal libs
import bodyParsers = require('../../lib-server/middleware/body-parsers')
import cors = require('../../lib-server/middleware/allow-cross-domain');

// Resource/Data modules
import sessionsMod = require('../../lib-server/resources/sessions');
import usersMod = require('../resources/users');

// routes
import midLogin = require('../../lib-server/routes/sessions/mid-auth');
import startSession = require('../../lib-server/routes/sessions/start');
import closeSession = require('../../lib-server/routes/sessions/close');
import sessionParams = require('./routes/owner/session-params');
import startTrans = require('./routes/owner/start-trans');
import closeTrans = require('./routes/owner/close-trans');
import getBytes = require('./routes/owner/get-bytes');
import putBytes = require('./routes/owner/put-bytes');

import api = require('../../lib-common/service-api/3nstorage/owner');

var MAX_CHUNK_SIZE = '0.5mb';

export function makeApp(sessions: sessionsMod.Factory, users: usersMod.Factory,
		midAuthorizer: midLogin.IMidAuthorizer): express.Express {
	
	var app = express();
	app.disable('etag');
	
	app.use(cors.allowCrossDomain(
			[ "Content-Type", "X-Session-Id", "X-Version" ],
			[ 'GET', 'POST', 'PUT', 'DELETE' ]));
	
	// Login
	app.post('/'+api.midLogin.START_URL_END,
			sessions.checkSession(),
			bodyParsers.json('1kb'),
			startSession.makeHandler(users.exists, sessions.generate));
	app.post('/'+api.midLogin.AUTH_URL_END,
			sessions.ensureOpenedSession(),
			bodyParsers.json('4kb'),
			midLogin.makeHandler(midAuthorizer));
	
	// *** Require authorized session for everything below ***
	app.use(sessions.ensureAuthorizedSession());

	app.post('/'+api.closeSession.URL_END,
			closeSession.makeHandler());
	
	// Session params
	app.get('/'+api.sessionParams.URL_END,
			sessionParams.makeHandler(users.getKeyDerivParams, MAX_CHUNK_SIZE));
	
	app.post('/'+api.startTransaction.EXPRESS_URL_END,
			bodyParsers.json('1kb'),
			startTrans.makeHandler(false, users.startTransaction));
	app.post('/'+api.startRootTransaction.URL_END,
			bodyParsers.json('1kb'),
			startTrans.makeHandler(true, users.startTransaction));
	app.post('/'+api.finalizeTransaction.EXPRESS_URL_END,
			closeTrans.makeHandler(false, true, users.finalizeTransaction));
	app.post('/'+api.cancelTransaction.EXPRESS_URL_END,
			closeTrans.makeHandler(false, false, users.cancelTransaction));
	app.post('/'+api.finalizeRootTransaction.EXPRESS_URL_END,
			closeTrans.makeHandler(true, true, users.finalizeTransaction));
	app.post('/'+api.cancelRootTransaction.EXPRESS_URL_END,
			closeTrans.makeHandler(true, false, users.cancelTransaction));
	
	// Getting and saving root object
	app.route('/'+api.rootHeader.EXPRESS_URL_END)
	.get(getBytes.makeHandler(true, users.getRootHeader))
	.put(putBytes.makeHandler(true, users.saveRootHeader, MAX_CHUNK_SIZE));
	app.route('/'+api.rootSegs.EXPRESS_URL_END)
	.get(getBytes.makeHandler(true, users.getRootSegments))
	.put(putBytes.makeHandler(true, users.saveRootSegments, MAX_CHUNK_SIZE));
	
	// Getting and saving non-root objects
	app.route('/'+api.objHeader.EXPRESS_URL_END)
	.get(getBytes.makeHandler(false, users.getObjHeader))
	.put(putBytes.makeHandler(false, users.saveObjHeader, MAX_CHUNK_SIZE));
	app.route('/'+api.objSegs.EXPRESS_URL_END)
	.get(getBytes.makeHandler(false, users.getObjSegments))
	.put(putBytes.makeHandler(false, users.saveObjSegments, MAX_CHUNK_SIZE));
	
	return app;
}

Object.freeze(exports);