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

import nacl = require('ecma-nacl');
import keyGenUtil = require('./key-gen-common');

export function setupWorker(notifPerc: number) {
	if ((notifPerc < 1) || (notifPerc > 99)) {
		notifPerc = 1;
	}
	self.addEventListener('message', (e) => {
		var params = keyGenUtil.workMsgToParams(e.data);
		var count = 0;
		var progressCB = (p: number): void => {
			if (count*notifPerc > p) { return; }
			(<any> self).postMessage({ progress: p });
			count += 1;
		};
		try {
			var key = nacl.scrypt(params.pass, params.salt,
				params.logN, params.r, params.p, 32, progressCB);
			(<any> self).postMessage({ key: key.buffer }, [ key.buffer ]);
		} catch (err) {
			(<any> self).postMessage({ error: err.message });
		}
	});
}
Object.freeze(exports);