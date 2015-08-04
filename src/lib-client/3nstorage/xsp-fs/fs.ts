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
 * Everything in this module is assumed to be inside of a file system
 * reliance set, exposing to outside only file system's wrap.
 */

import fErrMod = require('../../../lib-common/file-err');
import folderMod = require('./fs-entities');
import random = require('../../random');
import Q = require('q');
import nacl = require('ecma-nacl');
import byteSrcMod = require('../../byte-source');
import xspMod = require('./index');

var OBJID_LEN = 40;

export var sysFolders = {
	appData: 'Apps Data',
	userFiles: 'User Files'
};
Object.freeze(sysFolders);

interface SavingTask {
	objId: string;
	encrObjSrc: byteSrcMod.ObjBytesSource;
	newObj: boolean;
	deferredSaving: Q.Deferred<void>;
}

export class FS implements xspMod.FileSystem {
	
	arrFactory = nacl.arrays.makeFactory();
	storage: xspMod.Storage;
	objs: {
		[objId: string]: folderMod.File|folderMod.Folder;
	} = {};
	private savingProc: Q.Promise<void> = null;
	private root: folderMod.Folder = null;
	private isSubRoot = true;
	private objsToSave: {
		ordered: SavingTask[];
		byId: { [objId:string]: SavingTask };
	} = { ordered: [], byId: {} };
	
	constructor(storage: xspMod.Storage) {
		this.storage = storage;
		Object.seal(this);
	}
	
	getSavingProc(): Q.Promise<void> {
		return this.savingProc;
	}
	
	/**
	 * @return new objId, with null placed under this id, reserving it in
	 * objs map.
	 */
	generateNewObjId(): string {
		var id = random.stringOfB64UrlSafeChars(OBJID_LEN);
		if ('undefined' === typeof this.objs[id]) {
			this.objs[id] = null;
			return id;
		} else {
			return this.generateNewObjId();
		}
	}
	
	private setRoot(root: folderMod.Folder): void {
		if (this.root) { throw new Error("Root is already set."); }
		this.root = root;
		if ('string' === typeof root.objId) {
			this.objs[root.objId] = root;
		}
	}
	
	makeSubRoot(f: xspMod.Folder): xspMod.FileSystem {
		var fs = new FS(this.storage);
		var folder = <folderMod.Folder> this.objs[f.getObjId()]
		fs.setRoot(folderMod.Folder.rootFromFolder(fs, folder));
		fs.isSubRoot = true;
		return fs.wrap();
	}
	
	static makeNewRoot(storage: xspMod.Storage,
			masterEnc: nacl.secret_box.Encryptor): xspMod.FileSystem {
		var fs = new FS(storage);
		fs.setRoot(folderMod.Folder.newRoot(fs, masterEnc));
		fs.root.createFolder(sysFolders.appData);
		fs.root.createFolder(sysFolders.userFiles);
		return fs.wrap();
	}
	
	static makeExisting(storage: xspMod.Storage, rootObjId: string,
			masterDecr: nacl.secret_box.Decryptor, rootName: string = null):
			Q.Promise<xspMod.FileSystem> {
		var fs = new FS(storage);
		var promise = storage.getObj(rootObjId)
		.then((objSrc) => {
			return folderMod.Folder.rootFromObjBytes(
				fs, rootName, rootObjId, objSrc, masterDecr);
		})
		.then((root) => {
			fs.setRoot(root);
			return fs.wrap();
		});
		return promise;
	}
	
	
	private doSavingIteratively(): Q.Promise<void> {
		var task = this.objsToSave.ordered.shift();
		if (!task) {
			this.savingProc = null;
			return;
		}
		delete this.objsToSave.byId[task.objId];
		return this.storage.saveObj(task.objId,
			task.encrObjSrc, task.newObj)
		.then(() => {
			task.deferredSaving.resolve();
			return this.doSavingIteratively();
		}, (err) => {
			task.deferredSaving.reject(err);
			return task.deferredSaving.promise;
		});
	}
	
	flush(): void {
		if (this.savingProc) { return; }
		if (this.objsToSave.ordered.length === 0) { return; }
		this.savingProc = Q.when()
		.then(() => {
			return this.doSavingIteratively();
		})
		.fail((err) => {
			this.savingProc = null;
			throw err;
		});
	}
	
	close(closeStorage = true): Q.Promise<void> {
		this.flush();
		this.savingProc = (this.savingProc ? this.savingProc : Q.when())
		.then(() => {
			// TODO add destroing of obj's (en)decryptors
			
			if (!closeStorage) { return; }
			return this.storage.close();
		})
		.then(() => {
			this.root = null;
			this.storage = null;
			this.objs = null;
			this.objsToSave = null;
			this.savingProc = null;
		});
		return this.savingProc;
	}
	
	addSavingTask(objId: string, encrObjSrc: byteSrcMod.ObjBytesSource,
			isNew: boolean): Q.Promise<void> {
		var task = this.objsToSave.byId[objId];
		if (task) {
			if (!task.newObj && isNew) { throw new Error("Illegal indication "+
					"of new file, for an already existing one."); }
			// we fast resolve existing task's deferred, as write has not
			// started, since task can still be found in above container,
			// and we replace source with a new one, and set new deferred
			task.encrObjSrc = encrObjSrc;
			task.deferredSaving.resolve();
			task.deferredSaving = Q.defer<void>();
		} else {
			task = {
				objId: objId,
				encrObjSrc: encrObjSrc,
				newObj: isNew,
				deferredSaving: Q.defer<void>()
			};
			this.objsToSave.byId[task.objId] = task;
			this.objsToSave.ordered.push(task);
		}
		this.flush();
		return task.deferredSaving.promise;
	}
	
	getRoot(): xspMod.Folder {
		return this.root.wrap();
	}
	
	private changeObjId(obj: folderMod.Folder|folderMod.File,
			newId: string): void {
// TODO implementation (if folder, change children's parentId as well)
		throw new Error("Not implemented, yet");
	}
	
	move(destFolder: folderMod.Folder, newName: string): void {
// TODO implementation of move file
		throw new Error("Not implemented, yet");
	}
	
	private wrap(): xspMod.FileSystem {
		var wrap: xspMod.FileSystem = {
			getRoot: this.getRoot.bind(this),
			flush: this.flush.bind(this),
			close: this.close.bind(this),
			getSavingProc: this.getSavingProc.bind(this),
			makeSubRoot: this.makeSubRoot.bind(this)
		};
		Object.freeze(wrap);
		return wrap;
	}
	
}
Object.freeze(FS.prototype);
Object.freeze(FS);


Object.freeze(exports);