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

import ringMod = require('./ring');

interface StringToStringArrayMap {
	[name: string]: string[];
}

/**
 * This is a one-to-many, one way map from string ids to string emails.
 */
export class IdToEmailMap {
	
	private keyring: ringMod.Ring;
	private idToEmail: StringToStringArrayMap = {};
	
	constructor(kring: ringMod.Ring) {
		this.keyring = kring;
		Object.seal(this);
	}

	/**
	 * @param id
	 * @return undefined, if id is not known, or string with email, if there is one
	 * email registered for a given id, or an array of string emails, if more than
	 * one email registered for a given id. 
	 */
	getEmails(id: string): string[] {
		var emails = this.idToEmail[id];
		if (emails) { return emails; }
		if (Array.isArray(emails)) { return emails.concat([]); }
		return;	// undefined in explicit statement
	}

	/**
	 * @param id
	 * @param email
	 * @return true, if given id-email pair is successfully registered,
	 * and false, if such registration already existed.
	 */
	addPair(id: string, email: string): boolean {
		var emails = this.idToEmail[id];
		if (emails) {
			if (emails.indexOf(email) >= 0) { return false; }
			emails.push(email);
		} else {
			this.idToEmail[id] = [ email ];
		}
		return true;
	}
	
	/**
	 * @param ids is an array of string ids, associated with a given email
	 * @param email
	 */
	addPairs(ids: string[], email: string): void {
		for (var i=0; i<ids.length; i+=1) {
			this.addPair(ids[i], email);
		}
	}

	/**
	 * This removes given id-email pair.
	 * @param id
	 * @param email
	 * @return true, if pair was found and removed, and false, otherwise.
	 */
	removePair(id: string, email: string): boolean {
		var emails = this.idToEmail[id];
		if (!emails) { return false; }
		var emailInd = emails.indexOf(email);
		if (emailInd < 0) { return false; }
		if (emails.length === 0) {
			delete this.idToEmail[id];
		} else {
			emails = emails.slice(0, emailInd).concat(emails.slice(emailInd+1));
		}
		return true;
	}
	
	removePairs(ids: string[], email: string): void {
		for (var i=0; i<ids.length; i+=1) {
			this.removePair(ids[i], email);
		}
	}
	
}
Object.freeze(IdToEmailMap);
Object.freeze(IdToEmailMap.prototype);

Object.freeze(exports);