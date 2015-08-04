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

/*
 * This module provides hex encoding of binary array into a string.
 */

var HEX_INT_TO_LETTER_DICTIONARY = "0123456789abcdef";
var HEX_LETTER_TO_INT_DICTIONARY = (function () {
	var map: { [l: string]: number; } = {}, ch;
	// This is proper alphabet
	for (var i=0; i<HEX_INT_TO_LETTER_DICTIONARY.length; i+=1) {
		ch = HEX_INT_TO_LETTER_DICTIONARY[i];
		map[ch] = i;
	}
	// This adds ability to read lower case letters
	var upperDict = HEX_INT_TO_LETTER_DICTIONARY.toUpperCase();
	for (var i=10; i<upperDict.length; i+=1) {
		ch = upperDict[i];
		map[ch] = i;
	}
	return map;
})();

export function pack(bytes: Uint8Array): string {
	var chars = new Array<string>(bytes.length*2);
	var b: number;
	for (var i=0; i<bytes.length; i+=1) {
		b = bytes[i];
		chars[2*i] = HEX_INT_TO_LETTER_DICTIONARY[b >>> 4];
		chars[2*i+1] = HEX_INT_TO_LETTER_DICTIONARY[b & 15];
	}
	return chars.join('');
}

export function open(str: string): Uint8Array {
	if ((str.length % 2) > 0) { throw new Error(
			"Given string has odd number of charaters, while " +
			"in hex representation every byte is represented by two letters."); }
	var bytes = new Uint8Array(str.length/2);
	var b: number;
	var ch: string;
	var n: number;
	for (var i=0; i<str.length; i+=2) {
		ch = str[i];
		n = HEX_LETTER_TO_INT_DICTIONARY[ch];
		if ('undefined' === typeof n) { throw new Error(
				"String contains, at position "+i+", character '"+ch+
				"', which is not present in hex representation alphabet."); }
		b = (n << 4);
		ch = str[i+1];
		n = HEX_LETTER_TO_INT_DICTIONARY[ch];
		if ('undefined' === typeof n) { throw new Error(
				"String contains, at position "+(i+1)+", character '"+ch+
				"', which is not present in hex representation alphabet."); }
		b = (b | n);
		bytes[i/2] = b;
	}
	return bytes;
}

Object.freeze(exports);
