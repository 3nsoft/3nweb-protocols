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
 * This module provides an object with functions that encode array of octets
 * (binary data) into base64 strings.
 * Bytes, array of octets, are assumed to be in Uint8Array form, and the same
 * is produced in decoding.
 * 
 * Base64 implemented here uses alphabet, described in
 * https://tools.ietf.org/html/rfc4648 (RFC 4648),
 * i.e. last to chars are '+' and '/', with '=' used for padding, in a
 * strict correspondence of steps, described in RFC document.
 * Base64 encoder will not tolerate neither non-alphabet characters, nor
 * missing padding characters, if these are required, as per quoted RFC
 * document.
 * 
 * There is an urlSafe object with url safe version of base64.
 */

/**
 * We shall use some numerical constants, which we display here for readable
 * reference.
 * Note that placing them in variables shall add lookup penalty, as this is
 * dynamic javascript.
 * 3   === parseInt('11',2)
 * 15  === parseInt('1111',2)
 * 63  === parseInt('111111',2)
*/

function encodeBytesToBase64Universal(bytes: Uint8Array, intToLetDict: string,
		pad: string): string {
	var paddedSectionLength = (bytes.length % 3);
	var fullTriplesLength = (bytes.length - paddedSectionLength);
	var chars = new Array<string>(4*(fullTriplesLength/3 +
					(paddedSectionLength===0 ? 0 : 1)))
	var charIndex = 0;
	var n: number;
	var b1: number;
	var b2: number;
	var b3: number;
	for (var i=0; i<fullTriplesLength; i+=3) {
		b1 = bytes[i];
		b2 = bytes[i+1];
		b3 = bytes[i+2];
		// 1st six bits
		n = (b1 >>> 2);
		chars[charIndex] = intToLetDict[n];
		charIndex += 1;
		// 2nd six bits
		n = ((b1 & 3) << 4)  | (b2 >>> 4);
		chars[charIndex] = intToLetDict[n];
		charIndex += 1;
		// 3rd six bits
		n = ((b2 & 15) << 2) | (b3 >>> 6);
		chars[charIndex] = intToLetDict[n];
		charIndex += 1;
		// 4th six bits
		n = (b3 & 63);
		chars[charIndex] = intToLetDict[n];
		charIndex += 1;
	}
	if (paddedSectionLength === 1) {	// there are 8 bits to encode
		b1 = bytes[fullTriplesLength];
		// 1st six bits
		n = (b1 >>> 2);
		chars[charIndex] = intToLetDict[n];
		charIndex += 1;
		// last 2 bits, padded with zeros
		n = ((b1 & 3) << 4);
		chars[charIndex] = intToLetDict[n];
		chars[charIndex+1] = pad;
		chars[charIndex+2] = pad;
	} else if (paddedSectionLength === 2) {	// there are 16 bits to encode
		b1 = bytes[fullTriplesLength];
		b2 = bytes[fullTriplesLength+1];
		// 1st six bits
		n = (b1 >>> 2);
		chars[charIndex] = intToLetDict[n];
		charIndex += 1;
		// 2nd six bits
		n = ((b1 & 3) << 4)  | (b2 >>> 4);
		chars[charIndex] = intToLetDict[n];
		charIndex += 1;
		// last 4 bits, padded with zeros
		n = ((b2 & 15) << 2);
		chars[charIndex] = intToLetDict[n];
		chars[charIndex+1] = pad;
	}
	return chars.join('');
}

function getNumberFrom(letToIntDict: { [l: string]: number; },
		ch: string): number {
	var n = letToIntDict[ch];
	if ('undefined' === typeof n) { throw new Error(
			"String contains character '"+ch+
			"', which is not present in base64 representation alphabet."); }
	return n;
}

