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
 * This defines functions that implement ASMail reception protocol.
 */

import xhrUtils = require('../xhr-utils');
import Q = require('q');
import api = require('../../lib-common/service-api/asmail/retrieval');
import baseServiceUser = require('../user-with-mid-session');
import serviceLocator = require('../service-locator');

export class MailRecipient extends baseServiceUser.ServiceUser {
	
	constructor(user: string) {
		super(user, {
			login: api.midLogin.MID_URL_PART,
			logout: api.closeSession.URL_END,
			canBeRedirected: true
		});
		Object.seal(this);
	}

	setRetrievalUrl(serviceUrl: string): Q.Promise<void> {
		var promise = serviceLocator.asmailInfoAt(serviceUrl)
		.then((info) => {
			this.serviceURI = info.retrieval;
		});
		return promise;
	}
	
	private rejectOnNot200(deferred: Q.Deferred<any>,
			xhr: XMLHttpRequest): boolean {
		if (xhr.status != 200) {
			if (xhr.status == api.ERR_SC.needAuth) {
				this.sessionId = null;
			}
			xhrUtils.reject(deferred, xhr);
			return true;
		}
		return false;
	}
	
	listMsgs(): Q.Promise<api.listMsgs.Reply> {
		var url = this.serviceURI + api.listMsgs.URL_END;
		var deferred = Q.defer<api.listMsgs.Reply>();
		var xhr = xhrUtils.makeBodylessRequest('GET', url, () => {
			if (this.rejectOnNot200(deferred, xhr)) { return; }
			var reply = <api.listMsgs.Reply> xhr.response;
			if (!Array.isArray(reply)) {
				xhrUtils.reject(deferred, 200,
					"Response is malformed, it is not an array.");
				return;
			}
			deferred.resolve(reply);
		}, deferred, this.sessionId);
		xhr.responseType = "json";
		xhr.send();
		return deferred.promise;
	}

	getMsgMeta(msgId: string): Q.Promise<api.msgMetadata.Reply> {
		var url = this.serviceURI + api.msgMetadata.genUrlEnd(msgId);
		var deferred = Q.defer<api.msgMetadata.Reply>();
		var xhr = xhrUtils.makeBodylessRequest('GET', url, () => {
			if (this.rejectOnNot200(deferred, xhr)) { return; }
			var reply = <api.msgMetadata.Reply> xhr.response;
			if (!reply || ('object' !== typeof reply)) {
				xhrUtils.reject(deferred, 200,
					"Response is malformed, it is not an object.");
				return;
			}
			deferred.resolve(xhr.response);
		}, deferred, this.sessionId);
		xhr.responseType = "json";
		xhr.send();
		return deferred.promise;
	}

	private getBytes(url: string): Q.Promise<Uint8Array> {
		var deferred = Q.defer<Uint8Array>();
		var xhr = xhrUtils.makeBodylessRequest('GET', url, () => {
			if (this.rejectOnNot200(deferred, xhr)) { return; }
			var reply = <ArrayBuffer> xhr.response;
			if (!reply || ('object' !== typeof reply)) {
				xhrUtils.reject(deferred, 200,
					"Response is malformed, it is not an object.");
				return;
			}
			try {
				deferred.resolve(new Uint8Array(reply));
			} catch (e) {
				xhrUtils.reject(deferred, 200,
					"Response is malformed, it is not an arraybuffer.");
			}
		}, deferred, this.sessionId);
		xhr.responseType = "arraybuffer";
		xhr.send();
		return deferred.promise;
	}
	
	getObjHead(msgId: string, objId: string, opts?: api.BlobQueryOpts):
			Q.Promise<Uint8Array> {
		var url = this.serviceURI +
			api.msgObjHeader.genUrlEnd(msgId, objId, opts);
		return this.getBytes(url);
	}

	getObjSegs(msgId: string, objId: string, opts?: api.BlobQueryOpts):
			Q.Promise<Uint8Array> {
		var url = this.serviceURI +
			api.msgObjSegs.genUrlEnd(msgId, objId, opts);
		var deferred = Q.defer<Uint8Array>();
		var xhr = xhrUtils.makeBodylessRequest('GET', url, () => {
			if (this.rejectOnNot200(deferred, xhr)) { return; }
			var reply = <ArrayBuffer> xhr.response;
			if (!reply || ('object' !== typeof reply)) {
				xhrUtils.reject(deferred, 200,
					"Response is malformed, it is not an object.");
				return;
			}
			deferred.resolve(new Uint8Array(reply));
		}, deferred, this.sessionId);
		xhr.responseType = "arraybuffer";
		xhr.send();
		return deferred.promise;
	}

	removeMsg(msgId: string): Q.Promise<void> {
		var url = this.serviceURI + api.rmMsg.genUrlEnd(msgId);
		var deferred = Q.defer<void>();
		var xhr = xhrUtils.makeBodylessRequest('DELETE', url, () => {
			if (this.rejectOnNot200(deferred, xhr)) { return; }
			deferred.resolve();
		}, deferred, this.sessionId);
		xhr.responseType = "arraybuffer";
		xhr.send();
		return deferred.promise;
	}
	
}
Object.freeze(MailRecipient);
Object.freeze(MailRecipient.prototype);

Object.freeze(exports);