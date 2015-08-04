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
 * This defines functions that implement ASMail configuration protocol.
 */

import xhrUtils = require('../xhr-utils');
import api = require('../../lib-common/service-api/asmail/config');
import Q = require('q');
import baseServiceUser = require('../user-with-mid-session');
import serviceLocator = require('../service-locator');

export class MailConfigurator extends baseServiceUser.ServiceUser {
	
	paramsOnServer: {
		[name: string]: any;
	};
	
	constructor(userId: string) {
		super(userId, {
			login: api.midLogin.MID_URL_PART,
			logout: api.closeSession.URL_END,
			canBeRedirected: true });
		this.paramsOnServer = {};
		Object.seal(this);
	}

	setConfigUrl(serviceUrl: string): Q.Promise<void> {
		var promise = serviceLocator.asmailInfoAt(serviceUrl)
		.then((info) => {
			this.serviceURI = info.config;
		});
		return promise;
	}

	private getParam(url: string): Q.Promise<any> {
		var deferred = Q.defer<any>();
		var xhr = xhrUtils.makeBodylessRequest('GET', url, () => {
			if (xhr.status == 200) {
				deferred.resolve(xhr.response);
			} else {
				xhrUtils.reject(deferred, xhr);
			}
		}, deferred, this.sessionId);
		xhr.responseType = "json";
		xhr.send();
		return deferred.promise;
	}
	
	private setParam(url: string, param: any): Q.Promise<void> {
		var deferred = Q.defer<void>();
		var xhr = xhrUtils.makeJsonRequest(
			'PUT', url, () => {
			if (xhr.status == 200) {
				deferred.resolve();
			} else {
				xhrUtils.reject(deferred, xhr);
			}
		}, deferred, this.sessionId);
		xhr.sendJSON(param);
		return deferred.promise;
	}
	
	getInitPubKey(): Q.Promise<api.p.initPubKey.Certs> {
		return this.getParam(this.serviceURI + api.p.initPubKey.URL_END);
	}
	
	setInitPubKey(certs: api.p.initPubKey.Certs): Q.Promise<void> {
		return this.setParam(
			this.serviceURI + api.p.initPubKey.URL_END, certs);
	}
	
	getAnonSenderInvites(): Q.Promise<api.p.anonSenderInvites.List> {
		return this.getParam(this.serviceURI + api.p.anonSenderInvites.URL_END);
	} 
	
	setAnonSenderInvites(list: api.p.anonSenderInvites.List): Q.Promise<void> {
		return this.setParam(
			this.serviceURI + api.p.anonSenderInvites.URL_END, list);
	} 
	
}
Object.freeze(MailConfigurator.prototype);
Object.freeze(MailConfigurator);

Object.freeze(exports);