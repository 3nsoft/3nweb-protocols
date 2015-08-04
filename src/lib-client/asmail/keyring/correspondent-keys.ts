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
 * This file contains functionality, used inside keyring.
 */

import util = require('./common');
import nacl = require('ecma-nacl');
import jwk = require('../../../lib-common/jwkeys');
import msgMod = require('../msg');
import ringMod = require('./ring');
import random = require('../../random');

export interface ReceptionPair {
	pids: string[];
	recipientKey: util.JWKeyPair;
	senderPKey: jwk.JsonKeyShort;
	invitation?: string;
}

export interface SendingPair {
	pids: string[];
	recipientPKey: jwk.JsonKeyShort;
	senderKey: util.JWKeyPair;
	isSelfGenerated?: boolean;
}

function generatePids(): string[] {
	var pids: string[] = [];
	for (var i=0; i<5; i+=1) {
		pids[i] = random.stringOfB64Chars(util.PID_LENGTH);
	}
	return pids;
}

interface CorrespondentKeysJSON {
	
	/**
	 * This is correspondent's address.
	 */
	correspondent: string;
	
	/**
	 * This is an invitation token, which should be used to send messages to
	 * correspondent.
	 */
	inviteForSending: string;
	
	/**
	 * Correspondent's introductory public key that comes from some 3rd channel.
	 * It is used to initiate mail exchange, without relying on key, served
	 * by correspondent's mail server.
	 */
	introKey: jwk.JsonKey;
	
	/**
	 * Sending pair is used for sending messages to this recipient.
	 * It is set from suggestions that correspondent sends in her messages.
	 * When initiating an exchange, while this pair has not been set, it is
	 * generated, which is indicated by the flag.
	 */
	sendingPair: SendingPair;
	
	sendingPairTS: number;
	
	/**
	 * Reception key pairs are pairs which we suggest to this correspondent
	 * for sending messages to us.
	 * Suggested pair is the one that we have already suggested, or are
	 * suggesting now.
	 * When correspondent uses suggested pair, we move it to inUse, while
	 * previous inUse pair is moved to old.
	 */
	receptionPairs: {
		suggested: ReceptionPair;
		inUse: ReceptionPair;
		old: ReceptionPair;
	};
}

export class CorrespondentKeys {

	private keyring: ringMod.Ring;
	private keys: CorrespondentKeysJSON = null;
	get correspondent(): string {
		return this.keys.correspondent;
	}
	get invite(): string {
		return this.keys.inviteForSending;
	}
	set invite(invite: string) {
		this.keys.inviteForSending = invite;
	}
	
	/**
	 * @param kring in which these keys are hanging.
	 * @param address of this correspondent.
	 * Either an address should be null, or serialData.
	 * @param serialData from which this object should be reconstructed.
	 * Either serialData should be null, or an address.
	 */
	constructor(kring: ringMod.Ring, address: string, serialData: string) {
		this.keyring = kring;
		if (address) {
			this.keys = {
				correspondent: address,
				inviteForSending: null,
				introKey: null,
				sendingPair: null,
				sendingPairTS: 0,
				receptionPairs: {
					suggested: null,
					inUse: null,
					old: null
				}
			};
		} else {
			var data: CorrespondentKeysJSON = JSON.parse(serialData);
			// TODO checks of deserialized json data
			
			this.keys = data;
		}
		Object.seal(this);
	}
	
	/**
	 * This attaches all keys into ring's maps.
	 * Theis method should be called only once, and only on a deserialized
	 * object.
	 */
	mapAllKeysIntoRing(): void {
		// index correspondent's key
		if (this.keys.introKey) {
			this.keyring.introKeyIdToEmailMap.addPair(
					this.keys.introKey.kid, this.correspondent);
		}
		// index key pairs
		var pairs = [ this.keys.receptionPairs.suggested,
	    	          this.keys.receptionPairs.inUse,
	        	      this.keys.receptionPairs.old ];
		var email = this.correspondent;
		pairs.forEach((pair) => {
			if (!pair) { return; }
			pair.pids.forEach((pid) => {
				this.keyring.pairIdToEmailMap.addPair(pid, email);
			});
		});
	}

	/**
	 * @return json object for serialization.
	 */
	serialForm(): string {
		return JSON.stringify(this.keys);
	}

	/**
	 * Correctly remove previous key and attaches a new correspondent's
	 * introductory public key, performing keyring's update and save.
	 * @param pkey
	 * @param invite
	 * correspondent's mail server.
	 */
	setIntroKey(pkey: jwk.JsonKey, invite: string): void {
		try {
			util.extractPKeyBytes(pkey);
		} catch (err) {
			throw new Error("Given public key cannot be used:\n"+err.message);
		}
		// remove existing key, if there is one, from keyring's index
		if (this.keys.introKey) {
			this.keyring.introKeyIdToEmailMap.removePair(
					this.keys.introKey.kid, this.correspondent);
		}
		this.keys.introKey = pkey;
		// add new key to keyring's index
		this.keyring.introKeyIdToEmailMap.addPair(
				this.keys.introKey.kid, this.correspondent);
		this.keys.inviteForSending = invite;
	}
	
