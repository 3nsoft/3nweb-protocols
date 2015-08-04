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

export var SESSION_ID_HEADER = "X-Session-Id";

export interface JSONHttpRequest extends XMLHttpRequest {
	sendJSON(json: any): void;
}

export interface IOnLoad {
	(ev: Event): any;
}

export interface IOnError {
	(ev: ErrorEvent): any;
}

function makeRequest(contentType: string, method: string, url: string,
		onLoad: IOnLoad, onError: IOnError|Q.Deferred<any>,
		sessionId?: string): XMLHttpRequest {
	var xhr = new XMLHttpRequest();
	xhr.open(method, url, true);
	xhr.onload = onLoad;
	if ('function' === typeof onError) {
		xhr.onerror = <IOnError> onError;
	} else {
		var deferred = <Q.Deferred<any>> onError;
		xhr.onerror = () => {
			deferred.reject(new Error("Cannot connect to "+url));
		}
	}
	if (contentType) {
		xhr.setRequestHeader('Content-Type', contentType);
	}
	if (sessionId) { xhr.setRequestHeader(SESSION_ID_HEADER, sessionId); }
	return xhr;
}

/**
 * This assembles XMLHttpRequest with 'Content-Type: application/json'.
 * Session id header is added, if string id is given.
 * @param method
 * @param url
 * @param onLoad
 * @param onError it can either be an actual error handling function,
 * or a deferred object that gets rejected in a default way.
 * @param sessionId
 * @return JSONHttpRequest object, which is a XMLHttpRequest with attached
 * sendJSON() method.
 */
export function makeJsonRequest(method: string, url: string,
		onLoad: IOnLoad, onError: IOnError|Q.Deferred<any>,
		sessionId?: string): JSONHttpRequest {
	var jhr = (<JSONHttpRequest> makeRequest('application/json',
		method, url, onLoad, onError, sessionId));
	jhr.sendJSON = (json: any) => { jhr.send(JSON.stringify(json)); };
	return jhr;
}

/**
 * This assembles XMLHttpRequest with 'Content-Type: application/octet-stream'.
 * Session id header is added, if string id is given.
 * @param method
 * @param url
 * @param onLoad
 * @param onError it can either be an actual error handling function,
 * or a deferred object that gets rejected in a default way.
 * @param sessionId
 * @returns XMLHttpRequest object, setup and ready for send(blob).
 */
export function makeBinaryRequest(method: string, url: string,
		onLoad: IOnLoad, onError: IOnError|Q.Deferred<any>,
		sessionId?: string): XMLHttpRequest {
	return makeRequest('application/octet-stream',
		method, url, onLoad, onError, sessionId);
}

/**
 * This assembles XMLHttpRequest with 'Content-Type: text/plain'.
 * Session id header is added, if string id is given.
 * @param method
 * @param url
 * @param onLoad
 * @param onError it can either be an actual error handling function,
 * or a deferred object that gets rejected in a default way.
 * @param sessionId
 * @returns XMLHttpRequest object, setup and ready for send(string).
 */
export function makeTextRequest(method: string, url: string,
		onLoad: IOnLoad, onError: IOnError|Q.Deferred<any>,
		sessionId?: string): XMLHttpRequest {
	return makeRequest('text/plain',
		method, url, onLoad, onError, sessionId);
}

/**
 * This assembles XMLHttpRequest without 'Content-Type'.
 * Session id header is added, if string id is given.
 * @param method
 * @param url
 * @param onLoad
 * @param onError it can either be an actual error handling function,
 * or a deferred object that gets rejected in a default way.
 * @param sessionId
 * @returns XMLHttpRequest object, setup and ready for send(string).
 */
export function makeBodylessRequest(method: string, url: string,
		onLoad: IOnLoad, onError: IOnError|Q.Deferred<any>,
		sessionId?: string): XMLHttpRequest {
	var xhr = makeRequest(null,
		method, url, onLoad, onError, sessionId);
	var initSend = xhr.send;
	xhr.send = (data?) => {
		if ('undefined' !== typeof data) { throw new Error(
			"There should be no data in a body-less request."); }
		initSend.call(xhr);
	};
	return xhr;
}

export interface HttpError extends Error {
	status: number;
	xhr?: XMLHttpRequest;
}

/**
 * This sets a reject in a given deferred to HttpError with a given message,
 * status field, and XMLHttpRequest, if it has been given.
 * @param deferred is deferred object that has its rejected state set by this
 * function.
 * @param xhr is XMLHttpRequest object of the original request, or numberic
 * status code. In the first case, status code is taken from it, as well as
 * error message. Error message is taken from json's error field, or, response
 * is taken, if return type is text.
 * Else, statusText is used as a message.
 * 
 */
export function reject(deferred: Q.Deferred<any>,
		statusOrXhr: XMLHttpRequest|number, errMsg?: string): void {
	var msg: string;
	var status: number;
	var xhr: XMLHttpRequest;
	if ("number" === typeof statusOrXhr) {
		msg = errMsg;
		status = <number> statusOrXhr;
	} else {
		xhr = <XMLHttpRequest> statusOrXhr;
		status = xhr.status;
		if ((xhr.responseType === '') || (xhr.responseType === 'text')) {
			msg = ((xhr.response !== null) ? xhr.response : xhr.statusText);
		} else if (xhr.responseType === 'json') {
			msg = (((xhr.response !== null) && xhr.response.error)?
				xhr.response.error : xhr.statusText);
		} else {
			msg = xhr.statusText;
		}
	}
	var err = (<HttpError> new Error(msg));
	err.status = status;
	err.xhr = xhr;
	deferred.reject(err);
}

Object.freeze(exports);