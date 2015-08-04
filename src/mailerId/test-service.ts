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
 * This exports a function that creates a new instance of MailerId Provider server.
 * Notice that test resources are used.
 * These have proper interface, but implementation is test-grade.
 * For production attach proper implementation of resource objects.
 */

// External dependencies
import express = require('express');
import fs = require('fs');
import fErrMod = require('../lib-common/file-err');

// Our mountable apps
import userSettingsApp = require('./user-settings/user-settings-app');
import maileridApp = require('./mailerid-service/mailerid-app');

// Resource/Data modules
import sessions =
		require('../lib-server/resources/mem-backed-sessions-factory');
import usersMod = require('./resources/users');
import cert = require('./resources/certifier');
import computeDH = require('./resources/compute-login-dhshared-key');

var KEY_CERT_FNAME = 'key-n-certs.json';
var USERS_FOLDER = 'users';

function ensureFolder(path: string): void {
	try {
		fs.mkdirSync(path);
	} catch (err) {
		if (err.code !== fErrMod.Code.fileExists) { throw err; }
		path = fs.realpathSync(path);
		var stats = fs.statSync(path);
		if (!stats.isDirectory()) {
			throw new Error(path+" exists, but is not a folder");
		}
	}
}


export function makeApp(dataPath: string): express.Express {
	
	ensureFolder(dataPath+'/'+USERS_FOLDER);
	
	var app = express();
	var certProvisSessions = sessions.makeSingleProcFactory(2*60);
	var userSettingSessions = sessions.makeSingleProcFactory(10*60);
	var users = usersMod.makeFactory(dataPath+'/'+USERS_FOLDER);
	var certifier = cert.makeSingleProcCertifier(dataPath+'/'+KEY_CERT_FNAME);

	app.use('/mailerid',
			maileridApp.makeApp(certProvisSessions, users, certifier,
					computeDH.calcNaClBoxSharedKey));
	
	app.use('/mailerid-users',
			userSettingsApp.makeApp(userSettingSessions, users,
					computeDH.calcNaClBoxSharedKey));
	
	return app;
}

Object.freeze(exports);