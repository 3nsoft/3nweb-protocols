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
 * This file contains common functions used by parts of a keyring.
 */

import nacl = require('ecma-nacl');
import base64 = require('../../../lib-common/base64');
import utf8 = require('../../../lib-common/utf8');
import jwk = require('../../../lib-common/jwkeys');
import random = require('../../random');

export var KID_LENGTH = 16;
export var PID_LENGTH = 4;

export interface JWKeyPair {
	skey: jwk.JsonKey;
	pkey: jwk.JsonKey;
	createdAt?: number;
	retiredAt?: number;
}

export interface ASMailKeyPair {
	pid?: string;
	senderPKey?: jwk.JsonKey;
	recipientKid?: string;
}

export interface KeyPairInfo {
	role: string;
	pair: JWKeyPair;
	replacedAt?: number;
}

export var KEY_USE = {
		PUBLIC: 'asmail-pub-key',
		SECRET: 'asmail-sec-key',
		SYMMETRIC: 'asmail-sym-key'
};
Object.freeze(KEY_USE);

export var KEY_ROLE = {
		SUGGESTED: 'suggested',
		IN_USE: 'in_use',
		OLD: 'old',
		PUBLISHED_INTRO: 'published_intro',
		PREVIOUSLY_PUBLISHED_INTRO: 'prev_published_intro',
		INTRODUCTORY: 'introductory'
};
Object.freeze(KEY_ROLE);

/**
 * @return an object with two fields: skey & pkey, holding JWK form of secret and
 * public keys respectively.
 * These are to be used with NaCl's box (Curve+XSalsa+Poly encryption).
 * Key ids are the same in this intimate pair.
 */
export function generateKeyPair(): JWKeyPair {
	var skeyBytes = random.bytes(nacl.box.KEY_LENGTH);
	var pkeyBytes = nacl.box.generate_pubkey(skeyBytes);
	var kid = random.stringOfB64Chars(KID_LENGTH);
	var alg = nacl.box.JWK_ALG_NAME;
	var skey: jwk.JsonKey = {
		use: KEY_USE.SECRET, alg: alg, kid: kid,
		k: base64.pack(skeyBytes),
	};
	var pkey: jwk.JsonKey = {
		use: KEY_USE.PUBLIC, alg: alg, kid: kid,
		k: base64.pack(pkeyBytes)
	};
	return { skey: skey, pkey: pkey };
};

/**
 * We have this function for future use by a keyring, that takes symmetric key.
 * This keyring, is specifically tailored to handle short-lived public keys.
 * Therefore, this function is not used at the moment.
 * @return a JWK form of a key for NaCl's secret box (XSalsa+Poly encryption).
 */
export function generateSymmetricKey(): jwk.JsonKey {
	return {
		use: KEY_USE.SYMMETRIC,
		k: base64.pack(random.bytes(nacl.secret_box.KEY_LENGTH)),
		alg: nacl.secret_box.JWK_ALG_NAME,
		kid: random.stringOfB64Chars(KID_LENGTH)
	};
};

function getKeyBytesFrom(key: jwk.JsonKey, use: string, alg: string, klen: number):
		Uint8Array {
	if (key.use === use) {
		if (key.alg === alg) {
			var bytes = base64.open(key.k);
			if (bytes.length !== klen) { throw new Error(
					"Key "+key.kid+" has a wrong number of bytes"); }
			return bytes;
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

/**
 * This extracts bytes from a given secret key's JWK form
 * @param key is a JWK form of a key
 * @return Uint8Array with key's bytes.
 */
export function extractSKeyBytes(key: jwk.JsonKey): Uint8Array {
	return getKeyBytesFrom(key, KEY_USE.SECRET,
			nacl.box.JWK_ALG_NAME, nacl.box.KEY_LENGTH);
}

/**
 * This extracts bytes from a given public key's JWK form
 * @param key is a JWK form of a key
 * @return Uint8Array with key's bytes.
 */
export function extractPKeyBytes(key: jwk.JsonKey): Uint8Array {
	return getKeyBytesFrom(key, KEY_USE.PUBLIC,
			nacl.box.JWK_ALG_NAME, nacl.box.KEY_LENGTH);
}

/**
 * This extracts bytes from a given public key's short JWK form
 * @param key is a short JWK form of a key
 * @return Uint8Array with key's bytes.
 */
export function extractKeyBytes(key: jwk.JsonKeyShort): Uint8Array {
	var bytes = base64.open(key.k);
	if (bytes.length !== nacl.box.KEY_LENGTH) { throw new Error(
		"Key "+key.kid+" has a wrong number of bytes"); }
	return bytes;
}

///**
// * This puts named fields from a given data into a given object.
// * @param obj
// * @param fieldNames
// * @param data
// */
//export function loadFieldsFromData(
//		obj: any, fieldNames: string[], data: any): void {
//	fieldNames.forEach((fieldName) => {
//		if ('undefined' === typeof data[fieldName]) { throw new Error(
//				"Given data is missing field '"+fieldName+"'"); }
//		obj[fieldName] = data[fieldName];
//	});
//}
//
///**
// * @param obj
// * @param fieldNames
// * @returns an object ready for serialization, with named fields, taken from
// * a given object.
// */
//export function collectFieldsForSerialization(
//		obj: any, fieldNames: string[]): any {
//	var data = {};
//	fieldNames.forEach((fieldName) => {
//		if ('undefined' === typeof obj[fieldName]) { throw new Error(
//				"Given object is missing field '"+fieldName+"'"); }
//		data[fieldName] = obj[fieldName];
//	});
//	return data;
//}

Object.freeze(exports);