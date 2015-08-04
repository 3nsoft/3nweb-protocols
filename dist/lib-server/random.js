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
var crypto = require('crypto');
var base64 = require('../lib-common/base64');
function bytes(numOfBytes) {
    return new Uint8Array(crypto.randomBytes(numOfBytes));
}
exports.bytes = bytes;
function stringOfB64UrlSafeChars(numOfChars) {
    var numOfbytes = 3 * (1 + Math.floor(numOfChars / 4));
    var byteArr = bytes(numOfbytes);
    return base64.urlSafe.pack(byteArr).substring(0, numOfChars);
}
exports.stringOfB64UrlSafeChars = stringOfB64UrlSafeChars;
function stringOfB64Chars(numOfChars) {
    var numOfbytes = 3 * (1 + Math.floor(numOfChars / 4));
    var buf = crypto.randomBytes(numOfbytes);
    return buf.toString('base64').substring(0, numOfChars);
}
exports.stringOfB64Chars = stringOfB64Chars;
Object.freeze(exports);
