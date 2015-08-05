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
 * This module defines json form of keys and signed objects.
 */
var base64 = require('./base64');
var utf8 = require('./utf8');
function isLikeJsonKey(jkey) {
    return (('object' === typeof jkey) && !!jkey &&
        ('string' === typeof jkey.alg) && !!jkey.alg &&
        ('string' === typeof jkey.kid) && !!jkey.kid &&
        ('string' === typeof jkey.k) && !!jkey.k &&
        ('string' === typeof jkey.kid && !!jkey.kid));
}
exports.isLikeJsonKey = isLikeJsonKey;
function isLikeSignedLoad(load) {
    return (('object' === typeof load) && !!load &&
        ('string' === typeof load.alg) && !!load.alg &&
        ('string' === typeof load.kid) && !!load.kid &&
        ('string' === typeof load.sig) && !!load.sig &&
        ('string' === typeof load.load && !!load.load));
}
exports.isLikeSignedLoad = isLikeSignedLoad;
function isLikeKeyCert(cert) {
    return (('object' === typeof cert) && !!cert &&
        ('number' === typeof cert.expiresAt) &&
        ('number' === typeof cert.issuedAt) &&
        (cert.expiresAt > cert.issuedAt) &&
        ('string' === typeof cert.issuer) && !!cert.issuer &&
        ('object' === typeof cert.cert) && !!cert.cert &&
        ('object' === typeof cert.cert.principal) &&
        !!cert.cert.principal &&
        ('string' === typeof cert.cert.principal.address) &&
        !!cert.cert.principal.address &&
        isLikeJsonKey(cert.cert.publicKey));
}
exports.isLikeKeyCert = isLikeKeyCert;
function isLikeSignedKeyCert(load) {
    if (!isLikeSignedLoad(load)) {
        return false;
    }
    try {
        return isLikeKeyCert(JSON.parse(utf8.open(base64.open(load.load))));
    }
    catch (e) {
        return false;
    }
}
exports.isLikeSignedKeyCert = isLikeSignedKeyCert;
function keyFromJson(key, use, alg, klen) {
    if (key.use === use) {
        if (key.alg === alg) {
            var bytes = base64.open(key.k);
            if (bytes.length !== klen) {
                throw new Error("Key " + key.kid + " has a wrong number of bytes");
            }
            return {
                use: key.use,
                alg: key.alg,
                kid: key.kid,
                k: bytes
            };
        }
        else {
            throw new Error("Key " + key.kid +
                ", should be used with unsupported algorithm '" +
                key.alg + "'");
        }
    }
    else {
        throw new Error("Key " + key.kid + " has incorrect use '" + key.use +
            "', instead of '" + use + "'");
    }
}
exports.keyFromJson = keyFromJson;
function keyToJson(key) {
    return {
        use: key.use,
        alg: key.alg,
        kid: key.kid,
        k: base64.pack(key.k)
    };
}
exports.keyToJson = keyToJson;
function getKeyCert(signedCert) {
    return JSON.parse(utf8.open(base64.open(signedCert.load)));
}
exports.getKeyCert = getKeyCert;
function getPubKey(signedCert) {
    return getKeyCert(signedCert).cert.publicKey;
}
exports.getPubKey = getPubKey;
function getPrincipalAddress(signedCert) {
    return getKeyCert(signedCert).cert.principal.address;
}
exports.getPrincipalAddress = getPrincipalAddress;
Object.freeze(exports);
