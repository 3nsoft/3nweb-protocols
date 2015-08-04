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
import recipientMod = require('../../../lib-client/asmail/recipient');
import log = require('../../../lib-client/page-logging');
import idManage = require('../identity-management');
import keyringMod = require('../../../lib-client/asmail/keyring/index');
import msgMod = require('../../../lib-client/asmail/msg');
import nacl = require('ecma-nacl');
import xhrUtil = require('../../../lib-client/xhr-utils');
import jwk = require('../../../lib-common/jwkeys');

// These declared variables should be initialized in window by other script(s)
declare var mailerIdentity: idManage.IdManager;
declare var keyring: keyringMod.KeyRing;
declare var inbox: {
	msgs: msgMod.MsgOpener[];
	lastMsgTS: number;
};

var msgReceiver: recipientMod.MailRecipient = null;
function openInbox(): Q.Promise<recipientMod.MailRecipient> {
	if (msgReceiver && msgReceiver.sessionId) {
		return Q.when(msgReceiver);
	}
	log.write("Starting session for message retrieval ...");
	msgReceiver = new recipientMod.MailRecipient(mailerIdentity.getId());
	var promise = msgReceiver.setRetrievalUrl('https://localhost:8080/asmail')
	.then(() => {
		if (mailerIdentity.isProvisionedAndValid()) {
			log.write("Reusing already provisioned MailerId assertion " +
					"signer for "+msgReceiver.userId);
			return mailerIdentity.getSigner();
		} else{
			log.write("Start provisioning MailerId assertion signer for "+
					msgReceiver.userId);
			return mailerIdentity.provision()
			.then(() => {
				log.write(msgReceiver.userId+
					" can now be authorized by MailerId assertion.");
				return mailerIdentity.getSigner();
			});
		}
	})
	.then((midSigner) => {
		return msgReceiver.login(midSigner)
		.then(() => {
			log.write("LOGED IN: opened session "+msgReceiver.sessionId);
			return msgReceiver;
		});
	});
	return promise;
}

function getMsgMetaAndSetOpener(msgIds: string[], i = 0): Q.Promise<void> {
	if (i >= msgIds.length) { return; }
	var msgId = msgIds[i];
	log.write("Getting a metadata object for message "+msgId);
	return msgReceiver.getMsgMeta(msgId)
	.then((meta) => {
		log.write("MSG META REQUEST: status 200 -- for msg "+msgId);
		var msg = new msgMod.MsgOpener(msgId, meta);
		inbox.msgs.push(msg);
		var decrs = keyring.getDecryptorFor(msg.meta.extMeta);
		if (decrs) {
			log.write("Found "+decrs.length+" keys, based on metadata for msg "+
				msgId+". Will try if any fits.");
		} else {
			log.write("No keys found to decrypt msg "+msgId);
			return;
		}
		return msgReceiver.getObjHead(msg.msgId, msg.meta.extMeta.objIds[0])
		.then((header) => {
			for (var i=0; i<decrs.length; i+=1) {
				try {
					msg.setCrypto(decrs[i], header);
					break;
				} catch (err) {
					if (!(<any> err).failedCipherVerification) { throw err; }
				}
			}
			for (var i=0; i<decrs.length; i+=1) {
				decrs[i].decryptor.destroy();
			}
			if (msg.isCryptoSet()) {
				log.write("Decryptor is set for msg "+msgId);
			} else {
				log.write("No keys are found to be able to open msg "+msgId);
			}
		})
		
	})
	.then(() => {
		if ((i+1) < msgIds.length) {
			return getMsgMetaAndSetOpener(msgIds, i+1);
		}
	});
}

function sizeToReadableForm(s: number): string {
	if (s > 1024*1024*1024) {
		return Math.round(s/(1024*1024*1024)*10)/10+' GBs';
	} else if (s > 1024*1024) {
		return Math.round(s/(1024*1024)*10)/10+' MBs';
	} else if (s > 1024) {
		return Math.round(s/1024*10)/10+' KBs';
	} else {
		return s+' Bs';
	}
	
}

