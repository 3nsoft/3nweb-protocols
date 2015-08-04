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
 * This is a test of base64 binary-to-string encoding module
 */
import base64 = require('../lib-common/base64');
import nu = require('nodeunit');

function randomArr(size: number): Uint8Array {
	var testBytes = new Uint8Array(size);
	for (var i=0; i<testBytes.length; i+=1) {
		testBytes[i] = Math.floor(256*Math.random());
	}
	return testBytes;
}

function testB64On(test: nu.Test, testBytes: Uint8Array): void {
	var encStr = base64.pack(testBytes);
	var decodedBytes = base64.open(encStr);
	test.equal(testBytes.length, decodedBytes.length,
		"Lengths of arrays do not match.");
	for (var i=0; i<testBytes.length; i+=1) {
		if (testBytes[i] !== decodedBytes[i]) {
			test.equal(testBytes[i], decodedBytes[i],
				"at index "+i+" byte "+testBytes[i]+
				" got corrupted into "+decodedBytes[i]);
		}
	}
}

/**
 * Testing Base64 standard encoder
 */
export function base64Standard(test: nu.Test) {
	testB64On(test, new Uint8Array(0));
	testB64On(test, randomArr(1));
	testB64On(test, randomArr(2));
	testB64On(test, randomArr(3));
	testB64On(test, randomArr(998));
	testB64On(test, randomArr(999));
	testB64On(test, randomArr(1000));
	test.done();
}

function testUrlSafeB64On(test: nu.Test, testBytes: Uint8Array): void {
	var encStr = base64.urlSafe.pack(testBytes);
	var decodedBytes = base64.urlSafe.open(encStr);
	test.equal(testBytes.length, decodedBytes.length,
		"Lengths of arrays do not match.");
	for (var i=0; i<testBytes.length; i+=1) {
		if (testBytes[i] !== decodedBytes[i]) {
			test.equal(testBytes[i], decodedBytes[i],
				"at index "+i+" byte "+testBytes[i]+
				" got corrupted into "+decodedBytes[i]);
		}
	}
}

/**
 * Testing Base64 url-safe encoder
 */
export function base64UrlSafe(test: nu.Test) {
	testUrlSafeB64On(test, new Uint8Array(0));
	testUrlSafeB64On(test, randomArr(1));
	testUrlSafeB64On(test, randomArr(2));
	testUrlSafeB64On(test, randomArr(3));
	testUrlSafeB64On(test, randomArr(998));
	testUrlSafeB64On(test, randomArr(999));
	testUrlSafeB64On(test, randomArr(1000));
	test.done();
}
