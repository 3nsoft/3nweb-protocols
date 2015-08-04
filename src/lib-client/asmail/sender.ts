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
 * This defines functions that implement ASMail delivery protocol.
 */

import xhrUtils = require('../xhr-utils');
import Q = require('q');
import api = require('../../lib-common/service-api/asmail/delivery');
import midSigs = require('../../lib-common/mid-sigs-NaCl-Ed');
var Uri = require('jsuri');
import serviceLocator = require('../service-locator');

var LIMIT_ON_MAX_CHUNK = 1024*1024;

export class MailSender {
	
	sender: string;
	recipient: string;
	invitation: string;
	sessionId: string = null;
	maxMsgLength = 0;
	redirectedFrom: string = null;
	recipientPubKeyCerts: api.initPubKey.Reply = null;
	msgId: string = null;
	maxChunkSize = LIMIT_ON_MAX_CHUNK;
	
	private uri: string = null;
	get deliveryURI(): string {
		return this.uri;
	}
	private get serviceDomain(): string {
		return (new Uri(this.uri)).host();
	}
	
	/**
	 * @param sender is a string with sender's mail address, or null, for anonymous
	 * sending (non-authenticated).
	 * @param recipient is a required string with recipient's mail address.
	 * @param invitation is an optional string token, used with either anonymous
	 * (non-authenticated) delivery, or in a more strict delivery control in
	 * authenticated setting.
	 */
	constructor(sender: string, recipient: string, invitation: string = null) {
		this.sender = sender;
		this.recipient = recipient;
		this.invitation = invitation;
		Object.seal(this);
	}

	setDeliveryUrl(serviceUrl: string): Q.Promise<void> {
		var promise = serviceLocator.asmailInfoAt(serviceUrl)
		.then((info) => {
			this.uri = info.delivery;
		});
		return promise;
	}
	
	private canRedirect(deferred: Q.Deferred<any>,
			xhr: xhrUtils.JSONHttpRequest): boolean {
		var reply: api.sessionStart.RedirectReply = xhr.response;
		if (("string" !== typeof reply.redirect) ||
				(reply.redirect.length === 0) ||
				((new Uri(reply.redirect)).protocol() !== 'https')) {
			xhrUtils.reject(deferred, api.sessionStart.SC.redirect,
					"Received illegal redirect: "+reply.redirect);
			return false;
		}
		// refuse second redirect
		if (this.redirectedFrom !== null) {
			xhrUtils.reject(deferred, api.sessionStart.SC.redirect,
					"Mail delivery has been redirected too many times. " +
					"First redirect was from "+this.redirectedFrom+" to "+
					this.deliveryURI+" Second and forbidden redirect is to "+
					reply.redirect);
			return false;
		}
		// set params
		this.redirectedFrom = this.deliveryURI;
		this.uri = reply.redirect;
		return true;
	}
	
	/**
	 * This performs a pre-flight, server will provide the same information,
	 * as in session start, except that non session shall be opened a session.
	 * @return a promise, resolvable to reply info object with maxMsgLength.
	 * These values are also set in the fields of this sender.
	 * Failed promise's propagated error object may have an error status field:
	 *  403 is for not allowing to leave mail,
	 *  474 indicates unknown recipient,
	 *  480 tells that recipient's mailbox full.
	 */
	performPreFlight(): Q.Promise<api.preFlight.Reply> {
		var url = this.deliveryURI + api.preFlight.URL_END;
		var deferred = Q.defer<
			api.preFlight.Reply|Q.Promise<api.preFlight.Reply>>();
		var xhr = xhrUtils.makeJsonRequest('POST', url, () => {
			// set parameters from OK reply
			if (xhr.status == api.preFlight.SC.ok) {
				var reply: api.preFlight.Reply = xhr.response;
				try {
					if ('number' !== typeof reply.maxMsgLength) {
						throw "missing number maxMsgLength";
					}
					if (reply.maxMsgLength < 500) {
						throw "maxMsgLength is too short";
					}
					this.maxMsgLength = reply.maxMsgLength;
					deferred.resolve(reply);
				} catch (errMsg) {
					xhrUtils.reject(deferred, api.preFlight.SC.ok,
						"Response is malformed: "+errMsg);
				}
			// set parameters from redirect reply
			} else if (xhr.status == api.preFlight.SC.redirect) {
				// redirect call or reject inside of a checking function
				if (this.canRedirect(deferred, xhr)) {
					deferred.resolve(this.performPreFlight());
				}
			// reject promise for other responses
			} else {
				xhrUtils.reject(deferred, xhr);
			}
		}, deferred, this.sessionId);
		xhr.responseType = "json";
		xhr.sendJSON( <api.preFlight.Request> {
			sender: this.sender,
			recipient: this.recipient,
			invitation: this.invitation
		});
		return <Q.Promise<api.preFlight.Reply>> deferred.promise;
	}
	
