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
 * express ASMail-Configuration application.
 */

import express = require('express');

// Internal libs
import cors = require('../../lib-server/middleware/allow-cross-domain');
import bodyParsers = require('../../lib-server/middleware/body-parsers');

// Resource/Data modules
import sessionsMod = require('../../lib-server/resources/sessions');
import users = require('../resources/recipients');

// routes
import midLogin = require('../../lib-server/routes/sessions/mid-auth');
import startSession = require('../../lib-server/routes/sessions/start');
import closeSession = require('../../lib-server/routes/sessions/close');
import getParam = require('./routes/config/param-getter');
import setParam = require('./routes/config/param-setter');

import api = require('../../lib-common/service-api/asmail/config');

export function makeApp(sessions: sessionsMod.Factory, recipients: users.Factory,
		midAuthorizer: midLogin.IMidAuthorizer): express.Express {
	
	var app = express();
	app.disable('etag');
	
	app.use(cors.allowCrossDomain(
			[ "Content-Type", "X-Session-Id" ],
			[ 'GET', 'POST', 'PUT' ]));
	
	app.post('/'+api.midLogin.START_URL_END,
			sessions.checkSession(),
			bodyParsers.json('1kb'),
			startSession.makeHandler(recipients.exists, sessions.generate));
	app.post('/'+api.midLogin.AUTH_URL_END,
			sessions.ensureOpenedSession(),
			bodyParsers.json('4kb'),
			midLogin.makeHandler(midAuthorizer));
	
	// *** Require authorized session for everything below ***
	app.use(sessions.ensureAuthorizedSession());
	
	app.post('/'+api.closeSession.URL_END,
			closeSession.makeHandler());
	
	app.route('/'+api.p.initPubKey.URL_END)
	.get(getParam.makeHandler(recipients.getPubKey))
	.put(bodyParsers.json('4kb', true),
		setParam.makeHandler(recipients.setPubKey));
	
	app.route('/'+api.p.anonSenderInvites.URL_END)
	.get(getParam.makeHandler(recipients.getAnonSenderInvites))
	.put(bodyParsers.json('4kb', true),
		setParam.makeHandler(recipients.setAnonSenderInvites));
	
	return app;
}
Object.freeze(exports);