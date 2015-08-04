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
import midSig = require('../../lib-common/mid-sigs-NaCl-Ed');
import api = require('../../lib-common/service-api/3nstorage/owner');
import baseServiceUser = require('../user-with-mid-session');
import serviceLocator = require('../service-locator');
import keyGenUtils = require('../workers/key-gen-common');
import byteSrcMod = require('../byte-source');

var DEFAULT_MAX_SENDING_CHUNK = 1024*1024;
var DEFAULT_MAX_GETTING_CHUNK = 2*1024*1024;

function makeTransactionParamsFor(obj: byteSrcMod.ObjBytesSource,
		newObj = false): api.TransactionParams {
	var hLen = obj.header.totalSize();
	if (hLen === null) {
		hLen = -1;
	}
	var sLen = obj.segments.totalSize();
	if (sLen === null) {
		sLen = -1;
	}
	var p: api.TransactionParams = {
		sizes: {
			header: hLen,
			segments: sLen
		}
	};
	if (newObj) {
		p.isNewObj = true;
	}
	return p;
}

export class StorageOwner extends baseServiceUser.ServiceUser {
	
	keyDerivParams: keyGenUtils.ScryptGenParamsInJson = null;
	maxChunkSize: number = null;
	
	constructor(user: string) {
		super(user, {
			login: api.midLogin.MID_URL_PART,
			logout: api.closeSession.URL_END,
			canBeRedirected: true
		});
		Object.seal(this);
	}