	/**
	 * This performs the very first, mandatory request to server, telling server
	 * who message is intended to, and whether this is an anonymous sender
	 * delivery.
	 * @return a promise, resolvable to reply info object with sessionId and
	 * maxMsgLength.
	 * These values are also set in the fields of this sender.
	 * Failed promise's propagated error object may have an error status field:
	 *  403 is for not allowing to leave mail,
	 *  474 indicates unknown recipient,
	 *  480 tells that recipient's mailbox full.
	 */
	startSession(): Q.Promise<api.sessionStart.Reply> {
		var url = this.deliveryURI + api.sessionStart.URL_END;
		var deferred = Q.defer<
			api.sessionStart.Reply|Q.Promise<api.sessionStart.Reply>>();
		var xhr = xhrUtils.makeJsonRequest('POST', url, () => {
			// set parameters from OK reply
			if (xhr.status == api.sessionStart.SC.ok) {
				var reply: api.sessionStart.Reply = xhr.response;
				try {
					if ('number' !== typeof reply.maxMsgLength) {
						throw "missing number maxMsgLength";
					}
					if (reply.maxMsgLength < 500) {
						throw "maxMsgLength is too short";
					}
					this.maxMsgLength = reply.maxMsgLength;
					if ('string' !== typeof reply.sessionId) {
						throw "missing sessionId string";
					}
					this.sessionId = reply.sessionId;
					deferred.resolve(reply);
				} catch (errMsg) {
					xhrUtils.reject(deferred, api.sessionStart.SC.ok,
						"Response is malformed: "+errMsg);
				}
			// set parameters from redirect reply
			} else if (xhr.status == api.sessionStart.SC.redirect) {
				// start redirect call
				if (this.canRedirect(deferred, xhr)) {
					deferred.resolve(this.startSession());
				}
			// reject promise for other responses
			} else {
				xhrUtils.reject(deferred, xhr);
			}
		}, deferred, this.sessionId);
		xhr.responseType = "json";
		xhr.sendJSON({
			sender: this.sender,
			recipient: this.recipient,
			invitation: this.invitation
		});
		return <Q.Promise<api.sessionStart.Reply>> deferred.promise;
	}

	/**
	 * This sends mailerId assertion for sender authorization.
	 * @param assertionSigner is a MailerId assertion signer
	 * @return a promise for request completion.
	 * Rejected promise passes an error object, conditionally containing
	 * status field.
	 */
	authorizeSender(assertionSigner: midSigs.user.MailerIdSigner):
			Q.Promise<void> {
		var assertion = assertionSigner.generateAssertionFor(
			this.serviceDomain, this.sessionId);
		var url = this.deliveryURI.toString() + api.authSender.URL_END;
		var deferred = Q.defer<void>();
		var xhr = xhrUtils.makeJsonRequest('POST', url, () => {
			if (xhr.status == api.authSender.SC.ok) {
				deferred.resolve();
			} else {
				this.sessionId = null;
				xhrUtils.reject(deferred, xhr);
			}
		}, deferred, this.sessionId);
		xhr.sendJSON( <api.authSender.Request> {
			assertion: assertion,
			userCert: assertionSigner.userCert,
			provCert: assertionSigner.providerCert
		});
		return deferred.promise;
	}

	/**
	 * This gets recipients initial public key to launch message exchange.
	 * @return a promise resolvable to certificates, received from server.
	 * Certificates are also set in the field of this sender.
	 * Rejected promise passes an error object, conditionally containing
	 * status field.
	 */
	getRecipientsInitPubKey(): Q.Promise<api.initPubKey.Reply> {
		var url = this.deliveryURI + api.initPubKey.URL_END;
		var deferred = Q.defer<api.initPubKey.Reply>();
		var xhr = xhrUtils.makeBodylessRequest('GET', url, () => {
			if (xhr.status == api.initPubKey.SC.ok) {
				this.recipientPubKeyCerts = xhr.response;
				deferred.resolve(this.recipientPubKeyCerts);
			} else {
				xhrUtils.reject(deferred, xhr);
			}
		}, deferred, this.sessionId);
		xhr.responseType = "json";
		xhr.send();
		return deferred.promise;
	}

