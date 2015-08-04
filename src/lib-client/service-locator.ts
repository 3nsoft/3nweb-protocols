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
import xhrUtils = require('./xhr-utils');
import jwk = require('../lib-common/jwkeys');
var Uri = require('jsuri');

function readJSONLocatedAt(url: string): Q.Promise<{ uri: string; json: any }> {
	var uri = new Uri(url);
	if (uri.protocol() !== 'https') {
		throw new Error("Url protocol must be https.");
	}
	url = uri.toString();
	var deferred = Q.defer<{ uri: string; json: any }>();
	var xhr = xhrUtils.makeBodylessRequest('GET', url, () => {
		if (xhr.status == 200) {
			if (xhr.response === null) {
				xhrUtils.reject(deferred, 200,
						"Response is malformed: it is not JSON.");
			} else {
				deferred.resolve({
					uri: uri,
					json: xhr.response
				});
			}
		} else {
			xhrUtils.reject(deferred, xhr);
		}
	}, deferred, this.sessionId);
	xhr.responseType = "json";
	xhr.send();
	return deferred.promise;
}

function transformRelToAbsUri(uri, path: string): string {
	var u = new Uri(uri.toString());
	u.path(path);
	return u.toString();
}

export interface ASMailRoutes {
	delivery?: string;
	retrieval?: string;
	config?: string;
}

/**
 * @param url
 * @return a promise, resolvable to ASMailRoutes object.
 */
export function asmailInfoAt(url: string): Q.Promise<ASMailRoutes> {
	return readJSONLocatedAt(url)
	.then((data) => {
		var json = data.json;
		var uri = data.uri;
		var transform = <ASMailRoutes> {};
		if ('string' === typeof json.delivery) {
			transform.delivery = transformRelToAbsUri(uri, json.delivery);
		}
		if ('string' === typeof json.retrieval) {
			transform.retrieval = transformRelToAbsUri(uri, json.retrieval);
		}
		if ('string' === typeof json.config) {
			transform.config = transformRelToAbsUri(uri, json.config);
		}
		Object.freeze(transform);
		return transform;
	});
}

export interface MailerIdServiceInfo {
	provisioning: string;
	currentCert: jwk.SignedLoad;
}

/**
 * @param url
 * @return a promise, resolvable to MailerIdRoutes object.
 */
export function mailerIdInfoAt(url: string): Q.Promise<MailerIdServiceInfo> {
	return readJSONLocatedAt(url)
	.then((data) => {
		var json = data.json;
		var uri = data.uri;
		var transform = <MailerIdServiceInfo> {};
		if ('string' === typeof json.provisioning) {
			transform.provisioning = transformRelToAbsUri(uri, json.provisioning);
		} else {
			throw new Error("File "+uri.toString()+" is malformed.");
		}
		if (('object' === typeof json["current-cert"]) &&
				jwk.isLikeSignedKeyCert(json["current-cert"])) {
			transform.currentCert = json["current-cert"];
		} else {
			throw new Error("File "+uri.toString()+" is malformed.");
		}
		Object.freeze(transform);
		return transform;
	});
}

export interface StorageRoutes {
	owner?: string;
	shared?: string;
	config?: string;
}

/**
 * @param url
 * @return a promise, resolvable to StorageRoutes object.
 */
export function storageInfoAt(url: string): Q.Promise<StorageRoutes> {
	return readJSONLocatedAt(url)
	.then((data) => {
		var json = data.json;
		var uri = data.uri;
		var transform = <StorageRoutes> {};
		if ('string' === typeof json.owner) {
			transform.owner = transformRelToAbsUri(uri, json.owner);
		}
		if ('string' === typeof json.shared) {
			transform.shared = transformRelToAbsUri(uri, json.shared);
		}
		if ('string' === typeof json.config) {
			transform.config = transformRelToAbsUri(uri, json.config);
		}
		return transform;
	});
}

Object.freeze(exports);