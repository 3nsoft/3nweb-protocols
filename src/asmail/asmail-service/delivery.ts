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

// Modules for ASMail delivery protocol
import startSession = require('./routes/delivery/start-session');
import preFlight = require('./routes/delivery/pre-flight');
import authorize = require('./routes/delivery/sender-authorization');
import getRecipientPubKey = require(
	'./routes/delivery/provide-recipient-pubkey');
import putMetadata = require('./routes/delivery/put-metadata');
import putBytes = require('./routes/delivery/put-bytes');
import finalizeDelivery = require('./routes/delivery/finalize-delivery');

import api = require('../../lib-common/service-api/asmail/delivery');

var MAX_CHUNK_SIZE = '0.5mb';

export function makeApp(
		sessions: sessionsMod.Factory, recipients: recipMod.Factory,
		midAuthorizer: authorize.IMidAuthorizer): express.Express {
	
	var app = express();
	app.disable('etag');
	
	app.use(cors.allowCrossDomain(
			[ "Content-Type", "X-Session-Id" ],
			[ 'GET', 'POST', 'PUT' ]));
	
	app.post('/'+api.sessionStart.URL_END,
			sessions.checkSession(),
			bodyParsers.json('1kb'),
			startSession.makeHandler(
				recipients.allowedMaxMsgSize, sessions.generate));
	
	app.post('/'+api.preFlight.URL_END,
			sessions.checkSession(),
			bodyParsers.json('1kb'),
			preFlight.makeHandler(
				recipients.allowedMaxMsgSize));
	
	//
	// TODO add /restart-session/msg/:msgId for completion of aborted sending,
	//		due to long term (5 minutes and  more) loss of communication (e.g. 3G)
	//
	
	app.post('/'+api.authSender.URL_END,
			sessions.ensureOpenedSession(),
			bodyParsers.json('4kb'),
			authorize.makeHandler(midAuthorizer));
	
	// *** Require authorized session for everything below ***
	app.use(sessions.ensureAuthorizedSession());
	
	app.get('/'+api.initPubKey.URL_END,
			getRecipientPubKey.makeHandler(recipients.getPubKey));
	
	app.put('/'+api.msgMeta.URL_END,
			bodyParsers.json('16kb'),
			putMetadata.makeHandler(recipients.setMsgStorage, MAX_CHUNK_SIZE));
	
	app.put('/'+api.msgObjHeader.EXPRESS_URL_END,
			putBytes.makeHandler(recipients.saveObjHeader, MAX_CHUNK_SIZE));
	app.put('/'+api.msgObjSegs.EXPRESS_URL_END,
			putBytes.makeHandler(recipients.saveObjSegments, MAX_CHUNK_SIZE));
	
	app.post('/'+api.completion.URL_END,
			finalizeDelivery.makeHandler(recipients.finalizeDelivery));
	
	return app;
}
Object.freeze(exports);