function updateMsgList(): void {
	var tbody = $('#msg-inbox > tbody');
	tbody.empty();
	if (inbox.msgs.length === 0) {
		tbody.append('<tr><td colspan="7">No Messages</td></tr>');
		return;
	}
	inbox.msgs.forEach((msg, i) => {
		var tr = document.createElement('tr');
		// 1st column: Date -- show time when deivery was completed
		var td = document.createElement('td');
		$(td).text((new Date(msg.meta.deliveryCompletion)).toISOString());
		tr.appendChild(td);
		// 2nd column: server's msg id
		td = document.createElement('td');
		$(td).text(msg.msgId.substring(0, 9)+'...');
		tr.appendChild(td);
		// 3rd column: msg size
		td = document.createElement('td');
		$(td).text(sizeToReadableForm(msg.totalSize));
		tr.appendChild(td);
		// 4th column: information about keys
		td = document.createElement('td');
		if (msg.meta.extMeta.pid) {
			$(td).text('Established key pair: '+msg.meta.extMeta.pid);
		} else {
			$(td).text('Intro key used: '+
				msg.meta.extMeta.recipientKid.substring(0, 9)+'...');
		}
		tr.appendChild(td);
		// 5th column: status
		td = document.createElement('td');
		if (msg.isCryptoSet()) {
			$(td).text('Keys found');
		} else {
			$(td).text('Keys not found');
		}
		tr.appendChild(td);
		// 6th column: status
		td = document.createElement('td');
		if (msg.isCryptoSet()) {
			if (msg.sender.address) {
				$(td).text(msg.sender.address);
			} else {
				$(td).text("Will be verified on opening main");
			}
		}
		tr.appendChild(td);
		// 7th column: action buttons
		td = document.createElement('td');
		var htmlWithButtons = '';
		if (msg.isCryptoSet()) {
			htmlWithButtons += '<button class="btn btn-primary btn-sm"'+
				'onclick="mailCtrl.openMsg('+i+')">Open</button>';
		}
		htmlWithButtons += '<button class="btn btn-warning btn-sm"'+
			'onclick="mailCtrl.rmMsg('+i+')">Remove</button>';
		$(td).html(htmlWithButtons);
		tr.appendChild(td);
		// append this row
		tbody.append(tr);
	});
}

