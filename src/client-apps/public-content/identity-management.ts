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
import Q = require('q');
import routers = require('../../lib-client/simple-router');
import midProv = require('../../lib-client/mailer-id/provisioner');
import log = require('../../lib-client/page-logging');
import keyGen = require('../../lib-client/workers/key-gen-main');
import mid = require('../../lib-common/mid-sigs-NaCl-Ed');

// These declared variables should be initialized in window by other script(s)
declare var pageRouter: routers.Router;

// we make test certs short-living, so as to have expiration events
var CERTIFICATE_DURATION_SECONDS = 60*60;

var MIN_SECS_LEFT_ASSUMED_OK = 60;

export interface IdManager {
	completeCredentialsEntry(form: any, cancel: boolean): void;
	provision(): Q.Promise<mid.user.MailerIdSigner>;
	getId(): string;
	/**
	 * @return a promise, resolvable to mailerId signer.
	 */
	getSigner(): Q.Promise<mid.user.MailerIdSigner>;
	/**
	 * @return true, if signer for a given id has been provisioned, and
	 * shall be valid at least for the next minute, and false, otherwise.
	 */
	isProvisionedAndValid(): boolean;
	init(): Q.Promise<void>;
}

interface IdAndPass {
	id: string;
	pass: string;
}

class Manager implements IdManager {
	
	private provisioner: midProv.MailerIdProvisioner = null;
	private signer: mid.user.MailerIdSigner = null;
	private deferredCredentials: Q.Deferred<IdAndPass> = null;
	
	constructor() {
		Object.seal(this);
	}
	
	/**
	 * @return a promise, resolvable to an object with fields id and pass.
	 */
	private promiseIdAndPassForPKL(): Q.Promise<IdAndPass> {
		var idInput = $('#mailer-id-entry')[0];
		if (this.getId()) {
			(<any> idInput).value = this.getId();
			(<any> idInput).disabled = true;
		} else {
			(<any> idInput).disabled = false;
		}
		pageRouter.showElem('mailerid-credentials');
		if (this.getId()) {
			document.forms["mailerid-credentials"].pass.focus();
		} else {
			document.forms["mailerid-credentials"].mailerid.focus();
		}
		this.deferredCredentials = Q.defer<IdAndPass>();
		return this.deferredCredentials.promise;
	}
		
	completeCredentialsEntry(form: any, cancel: boolean): void {
		function hideForm() {
			form.reset();
			pageRouter.hideElem('mailerid-credentials');
		}
		try {
			if (cancel) {
				hideForm();
				this.deferredCredentials.reject(new Error(
					"User canceled entry of MailerId credentials."));
				return;
			}
			var id = form.mailerid.value;
			var pass = form.pass.value;
			if (!id) {
				alert("Mail address is missing.\nPlease, type it in.");
				return;
			}
			if (!pass) {
				alert("Passphrase is missing.\nPlease, type it in.");
				return;
			}
			hideForm();
			this.deferredCredentials.resolve({ id: id, pass: pass });
		} catch (err) {
			log.write("ERROR: "+err.message);
			console.error('Error in file '+err.fileName+' at '+
					err.lineNumber+': '+err.message);
		}
	}
	
	/**
	 * Notice that this function should actually do a DNS lookup to find
	 * domain and port of identity providing service, but in this test
	 * setting we feed in a location of our test MailerId service at
	 * localhost:8080.
	 * @return a promise, resolvable, when a new assertion signer is
	 * provisioned for a given id.
	 */
	provision(): Q.Promise<mid.user.MailerIdSigner> {
		var promise = this.promiseIdAndPassForPKL()
		.then((idAndPass) => {
			if (this.provisioner) {
				if (this.provisioner.userId !== idAndPass.id) { throw new Error(
					"Entered id is not the same as the one set for this app."); }
			} else {
				this.provisioner = new midProv.MailerIdProvisioner(
					idAndPass.id, 'https://localhost:8080/mailerid');
			}
			var genOfDHKeyCalcPromise = (keyGenParams) => {
				return keyGen.deriveKeyFromPass(idAndPass.pass, keyGenParams)
				.then((skey) => {
					return (serverPubKey: Uint8Array): Uint8Array => {
						return nacl.box.calc_dhshared_key(
							serverPubKey, skey);
					};
				});
			};
			return this.provisioner.provisionSigner(
				genOfDHKeyCalcPromise, CERTIFICATE_DURATION_SECONDS);
		})
		.then((midSigner) => {
			this.signer = midSigner;
			return this.signer;
		});
		return promise;
	}
		
	getId(): string {
		return (this.provisioner ? this.provisioner.userId : null);
	}
	
	getSigner(): Q.Promise<mid.user.MailerIdSigner> {
		if (this.isProvisionedAndValid()) {
			return Q.when(this.signer);
		}
		return this.provision()
		.then(() => {
			return this.signer;
		});
	}
	
	isProvisionedAndValid(): boolean {
		if (!this.signer) { return false; }
		return (this.signer.certExpiresAt >
			(Date.now()/1000 + MIN_SECS_LEFT_ASSUMED_OK));
	}
	
	init(): Q.Promise<void> {
		var promise = this.provision()
		.then(() => {
			$('title').text(this.getId());
			$('.user-id').text(this.getId());
		});
		return promise;
	}
	
}

export function makeManager(): IdManager {
	var m = new Manager();
	var managerWrap: IdManager = {
		completeCredentialsEntry: m.completeCredentialsEntry.bind(m),
		provision: m.provision.bind(m),
		getId: m.getId.bind(m),
		getSigner: m.getSigner.bind(m),
		isProvisionedAndValid: m.isProvisionedAndValid.bind(m),
		init: m.init.bind(m)
	};
	Object.freeze(managerWrap);
	return managerWrap;
}

Object.freeze(exports);