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
 * This contains functions for 3NStorage account setup.
 */

import Q = require('q');
import xhrUtils = require('../../../lib-client/xhr-utils');
import log = require('../../../lib-client/page-logging');
import routers = require('../../../lib-client/simple-router');
import midWithLogging = require('../../../lib-client/mid-proc-with-logging');
import midUser = require('../../../lib-client/user-with-mid-session');
import nacl = require('ecma-nacl');
import midSignMod = require('../../../lib-common/mid-sigs-NaCl-Ed');
import hex = require('../../../lib-common/hex');
import base64 = require('../../../lib-common/base64');
import random = require('../../../lib-client/random');
import keyGen = require('../../../lib-client/workers/key-gen-main');
import keyGenUtils = require('../../../lib-client/workers/key-gen-common');
import xspFS = require('../../../lib-client/3nstorage/xsp-fs/index');
import stores = require('../../../lib-client/3nstorage/stores');

// These declared variables should be initialized in window by index script
declare var pageRouter: routers.Router;
declare var userData: { account: Account; };

var DO_NOT_REPORT = "do not report error";

export class Account extends midUser.ServiceUser {
	
	accountExist: boolean = null;
	
	midSigner: midSignMod.user.MailerIdSigner = null;
	
	constructor(address: string) {
		super(address, {
			login: 'login/mailerid/',
			logout: 'close-session'
		});
		var loc = location.href;
		if (loc.indexOf('?') >= 0) {
			loc = loc.substring(0, loc.lastIndexOf('?'));
		}
		if (loc.indexOf('#') >= 0) {
			loc = loc.substring(0, loc.lastIndexOf('#'));
		}
		this.serviceURI = loc;
		Object.seal(this);
	}
	
	checkIfAccountExist(): Q.Promise<boolean> {
		var deferred = Q.defer<boolean>();
		var url = './exists-account';
		var xhr = xhrUtils.makeBodylessRequest('GET', url, () => {
			if (xhr.status == 200) {
				this.accountExist = true;
				deferred.resolve(true);
			} else if (xhr.status == 474) {
				this.accountExist = false;
				deferred.resolve(false);
			} else {
				xhrUtils.reject(deferred, xhr);
			}
		}, deferred, this.sessionId);
		xhr.send();
		return deferred.promise;
	}
	
	createAccount(keyGenParams: keyGenUtils.ScryptGenParamsInJson):
			Q.Promise<void> {
		var deferred = Q.defer<void>();
		var url = './make-account';
		var xhr = xhrUtils.makeJsonRequest('POST', url, () => {
			if ((xhr.status == 201) || (xhr.status == 473)) {
				deferred.resolve();
			} else {
				xhrUtils.reject(deferred, xhr);
			}
		}, deferred, this.sessionId);
		xhr.sendJSON(keyGenParams);
		return deferred.promise;
	}	
}

export function signinWithMailerIdAndCheckIfAccExist(form): void {
	try{
		log.clear();
		var address: string = form.address.value;
		var acc = new Account(address);
		midWithLogging.provisionAssertionSigner(form)
		.then((assertSigner) => {
			acc.midSigner = assertSigner;
			form.reset();
			return midWithLogging.startAndAuthSession(acc, acc.midSigner);
		})
		.then(() => {
			userData.account = acc;
			return acc.checkIfAccountExist();
		})
		.then((accExist) => {
			pageRouter.openView('login-success');
		})
		.fail((err) => {
			log.write("ERROR: "+err.message);
			console.error('Error in file '+err.fileName+' at '+
					err.lineNumber+': '+err.message);
		})
		.done();
	} catch (err) {
		console.error(err);
	}
}

export function logout(): void {
	if (!userData.account) { return; }
	var sid = userData.account.sessionId;
	userData.account.logout()
	.then(() => {
		console.info("Session '"+sid+"' is closed on the server side.");
		// cleanup info fields related to closed session
		userData.account = null;
		// open signin thingy
		pageRouter.openView('signin');
	})
	.fail((err) => {
		log.write("ERROR: "+err.message);
		console.error('Error in file '+err.fileName+' at '+
				err.lineNumber+': '+err.message);
	})
	.done();
}

var defaultKeyGenParams = {
	logN: 17, // 2^17 === 131072 === N in algorithm
	r: 8,	// r === 2^3
	p: 1
};

