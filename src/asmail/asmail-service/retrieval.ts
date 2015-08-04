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
 * express ASMail application.
 */

import express = require('express');

// Internal libs
import cors = require('../../lib-server/middleware/allow-cross-domain');
import bodyParsers = require('../../lib-server/middleware/body-parsers');

// Resource/Data modules
import sessionsMod = require('../../lib-server/resources/sessions');
import recipMod = require('../resources/recipients');

// routes
import midLogin = require('../../lib-server/routes/sessions/mid-auth');
import startSession = require('../../lib-server/routes/sessions/start');
import closeSession = require('../../lib-server/routes/sessions/close');
import listMsgIds = require('./routes/retrieval/list-messages');
import getMsgMeta = require('./routes/retrieval/get-message-meta');
import deleteMsg = require('./routes/retrieval/remove-message');
import getBytes = require('./routes/retrieval/get-message-bytes');

import api = require('../../lib-common/service-api/asmail/retrieval');

export function makeApp(
		sessions: sessionsMod.Factory, recipients: recipMod.Factory,
		midAuthorizer: midLogin.IMidAuthorizer): express.Express {
	
	var app = express();
	app.disable('etag');
	
	app.use(cors.allowCrossDomain(
			[ "Content-Type", "X-Session-Id" ],
			[ 'GET', 'POST', 'DELETE' ]));
	
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
	
	app.get('/'+api.listMsgs.URL_END,
			listMsgIds.makeHandler(recipients.getMsgIds));
	
	app.get('/'+api.msgMetadata.EXPRESS_URL_END,
			getMsgMeta.makeHandler(recipients.getMsgMeta));
	
	app['delete']('/'+api.rmMsg.EXPRESS_URL_END,
			deleteMsg.makeHandler(recipients.deleteMsg));
	
	app.get('/'+api.msgObjHeader.EXPRESS_URL_END,
			getBytes.makeHandler(recipients.getObjHeader));
	app.get('/'+api.msgObjSegs.EXPRESS_URL_END,
			getBytes.makeHandler(recipients.getObjSegments));
	
	return app;
}
Object.freeze(exports);