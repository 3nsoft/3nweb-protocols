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
 * This contains functions for asmail account setup.
 */

import Q = require('q');
import xhrUtils = require('../../../lib-client/xhr-utils');
import log = require('../../../lib-client/page-logging');
import routers = require('../../../lib-client/simple-router');
import midWithLogging = require('../../../lib-client/mid-proc-with-logging');
import midUser = require('../../../lib-client/user-with-mid-session');

// These declared variables should be initialized in window by index script
declare var pageRouter: routers.Router;
declare var userData: { account: Account; };

export class Account extends midUser.ServiceUser {
	
	params: any = null;
	
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
	
	/**
	 * @return promise resolvable to account info as json, if account exists,
	 * or null, if it does not.
	 */
	getAccountInfo(): Q.Promise<any> {
		var deferred = Q.defer();
		var url = './get-account-info';
		var xhr = xhrUtils.makeBodylessRequest('GET', url, () => {
			if (xhr.status == 200) {
				if (xhr.response) {
					this.params = xhr.response;
					deferred.resolve(this.params);
				} else {
					xhrUtils.reject(deferred, 200, "Resource "+url+" is malformed.");
				}
			} else if (xhr.status == 474) {
				deferred.resolve();
			} else {
				xhrUtils.reject(deferred, xhr);
			}
		}, deferred, this.sessionId);
		xhr.responseType = "json";
		xhr.send();
		return deferred.promise;
	}

	/**
	 * @return a promise, resolvable, when new account has been created for email,
	 * associated with a given session id, or if account for this email already
	 * exists.
	 */
	makeAccount(): Q.Promise<void> {
		var deferred = Q.defer<void>();
		var url = './make-account';
		var xhr = xhrUtils.makeBodylessRequest('POST', url, () => {
			if (xhr.status == 201) {
				deferred.resolve();
			} else {
				xhrUtils.reject(deferred, xhr);
			}
		}, deferred, this.sessionId);
		xhr.send();
		return deferred.promise;
	}

	postUpdatedInfoRequest(info: any): Q.Promise<void> {
		var deferred = Q.defer<void>();
		var url = './update-account-info';
		var xhr = xhrUtils.makeJsonRequest('POST', url, () => {
			if (xhr.status == 200) {
				log.write("Account info is updated.");
				deferred.resolve();
			} else {
				xhrUtils.reject(deferred, xhr);
			}
		}, deferred, this.sessionId);
		xhr.responseType = "json";
		xhr.sendJSON(info);
		return deferred.promise;
	}
	
}

export function signinWithMailerId(form) {
	try{
		log.clear();
		var address: string = form.address.value;
		var acc = new Account(address);
		midWithLogging.provisionAssertionSigner(form)
		.then((assertSigner) => {
			form.reset();
			return midWithLogging.startAndAuthSession(acc, assertSigner);
		})
		.then(() => {
			userData.account = acc;
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

export function openAccount(): void {
	userData.account.getAccountInfo()
	.then((accountInfo) => {
		if (accountInfo) { return accountInfo; }
		return userData.account.makeAccount()
		.then(() => {
			return userData.account.getAccountInfo();
		});
	})
	.then((accountInfo) => {
		pageRouter.openView('settings');
	})
	.fail((err) => {
		log.write("ERROR: "+err.message);
		console.error('Error in file '+err.fileName+' at '+err.lineNumber+': '+
				err.message);
	})
	.done();
}

export function logout(): void {
	if (!userData.account) { return; }
	var sid = userData.account.sessionId;
	userData.account.logout()
	.then(() => {
		console.info("Session '"+sid+"' is closed on the server side.");
		userData.account = null;
		// open signin thingy
		pageRouter.openView('signin');
	})
	.done();
}

export function updateInfo(form): void {
	alert("Not implemented");
	// TODO place things into currentAccount
	
}
