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
 * This is a test of utf8 encoding module
 */
import utf8 = require('../lib-common/utf8');
import nu = require('nodeunit');

function check(test: nu.Test, testStr: string): void {
	var bytes = utf8.pack(testStr);
	var resStr = utf8.open(bytes);
	test.equal(testStr, resStr, "Decoded string is the same as initial one");
	var buf = new Buffer(bytes);
	var nodeReadStr = buf.toString('utf8');
	test.equal(testStr, nodeReadStr, "String is not the same as node's");
}

export function testStrings(test: nu.Test) {
	check(test, "dsf;ijef щлоауцжадо 日本語");
	test.done();
}
