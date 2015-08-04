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
 * Everything in this module is assumed to be inside of a storage reliance set.
 */

import Q = require('q');
import fs = require('fs');
import base64 = require('../../lib-common/base64');
import random = require('../../lib-server/random');
import fErrMod = require('../../lib-common/file-err');
import storeMod = require('./store');
import fops = require('../../lib-server/resources/file_ops');


/**
 * @param rootFolder
 * @return promise, resolvable to path of a newly created folder.
 */
function createStoreFolder(rootFolder: string): Q.Promise<string> {
	var storeFolderPath = rootFolder+"/"+random.stringOfB64UrlSafeChars(20);
	var promise = Q.nfcall<void>(fs.mkdir, storeFolderPath)
	.then(() => {
		return storeFolderPath;
	})
	.fail((err) => {
		if (err.code === fErrMod.Code.fileExists) {
			return createStoreFolder(rootFolder);
		} else { throw err; }
	});
	return promise;
}

/**
 * @param rootFolder
 * @return an object-map from user ids to inbox folder paths.
 */
function pickupExistingStorages(rootFolder: string):
		{ [userId: string]: string; } {
	var fNames = fs.readdirSync(rootFolder);
	var userStorePaths: { [userId: string]: string; } = {};
	fNames.forEach((fName) => {
		var userId
		, path = rootFolder+'/'+fName;
		try {
			userId = fs.readFileSync(path+'/info/userid', { encoding: 'utf8' });
		} catch (err) {
			console.error("Folder "+fName+" cannot be seen as a store " +
					"in the root folder "+rootFolder+
					"\ndue to the following\n"+err.stack);
			return;
		}
		userStorePaths[userId] = path;
	});
	return userStorePaths;
}

export interface IStorageFactory {
	makeNewStoreFor(userId: string): Q.Promise<storeMod.Store>;
	getStore(userId: string): Q.Promise<storeMod.Store>;
}

export function makeFactory(rootFolder: string,
		writeBufferSize?: string|number, readBufferSize?: string|number):
		IStorageFactory {
	if (!fops.existsFolderSync(rootFolder)) { throw new Error(
			"Given path "+rootFolder+" does not identify existing directory."); }
	
	var userStorePaths = pickupExistingStorages(rootFolder);

	var factory: IStorageFactory = {
		makeNewStoreFor: (userId: string): Q.Promise<storeMod.Store> => {
			if ('undefined' !== typeof userStorePaths[userId]) {
				return <any> Q.when();
			}
			var promise = createStoreFolder(rootFolder)
			.then((path) => {
				var store = new storeMod.Store(
					userId, path, writeBufferSize, readBufferSize);
				userStorePaths[store.userId] = store.path;
				return storeMod.Store.initStore(store)
				.then(() => {
					return store;
				});
			});
			return promise;
		},
		getStore: (userId: string): Q.Promise<storeMod.Store> => {
			var path = userStorePaths[userId];
			if (path) {
				return Q.when(new storeMod.Store(
					userId, path, writeBufferSize, readBufferSize));
			} else {
				return <any> Q.when();
			}
		}
	};
	
	Object.freeze(factory);
	
	return factory;
}

Object.freeze(exports);