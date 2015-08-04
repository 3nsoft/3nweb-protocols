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
 * This file defines a ring, which must be wrapped, when it is exposed
 * outside of keyring's reliance set.
 */

import introKeys = require('./intro-keys');
import corrKeysMod = require('./correspondent-keys');
import emailMap = require('./id-to-email-map');
import util = require('./common');
import nacl = require('ecma-nacl');
import jwk = require('../../../lib-common/jwkeys');
import midSigs = require('../../../lib-common/mid-sigs-NaCl-Ed');
import msgMod = require('../msg');
import delivApi = require('../../../lib-common/service-api/asmail/delivery');
import confApi = require('../../../lib-common/service-api/asmail/config');
import Q = require('q');
import indexMod = require('./index');
import random = require('../../random');

/**
 * This is a list of all serializable fields from Ring.
 */
var dataFields = [ 'corrKeys', 'introKeys' ];

function makeSendingEncryptor(senderPair: corrKeysMod.SendingPair):
		nacl.secret_box.Encryptor {
	var skey = util.extractSKeyBytes(senderPair.senderKey.skey);
	var pkey = util.extractKeyBytes(senderPair.recipientPKey);
	var nextNonce = random.bytes(nacl.box.NONCE_LENGTH);
	return nacl.box.formatWN.makeEncryptor(pkey, skey, nextNonce);
}
	
function makeReceivingDecryptor(pkeyJW: jwk.JsonKeyShort, skeyJW: jwk.JsonKey):
		nacl.secret_box.Decryptor {
	var skey = util.extractSKeyBytes(skeyJW);
	var pkey = util.extractKeyBytes(pkeyJW);
	return nacl.box.formatWN.makeDecryptor(pkey, skey);
}

function selectPid(pids: string[]): string {
	if (pids.length < 1) { throw new Error("There are no pair ids in array."); }
	var i = Math.round((pids.length-1) * random.uint8()/255);
	return pids[i];
}

interface RingJSON {
	corrKeys: string[];
	introKeys: string;
}

export class Ring implements indexMod.KeyRing {
	
	introKeys: introKeys.IntroKeysContainer = null;
	corrKeys:  { [correspondent: string]: corrKeysMod.CorrespondentKeys; } = {};
	introKeyIdToEmailMap: emailMap.IdToEmailMap =
		new emailMap.IdToEmailMap(this);
	pairIdToEmailMap: emailMap.IdToEmailMap =
		new emailMap.IdToEmailMap(this);
	private storage: indexMod.Storage = null;
	
	constructor() {
		Object.seal(this);
	}
	
	private addCorrespondent(address: string, serialForm: string = null):
			corrKeysMod.CorrespondentKeys {
		var ck = (serialForm ?
			new corrKeysMod.CorrespondentKeys(this, null, serialForm) :
			new corrKeysMod.CorrespondentKeys(this, address, null));
		if (this.corrKeys[ck.correspondent]) { throw new Error(
			"Correspondent with address "+ck.correspondent+
			" is already present."); }
		this.corrKeys[ck.correspondent] = ck;
		if (serialForm) {
			ck.mapAllKeysIntoRing();
		}
		return ck;
	}
	
	init(storage: indexMod.Storage): Q.Promise<void> {
		if (this.storage) { throw new Error(
			"Keyring has already been initialized."); }
		this.storage = storage;
		var promise = this.storage.load()
		.then((serialForm) => {
			if (serialForm) {
				var json: RingJSON = JSON.parse(serialForm);
				// TODO check json's fields
				
				// init data
				this.introKeys = new introKeys.IntroKeysContainer(
					this, json.introKeys);
				json.corrKeys.forEach((info) => {
					this.addCorrespondent(null, info);
				});
			} else {
				this.introKeys = new introKeys.IntroKeysContainer(this);
				// save initial file, as there was none initially
				this.saveChanges();
			}
		});
		return promise;
	}

	saveChanges(): Q.Promise<void> {
		// pack bytes that need to be encrypted and saved
		var dataToSave = <RingJSON> {
			introKeys: this.introKeys.serialForm(),
			corrKeys: []
		};
		for (var email in this.corrKeys) {
			dataToSave.corrKeys.push(this.corrKeys[email].serialForm());
		}
		// trigger saving utility
		return this.storage.save(JSON.stringify(dataToSave));
	}
	
	updatePublishedKey(signer: midSigs.user.MailerIdSigner): void {
		this.introKeys.updatePublishedKey(signer);
		this.saveChanges();
	}
	
	getPublishedKeyCerts(): confApi.p.initPubKey.Certs {
		if (this.introKeys.publishedKeyCerts) {
			return this.introKeys.publishedKeyCerts;
		}
		return;	// undefined
	}