	setStorageUrl(serviceUrl: string): Q.Promise<void> {
		var promise = serviceLocator.storageInfoAt(serviceUrl)
		.then((info) => {
			this.serviceURI = info.owner;
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
	
	private setSessionParams(): Q.Promise<void> {
		var url = this.serviceURI + api.sessionParams.URL_END;
		var deferred = Q.defer<void>();
		var xhr = xhrUtils.makeBodylessRequest('GET', url, () => {
			if (this.rejectOnNot200(deferred, xhr)) { return; }
			var reply = <api.sessionParams.Reply> xhr.response;
			try {
				keyGenUtils.paramsFromJson('?', reply.keyDerivParams);
				if (('number' !== typeof reply.maxChunkSize) ||
						(reply.maxChunkSize < 1000)) {
					throw "Bad or missing maxChunkSize parameter.";
				}
				this.keyDerivParams = reply.keyDerivParams;
				this.maxChunkSize = reply.maxChunkSize;
				deferred.resolve();
			} catch (err) {
				if ('string' == typeof err) {
					xhrUtils.reject(deferred, xhr.status, err);
				} else {
					xhrUtils.reject(deferred, xhr.status, err.message);
				}
			}
		}, deferred, this.sessionId);
		xhr.responseType = "json";
		xhr.send();
		return deferred.promise;
	}
	
	/**
	 * This does MailerId login with a subsequent getting of session parameters
	 * from 
	 * @param assertionSigner
	 * @return a promise, resolvable, when mailerId login and getting parameters'
	 * successfully completes.
	 */
	login(midSigner: midSig.user.MailerIdSigner): Q.Promise<void> {
		if (this.sessionId) { throw new Error("Session is already opened."); } 
		var promise = super.login(midSigner)
		.then(() => {
			return this.setSessionParams();
		});
		return promise;
	}
	
	/**
	 * @param objId must be null for root object, and a string id for other ones
	 * @return a promise, resolvable to transaction id.
	 */
	private startTransaction(objId: string,
			transParams: api.TransactionParams): Q.Promise<string> {
		var url = this.serviceURI + ((objId === null) ?
				api.startRootTransaction.URL_END :
				api.startTransaction.getReqUrlEnd(objId));
		var deferred = Q.defer<string>();
		var xhr = xhrUtils.makeJsonRequest('POST', url, () => {
			if (this.rejectOnNot200(deferred, xhr)) { return; }
			var reply = <api.startTransaction.Reply> xhr.response;
			if ('string' !== typeof reply.transactionId) {
				xhrUtils.reject(deferred, xhr.status,
					"Bad or missing transactionId parameter.");
			} else {
				deferred.resolve(reply.transactionId);
			}
		}, deferred, this.sessionId);
		xhr.responseType = "json";
		xhr.sendJSON( <api.startTransaction.Request> transParams);
		return deferred.promise;
	}
	
	/**
	 * @param objId must be null for root object, and a string id for other ones
	 * @param transactionId
	 * @return a promise, resolvable to transaction id.
	 */
	private cancelTransaction(objId: string, transactionId: string):
			Q.Promise<void> {
		var url = this.serviceURI + ((objId === null) ?
				api.cancelRootTransaction.getReqUrlEnd(transactionId) :
				api.cancelTransaction.getReqUrlEnd(objId, transactionId));
		var deferred = Q.defer<void>();
		var xhr = xhrUtils.makeBodylessRequest('POST', url, () => {
			if (this.rejectOnNot200(deferred, xhr)) { return; }
			deferred.resolve();
		}, deferred, this.sessionId);
		xhr.send();
		return deferred.promise;
	}
	
	/**
	 * @param objId must be null for root object, and a string id for other ones
	 * @param transactionId
	 * @return a promise, resolvable to transaction id.
	 */
	private completeTransaction(objId: string, transactionId: string):
			Q.Promise<void> {
		var url = this.serviceURI + ((objId === null) ?
				api.finalizeRootTransaction.getReqUrlEnd(transactionId) :
				api.finalizeTransaction.getReqUrlEnd(objId, transactionId));
		var deferred = Q.defer<void>();
		var xhr = xhrUtils.makeBodylessRequest('POST', url, () => {
			if (this.rejectOnNot200(deferred, xhr)) { return; }
			deferred.resolve();
		}, deferred, this.sessionId);
		xhr.send();
		return deferred.promise;
	}
	
	private getBytes(url: string):
			Q.Promise<{ bytes: Uint8Array; ver: number; }> {
		var deferred = Q.defer<{ bytes: Uint8Array; ver: number; }>();
		var xhr = xhrUtils.makeBodylessRequest('GET', url, () => {
			if (this.rejectOnNot200(deferred, xhr)) { return; }
			try {
				var ver = parseInt(
					xhr.getResponseHeader(api.HTTP_HEADER.objVersion), 10);
				if (isNaN(ver)) {
					throw "Response is malformed, proper version missing.";
				}
				var reply = <ArrayBuffer> xhr.response;
				if (!reply || ('object' !== typeof reply)) {
					throw "Response is malformed, it is not an object.";
				}
				deferred.resolve({
					bytes: new Uint8Array(reply),
					ver: ver
				});
			} catch (e) {
				xhrUtils.reject(deferred, 200,
					('string' === typeof e) ? e : e.message);
			}
		}, deferred, this.sessionId);
		xhr.responseType = "arraybuffer";
		xhr.send();
		return deferred.promise;
	}
	
	private getAllBytesSequentially(objId: string, isHeader: boolean,
			sink: byteSrcMod.VersionedByteSink, ver: number = null, ofs = 0): Q.Promise<void> {
		var opts: api.GetBlobQueryOpts = {
			ofs: ofs,
			len: DEFAULT_MAX_GETTING_CHUNK
		};
		if ('number' === typeof ver) {
			opts.ver = ver;
		}
		var url = this.serviceURI;
		if (objId === null) {
			if (isHeader) {
				url += api.rootHeader.getReqUrlEnd(opts);
			} else {
				url += api.rootSegs.getReqUrlEnd(opts);
			}
		} else {
			if (isHeader) {
				url += api.objHeader.getReqUrlEnd(objId, opts);
			} else {
				url += api.objSegs.getReqUrlEnd(objId, opts);
			}
		}
		var promise = this.getBytes(url)
		.then((bytesAndVer) => {
			if (ver === null) {
				ver = bytesAndVer.ver;
				sink.setObjVersion(ver);
			} else if (ver !== bytesAndVer.ver) {
				throw new Error("Server sent bytes for object version "+
					bytesAndVer.ver+", while it has been asked for version "+ver);
			}
			if (bytesAndVer.bytes.length === 0) {
				sink.swallow(null);
				return;
			}
			sink.swallow(bytesAndVer.bytes);
			if (opts.len > bytesAndVer.bytes.length) {
				sink.swallow(null);
				return;
			}
			return this.getAllBytesSequentially(objId, isHeader, sink, ver, ofs);
		});
		return promise;
	}
	
	getObj(objId: string, ver: number = null): byteSrcMod.ObjBytesSource {
		var pipe = new byteSrcMod.SinkBackedObjSource();
		var headerSink: byteSrcMod.VersionedByteSink = {
			setObjVersion: pipe.sink.setObjVersion,
			swallow: pipe.sink.header.swallow,
			setTotalSize: pipe.sink.header.setTotalSize
		};
		var segmentsSink: byteSrcMod.VersionedByteSink = {
			setObjVersion: pipe.sink.setObjVersion,
			swallow: pipe.sink.segments.swallow,
			setTotalSize: pipe.sink.segments.setTotalSize
		};
		this.getAllBytesSequentially(objId, true, headerSink, ver)
		.then(() => {
			return this.getAllBytesSequentially(
				objId, false, segmentsSink, ver);
		})
		.done();
		return pipe.src;
	}
	
	getObjHeader(objId: string, ver: number = null):
			byteSrcMod.VersionedBytesSource {
		var pipe = new byteSrcMod.SinkBackedObjSource();
		var headerSink: byteSrcMod.VersionedByteSink = {
			setObjVersion: pipe.sink.setObjVersion,
			swallow: pipe.sink.header.swallow,
			setTotalSize: pipe.sink.header.setTotalSize
		};
		this.getAllBytesSequentially(objId, true, headerSink, ver)
		.done();
		return {
			getObjVersion: pipe.getObjVersion,
			read: pipe.src.header.read,
			totalSize: pipe.src.header.totalSize
		};
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
	
	private sendAllBytesNonAppending(objId: string, transactionId: string,
			isHeader: boolean, src: byteSrcMod.BytesSource, ofs = 0):
			Q.Promise<void> {
		var opts: api.PutBlobQueryOpts = {
			trans: transactionId,
			append: false,
			ofs: ofs
		};
		var url = this.serviceURI;
		if (objId === null) {
			if (isHeader) {
				url += api.rootHeader.putReqUrlEnd(opts);
			} else {
				url += api.rootSegs.putReqUrlEnd(opts);
			}
		} else {
			if (isHeader) {
				url += api.objHeader.putReqUrlEnd(objId, opts);
			} else {
				url += api.objSegs.putReqUrlEnd(objId, opts);
			}
		}
		var chunkLen = Math.min(this.maxChunkSize, DEFAULT_MAX_SENDING_CHUNK);
		var promise = src.read(chunkLen, chunkLen)
		.then((bytes) => {
			if (!bytes) { return; }
			return this.sendBytes(url, bytes)
			.then(() => {
				ofs += bytes.length;
				return this.sendAllBytesNonAppending(
					objId, transactionId, isHeader, src, ofs);
			});
		});
		return promise;
	}
	
	saveObj(objId: string, obj: byteSrcMod.ObjBytesSource, newObj?: boolean):
			Q.Promise<void> {
		var transactionId: string;
		var transParams = makeTransactionParamsFor(obj, newObj);
		if ((transParams.sizes.header < 0) || (transParams.sizes.segments < 0)) {
			throw new Error("Sending limitless file is not implemented, yet");
		}
		var promise = this.startTransaction(objId, transParams)
		.then((transId) => {
			transactionId = transId;
			return this.sendAllBytesNonAppending(
				objId, transactionId, true, obj.header);
		})
		.then(() => {
			return this.sendAllBytesNonAppending(
				objId, transactionId, false, obj.segments);
		})
		.fail((err) => {
			if (transactionId) {
				return this.cancelTransaction(objId, transactionId)
				.then(() => { throw err; }, () => { throw err; });
			}
			throw err;
		})
		.then(() => {
			this.completeTransaction(objId, transactionId);
		});
		return promise;
	}
	
}
Object.freeze(StorageOwner.prototype);
Object.freeze(StorageOwner);

Object.freeze(exports);