function genEncrForRoot(form: any): {
		encGen: () => Q.Promise<nacl.secret_box.Encryptor>;
		keyGenParams: keyGenUtils.ScryptGenParamsInJson; } {
	var secKeyHex: string = form.seckey.value;
	var pass: string = form.pass.value;
	var keyGenParams: keyGenUtils.ScryptGenParamsInJson = {
		logN: defaultKeyGenParams.logN,
		r: defaultKeyGenParams.r,
		p: defaultKeyGenParams.p,
		salt: base64.pack(random.bytes(64))
	};
	var skey: Uint8Array;
	if (secKeyHex) {
		if (pass) {
			log.write("INCORRECT INFO: provide only either secret key or "+
					"passphrase, but not both.");
			throw DO_NOT_REPORT;
		} else if (secKeyHex.length !== 64) {
			log.write("INCORRECT INFO: secret key should be 32 bytes long,\n"+
				"which is 64 hex charaters,\nwhile only "+secKeyHex.length+
				" are given.");
			throw DO_NOT_REPORT;
		} else {
			try {
				skey = hex.open(secKeyHex);
			} catch (err) {
				log.write("INCORRECT INFO: given secret key cannot be "+
					"interpreted as hex form of binary: "+err.message);
				throw DO_NOT_REPORT;
			}
		}
	} else {
		if (!pass) {
			log.write("MISSING INFO: provide either secret key "+
				",\nor passphrase, from which keys are derived.");
			throw DO_NOT_REPORT;
		}
	}
	form.reset();
	function encGen(): Q.Promise<nacl.secret_box.Encryptor> {
		var keyProm: Q.Promise<Uint8Array>;
		if (skey) {
			log.write("Using provided secret key for file system's root "+
				"master encryptor.");
			keyProm = Q.when(skey);
		} else {
			log.write("Start deriving a secret key from a given passphrase. "+
				"This key is used for file system's root master encryptor.");
			keyProm = keyGen.deriveKeyFromPass(pass, keyGenParams);
		}
		return keyProm
		.then((skey: Uint8Array) => {
			var enc = nacl.secret_box.formatWN.makeEncryptor(
				skey, random.bytes(nacl.secret_box.NONCE_LENGTH));
			nacl.arrays.wipe(skey);
			return enc;
		})
	}
	return { encGen: encGen, keyGenParams: keyGenParams };
}

function makeAndSaveRoot(encGen: () => Q.Promise<nacl.secret_box.Encryptor>):
			Q.Promise<void> {
	log.write("Connecting to storage service directly within owner api.");
	var remoteStore: xspFS.Storage;
	var promise = stores.make3NStorageOwner(
		'https://localhost:8080/3nstorage',
		() => { return Q.when(userData.account.midSigner); })
	.then((store) => {
		remoteStore = store;
		return encGen();
	})
	.then((enc) => {
		log.write("Setting up default file tree structure in a storage's "+
			"file system, and encrypting root with a derived secret key.");
		var fs = xspFS.makeNewRoot(remoteStore, enc);
		log.write("Flushing file system changes to the server.");
		fs.flush();
		return fs.getSavingProc()
		.then(() => {
			return fs.close();
		});
	})
	.then(() => {
		log.write("All changes are written to server. Do check in browser's "+
			"console particulars of requests. Check server's data folder to "+
			"verify that server only handles versioned encrypted blobs, "+
			"without any knowledge of file hierarchy."); 
	});
	return promise;
}

export function createAccount(form: any): void {
	try{
		log.clear();
		var encAndParams = genEncrForRoot(form);
		userData.account.createAccount(encAndParams.keyGenParams)
		.then(() => {
			log.write("Account with storage server is opened for "+
				userData.account.userId);
			return makeAndSaveRoot(encAndParams.encGen);
		})
		.then(() => {
			pageRouter.hideElem("make-new-account");
			pageRouter.showElem("account-exists");
		})
		.fail((err) => {
			if (err === DO_NOT_REPORT) { return; }
			log.write("ERROR: "+err.message);
			console.error('Error in file '+err.fileName+' at '+
					err.lineNumber+': '+err.message);
		})
		.done();
	} catch (err) {
		console.error(err);
	}
}

Object.freeze(exports);