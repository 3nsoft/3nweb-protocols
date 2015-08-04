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
 * This creates encryptor, which uses session key, established with PKL.
 */

import nacl = require('ecma-nacl');
import utf8 = require('./utf8');

export interface SessionEncryptor extends
		nacl.secret_box.Encryptor, nacl.secret_box.Decryptor {
	openJSON(bytesWN: Uint8Array): any; 
	packJSON(json: any): Uint8Array;
}

export function makeSessionEncryptor(key: Uint8Array, nextNonce: Uint8Array):
		SessionEncryptor {
	var encr = nacl.secret_box.formatWN.makeEncryptor(key, nextNonce, 2);
	var decr = nacl.secret_box.formatWN.makeDecryptor(key);
	return {
		open: decr.open,
		openJSON: (bytesWN: Uint8Array): any => {
			return JSON.parse(utf8.open(decr.open(bytesWN)));
		},
		pack: encr.pack,
		packJSON: (json: any): Uint8Array => {
			return encr.pack(utf8.pack(JSON.stringify(json)));
		},
		getDelta: encr.getDelta,
		destroy: (): void => {
			if (!encr) { return; }
			encr.destroy();
			encr = null;
			decr.destroy();
			decr = null;
		}
	};
}
