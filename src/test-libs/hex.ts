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
import hex = require('../lib-common/hex');
import nu = require('nodeunit');

function randomArr(size: number): Uint8Array {
	var testBytes = new Uint8Array(size);
	for (var i=0; i<testBytes.length; i+=1) {
		testBytes[i] = Math.floor(256*Math.random());
	}
	return testBytes;
}

function testHexEncOn(test: nu.Test, testBytes: Uint8Array) {
	var encStr = hex.pack(testBytes);
	var decodedBytes = hex.open(encStr);
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
 * Testing hex encoder
 */
export function base64Standard(test: nu.Test) {
	testHexEncOn(test, new Uint8Array(0));
	testHexEncOn(test, randomArr(1));
	testHexEncOn(test, randomArr(2));
	testHexEncOn(test, randomArr(999));
	testHexEncOn(test, randomArr(1000));
	test.done();
}
