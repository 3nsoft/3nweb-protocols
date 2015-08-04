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
 * This file contains functionality to perform mailerid-based signin,
 * logging intermediate steps for clarity of this demonstration.
 */

import nacl = require('ecma-nacl');
import Q = require('q');
import log = require('./page-logging');
import serviceLocator = require('./service-locator');
import keyGen = require('./workers/key-gen-main');
import midSigs = require('../lib-common/mid-sigs-NaCl-Ed');
import midProv = require('./mailer-id/provisioner');
import jwk = require('../lib-common/jwkeys');
import mid = require('./user-with-mid-session');

function getRandom(n: number): Uint8Array {
	var arr = new Uint8Array(n);
	(<any> window).crypto.getRandomValues(arr);
	return arr;
}

// We are doing a trick here for the test.
// Private members in TypeScript are just regular members in JavaScript,
// thus, casting to a different "show-privates" interface let's us
// show inner working of an object in a test setting.
interface MidProvisionerShowingPrivates {
	sessionId: string;
	keyDerivationParams: any;
	setUrlAndDomain(): Q.Promise<void>;
	startSession(): Q.Promise<void>;
	openSessionKey(dhsharedKeyCalculator: midProv.ICalcDHSharedKey): void;
	completeLoginExchange(): Q.Promise<void>;
	getCertificates(pkey: jwk.JsonKey, duration: number): Q.Promise<void>;
	userCert: jwk.SignedLoad;
	provCert: jwk.SignedLoad;
}
interface MidUserShowingPrivates {
	sessionId: string;
	startSession(): Q.Promise<void>;
	authenticateSession(midSigner: midSigs.user.MailerIdSigner):
		Q.Promise<boolean>;
}

/**
 * @param form from which address and passphrase are taken.
 * @return promise, that resolves to assertion signer.
 */
export function provisionAssertionSigner(form: any) {
	
	// get address and pass from the form
	var address = form.address.value
	var pass = form.pass.value;
	if (!pass) {
		log.write("MISSING INFO: provide a passphrase for "+address+
				", from which mailerId login secret key is derived.");
		throw new Error("Missing passphrase");
	}

	// prepare a generator of a promise that resolves into DH key calculator
	var genOfDHKeyCalcPromise = (keyGenParams: any) => {
		return keyGen.deriveKeyFromPass(pass, keyGenParams)
		.then((skey) => {
			return (serverPubKey: Uint8Array): Uint8Array => {
				return nacl.box.calc_dhshared_key(serverPubKey, skey);
			};
		});
	};
	
	var keyPair = midSigs.user.generateSigningKeyPair(getRandom);
	log.write("Generated a pair of keys, that will be used to sign " +
			"assertions, exactly like in browserId, from which mailerId " +
			"is different in using universal Public Key Login, and " +
			"having session-id as an audience parameter in the assertion.");

	log.write("In this test run we do not look into DNS, and check directly "+
			"localhost:8080/mailerid");
	
	var certProv: MidProvisionerShowingPrivates = <any>
		new midProv.MailerIdProvisioner(address, 'https://localhost:8080/mailerid');
	
	var promise = certProv.setUrlAndDomain()
	.then(() => {
		log.write("Loging into MailerId provider, to provision a certificate.");
		// This is an expanded pkl login, which is not available in provisioner
		// directly, and is a copy-paste from provisioner's super class
		return certProv.startSession()
		.then(() => {
			return genOfDHKeyCalcPromise(certProv.keyDerivationParams);
		})
		.then((dhsharedKeyCalculator) => {
			return certProv.openSessionKey(dhsharedKeyCalculator);
		})
		.then(() => {
			return certProv.completeLoginExchange();
		});
	})
	.then(() => {
		log.write("Login into MailerId is complete, session id and encryption " +
				"are established.");
		log.write("Asking MailerId provider to certify key, which will be used "+
				"to create assertions. Asking for 6 hours certificate duration.");
		return certProv.getCertificates(keyPair.pkey, 6*60*60);
	})
	.then(() => {
		log.write("Certificate is received. It can now be used to sign into "+
			"any service, that accepts MailerId. Signer will make signatures "+
			"with validity no longer than 15 minutes.");
		return midSigs.user.makeMailerIdSigner(
			keyPair.skey, certProv.userCert, certProv.provCert, 15*60);
	});
	
	return promise;
}

/**
 * @param midAssertionSigner
 * @return a promise resolvable to authenticated session id.
 */
export function startAndAuthSession(servUser: mid.ServiceUser,
		midSigner: midSigs.user.MailerIdSigner): Q.Promise<void> {
	var midUser: MidUserShowingPrivates = <any> servUser;
	log.write("Asking ASMail server to start session, and provide an "+
		"session id, which will be used in MailerId assertion.");
	var promise = midUser.startSession()
	.then(() => {
		log.write("Making MailerId assertion for current session, and "+
			"sending it with key certificates to service, "+
			"which is a relying party in this MailerId exchange.");
		return midUser.authenticateSession(midSigner);
	})
	.then(() => {
		log.write("Server successfully authenticates our session.");
	}, (err) => {
		throw new Error("Server is not authenticating our session. "+
				"It replied with status code "+err.status+
				", saying "+err.message);
	});
	return promise;
}
