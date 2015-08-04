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
 * This defines a base class for some service's client that logs in with
 * Public Key Login process and uses respectively authenticated session.
 */

import xhrUtils = require('./xhr-utils');
import Q = require('q');
import base64 = require('../lib-common/base64');
import nacl = require('ecma-nacl');
import jwk = require('../lib-common/jwkeys');
var Uri = require('jsuri');
import sessionEncr = require('../lib-common/session-encryptor');
import loginApi = require('../lib-common/service-api/pub-key-login');

var sbox = nacl.secret_box;
var PUB_KEY_LENGTH = nacl.box.KEY_LENGTH;

export interface ICalcDHSharedKey {
	(pkey: Uint8Array): Uint8Array;
}

export interface IPromDHSKeyCalc {
	(keyDerivParams: any): Q.Promise<ICalcDHSharedKey>;
}

export interface PKLoginError extends Error {
	serverNotTrusted: boolean;
}

export class ServiceUser {
	
	userId: string;
	sessionId: string = null;
	
	private uri: string;
	get serviceURI(): string {
		return this.uri;
	}
	set serviceURI(uriString: string) {
		var uriObj = new Uri(uriString);
		if (uriObj.protocol() !== 'https') {
			throw new Error("Url protocol must be https.");
		}
		if (!uriObj.host()) {
			throw new Error("Host name is missing.");
		}
		var p: string = uriObj.path();
		if (p[p.length-1] !== '/') {
			uriObj.setPath(p+'/');
		}
		this.uri = uriObj.toString();
	}
	
	private loginUrlPart: string;
	private logoutUrlEnd: string;
	private redirectedFrom: string = null;
	private canBeRedirected: boolean;

	encryptor: sessionEncr.SessionEncryptor = null;
	private encChallenge: Uint8Array = null;
	private serverPubKey: Uint8Array = null;
	private serverVerificationBytes: Uint8Array = null;
	private keyDerivationParams: any = null;
	
	constructor(userId: string, opts: {
			login: string; logout: string; canBeRedirected?: boolean; }) {
		this.userId = userId;
		this.loginUrlPart = opts.login;
		if ((this.loginUrlPart.length > 0) &&
				(this.loginUrlPart[this.loginUrlPart.length-1] !== '/')) {
			this.loginUrlPart += '/';
		}
		this.logoutUrlEnd = opts.logout;
		this.canBeRedirected = !!opts.canBeRedirected;
	}
	
	private startSession(): Q.Promise<void> {
		var deferred = Q.defer<any>()
		var url = this.serviceURI + this.loginUrlPart + loginApi.start.URL_END;
		var xhr = xhrUtils.makeJsonRequest('POST', url, () => {
			try {
				if (xhr.status == loginApi.start.SC.ok) {
					var r: loginApi.start.Reply = xhr.response;
					// set sessionid
					if (!r || ('string' !== typeof r.sessionId)) {
						throw "Resource "+url+" is malformed.";
					}
					this.sessionId = r.sessionId;
					// set server public key
					if ('string' !== typeof r.serverPubKey) {
						throw "Response from server is malformed, "+
							"as serverPubKey string is missing.";
					}
					try {
						this.serverPubKey = base64.open(r.serverPubKey);
						if (this.serverPubKey.length !== PUB_KEY_LENGTH) {
							throw "Server's key has a wrong size."; }
					} catch (err) {
						throw "Response from server is malformed: "+
							"bad serverPubKey string. Error: "+
							(('string' === typeof err)? err : err.message);
					}
					// get encrypted session key from json body
					if ('string' !== typeof r.sessionKey) {
						throw "Response from server is malformed, "+
							"as sessionKey string is missing.";
					}
					try {
						this.encChallenge = base64.open(r.sessionKey);
						if (this.encChallenge.length !==
								(sbox.NONCE_LENGTH + sbox.KEY_LENGTH)) {
							throw "Byte chunk with session key "+
								"has a wrong size.";
						}
					} catch (err) {
						throw "Response from server is malformed: "+
							"bad sessionKey string. Error: "+
							(('string' === typeof err)? err : err.message);
					}
					// get key derivation parameters
					if ('object' !== typeof r.keyDerivParams) {
						throw "Response from server is malformed, "+
							"as keyDerivParams string is missing.";
					}
					this.keyDerivationParams = r.keyDerivParams;
					// done
					deferred.resolve();
				} else if (this.canBeRedirected &&
						(xhr.status == loginApi.start.SC.redirect)) {
					var rd: loginApi.start.RedirectReply = xhr.response;
					if (!rd || ('string' !== typeof rd.redirect)) {
						throw "Resource "+url+" is malformed.";
					}
					// refuse second redirect
					if (this.redirectedFrom !== null) {
						throw "Redirected too many times. First redirect "+
							"was from "+this.redirectedFrom+" to "+
							this.serviceURI+". Second and forbidden "+
							"redirect is to "+rd.redirect;
					}
					// set params
					this.redirectedFrom = this.serviceURI;
					this.serviceURI = rd.redirect;
					// start redirect call
					deferred.resolve(this.startSession());
				} else {
					xhrUtils.reject(deferred, xhr);
				}
			} catch (errStr) {
				xhrUtils.reject(deferred, xhr.status, errStr);
			}
		}, deferred, this.sessionId);
		xhr.responseType = "json";
		xhr.sendJSON( <loginApi.start.Request> {
			userId: this.userId
		});
		return deferred.promise;
	}
	
