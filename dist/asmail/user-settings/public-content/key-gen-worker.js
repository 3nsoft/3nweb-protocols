(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
 * This sets up a scrypt key generating worker.
 */
/// <reference path="../../../typings/tsd.d.ts" />
importScripts('./scripts/ecma-nacl.js');
var keyGenWorker = require('../../../lib-client/workers/key-gen-worker');
keyGenWorker.setupWorker(10);

},{"../../../lib-client/workers/key-gen-worker":3}],2:[function(require,module,exports){
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
var base64 = require('../../lib-common/base64');
var utf8 = require('../../lib-common/utf8');
function paramsFromJson(passStr, paramsInJson) {
    var salt;
    var pass;
    try {
        if (('number' !== typeof paramsInJson.logN) || (paramsInJson.logN < 10)) {
            throw "Bad parameter logN.";
        }
        if (('number' !== typeof paramsInJson.r) || (paramsInJson.r < 1)) {
            throw "Bad parameter r.";
        }
        if (('number' !== typeof paramsInJson.p) || (paramsInJson.p < 1)) {
            throw "Bad parameter p.";
        }
        salt = base64.open(paramsInJson.salt);
        pass = utf8.pack(passStr);
    }
    catch (e) {
        if ('string' === typeof e) {
            throw new Error(e);
        }
        else {
            throw new Error("Bad parameter:\n" + e.message);
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
exports.paramsFromJson = paramsFromJson;
function paramsToWorkMsg(params) {
    return {
        json: {
            pass: params.pass.buffer,
            salt: params.salt.buffer,
            logN: params.logN,
            r: params.r,
            p: params.p
        },
        buffers: [params.pass.buffer, params.salt.buffer]
    };
}
exports.paramsToWorkMsg = paramsToWorkMsg;
function workMsgToParams(msgData) {
    return {
        logN: msgData.logN,
        r: msgData.r,
        p: msgData.p,
        pass: new Uint8Array(msgData.pass),
        salt: new Uint8Array(msgData.salt)
    };
}
exports.workMsgToParams = workMsgToParams;
Object.freeze(exports);

},{"../../lib-common/base64":4,"../../lib-common/utf8":5}],3:[function(require,module,exports){
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
var nacl = require('ecma-nacl');
var keyGenUtil = require('./key-gen-common');
function setupWorker(notifPerc) {
    if ((notifPerc < 1) || (notifPerc > 99)) {
        notifPerc = 1;
    }
    self.addEventListener('message', function (e) {
        var params = keyGenUtil.workMsgToParams(e.data);
        var count = 0;
        var progressCB = function (p) {
            if (count * notifPerc > p) {
                return;
            }
            self.postMessage({ progress: p });
            count += 1;
        };
        try {
            var key = nacl.scrypt(params.pass, params.salt, params.logN, params.r, params.p, 32, progressCB);
            self.postMessage({ key: key.buffer }, [key.buffer]);
        }
        catch (err) {
            self.postMessage({ error: err.message });
        }
    });
}
exports.setupWorker = setupWorker;
Object.freeze(exports);

},{"./key-gen-common":2,"ecma-nacl":"ecma-nacl"}],4:[function(require,module,exports){
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
function encodeBytesToBase64Universal(bytes, intToLetDict, pad) {
    var paddedSectionLength = (bytes.length % 3);
    var fullTriplesLength = (bytes.length - paddedSectionLength);
    var chars = new Array(4 * (fullTriplesLength / 3 + (paddedSectionLength === 0 ? 0 : 1)));
    var charIndex = 0;
    var n;
    var b1;
    var b2;
    var b3;
    for (var i = 0; i < fullTriplesLength; i += 3) {
        b1 = bytes[i];
        b2 = bytes[i + 1];
        b3 = bytes[i + 2];
        // 1st six bits
        n = (b1 >>> 2);
        chars[charIndex] = intToLetDict[n];
        charIndex += 1;
        // 2nd six bits
        n = ((b1 & 3) << 4) | (b2 >>> 4);
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
    if (paddedSectionLength === 1) {
        b1 = bytes[fullTriplesLength];
        // 1st six bits
        n = (b1 >>> 2);
        chars[charIndex] = intToLetDict[n];
        charIndex += 1;
        // last 2 bits, padded with zeros
        n = ((b1 & 3) << 4);
        chars[charIndex] = intToLetDict[n];
        chars[charIndex + 1] = pad;
        chars[charIndex + 2] = pad;
    }
    else if (paddedSectionLength === 2) {
        b1 = bytes[fullTriplesLength];
        b2 = bytes[fullTriplesLength + 1];
        // 1st six bits
        n = (b1 >>> 2);
        chars[charIndex] = intToLetDict[n];
        charIndex += 1;
        // 2nd six bits
        n = ((b1 & 3) << 4) | (b2 >>> 4);
        chars[charIndex] = intToLetDict[n];
        charIndex += 1;
        // last 4 bits, padded with zeros
        n = ((b2 & 15) << 2);
        chars[charIndex] = intToLetDict[n];
        chars[charIndex + 1] = pad;
    }
    return chars.join('');
}
function getNumberFrom(letToIntDict, ch) {
    var n = letToIntDict[ch];
    if ('undefined' === typeof n) {
        throw new Error("String contains character '" + ch + "', which is not present in base64 representation alphabet.");
    }
    return n;
}
function decodeUniversalBase64String(str, letToIntDict, pad) {
    if ((str.length % 4) > 0) {
        throw new Error("Given string's length is not multiple of four, while " + "base64 representation with mandatory padding expects such length.");
    }
    if (str.length === 0) {
        return new Uint8Array(0);
    }
    var numOfBytesInPaddedSection = 0;
    if (str[str.length - 2] === pad) {
        numOfBytesInPaddedSection = 1;
    }
    else if (str[str.length - 1] === pad) {
        numOfBytesInPaddedSection = 2;
    }
    var bytes = new Uint8Array((str.length / 4 - 1) * 3 + (numOfBytesInPaddedSection === 0 ? 3 : numOfBytesInPaddedSection));
    var strLenOfCompleteGroups = (str.length - (numOfBytesInPaddedSection === 0 ? 0 : 4));
    var byteIndex = 0;
    var b;
    var n;
    for (var i = 0; i < strLenOfCompleteGroups; i += 4) {
        // 1st octet
        n = getNumberFrom(letToIntDict, str[i]);
        b = n << 2;
        n = getNumberFrom(letToIntDict, str[i + 1]);
        b |= (n >>> 4);
        bytes[byteIndex] = b;
        byteIndex += 1;
        // 2nd octet
        b = (n & 15) << 4;
        n = getNumberFrom(letToIntDict, str[i + 2]);
        b |= (n >>> 2);
        bytes[byteIndex] = b;
        byteIndex += 1;
        // 3rd octet
        b = (n & 3) << 6;
        n = getNumberFrom(letToIntDict, str[i + 3]);
        b |= n;
        bytes[byteIndex] = b;
        byteIndex += 1;
    }
    if (numOfBytesInPaddedSection === 1) {
        // 1st octet only
        n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups]);
        b = n << 2;
        n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups + 1]);
        b |= (n >>> 4);
        bytes[byteIndex] = b;
    }
    else if (numOfBytesInPaddedSection === 2) {
        // 1st octet
        n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups]);
        b = n << 2;
        n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups + 1]);
        b |= (n >>> 4);
        bytes[byteIndex] = b;
        // 2nd octet
        b = (n & 15) << 4;
        n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups + 2]);
        b |= (n >>> 2);
        bytes[byteIndex + 1] = b;
    }
    return bytes;
}
function makeLetToIntDict(intToLetDict) {
    var dict = {}, l;
    for (var i = 0; i < intToLetDict.length; i += 1) {
        l = intToLetDict[i];
        dict[l] = i;
    }
    return dict;
}
// This is a standard base64 alphabet, and corresponding functions
var BASE64_INT_TO_LETTER_DICTIONARY = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var BASE64_LETTER_TO_INT_DICTIONARY = makeLetToIntDict(BASE64_INT_TO_LETTER_DICTIONARY);
var BASE64_PAD = '=';
function pack(bytes) {
    return encodeBytesToBase64Universal(bytes, BASE64_INT_TO_LETTER_DICTIONARY, BASE64_PAD);
}
exports.pack = pack;
function open(str) {
    return decodeUniversalBase64String(str, BASE64_LETTER_TO_INT_DICTIONARY, BASE64_PAD);
}
exports.open = open;
//This is a URL/filesystem safe base64 alphabet, and corresponding functions
var URL_SAFE_BASE64_INT_TO_LETTER_DICTIONARY = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
var URL_SAFE_BASE64_LETTER_TO_INT_DICTIONARY = makeLetToIntDict(URL_SAFE_BASE64_INT_TO_LETTER_DICTIONARY);
var urlSafe;
(function (urlSafe) {
    function open(str) {
        return decodeUniversalBase64String(str, URL_SAFE_BASE64_LETTER_TO_INT_DICTIONARY, BASE64_PAD);
    }
    urlSafe.open = open;
    function pack(bytes) {
        return encodeBytesToBase64Universal(bytes, URL_SAFE_BASE64_INT_TO_LETTER_DICTIONARY, BASE64_PAD);
    }
    urlSafe.pack = pack;
})(urlSafe = exports.urlSafe || (exports.urlSafe = {}));
Object.freeze(urlSafe);
Object.freeze(exports);

},{}],5:[function(require,module,exports){
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
 * This module provides an object with functions that encode strings to bytes, and decode strings from bytes.
 * Bytes, array of octets, are generated in Uint8Array form, and assume the same form for decoding.
 * Only utf8 is implemented, so far.
 * If someone needs to implement another unicode encoding, they may do so.
 * If someone needs non-unicode, they should be stopped from this historic madness, by re-evaluating their
 * app's requirements, and re-thinking overall system design.
 */
/**
 * Following utf8 encoding table, found in https://en.wikipedia.org/wiki/UTF-8 with RFC3629 restricting
 * code point values to no more than 0x10FFFF.
 *
 * Below we shall use some numerical constants, which we display here for readable reference.
 * Note that placing them in variables shall add lookup penalty, as this is dynamic javascript.
 * 7   === parseInt('111',2)
 * 15  === parseInt('1111',2)
 * 31  === parseInt('11111',2)
 * 63  === parseInt('111111',2)
 * 128 === parseInt('10000000',2)
 * 192 === parseInt('11000000',2)
 * 224 === parseInt('11100000',2)
 * 240 === parseInt('11110000',2)
 * 248 === parseInt('11111000',2)
 */
function unicodePointToUtf8Bytes(ucp) {
    var bytes;
    if (ucp <= 0x7F) {
        // 1 byte of the form 0xxxxxxx
        bytes = new Uint8Array(1);
        bytes[0] = ucp;
    }
    else if (ucp <= 0x7FF) {
        // 2 bytes, the first one is 110xxxxx, and the last one is 10xxxxxx
        bytes = new Uint8Array(2);
        bytes[1] = 128 | (ucp & 63);
        ucp >>>= 6;
        bytes[0] = 192 | ucp;
    }
    else if (ucp <= 0xFFFF) {
        // 3 bytes, the first one is 1110xxxx, and last 2 are 10xxxxxx
        bytes = new Uint8Array(3);
        for (var i = 2; i > 0; i -= 1) {
            bytes[i] = 128 | (ucp & 63);
            ucp >>>= 6;
        }
        bytes[0] = 224 | ucp;
    }
    else if (ucp <= 0x10FFFF) {
        // 4 bytes, the first one is 11110xxx, and last 3 are 10xxxxxx
        bytes = new Uint8Array(4);
        for (var i = 3; i > 0; i -= 1) {
            bytes[i] = 128 | (ucp & 63);
            ucp >>>= 6;
        }
        bytes[0] = 240 | ucp;
    }
    else {
        throw new Error("Unicode char point is greater than 0x7FFFFFFF, which cannot be encoded into utf8.");
    }
    return bytes;
}
function pack(str) {
    var byteCounter = 0, charVocabulary = {}, ch, charBytes;
    for (var i = 0; i < str.length; i += 1) {
        ch = str[i];
        charBytes = charVocabulary[ch];
        if ('undefined' === typeof charBytes) {
            charBytes = unicodePointToUtf8Bytes(ch.charCodeAt(0));
            charVocabulary[ch] = charBytes;
        }
        byteCounter += charBytes.length;
    }
    var allBytes = new Uint8Array(byteCounter);
    byteCounter = 0;
    for (var i = 0; i < str.length; i += 1) {
        ch = str[i];
        charBytes = charVocabulary[ch];
        allBytes.set(charBytes, byteCounter);
        byteCounter += charBytes.length;
    }
    return allBytes;
}
exports.pack = pack;
function addSecondaryBytesIntoCodePoint(codePoint, utf8Bytes, pos, numOfSecBytes) {
    "use strict";
    var b;
    for (var i = 0; i < numOfSecBytes; i += 1) {
        b = utf8Bytes[pos + i];
        if ('undefined' === typeof b) {
            throw new Error("Encountered end of byte array in the middle of multi-byte " + "code point, at position " + (pos + 1));
        }
        if ((b & 192) !== 128) {
            throw new Error("Encountered at position " + (pos + i) + " byte " + b.toString(2) + ", which should be a secondary utf8 byte like 10xxxxxx, but isn't.");
        }
        codePoint <<= 6;
        codePoint += (b & 63);
    }
    return codePoint;
}
function open(utf8Bytes) {
    var byteCounter = 0, charCount = 0, charArr = new Array(utf8Bytes.length), b, ch, codePoint;
    while (byteCounter < utf8Bytes.length) {
        b = utf8Bytes[byteCounter];
        if ((b & 128) === 0) {
            // 1 byte of the form 0xxxxxxx
            codePoint = b;
            byteCounter += 1;
        }
        else if ((b & 224) === 192) {
            // 2 bytes, the first one is 110xxxxx, and the last one is 10xxxxxx
            codePoint = (b & 31);
            codePoint = addSecondaryBytesIntoCodePoint(codePoint, utf8Bytes, byteCounter + 1, 1);
            byteCounter += 2;
        }
        else if ((b & 240) === 224) {
            // 3 bytes, the first one is 1110xxxx, and last 2 are 10xxxxxx
            codePoint = (b & 15);
            codePoint = addSecondaryBytesIntoCodePoint(codePoint, utf8Bytes, byteCounter + 1, 2);
            byteCounter += 3;
        }
        else if ((b & 248) === 240) {
            // 4 bytes, the first one is 11110xxx, and last 3 are 10xxxxxx
            codePoint = (b & 7);
            codePoint = addSecondaryBytesIntoCodePoint(codePoint, utf8Bytes, byteCounter + 1, 3);
            byteCounter += 4;
        }
        else {
            throw new Error("Encountered at position " + byteCounter + " byte " + b.toString(2) + ", which should not be present in a utf8 encoded block.");
        }
        ch = String.fromCharCode(codePoint);
        charArr[charCount] = ch;
        charCount += 1;
    }
    return charArr.join('');
}
exports.open = open;
Object.freeze(exports);

},{}]},{},[1]);