export function listMsgs() {
	try {
		log.clear();
		openInbox()
		.then(() => {
			log.write("Getting a list of messages");
			return msgReceiver.listMsgs();
		})
		.then((msgIds) => {
			log.write("LIST MESSAGES REQUEST: status 200 -- there are "+
					msgIds.length+" messages available.");
			// filter out already known messages
			msgIds = msgIds.filter((msgId) => {
				return !inbox.msgs.some((msg) => {
					return msg.msgId === msgId;
				});
			});
			if (msgIds.length === 0) {
				log.write("There are no new messages.");
				return;
			}
			return getMsgMetaAndSetOpener(msgIds);
		})
		.then(() => {
			if (inbox.msgs.length === 0) { return; }
			inbox.msgs = inbox.msgs.sort((a, b) => {
				return (a.meta.deliveryCompletion - b.meta.deliveryCompletion);
			});
			inbox.lastMsgTS =
				inbox.msgs[inbox.msgs.length-1].meta.deliveryCompletion;
			updateMsgList();
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

export function rmMsg(msgInd: number): void {
	try {
		log.clear();
		var msg = inbox.msgs[msgInd];
		if (!msg) {
			updateMsgList();
			return;
		}
		openInbox()
		.then(() => {
			log.write("Removing message "+msg.msgId);
			return msgReceiver.removeMsg(msg.msgId);
		})
		.then(() => {
			inbox.msgs.splice(msgInd, 1);
			updateMsgList();
		}, (err: xhrUtil.HttpError) => {
			if (err.status == 474) {
				inbox.msgs.splice(msgInd, 1);
			}
			updateMsgList();
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

function displayPlainTextMsg(msg: msgMod.MsgOpener): void {
	var msgDisplay = $('#msg-display');
	var bodyTxt = msg.getMainBody().text.plain;
	var txtDisplay = msgDisplay.find('.msg-plain-txt');
	if (bodyTxt) { bodyTxt.split(/\r?\n/).forEach((txt) => {
		var p = document.createElement('p');
		$(p).text(txt);
		txtDisplay.append(p);
	}); }
	var subject = msg.main[msgMod.HEADERS.SUBJECT];
	msgDisplay.find('.msg-subject').text(subject ? subject : '');
	msgDisplay.find('.sender-addr').text(msg.sender.address);
	var trust: string;
	if (msg.sender.usedKeyInfo === keyringMod.KEY_ROLE.SUGGESTED) {
		trust = "Sender of this message is cryptographically trusted, as (s)he "+
			"uses established key chain, and, in particular, this message "+
			"is encrypted to recently suggested pair, which hasn't been used, "+
			"till now.";
	} else if (msg.sender.usedKeyInfo === keyringMod.KEY_ROLE.IN_USE) {
		trust = "Sender of this message is cryptographically trusted, as (s)he "+
			"uses established key chain, and, in particular, this message "+
			"is encrypted to recently a pair, which has already been used.";
	} else if (msg.sender.usedKeyInfo === keyringMod.KEY_ROLE.OLD) {
		trust = "Sender of this message is cryptographically trusted, as (s)he "+
			"uses established key chain. But, this message is encrypted to "+
			"an old pair, which has already been superseded by a new one.";
	} else if (msg.sender.usedKeyInfo === keyringMod.KEY_ROLE.PUBLISHED_INTRO) {
		trust = (keyring.isKnownCorrespondent(msg.sender.address) ?
			"Sender used currently published introductory key, as a stranger, "+
			"but (s)he is already added to a keyring as a trusted party." :
			"Sender of this message is a stranger, as (s)he uses an "+
			"introductory key, currently published on server.");
	} else if (msg.sender.usedKeyInfo ===
			keyringMod.KEY_ROLE.PREVIOUSLY_PUBLISHED_INTRO) {
		trust = (keyring.isKnownCorrespondent(msg.sender.address) ?
			"Sender used previously published introductory key, as a stranger, "+
			"but (s)he is already added to keyring as a trusted party." :
			"Sender of this message is a stranger, as (s)he uses an "+
			"introductory key, previously published on server.");
	} else if (msg.sender.usedKeyInfo === keyringMod.KEY_ROLE.INTRODUCTORY) {
		trust = (keyring.isKnownCorrespondent(msg.sender.address) ?
			"Sender used offline introductory key, as a stranger, "+
			"but (s)he is already added to a keyring as a trusted party." :
			"Sender of this message is a stranger, as (s)he uses an "+
			"introductory key, distributed not through the server.");
	} else {
		trust = ">>> Program encounted unimplemented key role <<<";
	}
	msgDisplay.find('.sender-trust').text(trust);
	var startTrustBtn = msgDisplay.find('.start-trust');
	if (keyring.isKnownCorrespondent(msg.sender.address)) {
		startTrustBtn.css('display', 'none').off();
		keyring.absorbSuggestedNextKeyPair(msg.sender.address,
				msg.getNextCrypto(), msg.meta.deliveryStart);
	} else {
		startTrustBtn.css('display', 'block')
		.click((): void => {
			keyring.absorbSuggestedNextKeyPair(msg.sender.address,
				msg.getNextCrypto(), msg.meta.deliveryStart);
			startTrustBtn.css('display', 'none').off();
		});
	}
	msgDisplay.css('display', 'block');
}

export function closeMsgView() {
	var msgDisplay = $('#msg-display');
	msgDisplay.css('display', 'none');
	msgDisplay.find('.msg-plain-txt').empty();
	msgDisplay.find('.msg-subject').empty();
	msgDisplay.find('.sender-addr').empty();
	msgDisplay.find('.start-trust').css('display', 'none').off();
}

function getMidRoot (domain: string):
		Q.Promise<{ cert: jwk.SignedLoad; domain: string; }> {
	log.write("To verify sender's introductory key, we need to get MailerId "+
		"root certificate. A DNS look up should be done here to "+
		"located sender's MailerId service. In this test we "+
		"assume that location is https://localhost:8080/mailerid");
	return serviceLocator.mailerIdInfoAt('https://localhost:8080/mailerid')
	.then((data) => {
		log.write("Response from https://localhost:8080/mailerid "+
			"provides a current MailerId root certificate.");
		return { cert: data.currentCert, domain: 'localhost' };
	});
						
}

export function openMsg(msgInd: number): void {
	try {
		log.clear();
		var msg = inbox.msgs[msgInd];
		if (!msg) {
			updateMsgList();
			return;
		}
		
		var promiseToOpenMain: Q.Promise<void>;
		if (msg.main) {
			promiseToOpenMain = Q.when();
		} else if (!msg.isCryptoSet()) {
			updateMsgList();
			return;
		} else {
			promiseToOpenMain = openInbox()
			.then(() => {
				log.write("Downloading all segments of main object (id: "+
					msg.meta.extMeta.objIds[0]+") in one request.");
				return msgReceiver.getObjSegs(msg.msgId,
					msg.meta.extMeta.objIds[0]);
			})
			.then((bytes) => {
				log.write("Decrypting main object.");
				if (msg.sender.address) {
					return msg.setMain(bytes)
					.then(() => {
						keyring.absorbSuggestedNextKeyPair(msg.sender.address,
							msg.getNextCrypto(), msg.meta.deliveryStart);
					});
				} else {
					return msg.setMain(bytes, getMidRoot);
				}
			});
		}
		
		promiseToOpenMain
		.then(() => {
			var b = msg.getMainBody();
			if (b.text && ('string' === typeof b.text.plain)) {
				displayPlainTextMsg(msg);
			} else {
				alert("Display of other\n message types\n is not implemented.");
			}
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