	private openSessionKey(dhsharedKeyCalculator: ICalcDHSharedKey): void {
		// encrypted challenge has session key packaged into WN format, with
		// poly part cut out. Therefore, usual open method will not do as it
		// does poly check. We should recall that cipher is a stream with data
		// xor-ed into it. Encrypting zeros gives us stream bytes, which can
		// be xor-ed into the data part of challenge bytes to produce a key.
		var dhsharedKey = dhsharedKeyCalculator(this.serverPubKey);
		var nonce = new Uint8Array(this.encChallenge.subarray(0, sbox.NONCE_LENGTH));
		var sessionKey = new Uint8Array(this.encChallenge.subarray(sbox.NONCE_LENGTH));
		var zeros = new Uint8Array(sbox.KEY_LENGTH);
		var streamBytes = sbox.pack(zeros, nonce, dhsharedKey);
		streamBytes = streamBytes.subarray(streamBytes.length - sbox.KEY_LENGTH);
		for (var i=0; i<sbox.KEY_LENGTH; i+=1) {
			sessionKey[i] ^= streamBytes[i];
		}
		// since there was no poly, we are not sure, if we are talking to server
		// that knows our public key. Server shall give us these bytes, and we
		// should prepare ours for comparison.
		this.serverVerificationBytes = sbox.pack(sessionKey, nonce, dhsharedKey);
		this.serverVerificationBytes =
			this.serverVerificationBytes.subarray(0, sbox.POLY_LENGTH);
		nacl.nonce.advanceOddly(nonce);
		this.encryptor = sessionEncr.makeSessionEncryptor(sessionKey, nonce);
		// encrypt session key for completion of login exchange
		this.encChallenge = this.encryptor.pack(sessionKey);
		// cleanup arrays
		nacl.arrays.wipe(dhsharedKey, nonce, sessionKey);
	}
	
	private completeLoginExchange(): Q.Promise<void> {
		var deferred = Q.defer<void>();
		var url = this.serviceURI + this.loginUrlPart + loginApi.complete.URL_END;
		var xhr = xhrUtils.makeBinaryRequest('POST', url, () => {
			if (xhr.status == loginApi.complete.SC.ok) {
				var bytesToVerify = new Uint8Array(xhr.response);
				// compare bytes to check, if server is can be trusted
				if (nacl.compareVectors(
						bytesToVerify, this.serverVerificationBytes)) {
					deferred.resolve();
					this.serverVerificationBytes = null;
				} else {
					var err = <PKLoginError> (new Error(
							"Server verification failed."));
					err.serverNotTrusted = true;
					deferred.reject(err);
				}
			} else {
				if (xhr.status == loginApi.complete.SC.authFailed) {
					this.sessionId = null;
				}
				xhrUtils.reject(deferred, xhr);
			}
		}, deferred, this.sessionId);
		xhr.responseType = "arraybuffer";
		xhr.send(this.encChallenge);
		this.encChallenge = null;
		return deferred.promise;
	}
	
	/**
	 * @param genOfDHKeyCalcPromise is a function that takes key derivation
	 * parameters, and returns promise of DH key calculating function, which
	 * in its order takes server's public key as a single parameter.
	 * @return promise, resolvable when PKL process completes.
	 */
	login(genOfDHKeyCalcPromise: IPromDHSKeyCalc): Q.Promise<void> {
		var promise = this.startSession()
		.then(() => {
			return genOfDHKeyCalcPromise(this.keyDerivationParams);
		})
		.then((dhsharedKeyCalculator) => {
			return this.openSessionKey(dhsharedKeyCalculator);
		})
		.then(() => {
			return this.completeLoginExchange();
		});
		return promise;
	}
	
	/**
	 * This method closes current session.
	 * @return a promise for request completion.
	 */
	logout(): Q.Promise<void> {
		var url = this.serviceURI + this.logoutUrlEnd;
		var deferred = Q.defer<void>();
		var xhr = xhrUtils.makeBodylessRequest('POST', url, () => {
			if (xhr.status == 200) {
				deferred.resolve();
			} else {
				xhrUtils.reject(deferred, xhr);
			}
		}, deferred, this.sessionId);
		xhr.send();
		return deferred.promise
		.fin(() => {
			this.sessionId = null;
			this.encryptor.destroy();
			this.encryptor = null;
		});
	}
	
}

Object.freeze(exports);