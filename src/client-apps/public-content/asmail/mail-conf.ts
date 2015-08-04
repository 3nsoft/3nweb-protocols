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

import keyringMod = require('../../../lib-client/asmail/keyring/index');
import mailServConf = require('../../../lib-client/asmail/service-config');
import serviceLocator = require('../../../lib-client/service-locator');
import log = require('../../../lib-client/page-logging');
import fileStorageMod = require('../file-storage');
import idManage = require('../identity-management');
import confApi = require('../../../lib-common/service-api/asmail/config');
import jwk = require('../../../lib-common/jwkeys');
import Q = require('q');
import random = require('../../../lib-client/random');

// These declared variables should be initialized in window by other script(s)
declare var keyring: keyringMod.KeyRing;
declare var mailerIdentity: idManage.IdManager;

function promiseCallWithMailConf(func:
		(mailConf: mailServConf.MailConfigurator) => Q.Promise<void>):
		Q.Promise<void> {
	var mailServiceConf =
		new mailServConf.MailConfigurator(mailerIdentity.getId());
	var promise = mailServiceConf.setConfigUrl('https://localhost:8080/asmail')
	.then(() => {
		return mailerIdentity.getSigner();
	})
	.then((signer) => {
		return mailServiceConf.login(signer);
	})
	.then(() => {
		return func(mailServiceConf);
	})
	.then(() => {
		return mailServiceConf.logout();
	})
	.fail((err) => {
		return mailServiceConf.logout()
		.fail((err) => { });	// swallowing any error on final logout only
	})
	return promise;
}

function callWithMailConf(func:
		(mailConf: mailServConf.MailConfigurator) => Q.Promise<void>): void {
	promiseCallWithMailConf(func)
	.fail((err) => {
		log.write("ERROR: "+err.message);
		console.error('Error in file '+err.fileName+' at '+
				err.lineNumber+': '+err.message);
	})
	.done();
}

function getAndDisplayPubKeyInfo(mailConf: mailServConf.MailConfigurator):
		Q.Promise<void> {
	return mailConf.getInitPubKey()
	.then((certs: confApi.p.initPubKey.Certs) => {
		$('.published-key-id-on-server').text(
			certs ? jwk.getPubKey(certs.pkeyCert).kid : 'not set');
	});
}

export function displayPKeyOnServer(): void {
	callWithMailConf((mailConf: mailServConf.MailConfigurator):
			Q.Promise<void> => {
		log.write("Fetching a public key, registered on the server.");
		return getAndDisplayPubKeyInfo(mailConf);
	});
}

export function init(): Q.Promise<void> {
	return promiseCallWithMailConf((mailConf:
			mailServConf.MailConfigurator): Q.Promise<void> => {
		return mailConf.getInitPubKey()
		.then((certsOnServer: confApi.p.initPubKey.Certs) => {
			if (!certsOnServer) {
				log.write("Public key is not registered on ASMail server.");
			}
			var certsInRing = keyring.getPublishedKeyCerts();
			if (certsInRing) {
				if (!certsOnServer) {
					log.write("Registering existing introductory public key "+
						"on ASMail server.");
					return mailConf.setInitPubKey(certsInRing);
				}
				var kidOnServer = jwk.getPubKey(certsOnServer.pkeyCert).kid
				var kidInRing = jwk.getPubKey(certsInRing.pkeyCert).kid;
				if (kidOnServer === kidInRing) {
					log.write("Introductory key, registered on ASMail server "+
						"is the same as the one in the keyring.");
				} else {
					log.write("Introductory key, registered on ASMail server "+
						"has id '"+kidOnServer+"', while key in the keyring "+
						"has id '"+kidInRing+"'.");
					log.write("Registering correct public key "+
						"on ASMail server.");
					return mailConf.setInitPubKey(certsInRing);
				}
			} else {
				log.write("No introductory key in the keyring.");
				return generateNewIntroKey()
				.then(() => {
					certsInRing = keyring.getPublishedKeyCerts();
					log.write("Registering new public key on ASMail server.");
					return mailConf.setInitPubKey(certsInRing);
				});
			}
		})
		.then(() => {
			return mailConf.getAnonSenderInvites()
			.then((invites) => {
				if(Object.keys(invites).length > 0) {
					log.write("There are invitation tokens for anonymous "+
						"senders registered on ASMail server.");
					return;
				}
				log.write("There are no invitation tokens for anonymous "+
					"senders registered on ASMail server. "+
					"We generate one, and record it with ASMail server.");
				invites[random.stringOfB64Chars(40)] = 1024*1024*1024;
				return mailConf.setAnonSenderInvites(invites);
			});
		});
	});
}

export function getSingleAnonSenderInvite(): Q.Promise<string> {
	var token: string;
	var promise = promiseCallWithMailConf((mailConf:
			mailServConf.MailConfigurator): Q.Promise<void> => {
		return mailConf.getAnonSenderInvites()
		.then((invites) => {
			if(Object.keys(invites).length === 0) {
				log.write("There are no invitation tokens for anonymous "+
					"senders registered on ASMail server. "+
					"We generate one, and record it with ASMail server.");
				token = random.stringOfB64Chars(40);
				invites[token] = 1024*1024*1024;
				return mailConf.setAnonSenderInvites(invites);
			} else {
				token = Object.keys(invites)[0];
			}
		});
	});
	return promise.then(() => { return token; });
}

// XXX may be updating and pushing public key should be one function

export function pushPublishedKeyToServer(): void {
	log.clear();
	callWithMailConf((mailConf: mailServConf.MailConfigurator):
			Q.Promise<void> => {
		log.write("Registering introductory key certificates on the server.");
		var certs = keyring.getPublishedKeyCerts();
		return mailConf.setInitPubKey(certs)
		.then(() => {
			return getAndDisplayPubKeyInfo(mailConf);
		});
	});
}

function generateNewIntroKey(): Q.Promise<void> {
	log.write("Generating new introductory public key and certifying it.");
	return mailerIdentity.getSigner()
	.then((signer) => {
		keyring.updatePublishedKey(signer);
		var kid = jwk.getPubKey(keyring.getPublishedKeyCerts().pkeyCert).kid;
		$('.published-key-id').text(kid);
	})
}

Object.freeze(exports);