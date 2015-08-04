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

import serviceLocator = require('../../../lib-client/service-locator');
import Q = require('q');
import senderMod = require('../../../lib-client/asmail/sender');
import msgMod = require('../../../lib-client/asmail/msg');
import log = require('../../../lib-client/page-logging');
import idManage = require('../identity-management');
import keyringMod = require('../../../lib-client/asmail/keyring/index');
import jwk = require('../../../lib-common/jwkeys');
import midSigs = require('../../../lib-common/mid-sigs-NaCl-Ed');
import confApi = require('../../../lib-common/service-api/asmail/config');
import mailConf = require('./mail-conf');

// These declared variables should be initialized in window by other script(s)
declare var mailerIdentity: idManage.IdManager;
declare var keyring: keyringMod.KeyRing;

export function sendPreFlight(form: any): void {
	try{
		log.clear();
		
		var needsAuth = form.auth.checked;
		var recipient = form.recipient.value;
		var sender = (needsAuth ? mailerIdentity.getId() : null);
		
		if (!recipient) {
			alert("Recipient's address is missing");
			form.recipient.focus();
			return;
		}
		
		log.write("Making a pre-flight request ...");
		
		var inviteToken = keyring.getInviteForSendingTo(recipient);
		var mSender = (inviteToken ?
			new senderMod.MailSender(sender, recipient, inviteToken) :
			new senderMod.MailSender(sender, recipient));
		mSender.setDeliveryUrl('https://localhost:8080/asmail')
		.then(() => {
			log.write("Response from https://localhost:8080/asmail "+
				"tells that message delivery should be done at "+
				mSender.deliveryURI);
			return mSender.performPreFlight()
			.then(() => {
				log.write("PRE-FLIGHT: status 200 -- OK, maximum message "+
						"size is "+mSender.maxMsgLength+" bytes.");
			}, (err) => {
				if (err.status == 474) {
					log.write("PRE-FLIGHT: status 474 -- unknown recipient. " +
							"Server says: "+err.message);
					err.noReport = true;
				} else if (err.status == 403) {
					log.write("PRE-FLIGHT: status 403 -- leaving mail is not " +
							"allowed. Server says: "+err.message);
					err.noReport = true;
				} else if (err.status == 480) {
					log.write("PRE-FLIGHT: status 480 -- mailbox is full. "+
							"Server says: "+err.message);
					err.noReport = true;
				}
				throw err;
			});
		})
		.fail((err) => {
			if (err.noReport) { return; }
			log.write("ERROR: "+err.message);
			console.error('Error in file '+err.fileName+' at '+
					err.lineNumber+': '+err.message);
		})
		.done();
	} catch (err) {
		console.error(err);
	}
}

function extractMsg(form: any): msgMod.MsgPacker {
	var msg = new msgMod.MsgPacker();
	msg.setPlainTextBody(form.msgTextBody.value);
	msg.setHeader('Subject', form.msgSubject.value);
	msg.setHeader('From', mailerIdentity.getId());
	msg.setHeader('To', form.recipient.value);
	return msg;
}

function sendObj(mSender: senderMod.MailSender, objId: string,
		bytes: msgMod.EncrDataBytes): Q.Promise<void> {
	var offset: number = null;
	function sendHead(isFirst?: boolean): Q.Promise<void> {
		if (isFirst) { offset = 0; }
		var chunkSize = Math.min(bytes.head.length-offset, mSender.maxChunkSize);
		var chunk = bytes.head.subarray(offset, offset+chunkSize);
		return mSender.sendObjHeadChunk(objId, offset, chunk,
			(isFirst ? bytes.head.length : null))
		.then(() => {
			offset += chunkSize;
			if (offset < bytes.head.length) {
				return sendHead();
			}
		});
	}
	var segsLen = 0;
	for (var i=0; i<bytes.segs.length; i+=1) {
		segsLen += bytes.segs[i].length;
	}
	var segInd = 0;
	var posInSeg = 0;
	function sendSegs(isFirst?: boolean): Q.Promise<void> {
		if (segInd >= bytes.segs.length) { return; }
		if (isFirst) { offset = 0; }
		var chunk = new Uint8Array(Math.min(mSender.maxChunkSize, segsLen));
		var ofs = 0;
		var d: number;
		var seg: Uint8Array;
		while (ofs < chunk.length) {
			seg = bytes.segs[segInd];
			d = seg.length - posInSeg;
			d = Math.min(d, chunk.length - ofs);
			chunk.set(seg.subarray(posInSeg, posInSeg+d), ofs);
			ofs += d;
			posInSeg += d;
			if (posInSeg === seg.length) {
				segInd += 1;
				posInSeg = 0;
			}
		}
		chunk = chunk.subarray(0, ofs);
		return mSender.sendObjSegsChunk(objId, offset, chunk,
			(isFirst ? segsLen : null))
		.then(() => {
			offset += ofs;
			if (offset < segsLen) {
				sendSegs();
			}
		});
	}
	var promise = sendHead(true)
	.then(() => {
		return sendSegs(true);
	})
	return promise;
}

