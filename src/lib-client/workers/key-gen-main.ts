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
import log = require('../../lib-client/page-logging');
import keyGenUtil = require('./key-gen-common');

/**
 * @param pass is a passphrase, from which a key should be generated.
 * @param keyGenParams is an object with parameters needed for key generation
 * from passphrase.
 * @return a promise, resolvable to Uint8Array with generated key.
 */
export function deriveKeyFromPass(pass: string, keyGenParams: keyGenUtil.ScryptGenParamsInJson):
		Q.Promise<Uint8Array> {
	// derive secret key from the password 
	// this needs a web-worker, as scrypt is intense 
	var deferred = Q.defer<Uint8Array>();
	var worker = new Worker('./key-gen-worker.js');
	worker.addEventListener('message', function(e) {
		if (e.data.progress) {
			log.write("Derivation progress: "+e.data.progress+"%");
			return;
		}
		if (e.data.key) {
			deferred.resolve(new Uint8Array(e.data.key));
			log.write("Secret key has been derived from a password.");
		} else {
			log.write("Error occured in key-deriving web-worker: "+e.data.error);
			throw new Error("Cannot derive secret key. Error message: "+e.data.error);
		}
		worker.terminate();
		worker = null; 
	});
	log.write("Starting derivation of secret key from given passphrase, using "+
		"Ecma-NaCl implementation of scrypt. Parameters are salt: "+
		keyGenParams.salt+", "+"logN: "+keyGenParams.logN+", r: "+keyGenParams.r+
		", p: "+keyGenParams.p+". Memory use is on the order of "+
		Math.floor(keyGenParams.r*Math.pow(2, 7+keyGenParams.logN-20))+"MB.");
	var workMsg = keyGenUtil.paramsToWorkMsg(
		keyGenUtil.paramsFromJson(pass, keyGenParams));
	worker.postMessage(workMsg.json, workMsg.buffers);
	return deferred.promise;
}
Object.freeze(exports);