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
 * This is for shared things between main and other-thread parts of a worker.
 */

import base64 = require('../../lib-common/base64');
import utf8 = require('../../lib-common/utf8');

export interface ScryptGenParamsInJson {
	logN: number;
	r: number;
	p: number;
	salt: string;
}

export interface ScryptGenParams {
	logN: number;
	r: number;
	p: number;
	pass: Uint8Array;
	salt: Uint8Array;
}

export function paramsFromJson(passStr: string,
		paramsInJson: ScryptGenParamsInJson): ScryptGenParams {
	var salt: Uint8Array;
	var pass: Uint8Array;
	try {
		if (('number' !== typeof paramsInJson.logN) ||
			(paramsInJson.logN < 10)) { throw "Bad parameter logN."; }
		if (('number' !== typeof paramsInJson.r) ||
			(paramsInJson.r < 1)) { throw "Bad parameter r."; }
		if (('number' !== typeof paramsInJson.p) ||
			(paramsInJson.p < 1)) { throw "Bad parameter p."; }
		salt = base64.open(paramsInJson.salt);
		pass = utf8.pack(passStr);
	} catch (e) {
		if ('string' === typeof e) {
			throw new Error(e);
		} else {
			throw new Error("Bad parameter:\n"+e.message);
		}
	}
	return {
		logN: paramsInJson.logN,
		r: paramsInJson.r,
		p: paramsInJson.p,
		pass: pass,
		salt: salt
	};
}

export interface JsonMsgPart {
	pass: ArrayBuffer;
	salt: ArrayBuffer;
	logN: number;
	r: number;
	p: number;
}

export function paramsToWorkMsg(params: ScryptGenParams):
		{ json: JsonMsgPart; buffers: ArrayBuffer[]; } {
	return {
		json: {
			pass: params.pass.buffer,
			salt: params.salt.buffer,
			logN: params.logN,
			r: params.r,
			p: params.p
		},
		buffers: [ params.pass.buffer, params.salt.buffer ]
	};
}

export function workMsgToParams(msgData: JsonMsgPart) {
	return {
		logN: msgData.logN,
		r: msgData.r,
		p: msgData.p,
		pass: new Uint8Array(msgData.pass),
		salt: new Uint8Array(msgData.salt)
	};
}

Object.freeze(exports);