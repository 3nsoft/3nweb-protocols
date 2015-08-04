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
 * This defines functions used by user login part.
 */

import utf8 = require('../../../lib-common/utf8');
import hex = require('../../../lib-common/hex');
import Q = require('q');
import nacl = require('ecma-nacl');
import xhr = require('../../../lib-client/xhr-utils');
import log = require('../../../lib-client/page-logging');
import keyGen = require('../../../lib-client/workers/key-gen-main');
import pkl = require('../../../lib-client/user-with-pkl-session');
import sessionEncr = require('../../../lib-common/session-encryptor');

// We are doing a trick here for the test.
// Private members in TypeScript are just regular members in JavaScript,
// thus, casting to a different "show-privates" interface let's us
// show inner working of an object in a test setting.
interface PKLUserShowingPrivates {
	sessionId: string;
	serviceURI: string;
	keyDerivationParams: any;
	encryptor: sessionEncr.SessionEncryptor;
	startSession(): Q.Promise<void>;
	openSessionKey(dhsharedKeyCalculator: pkl.ICalcDHSharedKey): void;
	completeLoginExchange(): Q.Promise<void>;
	login(genOfDHKeyCalcPromise: pkl.IPromDHSKeyCalc): Q.Promise<void>;
	logout(): Q.Promise<void>;
}

export function loginUser(form): void {
	try {

		var username: string = form.username.value;
		var secretkey: string = form.seckey.value;
		var pass: string = form.pass.value;

		log.clear();

		if (!username) {
			log.write("MISSING INFO: provide username for new account.");
			return;
		}

		var promiseOfSecretKey = null;
		if (secretkey) {
			if (pass) {
				log.write("INCORRECT INFO: provide only either secret key or "+
						"passphrase, but not both.");
				return;
			} else if (secretkey.length !== 64) {
				log.write("INCORRECT INFO: secret key should be 32 bytes long,\n"+
					"which is 64 hex charaters,\nwhile only "+secretkey.length+
						" are given.");
				return;
			} else {
				promiseOfSecretKey = Q.fcall(() => {
					return hex.open(secretkey);
				})
				.fail(function(err){
					log.write("INCORRECT INFO: given secret key cannot be "+
						"interpreted as hex form of binary: "+err.message);
					throw new Error(err);
				});
			}
		} else {
			if (!pass) {
				log.write("MISSING INFO: provide either secret key for "+username+
					",\nor passphrase, from which keys are derived.");
				return;
			}
		}

		var pklUser: PKLUserShowingPrivates = <any>
			new pkl.ServiceUser(username, {
				login: 'login/pub-key/',
				logout: ''
			});
		var loc = location.href;
		if (loc.indexOf('?') >= 0) {
			loc = loc.substring(0, loc.lastIndexOf('?'));
		}
		if (loc.indexOf('#') >= 0) {
			loc = loc.substring(0, loc.lastIndexOf('#'));
		}
		pklUser.serviceURI = loc;

		log.write("Making an initial request, providing a username, and waiting"+
			" for reply with a challenge. Server's challenge is NaCl's box "+
			"envelope without (!) message authenticating code. MAC is send to "+
			"client only with server's final OK. MAC tells client that server "+
			"does have its public key. The delay in MAC's transmission protects "+
			"from a start of an offline attack on password-generated keys.");
		
		pklUser.startSession()
		.fail((err) => {
			if (err.status === 474) {
				log.write("Given user name is not known to the server.");
			}
			throw err;
		})
		.then(() => {
			log.write("New session id==='"+pklUser.sessionId+"' has been opened. "+
				"Received challenge contains random session key, encrypted with "+
				"shared (in Diffie-Hellman sense) key.");
			if (!promiseOfSecretKey) {
				promiseOfSecretKey = keyGen.deriveKeyFromPass(
					pass, pklUser.keyDerivationParams);
			}
			return promiseOfSecretKey
			.then((secretkey) => {
				pklUser.openSessionKey((serverPubKey) => {
					return nacl.box.calc_dhshared_key(serverPubKey, secretkey);
				});
			});
		})
		.then(() => {
			log.write("Session key has been extracted from the challenge and "+
				"encrypted with itself, to be send back to server, to confirm "+
				"that this client has secret key, which corresponds to public "+
				"key on server's file.");
			return pklUser.completeLoginExchange();
		})
		.fail((err) => {
			if ((<pkl.PKLoginError> err).serverNotTrusted) {
				log.write("ERROR: Server verification bytes are not accepted. "+
					"This indicates that server cannot be trusted, as it does "+
					"not possess proper key, and OK response on challenge "+
					"decryption was fake.");
				throw new Error("Server is faking knowledge of user's public key.");
			} else if (err.status === 403) {
				log.write("Server is not accepting confirmation of "+
					"decrypting ability.");
			}
			throw err;
			return null; // else ts complains
		})
		.then(() => {
			// cleanup 
			form.reset();
			// log 
			log.write("Server has accepted confirmation. Server's reply with "+
				"an original challenge's MAC is verified and server is deemed "+
				"trusted. Session is authorized now. As a side effect of this, "+
				"both sides have common session key. This whole login exchange "+
				"must happen within tls-protected connection. Session key, though,"+
				" may be used for a paranoid level of encryption of further "+
				"hyper-sensitive exchanges.");
		})
		.then(() => {
			log.write("Requesting account info inside this authenticated "+
				"session, displaying use of extra encryption with session key."+
				" This means receiving pure binary data, which is possible in"+
				" version 2 of XMLHTTPRequest. We'll have no more insane passing"+
				" of binary as ascii text!");
			var deferred = Q.defer<Uint8Array>();
			var url = "/mailerid-users/get-user-info";
			var req = xhr.makeBodylessRequest('GET', url, () => {
				if (req.status == 200) {
					deferred.resolve(new Uint8Array(req.response));
				} else {
					xhr.reject(deferred, req);
				}
			}, deferred, pklUser.sessionId);
			req.responseType = "arraybuffer";
			req.send();
			return deferred.promise;
		})
		.then((encResp) => {
			var info = pklUser.encryptor.openJSON(encResp);
			log.write("User info on file is "+JSON.stringify(info, null, ' '));
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
