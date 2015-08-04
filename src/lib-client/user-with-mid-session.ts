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
 * MailerId and uses respectively authenticated session.
 */

import xhrUtils = require('./xhr-utils');
import midSig = require('../lib-common/mid-sigs-NaCl-Ed');
import Q = require('q');
var Uri = require('jsuri');
import loginApi = require('../lib-common/service-api/mailer-id/login');
import jwk = require('../lib-common/jwkeys');

export class ServiceUser {
	
	userId: string;
	sessionId: string = null;
	
	private uri: string = null;
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
	private get serviceDomain(): string {
		return (new Uri(this.uri)).host();
	}
	
	private loginUrlPart: string;
	private logoutUrlEnd: string;
	private redirectedFrom: string = null;
	private canBeRedirected: boolean;
	
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
		var deferred = Q.defer<any>();
		var url = this.serviceURI + this.loginUrlPart +
			loginApi.startSession.URL_END;
		var xhr = xhrUtils.makeJsonRequest('POST', url, () => {
			try {
				if (xhr.status == loginApi.startSession.SC.ok) {
					var r: loginApi.startSession.Reply = xhr.response;
					if (!r || ('string' !== typeof r.sessionId)) {
						throw "Resource "+url+" is malformed.";
					}
					this.sessionId = r.sessionId;
					deferred.resolve();
				} else if (this.canBeRedirected &&
						(xhr.status == loginApi.startSession.SC.redirect)) {
					var rd: loginApi.startSession.RedirectReply = xhr.response;
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
		}, deferred);
		xhr.responseType = "json";
		xhr.sendJSON( <loginApi.startSession.Request> {
			userId: this.userId
		})
		return <Q.Promise<void>> deferred.promise;
	}
	
	private authenticateSession(midSigner: midSig.user.MailerIdSigner):
			Q.Promise<void> {
		var deferred = Q.defer<void>();
		var url = this.serviceURI + this.loginUrlPart +
			loginApi.authSession.URL_END;
		var xhr = xhrUtils.makeJsonRequest('POST', url, () => {
			if (xhr.status == loginApi.authSession.SC.ok) {
				deferred.resolve();
			} else {
				if (xhr.status == loginApi.authSession.SC.authFailed) {
					this.sessionId = null;
				}
				xhrUtils.reject(deferred, xhr);
			}
		}, deferred, this.sessionId);
		xhr.sendJSON( <loginApi.authSession.Request> {
			assertion: midSigner.generateAssertionFor(
				this.serviceDomain, this.sessionId),
			userCert: midSigner.userCert,
			provCert: midSigner.providerCert
		});
		return deferred.promise;
	}

	/**
	 * This starts and authorizes a new session.
	 * @param assertionSigner
	 * @return a promise, resolvable, when mailerId login successfully
	 * completes.
	 */
	login(midSigner: midSig.user.MailerIdSigner): Q.Promise<void> {
		if (this.sessionId) { throw new Error("Session is already opened."); } 
		var promise = this.startSession()
		.then(() => {
			return this.authenticateSession(midSigner);
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
		});
	}
	
}

Object.freeze(exports);