function extractAndVerifyPKey(address: string,
		certs: confApi.p.initPubKey.Certs, validAt: number,
		rootCert: jwk.SignedLoad, rootAddr: string): jwk.JsonKey {
	try {
		return midSigs.relyingParty.verifyPubKey(certs.pkeyCert, address,
			{ user: certs.userCert, prov: certs.provCert, root: rootCert },
			rootAddr, validAt);
	} catch (e) {
		return null;
	}
}

export function sendMsg(form) {
	try{
		log.clear();
		
		var needsAuth = form.auth.checked;
		var recipient = form.recipient.value;
		var sender = (needsAuth ? mailerIdentity.getId() : null);
		var msg = extractMsg(form);
		
		if (!recipient) {
			alert("Recipient's address is missing");
			form.recipient.focus();
			return;
		}
		
		log.write("Sending a message ...");
		
		var inviteToSendNow = keyring.getInviteForSendingTo(recipient);
		var mSender = (inviteToSendNow ?
			new senderMod.MailSender(sender, recipient, inviteToSendNow) :
			new senderMod.MailSender(sender, recipient));
		var promise: Q.Promise<any> = mSender.setDeliveryUrl(
			'https://localhost:8080/asmail')
		.then(() => {
			log.write("Response from https://localhost:8080/asmail "+
				"tells that message delivery should be done at "+
				mSender.deliveryURI);
		})
		// 1st request
		.then(() => {
			return mSender.startSession()
			.then(() => {
				log.write(
					"1st REQUEST: status 200 -- OK, maximum message size is "+
					mSender.maxMsgLength+" bytes.");
			}, ((err) => {
				if (err.status == 474) {
					log.write("1st REQUEST: status 474 -- unknown recipient. "+
							"Server says: "+err.message);
					err.noReport = true;
				} else if (err.status == 403) {
					log.write("1st REQUEST: status 403 -- leaving mail is " +
							"not allowed. Server says: "+err.message);
					err.noReport = true;
				} else if (err.status == 480) {
					log.write("1st REQUEST: status 480 -- mailbox is full. "+
							"Server says: "+err.message);
					err.noReport = true;
				}
				throw err;
			}));
		});
		
		// 2nd request, applicable only to authenticated sending
		if (sender) {
			promise = promise
			.then(() => {
				if (mailerIdentity.isProvisionedAndValid()) {
					log.write("Reusing already provisioned MailerId assertion "+
						"signer for "+mSender.sender);
				} else {
					log.write(
						"Start provisioning MailerId assertion signer for "+
						mSender.sender);
				}
				return mailerIdentity.getSigner();
			})
			.then((signer) => {
				log.write(mSender.sender+
					" can now be authorized by MailerId assertion.");
				return mSender.authorizeSender(signer)
				.then(() => {
					log.write("2nd REQUEST: status 200 -- OK, sender address "+
						mSender.sender+" has been successfully authenticated.");
				}, <any> ((err) => {
					if (err.status == 403) {
						log.write("2nd REQUEST: status 403 -- authentication "+
							"failure. Server says: "+err.message);
					}
					err.noReport = true;
					throw err;
				}));
			});
		}
		
		var introPKeyFromServer: jwk.JsonKey = null; 
		
		promise
		.then(() => {
			// 3rd request, is needed only when recipient is not known
			if (keyring.isKnownCorrespondent(mSender.recipient)) {
				log.write(
					"There are "+mSender.recipient+" keys in the keyring. "+
					"3rd request is skipped, and keys from a keyring will "+
					"be used.");
				return;
			}
			log.write("There is a need to look up "+mSender.recipient+
					" introductory key on the mail server.");
			return mSender.getRecipientsInitPubKey()
			.then((certs) => {
				log.write("3rd REQUEST: status 200 --received "+
					mSender.recipient+" public key certificates.");
				return certs;
			}, <any> ((err) => {
				if (err.status == 474) {
					log.write(
						"3rd REQUEST: status 474 -- no public key found " +
						"on the server. Server says: "+err.message);
					log.writeLink("Set test keys for "+mSender.recipient,
						"#config", true);
					err.noReport = true;
					throw err;
				}
			}))
			// verify recipient's key certificates
			.then((certs) => {
				log.write("To verify recipient's key, we need to get MailerId "+
					"root certificate. A DNS look up should be done here to "+
					"located recipient's MailerId service. In this test we "+
					"assume that location is https://localhost:8080/mailerid");
				return serviceLocator.mailerIdInfoAt(
					'https://localhost:8080/mailerid')
				.then((data) => {
					log.write("Response from https://localhost:8080/mailerid "+
						"provides a current MailerId root certificate.");
					var rootCert = data.currentCert;
					var rootAddr = 'localhost';
					var now = Date.now() / 1000;
					var pkey = extractAndVerifyPKey(mSender.recipient, certs,
						now, rootCert, rootAddr);
					if (pkey) {
						log.write("Certificates for "+mSender.recipient+
							" passes validation.");
						introPKeyFromServer = pkey;
					} else {
						log.writeLink("Update test keys for "+mSender.recipient+
							" as those on file fail verificattion.",
							"#config", true);
						throw new Error("Public key certificates for "+
							mSender.recipient+" fail verification.");
					}
				});
			});
		})
		.then(() => {
			return mailConf.getSingleAnonSenderInvite();
		})
		.then((inviteForReplies) => {
			// encrypting message
			var msgCrypto = keyring.generateKeysForSendingTo(
				mSender.recipient, inviteForReplies, introPKeyFromServer);
			msg.setNextKeyPair(msgCrypto.pairs.next);
			var maxChunkSize: number = null;
			var dataToSend: msgMod.SendReadyForm = null;
			var prom: Q.Promise<any>;
			if (msgCrypto.pairs.current.pid) {
				msg.setMetaForEstablishedKeyPair(msgCrypto.pairs.current.pid);
				log.write("Encrypting current message to established pair '"+
					(<msgMod.MetaForEstablishedKeyPair> msg.meta).pid+
					"' and suggesting to use next a new pair '"+
					msg.main.data['Next Crypto'].pid+"'");
				prom = Q.when();
			} else {
				log.write("Encrypting current message to recipient's key '"+
					msgCrypto.pairs.current.recipientKid+"' and a freshly "+
					"generated key '"+msgCrypto.pairs.current.senderPKey.kid+
					"'");
				prom = mailerIdentity.getSigner()
				.then((signer) => {
					log.write("Using MailerId, sign new key '"+
						msgCrypto.pairs.current.senderPKey.kid+
						"', so as to put at least some trust into it.");
					msg.setMetaForNewKey(
						msgCrypto.pairs.current.recipientKid,
						msgCrypto.pairs.current.senderPKey.k,
						signer.certifyPublicKey(
							msgCrypto.pairs.current.senderPKey, 30*24*60*60),
						signer.userCert, signer.providerCert);
				});
			}
			prom = prom.then(() => {
				dataToSend = msg.encrypt(msgCrypto.encryptor);
				msgCrypto.encryptor.destroy();
			})
			// sending metadata
			.then(() => {
				log.write("Sending a plaintext metadata. Notice that it only "+
					"contains info about encryption key(s) and ids of "+
					"objects, that constitute this message.");
				return mSender.sendMetadata(dataToSend.meta);
			})
			.then((resp) => {
				maxChunkSize = resp.maxChunkSize;
				log.write("4th REQUEST: status 201 -- OK. Server assigned "+
					"this message an id '"+mSender.msgId+
					"'. Server indicated that "+maxChunkSize+
					" is a maximum bytes chunk size");
			})
			.then(() => {
				var tasksChain: Q.Promise<void> = null;
				dataToSend.meta.objIds.forEach((objId: string) => {
					if (tasksChain) {
						tasksChain = tasksChain
						.then(() => {
							return sendObj(
								mSender, objId, dataToSend.bytes[objId]);
						});
					} else {
						tasksChain = sendObj(
							mSender, objId, dataToSend.bytes[objId]);
					}
				});
				return tasksChain;
			})
			.then(() => {
				log.write("5th REQUESTs: all have status 201 -- OK. All "+
					"object bytes have been successfully delivered to server.");
				return mSender.completeDelivery();
			})
			.then(() => {
				log.write("6th REQUEST: status 200 -- OK. This request " +
					"finalizes message sending, letting server know that "+
					"it has received the whole of the inteded message.");
				form.reset();
			});
			return prom;
		})
		.fail((err) => {
			if (err.noReport) { return; }
			log.write("ERROR: "+err.message);
			console.error('Error in file '+err.fileName+' at '+
					err.lineNumber+': '+err.message);
		})
		.done();
	} catch (err) {
		console.error(err);
	}
}

Object.freeze(exports);