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
 * This exports a function that creates a new instance of ASMail delivery server.
 * Notice that test resources are used.
 * These have proper interface, but implementation is test-grade.
 * For production attach proper implementation of resource objects.
 */

// External dependencies
import express = require('express');

//Our mountable apps
import userSettingsApp = require('./user-settings/user-settings-app');
import storage = require('./3nstorage-service/3nstorage-app');

//Resource/Data modules
import sessions = require(
	'../lib-server/resources/mem-backed-sessions-factory');
import usersMod = require('./resources/users');
import midAuthorizer = require('../lib-server/resources/mailerid-authorizer');

export function makeApp(dataFolder: string): express.Express {
	
	// TODO make users, and sessions for account settings,
	// owner file access, and sharing file access, and proper
	// resources to mounted apps
	
	var app = express();
	var ownersSessions = sessions.makeSingleProcFactory(20*60);
	var sharingSessions = sessions.makeSingleProcFactory(20*60);
	var userSettingSessions = sessions.makeSingleProcFactory(20*60);
	var users = usersMod.makeFactory(dataFolder);
	
	app.use('/3nstorage', storage.makeApp(
			ownersSessions, sharingSessions, users, midAuthorizer.validate));
	
	app.use('/3nstorage-users',
			userSettingsApp.makeApp(userSettingSessions,
					users, midAuthorizer.validate));
	
	return app;
};
