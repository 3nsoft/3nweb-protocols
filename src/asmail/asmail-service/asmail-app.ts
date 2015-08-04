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

import sessionsMod = require('../../lib-server/resources/sessions');
import users = require('../resources/recipients');
import authorize = require('../../lib-server/routes/sessions/mid-auth');

// ASMail inner parts
import config = require('./config');
import delivery = require('./delivery');
import retrieval = require('./retrieval');

var PATHS = {
	delivery: '/delivery/',
	retrieval: '/retrieval/',
	config: '/config/'
};

function setupStaticEntryRoute(app: express.Express): void {
	
	app.route('/')
	.all(cors.allowCrossDomain(
			[ "Content-Type" ],
			[ 'GET' ]))
	.get((req: express.Request, res: express.Response) => {
		var path = req.originalUrl;
		if (path[path.length-1] !== '/') {
			path = path+'/';
		}
		var json = {
				"delivery": path+PATHS.delivery.substring(1),
				"retrieval": path+PATHS.retrieval.substring(1),
				"config": path+PATHS.config.substring(1)
		};
		// the following implicitly sets content type application/json
		res.status(200).json(json);
	});
	
}

export function makeApp(mailDeliverySessions: sessionsMod.Factory,
		recipientsSessions: sessionsMod.Factory, recipients: users.Factory,
		mailerIdAuthorizer: authorize.IMidAuthorizer): express.Express {
	
	var app = express();
	
	setupStaticEntryRoute(app);
	
	app.use(PATHS.delivery, delivery.makeApp(
			mailDeliverySessions, recipients, mailerIdAuthorizer));
	
	app.use(PATHS.retrieval, retrieval.makeApp(
			recipientsSessions, recipients, mailerIdAuthorizer));
	
	app.use(PATHS.config, config.makeApp(
			recipientsSessions, recipients, mailerIdAuthorizer));
	
	return app;
}
Object.freeze(exports);