	/**
	 * This function generates new suggested reception pair, but only if there
	 * is currently none.
	 * If there is previous suggested pair, it shall be returned.
	 * @param invitation is an invitation string, for use with a new key pair.
	 * It can be null. When null, new chain of pairs shall start without a token,
	 * while existing one will use whatever token has been used already (if any).
	 * @return reception pair, which should be suggested to correspondent.
	 */
	suggestPair(invitation: string): msgMod.SuggestedNextKeyPair {
		var nextKeyPair: msgMod.SuggestedNextKeyPair;
		if (this.keys.receptionPairs.suggested) {
			var suggPair = this.keys.receptionPairs.suggested;
			nextKeyPair = {
				pids: suggPair.pids,
				senderKid: suggPair.senderPKey.kid,
				recipientPKey: suggPair.recipientKey.pkey
			};
			if (invitation) {
				nextKeyPair.invitation = invitation;
			} else if (suggPair.invitation) {
				nextKeyPair.invitation = suggPair.invitation; 
			}
			return nextKeyPair;
		}
		if (!this.keys.sendingPair) { throw new Error(
				"Sending pair should be set before calling this function."); }
		var corrPKey = this.keys.sendingPair.recipientPKey;
		var pair: ReceptionPair = {
				pids: generatePids(),
				recipientKey: util.generateKeyPair(),
				senderPKey: corrPKey
		};
		if (invitation) {
			pair.invitation = invitation;
		}
		this.keys.receptionPairs.suggested = pair;
		// add pair to index
		this.keyring.pairIdToEmailMap.addPairs(pair.pids, this.correspondent);
		this.keyring.saveChanges();
		nextKeyPair = {
			pids: pair.pids,
			senderKid: pair.senderPKey.kid,
			recipientPKey: pair.recipientKey.pkey
		};
		if (pair.invitation) {
			nextKeyPair.invitation = pair.invitation;
		}
		return nextKeyPair;
	}

	/**
	 * This marks suggested reception pair as being in use, if it has the same
	 * id as a given pid.
	 * Otherwise, nothing happens.
	 * Suggested pair is moved into category in-use, while in-use pair is
	 * reclassified as old.
	 * @param pid
	 */
	markPairAsInUse(pid: string): void {
		if (!this.keys.receptionPairs.suggested ||
			(this.keys.receptionPairs.suggested.pids.indexOf(pid) < 0)) { return; }
		var mp = this.keys.receptionPairs.inUse;
		this.keys.receptionPairs.inUse = this.keys.receptionPairs.suggested;
		if (mp) {
			var dp = this.keys.receptionPairs.old;
			this.keys.receptionPairs.old = mp;
			if (dp) {
				dp.pids.forEach((pid) => {
					this.keyring.pairIdToEmailMap.removePair(
						pid, this.correspondent);
				});
			}
		}
	}
	
	/**
	 * This function is used internally in this.setSendingPair(p) function.
	 * @param kid
	 * @return a key for receiving, corresponding to given key id.
	 */
	private findReceptionKey(kid: string): util.JWKeyPair {
		for (var fieldName in this.keys.receptionPairs) {
			var rp: ReceptionPair = this.keys.receptionPairs[fieldName];
			if (!rp) { continue; }
			if (rp.recipientKey.skey.kid === kid) {
				return rp.recipientKey;
			}
		}
		var keyInfo = this.keyring.introKeys.findKey(kid);
		if (keyInfo) {
			return keyInfo.pair;
		} else {
			var err = new Error("Key cannot be found");
			(<any> err).unknownKid = true;
			throw err;
		}
	}

	/**
	 * This checks given pair and sets a new sending pair.
	 * @param pair
	 * @param timestamp
	 */
	setSendingPair(pair: msgMod.SuggestedNextKeyPair, timestamp: number): void {
		if (this.keys.sendingPairTS >= timestamp) { return; }
		var senderKey = this.findReceptionKey(pair.senderKid);
		try {
			util.extractKeyBytes(pair.recipientPKey);
		} catch (err) {
			throw new Error(
				"Public key in a given pair cannot be used:\n"+err.message);
		}
		this.keys.sendingPair = {
				pids: pair.pids,
				recipientPKey: pair.recipientPKey,
				senderKey: senderKey
		};
		if (pair.invitation) {
			this.keys.inviteForSending = pair.invitation;
		}
		this.keys.sendingPairTS = timestamp;
	}
	
	/**
	 * @param pid
	 * @return pair for receiving messages and a role of a given pair.
	 * Undefined is returned when no pair were found.
	 */
	getReceivingPair(pid: string):
			{ pair: ReceptionPair; role: string; } {
		var pairs = this.keys.receptionPairs;
		if (pairs.suggested && (pairs.suggested.pids.indexOf(pid) >= 0)) {
			return {
				pair: pairs.suggested,
				role: util.KEY_ROLE.SUGGESTED
			};
		} else if (pairs.inUse && (pairs.inUse.pids.indexOf(pid) >= 0)) {
			return {
				pair: pairs.inUse,
				role: util.KEY_ROLE.IN_USE
			};
		} else if (pairs.old && (pairs.old.pids.indexOf(pid) >= 0)) {
			return {
				pair: pairs.old,
				role: util.KEY_ROLE.OLD
			};
		}
		return;	// explicit return of undefined
	}
	
	/**
	 * @param corrIntroKey is a correspondent's intro key, required, when there
	 * is no introKey.
	 * @return existing sending pair, or generates a new one.
	 */
	getSendingPair(corrIntroKey: jwk.JsonKey = null): SendingPair {
		if (this.keys.sendingPair) { return this.keys.sendingPair; }
		var senderKey = util.generateKeyPair();
		var recipientPKey = (corrIntroKey ? corrIntroKey : this.keys.introKey);
		if (!recipientPKey) { throw new Error("Introductory key for "+
			this.correspondent+" is neither given, nor present in the ring."); }
		this.keys.sendingPair = {
				pids: generatePids(),
				recipientPKey: recipientPKey,
				senderKey: senderKey,
				isSelfGenerated: true
		};
		this.keyring.saveChanges();
		return this.keys.sendingPair;
	}
	
}
Object.freeze(CorrespondentKeys.prototype);
Object.freeze(CorrespondentKeys);

Object.freeze(exports);