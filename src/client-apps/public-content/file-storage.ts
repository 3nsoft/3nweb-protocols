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

import Q = require("q");
import midSignMod = require('../../lib-common/mid-sigs-NaCl-Ed');
import nacl = require('ecma-nacl');
import utf8 = require('../../lib-common/utf8');
import xspFS = require('../../lib-client/3nstorage/xsp-fs/index');
import storesMod = require('../../lib-client/3nstorage/stores');
import routers = require('../../lib-client/simple-router');
import keyGen = require('../../lib-client/workers/key-gen-main');
import log = require('../../lib-client/page-logging');
import fErrMod = require('../../lib-common/file-err');
import keyringMod = require('../../lib-client/asmail/keyring/index');

// These declared variables should be initialized in window by other script(s)
declare var pageRouter: routers.Router;

export interface Storage {
	completeCredentialsEntry(form: any, cancel: boolean): void;
	init(signerGen: () => Q.Promise<midSignMod.user.MailerIdSigner>):
		Q.Promise<void>;
	close(): Q.Promise<void>;
	keyringStorage(): keyringMod.Storage;
}

var KEYRING_APP_DATA_FOLDER = 'org.3nweb.demo.protocols.keyring';
var KEYRING_FNAME = 'keyring.json';

class FileStorage {
	
	private remoteStore: xspFS.Storage = null;
	private keyringFS: xspFS.FileSystem = null;
	private deferredMasterPass: Q.Deferred<string> = null;
	
	/**
	 * @return a promise, resolvable to an object with pass field.
	 */
	private promiseMasterPassForRoot(): Q.Promise<string> {
		pageRouter.showElem('storage-credentials');
		document.forms['storage-key-entry'].pass.focus();
		this.deferredMasterPass = Q.defer<string>();
		return this.deferredMasterPass.promise;
	}
		
	completeCredentialsEntry(form: any, cancel: boolean): void {
		function hideForm() {
			form.reset();
			pageRouter.hideElem('storage-credentials');
		}
		try {
			if (cancel) {
				hideForm();
				this.deferredMasterPass.reject(new Error(
					"User canceled entry of master password for storage root."));
				return;
			}
			var pass = form.pass.value;
			if (!pass) {
				alert("Passphrase is missing.\nPlease, type it in.");
				return;
			}
			hideForm();
			this.deferredMasterPass.resolve(pass);
		} catch (err) {
			log.write("ERROR: "+err.message);
			console.error('Error in file '+err.fileName+' at '+
					err.lineNumber+': '+err.message);
		}
	}
	
	init(signerGen: () => Q.Promise<midSignMod.user.MailerIdSigner>):
			Q.Promise<void> {
		var promise = storesMod.make3NStorageOwner(
			'https://localhost:8080/3nstorage', signerGen)
		.then((remoteStore) => {
			this.remoteStore = remoteStore;
			return this.promiseMasterPassForRoot();
		})
		.then((pass) =>  {
			return keyGen.deriveKeyFromPass(pass,
				this.remoteStore.getRootKeyDerivParams());
		})
		.then((mkey) => {
			var masterDecr = nacl.secret_box.formatWN.makeDecryptor(mkey);
			nacl.arrays.wipe(mkey);
			return xspFS.makeExisting(this.remoteStore, null, masterDecr)
		})
		.then((rootFS) => {
			var tasks = [ this.setKeyringFS(rootFS) ];
			return <any> Q.all(tasks)
			.fin(() => {
				return rootFS.close(false);
			});
		})
		return promise;
	}
	
	private setKeyringFS(rootFS: xspFS.FileSystem): Q.Promise<void> {
		if (this.keyringFS) { throw new Error("File system is already set"); }
		var promise = rootFS.getRoot().getFolderInThisSubTree(
			[ xspFS.sysFolders.appData, KEYRING_APP_DATA_FOLDER ], true)
		.then((f) => {
			this.keyringFS = rootFS.makeSubRoot(f);
		});
		return promise;
	}
	
	keyringStorage(): keyringMod.Storage {
		return (new KeyRingStore(this.keyringFS)).wrap();
	}
	
	close(): Q.Promise<void> {
		var tasks: Q.Promise<void>[] = [];
		if (this.keyringFS) {
			tasks.push(this.keyringFS.close(false));
			this.keyringFS = null;
		}
		if (this.remoteStore) {
			tasks.push(this.remoteStore.close());
			this.remoteStore = null;
		}
		return <any> Q.all(tasks);
	}
	
	wrap(): Storage {
		var wrap = {
			completeCredentialsEntry: this.completeCredentialsEntry.bind(this),
			init: this.init.bind(this),
			close: this.close.bind(this),
			keyringStorage: this.keyringStorage.bind(this)
		};
		Object.freeze(wrap);
		return wrap;
	}
	
}
Object.freeze(FileStorage);
Object.freeze(FileStorage.prototype);

export function makeStorage(): Storage {
	return (new FileStorage()).wrap();
}

class KeyRingStore implements keyringMod.Storage {
	
	private keyringFS: xspFS.FileSystem;
	
	constructor(keyringFS: xspFS.FileSystem) {
		if (!keyringFS) { throw new Error("No file system given."); }
		this.keyringFS = keyringFS;
		Object.seal(this);
	}
	
	save(serialForm: string): Q.Promise<void> {
		if (!this.keyringFS) { throw new Error("File system is not setup"); }
		log.write("Record changes to keyring file");
		var promise = this.keyringFS.getRoot().getFile(KEYRING_FNAME, true)
		.then((file) => {
			if (!file) {
				log.write("Create keyring file, as it does not exist, yet.");
				file = this.keyringFS.getRoot().createFile(KEYRING_FNAME);
			}
			return file.save(utf8.pack(serialForm));
		});
		return promise;
	}
	
	load(): Q.Promise<string> {
		if (!this.keyringFS) { throw new Error("File system is not setup"); }
		log.write("Loading keyring file");
		var promise = this.keyringFS.getRoot().getFile(KEYRING_FNAME)
		.then((file) => {
			return file.readSrc()
			.then((src) => {
				return src.read(0, null, true);
			})
			.then((bytes) => {
				return utf8.open(bytes);
			})
		}, (err) => {
			if ((<fErrMod.FileError> err).code === fErrMod.Code.noFile) {
				return null;
			}
			throw err;
		});
		return promise;
	}
	
	wrap(): keyringMod.Storage {
		var wrap: keyringMod.Storage = {
			load: this.load.bind(this),
			save: this.save.bind(this)
		};
		Object.freeze(wrap);
		return wrap;
	}
	
}
Object.freeze(KeyRingStore);
Object.freeze(KeyRingStore.prototype);

Object.freeze(exports);