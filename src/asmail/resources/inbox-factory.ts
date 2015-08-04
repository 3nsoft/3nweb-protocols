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

import Q = require('q');
import fs = require('fs');
import inboxMod = require('./inbox');
import base64 = require('../../lib-common/base64');
import random = require('../../lib-server/random');
import fErrMod = require('../../lib-common/file-err');
import fops = require('../../lib-server/resources/file_ops');

/**
 * @param rootFolder
 * @return promise, resolvable to path of a newly created folder.
 */
function createInboxFolder(rootFolder: string): Q.Promise<string> {
	var inboxFolderPath = rootFolder+"/"+random.stringOfB64UrlSafeChars(20);
	var promise = Q.nfcall<void>(fs.mkdir, inboxFolderPath)
	.then(() => {
		return inboxFolderPath;
	})
	.fail((err: fErrMod.FileError) => {
		if (err.code === fErrMod.Code.fileExists) {
			return createInboxFolder(rootFolder);
		} else { throw err; }
	});
	return promise;
}

/**
 * @param rootFolder
 * @return an object-map from user ids to inbox folder paths.
 */
function pickupExistingInboxes(rootFolder: string):
		{ [userId: string]: string; } {
	var fNames = fs.readdirSync(rootFolder);
	var userInboxPaths: { [userId: string]: string; } = {};
	fNames.forEach((fName) => {
		var userId
		, path = rootFolder+'/'+fName;
		try {
			userId = fs.readFileSync(path+'/info/userid', { encoding: 'utf8' });
		} catch (err) {
			console.error("Folder "+fName+" cannot be seen as an inbox " +
					"in the root folder "+rootFolder+
					"\ndue to the following\n"+err.stack);
			return;
		}
		userInboxPaths[userId] = path;
	});
	return userInboxPaths;
}

export interface IInboxFactory {
	/**
	 * @param userId
	 * @return promise, either resolvable to inbox object for a newly created
	 * inbox, or resolvable to undefined, if given id is already associated
	 * with existing inbox.
	 */
	makeNewInboxFor(userId: string): Q.Promise<inboxMod.Inbox>;
	/**
	 * @param userId
	 * @return a promise, either resolvable to found inbox, or, resolvable to
	 * undefined, if given user id is unknown.
	 */
	getInbox(userId: string): Q.Promise<inboxMod.Inbox>;
}

export function makeFactory(rootFolder: string,
		writeBufferSize?: string|number, readBufferSize?: string|number):
		IInboxFactory {
	if (!fops.existsFolderSync(rootFolder)) { throw new Error(
			"Given path "+rootFolder+" does not identify existing directory."); }
	
	var userInboxPaths = pickupExistingInboxes(rootFolder);
	
	var factory: IInboxFactory = {
		makeNewInboxFor: (userId: string): Q.Promise<inboxMod.Inbox> => {
			if ('undefined' !== typeof userInboxPaths[userId]) {
				return <any> Q.when();
			}
			return createInboxFolder(rootFolder)
			.then((path) => {
				var inbox = new inboxMod.Inbox(userId, path,
					writeBufferSize, readBufferSize);
				userInboxPaths[inbox.userId] = inbox.path;
				return inboxMod.Inbox.initInbox(inbox)
				.then(() => {
					return inbox;
				});
			});
		},
		getInbox: (userId: string): Q.Promise<inboxMod.Inbox> => {
			var path = userInboxPaths[userId];
			if (path) {
				return Q.when(new inboxMod.Inbox(userId, path,
					writeBufferSize, readBufferSize));
			} else {
				return <any> Q.when();
			}
		}
	};
	
	Object.freeze(factory);
	
	return factory;
}

Object.freeze(exports);