function decodeUniversalBase64String(str: string,
		letToIntDict: { [l: string]: number; }, pad: string): Uint8Array {
	if ((str.length % 4) > 0) { throw new Error(
			"Given string's length is not multiple of four, while " +
			"base64 representation with mandatory padding expects such length."); }
	if (str.length === 0) { return new Uint8Array(0); }
	var numOfBytesInPaddedSection = 0;
	if (str[str.length-2] === pad) {
		numOfBytesInPaddedSection = 1;
	} else if (str[str.length-1] === pad) {
		numOfBytesInPaddedSection = 2;
	}
	var bytes = new Uint8Array((str.length/4-1)*3 +
			(numOfBytesInPaddedSection===0 ? 3 : numOfBytesInPaddedSection));
	var strLenOfCompleteGroups = (str.length -
			(numOfBytesInPaddedSection===0 ? 0 : 4));
	var byteIndex = 0;
	var b: number;
	var n: number;
	for (var i=0; i<strLenOfCompleteGroups; i+=4) {
		// 1st octet
		n = getNumberFrom(letToIntDict, str[i]);
		b = n << 2;
		n = getNumberFrom(letToIntDict, str[i+1]);
		b |= (n >>> 4);
		bytes[byteIndex] = b;
		byteIndex += 1;
		// 2nd octet
		b = (n & 15) << 4;
		n = getNumberFrom(letToIntDict, str[i+2]);
		b |= (n >>> 2);
		bytes[byteIndex] = b;
		byteIndex += 1;
		// 3rd octet
		b = (n & 3) << 6;
		n = getNumberFrom(letToIntDict, str[i+3]);
		b |= n;
		bytes[byteIndex] = b;
		byteIndex += 1;
	}
	if (numOfBytesInPaddedSection === 1) {
		// 1st octet only
		n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups]);
		b = n << 2;
		n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups+1]);
		b |= (n >>> 4);
		bytes[byteIndex] = b;
	} else if (numOfBytesInPaddedSection === 2) {
		// 1st octet
		n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups]);
		b = n << 2;
		n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups+1]);
		b |= (n >>> 4);
		bytes[byteIndex] = b;
		// 2nd octet
		b = (n & 15) << 4;
		n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups+2]);
		b |= (n >>> 2);
		bytes[byteIndex+1] = b;
	}
	return bytes;
}

function makeLetToIntDict(intToLetDict: string): { [l: string]: number; } {
	var dict: { [l: string]: number; } = {}
	, l;
	for(var i=0; i<intToLetDict.length; i+=1){
		l = intToLetDict[i];
		dict[l] = i;
	}
	return dict;
}

// This is a standard base64 alphabet, and corresponding functions
var BASE64_INT_TO_LETTER_DICTIONARY =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var BASE64_LETTER_TO_INT_DICTIONARY =
	makeLetToIntDict(BASE64_INT_TO_LETTER_DICTIONARY);
var BASE64_PAD = '=';

export function pack(bytes: Uint8Array): string {
	return encodeBytesToBase64Universal(bytes,
			BASE64_INT_TO_LETTER_DICTIONARY, BASE64_PAD);
}

export function open(str: string): Uint8Array {
	return decodeUniversalBase64String(str,
			BASE64_LETTER_TO_INT_DICTIONARY, BASE64_PAD);
}

//This is a URL/filesystem safe base64 alphabet, and corresponding functions
var URL_SAFE_BASE64_INT_TO_LETTER_DICTIONARY =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
var URL_SAFE_BASE64_LETTER_TO_INT_DICTIONARY =
	makeLetToIntDict(URL_SAFE_BASE64_INT_TO_LETTER_DICTIONARY);

export module urlSafe {
	
	export function open(str: string): Uint8Array {
		return decodeUniversalBase64String(str,
				URL_SAFE_BASE64_LETTER_TO_INT_DICTIONARY, BASE64_PAD);
	}
	
	export function pack(bytes: Uint8Array): string {
		return encodeBytesToBase64Universal(bytes,
				URL_SAFE_BASE64_INT_TO_LETTER_DICTIONARY, BASE64_PAD);
	}
}
Object.freeze(urlSafe);

Object.freeze(exports);
