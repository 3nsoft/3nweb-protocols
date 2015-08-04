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

import base64 = require('./base64');
import utf8 = require('./utf8');

export interface JsonKeyShort {
	k: string;
	kid: string;
}

export interface JsonKey extends JsonKeyShort {
	use: string;
	alg: string;
}

export function isLikeJsonKey(jkey: JsonKey): boolean {
	return (('object' === typeof jkey) && !!jkey &&
		('string' === typeof jkey.alg) && !!jkey.alg &&
		('string' === typeof jkey.kid) && !!jkey.kid &&
		('string' === typeof jkey.k) && !!jkey.k &&
		('string' === typeof jkey.kid && !!jkey.kid));
}

export interface Key {
	use: string;
	k: Uint8Array;
	alg: string;
	kid: string;
}

export interface SignedLoad {
	alg: string;
	kid: string;
	sig: string;
	load: string;
}

export function isLikeSignedLoad(load: SignedLoad): boolean {
	return (('object' === typeof load) && !!load &&
			('string' === typeof load.alg) && !!load.alg &&
			('string' === typeof load.kid) && !!load.kid &&
			('string' === typeof load.sig) && !!load.sig &&
			('string' === typeof load.load && !!load.load));
}

export interface KeyCert {
	cert: {
		publicKey: JsonKey;
		principal: { address: string };
	};
	issuer: string;
	issuedAt: number;
	expiresAt: number;
}

export function isLikeKeyCert(cert: KeyCert): boolean {
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

export function isLikeSignedKeyCert(load: SignedLoad): boolean {
	if (!isLikeSignedLoad(load)) { return false; }
	try {
		return isLikeKeyCert(JSON.parse(utf8.open(base64.open(load.load))));
	} catch (e) {
		return false;
	}
}

export function keyFromJson(key: JsonKey,
		use: string, alg: string, klen: number): Key {
	if (key.use === use) {
		if (key.alg === alg) {
			var bytes = base64.open(key.k);
			if (bytes.length !== klen) { throw new Error(
					"Key "+key.kid+" has a wrong number of bytes"); }
			return {
				use: key.use,
				alg: key.alg,
				kid: key.kid,
				k: bytes
			};
		} else {
			throw new Error("Key "+key.kid+
					", should be used with unsupported algorithm '"+
					key.alg+"'");
		}
	} else {
		throw new Error("Key "+key.kid+" has incorrect use '"+key.use+
				"', instead of '"+use+"'");
	}
}

export function keyToJson(key: Key): JsonKey {
	return {
		use: key.use,
		alg: key.alg,
		kid: key.kid,
		k: base64.pack(key.k)
	}
}

export function getKeyCert(signedCert: SignedLoad): KeyCert {
	return JSON.parse(utf8.open(base64.open(signedCert.load)));
}

export function getPubKey(signedCert: SignedLoad): JsonKey {
	return getKeyCert(signedCert).cert.publicKey;
}

export function getPrincipalAddress(signedCert: SignedLoad): string {
	return getKeyCert(signedCert).cert.principal.address;
}

Object.freeze(exports);