	isKnownCorrespondent(address: string): boolean {
		return (!!this.corrKeys[address]);
	}
	
	setCorrepondentTrustedIntroKey(address: string, pkey: jwk.JsonKey,
			invite: string = null): void {
		var ck = this.corrKeys[address];
		if (!ck) {
			ck = this.addCorrespondent(address);
		}
		ck.setIntroKey(pkey, invite);
		this.saveChanges();
	}
	
	absorbSuggestedNextKeyPair(correspondent: string,
			pair: msgMod.SuggestedNextKeyPair, timestamp: number): void {
		var ck = this.corrKeys[correspondent];
		if (!ck) {
			ck = this.addCorrespondent(correspondent);
		}
		ck.setSendingPair(pair, timestamp);
		this.saveChanges();
	}
	
	getInviteForSendingTo(correspondent: string): string {
		var ck = this.corrKeys[correspondent];
		return (ck ? ck.invite : null);
		
	}
	
	markPairAsInUse(correspondent: string, pid: string) {
		this.corrKeys[correspondent].markPairAsInUse(pid);
		this.saveChanges();
	}
	
	generateKeysForSendingTo(address: string, invitation: string = null,
			introPKeyFromServer: jwk.JsonKey = null): {
				encryptor: nacl.secret_box.Encryptor;
				pairs: { current: util.ASMailKeyPair;
						next: msgMod.SuggestedNextKeyPair; }; } {
		var ck = this.corrKeys[address];
		var sendingPair: corrKeysMod.SendingPair;
		if (ck) {
			sendingPair = ck.getSendingPair();
		} else if (introPKeyFromServer) {
			ck = this.addCorrespondent(address);
			sendingPair = ck.getSendingPair(introPKeyFromServer);
		} else {
			throw new Error("There are no known keys for given address "+
				address+" and a key from a mail server is not given either.");
		}
		var encryptor = makeSendingEncryptor(sendingPair);
		var suggestPair = ck.suggestPair(invitation);
		var currentPair: util.ASMailKeyPair;
		if (sendingPair.isSelfGenerated) {
			currentPair = {
				senderPKey: sendingPair.senderKey.pkey,
				recipientKid: sendingPair.recipientPKey.kid
			};
		} else {
			currentPair = { pid: selectPid(sendingPair.pids) };
		}
		return {
			encryptor: encryptor,
			pairs: { current: currentPair, next: suggestPair }
		};
	}

	getDecryptorFor(pair: delivApi.msgMeta.CryptoInfo):
			indexMod.DecryptorWithInfo[] {
		var decryptors: indexMod.DecryptorWithInfo[] = [];
		if (pair.pid) {
			var emails = this.pairIdToEmailMap.getEmails(pair.pid);
			if (!emails) { return; }
			emails.forEach((email) => {
				var ck = this.corrKeys[email];
				var rp = ck.getReceivingPair(pair.pid);
				var decryptor = makeReceivingDecryptor(
						rp.pair.senderPKey, rp.pair.recipientKey.skey);
				decryptors.push({
					correspondent: email,
					decryptor: decryptor,
					cryptoStatus: rp.role
				});
			});
		} else {
			var recipKey = this.introKeys.findKey(pair.recipientKid);
			if (!recipKey) { return; }
			var decryptor = makeReceivingDecryptor(
				{
					kid: '',
					k: pair.senderPKey,
					alg: recipKey.pair.skey.alg,
					use: util.KEY_USE.PUBLIC
				},
				recipKey.pair.skey);
			decryptors.push({
				decryptor: decryptor,
				cryptoStatus: recipKey.role
			});
		}
		return decryptors;
	}
	
	wrap(): indexMod.KeyRing {
		var wrap: indexMod.KeyRing = {
			saveChanges: this.saveChanges.bind(this),
			updatePublishedKey: this.updatePublishedKey.bind(this),
			getPublishedKeyCerts: this.getPublishedKeyCerts.bind(this),
			isKnownCorrespondent: this.isKnownCorrespondent.bind(this),
			setCorrepondentTrustedIntroKey:
				this.setCorrepondentTrustedIntroKey.bind(this),
			generateKeysForSendingTo: this.generateKeysForSendingTo.bind(this),
			getDecryptorFor: this.getDecryptorFor.bind(this),
			absorbSuggestedNextKeyPair:
				this.absorbSuggestedNextKeyPair.bind(this),
			getInviteForSendingTo: this.getInviteForSendingTo.bind(this),
			init: this.init.bind(this)
		};
		Object.freeze(wrap);
		return wrap;
	}
	
}


Object.freeze(exports);