	/**
	 * This method sends message metadata.
	 * @param md is a json-shaped message metadata, to be send to server
	 * @return a promise, resolvable on 201-OK response to json with msgId,
	 * and optional min and max limits on object chunks.
	 * These values are also set in the fields of this sender.
	 * Not-OK responses reject promises.
	 */
	sendMetadata(meta: api.msgMeta.Request): Q.Promise<api.msgMeta.Reply> {
		var url = this.deliveryURI + api.msgMeta.URL_END;
		var deferred = Q.defer<api.msgMeta.Reply>();
		var xhr = xhrUtils.makeJsonRequest('PUT', url, () => {
			if (xhr.status == api.msgMeta.SC.ok) {
				var reply: api.msgMeta.Reply = xhr.response;
				try {
					if (('string' !== typeof reply.msgId) ||
							(reply.msgId.length === 0)) {
						throw "msgId string is missing";
					}
					this.msgId = reply.msgId;
					if ('number' === typeof reply.maxChunkSize) {
						if (reply.maxChunkSize < 1024) {
							throw "maxChunkSize is too small";
						} else if (reply.maxChunkSize > LIMIT_ON_MAX_CHUNK) {
							this.maxChunkSize = LIMIT_ON_MAX_CHUNK;
						} else {
							this.maxChunkSize = reply.maxChunkSize;
						}
					}
					deferred.resolve(reply);
				} catch (errMsg) {
					xhrUtils.reject(deferred, api.msgMeta.SC.ok,
						"Response is malformed: "+errMsg);
				}
			} else {
				xhrUtils.reject(deferred, xhr);
			}
		}, deferred, this.sessionId);
		xhr.responseType = "json";
		xhr.sendJSON(meta);
		return deferred.promise;
	}
	
	private sendBytes(url: string, bytes: Uint8Array): Q.Promise<void> {
		var deferred = Q.defer<void>();
		var xhr = xhrUtils.makeBinaryRequest('PUT', url, () => {
			if (xhr.status == 201) {
				deferred.resolve();
			} else {
				xhrUtils.reject(deferred, xhr);
			}
		}, deferred, this.sessionId);
		xhr.send(bytes);
		return deferred.promise;
	}
	
	sendObjHeadChunk(objId: string, offset: number, chunk: Uint8Array,
			totalHeadLen?: number): Q.Promise<void> {
		var opts: api.BlobQueryOpts = {
			append: false,
			ofs: offset
		};
		if ('number' === typeof totalHeadLen) {
			opts.total = totalHeadLen;
		}
		var url = this.deliveryURI + api.msgObjHeader.genUrlEnd(objId, opts);
		return this.sendBytes(url, chunk);
	}
	
	sendObjSegsChunk(objId: string, offset: number, chunk: Uint8Array,
			totalSegsLen?: number): Q.Promise<void> {
		var opts: api.BlobQueryOpts = {
			append: false,
			ofs: offset
		};
		if ('number' === typeof totalSegsLen) {
			opts.total = totalSegsLen;
		}
		var url = this.deliveryURI + api.msgObjSegs.genUrlEnd(objId, opts);
		return this.sendBytes(url, chunk);
	}
	
	appendObjHead(objId: string, chunk: Uint8Array, isFirst?: boolean):
			Q.Promise<void> {
		var opts: api.BlobQueryOpts = {
			append: true
		};
		if (isFirst) {
			opts.total = -1;
		}
		var url = this.deliveryURI + api.msgObjHeader.genUrlEnd(objId, opts);
		return this.sendBytes(url, chunk);
	}
	
	appendObjSegs(objId: string, chunk: Uint8Array, isFirst?: boolean):
			Q.Promise<void> {
		var opts: api.BlobQueryOpts = {
			append: true
		};
		if (isFirst) {
			opts.total = -1;
		}
		var url = this.deliveryURI + api.msgObjSegs.genUrlEnd(objId, opts);
		return this.sendBytes(url, chunk);
	}

	/**
	 * @return a promise, resolvable when message delivery closing.
	 */
	completeDelivery(): Q.Promise<void> {
		var url = this.deliveryURI.toString() + api.completion.URL_END;
		var deferred = Q.defer<void>();
		var xhr = xhrUtils.makeBodylessRequest('POST', url, () => {
			if (xhr.status == 200) {
				this.sessionId = null;
				deferred.resolve();
			} else {
				xhrUtils.reject(deferred, xhr);
			}
		}, deferred, this.sessionId);
		xhr.send();
		return deferred.promise;
	}
	
}
Object.freeze(MailSender);
Object.freeze(MailSender.prototype);

Object.freeze(exports);