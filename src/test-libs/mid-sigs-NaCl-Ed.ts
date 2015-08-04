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
 * Testing MailerId signing module.
 */

import nu = require('nodeunit');
import mid = require("../lib-common/mid-sigs-NaCl-Ed");
import crypto = require("crypto");
import utf8 = require("../lib-common/utf8");
import base64 = require("../lib-common/base64");
import jwk = require("../lib-common/jwkeys");

function getRandom(numOfBytes: number): Uint8Array {
	return new Uint8Array(<any> crypto.randomBytes(numOfBytes));
}

module TestSuite {
	
	var issuer = "test.co/mailerId";
	var midRoot: { cert: jwk.SignedLoad; skey: jwk.JsonKey; };
	var provider: { cert: jwk.SignedLoad; skey: jwk.JsonKey; };
	var certifier: mid.idProvider.IdProviderCertifier;
	var user = "user@some.com";
	var userKeys: mid.Keypair;
	var userKeyCert: jwk.SignedLoad;
	var rpDomain = "relying.party.domain";
	var certChain: mid.CertsChain;
	
	export function setUp(callback: Function): void {
		
		// provider's setup functions
		midRoot = mid.idProvider.generateRootKey(
				issuer, 90*24*60*60, getRandom);
		provider = mid.idProvider.generateProviderKey(
				issuer, 10*24*60*60, midRoot.skey, getRandom);
		certifier = mid.idProvider.makeIdProviderCertifier(
				issuer, 24*60*60, provider.skey);
		
		// user's provisioning its certificate, using provider's service
		// user generates its signing key
		userKeys = mid.user.generateSigningKeyPair(getRandom);
		// provider certifies user's key
		userKeyCert = certifier.certify(userKeys.pkey, user, 3*60*60);
		// certs' chain
		certChain = {
			user: userKeyCert,
			prov: provider.cert,
			root: midRoot.cert
		};
		
		callback();
	}
	
	export function chainOfCerts(test: nu.Test) {
		
		var nowSecs = Math.floor(Date.now()/1000);
		
		// relying party verifies user's certificate all way to root certificate
		var certInfo = mid.relyingParty.verifyChainAndGetUserKey(
			certChain, issuer, nowSecs);
		test.equal(certInfo.address, user);
		test.deepEqual(jwk.keyToJson(certInfo.pkey), userKeys.pkey);
		// certificate can be checked for a particular moment in time
		mid.relyingParty.verifyChainAndGetUserKey(
			certChain, issuer, nowSecs+60*60);
		test.throws(() => {
			mid.relyingParty.verifyChainAndGetUserKey(
				certChain, issuer, nowSecs+4*60*60);
		});
		
		test.done();
	}
	
	function checkAssertion(test: nu.Test, rpDomain: string, sessionId: string,
			assertion: jwk.SignedLoad): void {
		
		var nowSecs = Math.floor(Date.now()/1000);
		
		// relying party verifies an assertion
		var assertInfo = mid.relyingParty.verifyAssertion(
			assertion, certChain, issuer, nowSecs);
		test.equal(assertInfo.user, user);
		test.equal(assertInfo.sessionId, sessionId);
		test.equal(assertInfo.relyingPartyDomain, rpDomain);
		// assertion can be checked for a particular moment in time
		mid.relyingParty.verifyAssertion(
			assertion, certChain, issuer, nowSecs+1);
		test.throws(() => {
			mid.relyingParty.verifyAssertion(
				assertion, certChain, issuer, nowSecs+60*60);
		});
	}
	
	export function assertions(test: nu.Test) {
		
		var signer = mid.user.makeMailerIdSigner(
			userKeys.skey, userKeyCert, provider.cert, 20*60);
		
		// service (relying party) generates session id
		var sessionId = base64.pack(getRandom(24));
		
		// user creates signed assertion with given session id inside
		var assertion = signer.generateAssertionFor(rpDomain, sessionId, 10*60);
		checkAssertion(test, rpDomain, sessionId, assertion);
		
		assertion = signer.generateAssertionFor(rpDomain, sessionId);
		checkAssertion(test, rpDomain, sessionId, assertion);
		
		test.done();
	}
	
	function checkKeyCert(test: nu.Test, certForPKey: jwk.SignedLoad,
			pkey: jwk.JsonKey): void {
		
		var nowSecs = Math.floor(Date.now()/1000);
			
		var certInfo = mid.relyingParty.verifyChainAndGetUserKey(
			certChain, issuer, nowSecs);
	
		// peer (relying party) verifies signed key
		var pkeyFromCert = mid.relyingParty.verifyKeyCert(
			certForPKey, certInfo.address, certInfo.pkey, nowSecs);
		test.deepEqual(pkeyFromCert, pkey);
		// certificate can be checked for a particular moment in time
		mid.relyingParty.verifyKeyCert(
			certForPKey, certInfo.address, certInfo.pkey, nowSecs+9*60);
		test.throws(() => {
			mid.relyingParty.verifyKeyCert(
				certForPKey, certInfo.address, certInfo.pkey,
				nowSecs+30*24*60*60+20*60);
		});
	}
	
	export function signingKeys(test: nu.Test) {
		
		var signer = mid.user.makeMailerIdSigner(
			userKeys.skey, userKeyCert, provider.cert, 20*60);
		
		// user signes its public key
		var pkey: jwk.JsonKey = {
			use: 'some use',
			alg: 'some NaCl alg',
			k: 'RkYr4Rf48Z5NOcHEi6mvtiCVFO4bBZsy9LyHQCFjyuw=',
			kid: '12345'
		}
		var certForPKey = signer.certifyPublicKey(pkey, 30*24*60*60);
		checkKeyCert(test, certForPKey, pkey);
		
		test.done();
	}
	
}

module.exports = TestSuite;
