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

import base64 = require('../lib-common/base64');

// exposing to ts window.crypto
declare var crypto: any;

export function bytes(numOfBytes: number): Uint8Array {
	var arr = new Uint8Array(numOfBytes);
	crypto.getRandomValues(arr);
	return arr;
}

export function uint8(): number {
	return bytes(1)[0];
}

export function stringOfB64UrlSafeChars(numOfChars: number): string {
	var numOfbytes = 3*(1 + Math.floor(numOfChars/4));
	var byteArr = bytes(numOfbytes);
	return base64.urlSafe.pack(byteArr).substring(0, numOfChars);
}

export function stringOfB64Chars(numOfChars: number): string {
	var numOfbytes = 3*(1 + Math.floor(numOfChars/4));
	var byteArr = bytes(numOfbytes);
	return base64.pack(byteArr).substring(0, numOfChars);
}

Object.freeze(exports);