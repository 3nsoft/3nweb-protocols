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
 * This module is a function that constructs test-grade users factories.
 * Notice that production code would use db, and functions would have to return promises,
 * instead of direct values, as we do it here now.
 */

import fs = require('fs');
import base64 = require('../../lib-common/base64');
import nacl = require('ecma-nacl');
import jwk = require('../../lib-common/jwkeys');

var AT_DOMAIN = '@localhost';

function stripDomainPart(username: string): string {
	var domainInd = username.lastIndexOf(AT_DOMAIN);
	return ((domainInd === -1) ? username : username.substring(0, domainInd));
}

function getPublicKeyBytesAccordingToAlg(info: UserInfo): Uint8Array {
	if (info.pkey.alg === nacl.box.JWK_ALG_NAME) {
		var k = base64.open(info.pkey.k);
		if (k.length !== nacl.box.KEY_LENGTH) {
			throw new Error("User's ("+info.id+") key has incorrect length.");
		}
		return k;
	} else {
		throw new Error("User's ("+info.id+") key for unsupported algorithm.");
	}
}

export interface UserInfo {
	id: string;
	pkey: jwk.JsonKey;
	params: any;
}

function readUserFromFolder(dataPath): { [id: string]: UserInfo; } {
	var users: { [id: string]: UserInfo; } = {};
	var files = fs.readdirSync(dataPath);
	var file: string;
	var user: UserInfo;
	var str: string;
	for (var i=0; i<files.length; i+=1) {
		file = files[i];
		str = fs.readFileSync(dataPath+'/'+file,
				{ encoding: 'utf8', flag: 'r' });
		try {
			user = JSON.parse(str);
		} catch (e) {
			console.error("File "+file+
					" cannot by intertpreted as json:\n"+str);
			continue;
		}
		if (users[user.id]) {
			console.error("File "+file+" contains info for user "+user.id);
			continue;
		}
		users[stripDomainPart(user.id)] = user;
	}
	return users;
}

function recordUserInfoToDisk(dataPath: string, info: UserInfo): void {
	var file = dataPath+'/'+Date.now()+'.json'
	var str = JSON.stringify(info);
	fs.writeFileSync(file, str, { encoding: 'utf8', flag: 'wx' });
}

export interface IGetInfo {
	(id: string): UserInfo;
}
export interface IGetUserParamsAndKey {
	(id: string): { key: Uint8Array; params: any; };
}
export interface IAdd {
	(user: UserInfo): boolean;
}
export interface Factory {
	getInfo: IGetInfo;
	getUserParamsAndKey: IGetUserParamsAndKey;
	add: IAdd;
}

export function makeFactory(dataPath: string): Factory {
	
	var users = readUserFromFolder(dataPath);
	
	var factory: Factory = {
		getInfo: (id: string) => {
			id = stripDomainPart(id);
			var userInfo = users[id];
			if (!userInfo) { return; }
			return userInfo;
		},
		getUserParamsAndKey: (id: string) => {
			id = stripDomainPart(id);
			var userInfo = users[id];
			if (!userInfo) { return; }
			return {
				key: getPublicKeyBytesAccordingToAlg(userInfo),
				params: userInfo.params
			};
		},
		add: (user: UserInfo) => {
			var id = stripDomainPart(stripDomainPart(user.id));
			if ('undefined' !== typeof users[id]) { return false; }
			users[id] = user;
			recordUserInfoToDisk(dataPath, user);
			return true;
		}
	};
	Object.freeze(factory);
	
	return factory;
}

Object.freeze(exports);