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

import Q = require('q');
import byteSrcMod = require('../byte-source');
import xspFS = require('./xsp-fs/index');
import midSig = require('../../lib-common/mid-sigs-NaCl-Ed');
import remoteServ = require('./service');
import keyGenUtils = require('../workers/key-gen-common');

class StorageOwner implements xspFS.Storage {
	
	private getMidSigner: () => Q.Promise<midSig.user.MailerIdSigner>;
	private remoteStorage: remoteServ.StorageOwner = null;
	private loginProc: Q.Promise<void> = null;
	
	constructor(getMidSigner: () => Q.Promise<midSig.user.MailerIdSigner>) {
		this.getMidSigner = getMidSigner;
		Object.seal(this);
	}
	
	static makeAndLogin(serviceUrl: string,
			getMidSigner: () => Q.Promise<midSig.user.MailerIdSigner>):
			Q.Promise<xspFS.Storage> {
		var s = new StorageOwner(getMidSigner);
		var promise = s.getMidSigner()
		.then((signer) => {
			s.remoteStorage = new remoteServ.StorageOwner(signer.address);
			return s.remoteStorage.setStorageUrl(serviceUrl)
			.then(() => {
				return s.remoteStorage.login(signer);
			});
		})
		.then(() => {
			return s.wrap();
		});
		return promise;
	}
	
	private login(): Q.Promise<void> {
		if (this.loginProc) { return this.loginProc; }
		this.loginProc = this.getMidSigner()
		.then((signer) => {
			
		})
		.fin(() => {
			this.loginProc = null;
		})
		return this.loginProc;
	}
	
	getRootKeyDerivParams(): keyGenUtils.ScryptGenParamsInJson {
		return this.remoteStorage.keyDerivParams;
	}
	
	getObj(objId: string): Q.Promise<byteSrcMod.ObjBytesSource> {
		if (this.remoteStorage.sessionId) {
			return Q.when(this.remoteStorage.getObj(objId));
		}
		return this.login()
		.then(() => {
			return this.remoteStorage.getObj(objId);
		});
	}
	
	getObjHeader(objId: string): Q.Promise<byteSrcMod.BytesSource> {
		if (this.remoteStorage.sessionId) {
			return Q.when(this.remoteStorage.getObjHeader(objId));
		}
		return this.login()
		.then(() => {
			return this.remoteStorage.getObjHeader(objId);
		});
	}
	
	saveObj(objId: string, obj: byteSrcMod.ObjBytesSource, newObj?: boolean):
			Q.Promise<void> {
		if (this.remoteStorage.sessionId) {
			return this.remoteStorage.saveObj(objId, obj, newObj);
		}
		return this.login()
		.then(() => {
			return this.remoteStorage.saveObj(objId, obj, newObj);
		});
	}
	
	close(): Q.Promise<void> {
		return (this.remoteStorage.sessionId ?
			this.remoteStorage.logout() : Q.when())
		.fin(() => {
			this.getMidSigner = null;
			this.remoteStorage = null;
		})
		.fail((err) => { return; });
	}
	
	wrap(): xspFS.Storage {
		return {
			getObj: this.getObj.bind(this),
			getObjHeader: this.getObjHeader.bind(this),
			saveObj: this.saveObj.bind(this),
			close: this.close.bind(this),
			getRootKeyDerivParams: this.getRootKeyDerivParams.bind(this)
		};
	}
	
}
Object.freeze(StorageOwner.prototype);
Object.freeze(StorageOwner);

export var make3NStorageOwner = StorageOwner.makeAndLogin;

Object.freeze(exports);