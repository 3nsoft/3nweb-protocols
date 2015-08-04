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

import util = require('./common');
import nacl = require('ecma-nacl');
import jwk = require('../../../lib-common/jwkeys');
import midSigs = require('../../../lib-common/mid-sigs-NaCl-Ed');
import msgMod = require('../msg');
import delivApi = require('../../../lib-common/service-api/asmail/delivery');
import confApi = require('../../../lib-common/service-api/asmail/config');
import Q = require('q');
import ringMod = require('./ring');

export interface KeyRing {
	
	/**
	 * This sets storage and initializes with data, loaded from it.
	 */
	init(storage: Storage): Q.Promise<void>;
	
	/**
	 * This saves key ring, if there are changes, that need to be saved.
	 */
	saveChanges(): void;
	
	/**
	 * This generates a new NaCl's box key pair, setting it as introductory
	 * published key with all respective certificates.
	 * @param signer to create certificates for a new key.
	 */
	updatePublishedKey(signer: midSigs.user.MailerIdSigner): void;
	
	/**
	 * @return published certificates for an introductory key,
	 * or undefined, if the key was not set.
	 */
	getPublishedKeyCerts(): confApi.p.initPubKey.Certs;
	
	/**
	 * @param address
	 * @return true, if a lookup on mail server for introductory key is needed
	 * when sending mail to a given address. 
	 * False is returned when such lookup is not required, which is a case,
	 * either when mutual key pairs have already been established, or when there
	 * is no introductory key, which came not from mail server, i.e. other
	 * trusted channel, like physical business card exchange.
	 */
	isKnownCorrespondent(address: string): boolean;
	
	/**
	 * @param address of a correspondent
	 * @param pkey is a JWK form of correspondents public key, which to be set
	 * as correspondent's introductory key, that comes not from mail server,
	 * but from other trusted channel.
	 * @param invite is an optional invitation token, which should be used to
	 * send messages to given correspondent.
	 */
	setCorrepondentTrustedIntroKey(address: string,
			pkey: jwk.JsonKey, invite?: string): void;
	
	/**
	 * @param address
	 * @param invitation is an optional invitation token, that should be used
	 * by correspondent with the new suggested pair, i.e. in future replies.
	 * @param introPKeyFromServer is an optional recipient's key from a mail
	 * server. If it is required (check this.shouldLookForIntroKeyOf()), but
	 * is not given, an exception will be thrown.
	 * @return an object with following fields:
	 * (a) encryptor - with encryptor, which should be used to pack message's
	 *                 main part's key;
	 * (b) pairs - contains sendable form for both, current  and suggested pairs.
	 */
	generateKeysForSendingTo(address: string, invitation?: string,
		introPKeyFromServer?: jwk.JsonKey): {
			encryptor: nacl.secret_box.Encryptor;
			pairs: {
				current: util.ASMailKeyPair;
				next: msgMod.SuggestedNextKeyPair
			};
		};
	
	absorbSuggestedNextKeyPair(correspondent: string,
		suggPair: msgMod.SuggestedNextKeyPair, timestamp: number): void;
	
	getInviteForSendingTo(correspondent: string): string;
	
	/**
	 * @param pair
	 * @return an array of DecryptorWithInfo's.
	 * Undefined is returned when pair's id is not known. 
	 */
	getDecryptorFor(pair: delivApi.msgMeta.CryptoInfo): DecryptorWithInfo[];
	
}

export interface DecryptorWithInfo {
	correspondent?: string;
	decryptor: nacl.secret_box.Decryptor;
	cryptoStatus: string;
}

export interface Storage {
	load(): Q.Promise<string>;
	save(serialForm: string): Q.Promise<void>;
}

/**
 * @return an wrap around newly created key ring object.
 */
export function makeKeyRing(): KeyRing {
	return (new ringMod.Ring()).wrap();
}

export var KEY_USE = util.KEY_USE;
export var KEY_ROLE = util.KEY_ROLE;

Object.freeze(exports);