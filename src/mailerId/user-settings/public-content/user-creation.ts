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
 * This defines functions used by user creation part.
 */

import hex = require('../../../lib-common/hex');
import base64 = require('../../../lib-common/base64');
import Q = require('q');
import nacl = require('ecma-nacl');
import xhr = require('../../../lib-client/xhr-utils');
import random = require('../../../lib-client/random');
import log = require('../../../lib-client/page-logging');
import keyGen = require('../../../lib-client/workers/key-gen-main');

export function processNewUserInfoAndSend(form): void {
	try {

		var username: string = form.username.value;
		var pubkey: string = form.pubkey.value;
		var pass: string = form.pass.value;
		var keyGenParams = {
			salt: base64.pack(random.bytes(64)),
			logN: 17, // 2^17 === 131072 === N in algorithm
			r: 8,	// r === 2^3
			p: 1
		};
		// Note that with these parameters scrypt shall use memory around:
		// (2^7)*r*N === (2^7)*(2^3)*(2^17) === 2^27 === (2^7)*(2^20) === 128MB
		// If we choose logN === 14, then scrypt uses only 16MB, and in 2015 we
		// already have Intel Xeon Processor E7-4890 v2 with 37.5M (!) of Cache.
		// The point of scrypt is to use so much memory that it will not fit
		// into cache of any known processor.

		log.clear();

		if (!username) {
			log.write("MISSING INFO: provide username for new account.");
			return;
		}

		var promiseOfPubKey: Q.Promise<Uint8Array>;
		if (pubkey) {
			if (pass) {
				log.write("INCORRECT INFO: provide only either public key or\n"+
					"passphrase, but not both.");
				return;
			} else if (pubkey.length < 64) {
				log.write("INCORRECT INFO: public key should be 32 bytes long,\n"+
					"which is 64 hex charaters,\nwhile only "+pubkey.length+
					" are given.");
				return;
			} else {
				promiseOfPubKey = <any> Q.fcall(() => {
					return hex.open(pubkey);
				})
				.fail((err) => {
					log.write("INCORRECT INFO: given public key cannot be"+
					" interpreted as hex form of binary: "+err.message);
					throw new Error(err);
				});
			}
		} else {
			if (pass) {
				promiseOfPubKey = keyGen.deriveKeyFromPass(pass, keyGenParams)
				.then((skey) => {
					var pkey = nacl.box.generate_pubkey(skey);
					log.write("Public key has been calculated and is (in hex): "+
						hex.pack(pkey));
					return pkey;
				});
			} else {
				log.write("MISSING INFO: provide either public key for "+
					username+",\nor passphrase, from which keys are derived.");
				return;
			}
		}

		promiseOfPubKey
		.then((pkey) => {
			log.write("Sending username and user's public key to the server "+
				"to create a test account. Check request body to see, how "+
				"simple and short is JWK form of keys of developer-friendly "+
				"NaCl's cryptographic functions.");
			var deferred = Q.defer<void>();
			var url = "/mailerid-users/add-user";
			var req = xhr.makeJsonRequest('PUT', url, () => {
				if (req.status == 201) {
					deferred.resolve();
					log.write("Server created a new test account record.");
				} else if (req.status == 473) {
					log.write("Given user name is already present on the "+
						"server, try another one.");
					xhr.reject(deferred, req);
				} else {
					xhr.reject(deferred, req);
				}
			}, deferred);
			req.sendJSON({
				id: username,
				pkey: {
					use: 'login-pub-key',
					alg: 'NaCl-box-CXSP',
					k: base64.pack(pkey)
				},
				params: keyGenParams
			});
			return deferred.promise;
		})
		.then(() => {
			// cleanup 
			form.reset();
			// show further info in the log 
			log.write("You may sign into account page to view the Public Key "+
				"Login in process:");
			log.writeLink("Sign in", "#login-view");
			log.write("And you may use this new test account with services "+
				"that use MailerId protocol, and see its process:");
			log.writeLink("ASMail service",
					"https://localhost:8080/asmail-users/", true);
			log.writeLink("3NStorage service",
					"https://localhost:8080/3nstorage-users/", true);

		})
		.fail(function(err){
			log.write("ERROR: "+err.message);
			console.error('Error in file '+err.fileName+' at '+
					err.lineNumber+': '+err.message);
		})
		.done();
	} catch (err) {
		console.error(err);
	}
}

