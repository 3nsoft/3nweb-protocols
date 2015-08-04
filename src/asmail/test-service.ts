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
 * This creates a new instance of ASMail server internals, adding
 * appropriate routes to a given express app.
 */

// External dependencies
import express = require('express');

//Our mountable apps
import settings = require('./user-settings/user-settings-app');
import mail = require('./asmail-service/asmail-app');

// Resource/Data modules
import sessions = require('../lib-server/resources/mem-backed-sessions-factory');
import recipientsMod = require('./resources/recipients');
import midAuthorizer = require('../lib-server/resources/mailerid-authorizer');

export function makeApp(rootFolder: string): express.Express {
	
	var app = express();
	var mailDeliverySessions = sessions.makeSingleProcFactory(5*60);
	var recipientsSessions = sessions.makeSingleProcFactory(10*60);
	var userSettingSessions = sessions.makeSingleProcFactory(10*60);
	var recipients = recipientsMod.makeFactory(rootFolder);

	app.use('/asmail', mail.makeApp(
			mailDeliverySessions, recipientsSessions,
			recipients, midAuthorizer.validate));
	
	app.use('/asmail-users', settings.makeApp(
			userSettingSessions, recipients, midAuthorizer.validate));
	
	return app;
};
