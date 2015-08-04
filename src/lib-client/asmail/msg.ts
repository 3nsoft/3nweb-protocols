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

import utf8 = require('../../lib-common/utf8');
import jwk = require('../../lib-common/jwkeys');
import nacl = require('ecma-nacl');
import delivApi = require('../../lib-common/service-api/asmail/delivery');
import retrievalApi = require('../../lib-common/service-api/asmail/retrieval');
import keyringMod = require('./keyring/index');
import random = require('../random');
import xspUtil = require('../../lib-client/xsp-utils');
import midSigs = require('../../lib-common/mid-sigs-NaCl-Ed');
import Q = require('q');

export interface EncrDataBytes {
	head: Uint8Array;
	segs: Uint8Array[];
}

function countTotalLength(bytes: EncrDataBytes): number {
	var totalLen = bytes.head.length;
	for (var i=0; i<bytes.segs.length; i+=1) {
		totalLen += bytes.segs[i].length;
	}
	return totalLen;
}

export interface MsgPart<T> {
	data: T;
	encrBytes: EncrDataBytes;
	id: string;
}

export interface MainData {
	[field: string]: any;
}

export interface MetaForEstablishedKeyPair {
	pid: string;
}

export interface MetaForNewKey {
	recipientKid: string;
	senderPKey: string;
}

export interface SuggestedNextKeyPair {
	pids: string[];
	senderKid: string;
	recipientPKey: jwk.JsonKeyShort;
	invitation?: string;
}

export interface CryptoCertification {
	keyCert: jwk.SignedLoad;
	senderCert: jwk.SignedLoad;
	provCert: jwk.SignedLoad;
}

export var HEADERS = {
	SUBJECT: 'Subject',
	DO_NOT_REPLY: 'Do Not Reply'
};

var MANAGED_FIELDS = {
	BODY: 'Body',
	NEXT_CRYPTO: 'Next Crypto',
	CRYPTO_CERTIF: 'Crypto Certification',
	ATTACHMENTS: 'Attachments'
};
var isManagedField = (() => {
	var fieldsInLowCase: string[] = [];
	for (var fName in MANAGED_FIELDS) {
		fieldsInLowCase.push(MANAGED_FIELDS[fName].toLowerCase());
	}
	return (name: string) => {
		return (fieldsInLowCase.indexOf(name.toLowerCase()) > -1);
	};
})();

export interface MainBody {
	text?: {
		plain?: string;
	}
}

var SEG_SIZE_IN_K_QUATS = 16;

function encryptByteArray(plainBytes: Uint8Array,
		mkeyEnc: nacl.secret_box.Encryptor): EncrDataBytes {
	var keyHolder = nacl.fileXSP.makeNewFileKeyHolder(mkeyEnc, random.bytes);
	var w = keyHolder.newSegWriter(SEG_SIZE_IN_K_QUATS, random.bytes);
	w.setContentLength(plainBytes.length);
	var head = w.packHeader(mkeyEnc);
	var segs: Uint8Array[] = [];
	var offset = 0;
	var segInd = 0;
	var encRes: { dataLen: number; seg: Uint8Array };
	while (offset < plainBytes.length) {
		encRes = w.packSeg(plainBytes.subarray(offset), segInd);
		offset += encRes.dataLen;
		segInd += 1;
		segs.push(encRes.seg);
	}
	var encBytes: EncrDataBytes = {
		head: head,
		segs: segs
	};
	Object.freeze(encBytes.segs);
	Object.freeze(encBytes);
	w.destroy();
	keyHolder.destroy();
	return encBytes;
}

function encryptJSON(json: any, mkeyEnc: nacl.secret_box.Encryptor):
		EncrDataBytes {
	var plainBytes = utf8.pack(JSON.stringify(json));
	return encryptByteArray(plainBytes, mkeyEnc);
}

export interface SendReadyForm {
	meta: delivApi.msgMeta.Request;
	bytes: {
		[id: string]: EncrDataBytes;
	};
	totalLen: number;
}

export class MsgPacker {
	
	meta: MetaForEstablishedKeyPair | MetaForNewKey;
	main: MsgPart<MainData>;
	private allObjs: { [id: string]: MsgPart<any>; };
	
	constructor() {
		this.meta = null;
		this.allObjs = {};
		this.main = this.addMsgPart(<MainData> {});
		Object.seal(this);
	}

	private addMsgPart<T>(data: T): MsgPart<T> {
		var id: string;
		do {
			id = random.stringOfB64UrlSafeChars(4);
		} while (this.allObjs[id]);
		var p: MsgPart<T> = {
			data: data,
			id: id,
			encrBytes: null
		};
		Object.seal(p);
		this.allObjs[id] = p;
		return p;
	}

	/**
	 * This sets a plain text body.
	 * @param text
	 */
	setPlainTextBody(text: string): void {
		this.main.data[MANAGED_FIELDS.BODY] = {
			text: { plain: text }
		};
	}

	/**
	 * This sets named header to a given value.
	 * These headers go into main object, which is encrypted.
	 * @param name
	 * @param value can be string, number, or json.
	 */
	setHeader(name: string, value: any): void {
		if (isManagedField(name)) { throw new Error(
			"Cannot directly set message field '"+name+"'."); }
		this.main.data[name] = JSON.parse(JSON.stringify(value));
	}
	
	setMetaForEstablishedKeyPair(pid: string): void {
		if (this.meta) { throw new Error(
			"Message metadata has already been set."); }
		this.meta = <MetaForEstablishedKeyPair> {
			pid: pid,
		};
		Object.freeze(this.meta);
	}
	
	setMetaForNewKey(recipientKid: string, senderPKey: string,
			keyCert: jwk.SignedLoad, senderCert: jwk.SignedLoad,
			provCert: jwk.SignedLoad): void {
		if (this.meta) { throw new Error(
			"Message metadata has already been set."); }
		this.meta = <MetaForNewKey> {
			recipientKid: recipientKid,
			senderPKey: senderPKey,
		};
		Object.freeze(this.meta);
		this.main.data[MANAGED_FIELDS.CRYPTO_CERTIF] = <CryptoCertification> {
			keyCert: keyCert,
			senderCert: senderCert,
			provCert: provCert
		};
	}
	
	setNextKeyPair(pair: SuggestedNextKeyPair): void {
		if (this.main.data[MANAGED_FIELDS.NEXT_CRYPTO]) { throw new Error(
			"Next Crypto has already been set in the message."); }
		this.main.data[MANAGED_FIELDS.NEXT_CRYPTO] = pair;
	}

	private toSendForm(): SendReadyForm {
		if (!this.meta) { throw new Error("Metadata has not been set."); }
		var meta: delivApi.msgMeta.Request = JSON.parse(JSON.stringify(this.meta));
		meta.objIds = [ this.main.id ];
		var bytes: { [id: string]: EncrDataBytes; } = {};
		var totalLen = 0;
		var msgPart: MsgPart<any>;
		for (var id in this.allObjs) {
			msgPart = this.allObjs[id];
			if (!msgPart.encrBytes) { throw new Error(
				"Message object "+id+"is not encrypted."); }
			bytes[id] = msgPart.encrBytes;
			totalLen += countTotalLength(msgPart.encrBytes);
			if (id !== this.main.id) {
				meta.objIds.push(id);
			}
		}
		return {
			meta: meta,
			bytes: bytes,
			totalLen: totalLen
		};
	}
	
	private throwupOnMissingParts() {
		if (!this.meta) { throw new Error("Message meta is not set"); }
		if (!this.main.data[HEADERS.DO_NOT_REPLY] &&
				!this.main.data[MANAGED_FIELDS.NEXT_CRYPTO]) { throw new Error(
			"Next Crypto is not set."); }
		if (!this.main.data[MANAGED_FIELDS.BODY]) { throw new Error(
			"Message Body is not set."); }
		if ((<MetaForNewKey> this.meta).senderPKey &&
				!this.main.data[MANAGED_FIELDS.CRYPTO_CERTIF]) { throw new Error(
			"Sender's key certification is missing."); }
	}
	
	encrypt(mkeyEnc: nacl.secret_box.Encryptor): SendReadyForm {
		this.throwupOnMissingParts();
		if (Object.keys(this.allObjs).length > 1) { throw new Error(
			"This test implementation is not encrypting multi-part messages"); }
		this.main.encrBytes = encryptJSON(this.main.data, mkeyEnc);
		return this.toSendForm();
	}
	
}
Object.freeze(MsgPacker.prototype);
Object.freeze(MsgPacker);

/**
 * @param address
 * @return a domain portion from a given address.
 */
function getDomainFrom(address: string): string {
	if (address.length === 0) { throw new Error(
		"Empty string is given as address."); }
	var indOfAt = address.lastIndexOf('@');
	if (indOfAt < 0) { return address; }
	var domain = address.substring(indOfAt+1);
	if (domain.length === 0) { throw new Error(
		"Domain portion in given address is empty"); }
	return domain;
}

export class MsgOpener {
	
	msgId: string;
	meta: retrievalApi.msgMetadata.Reply;
	totalSize: number;
	
	private senderAddress: string = null;
	private senderKeyInfo: string = null;
	get sender(): { address: string; usedKeyInfo: string; } {
		if (!this.senderKeyInfo) { throw new Error("Sender is not set."); }
		return {
			address: this.senderAddress,
			usedKeyInfo: this.senderKeyInfo
		};
	}
	
	private mainObjReader: nacl.fileXSP.SegmentsReader = null;
	private mainDatum: MainData;
	get main(): MainData {
		return this.mainDatum;
	}
	
	constructor(msgId: string, meta: retrievalApi.msgMetadata.Reply) {
		this.msgId = msgId;
		this.meta = meta;
		this.totalSize = 0;
		if (this.meta.extMeta.objIds.length === 0) {
			throw new Error("There are no obj ids.");
		}
		this.meta.extMeta.objIds.forEach((objId) => {
			var objSize = this.meta.objSizes[objId];
			if (!objSize) { return; }
			this.totalSize += objSize.header;
			this.totalSize += objSize.segments;
		});
	}
	
	setCrypto(decrInfo: keyringMod.DecryptorWithInfo, mainHeader: Uint8Array):
			void {
		var kh = nacl.fileXSP.makeFileKeyHolder(decrInfo.decryptor, mainHeader);
		this.mainObjReader = kh.segReader(mainHeader);
		this.senderKeyInfo = decrInfo.cryptoStatus;
		if (decrInfo.correspondent) {
			this.senderAddress = decrInfo.correspondent;
		}
	}
	
	isCryptoSet(): boolean {
		return !!this.mainObjReader;
	}
	
	setMain(mainObjSegs: Uint8Array,
			midRootCert?: (domain: string) => Q.Promise<
				{ cert: jwk.SignedLoad; domain: string; }>):
			Q.Promise<void> {
		if (this.mainDatum) { throw new Error("Main has already been set."); }
		if (!this.mainObjReader) { throw new Error("Crypto is not set"); }
		var bytes = xspUtil.openAllSegs(this.mainObjReader, mainObjSegs);
		var main: MainData = JSON.parse(utf8.open(bytes));
		if (this.senderAddress) {
			this.mainDatum = main;
			return Q.when();
		}
		if ('function' !== typeof midRootCert) { throw new Error(
			"Certificate verifier is not given, when it is needed for "+
			"verification of sender's introductory key, and sender's "+
			"identity."); }
		if (!this.meta.extMeta.senderPKey) { throw new Error(
			"Sender key is missing in external meta, while message's "+
			"sender is not known, which is possible only when sender "+
			"key is given in external meta."); }
		var currentCryptoCert = <CryptoCertification>
			main[MANAGED_FIELDS.CRYPTO_CERTIF];
		var senderPKeyCert = jwk.getKeyCert(currentCryptoCert.keyCert);
		if (senderPKeyCert.cert.publicKey.k !==
				this.meta.extMeta.senderPKey) {
			this.mainObjReader = null;
			return Q.reject<void>(new Error("Sender's key used for encryption "+
				"is not the same as the one, provided with certificates "+
				"in the message."));
		}
		var senderAddress = senderPKeyCert.cert.principal.address;
		if (this.meta.authSender && (this.meta.authSender !== senderAddress)) {
			throw new Error("Sender address, used in authentication to "+
				"server, is not the same as the one used for athentication "+
				"of an introductory key");
		}
		var senderDomain = getDomainFrom(senderAddress);
		var promise = midRootCert(senderDomain)
		.then((rootInfo) => {
			var validAt = Math.round(this.meta.deliveryCompletion/1000);
			midSigs.relyingParty.verifyPubKey(
				currentCryptoCert.keyCert, senderAddress,
				{ user: currentCryptoCert.senderCert,
					prov: currentCryptoCert.provCert,
					root: rootInfo.cert },
				rootInfo.domain, validAt);
			this.senderAddress = senderAddress;
			this.mainDatum = main;
		});
		return promise;
	}
	
	getMainBody(): MainBody {
		if (!this.main) { throw new Error("Main message part is not set."); }
		var body = this.main[MANAGED_FIELDS.BODY];
		if (!body) { throw new Error("Body is missing in the main part."); }
		return body;
	}
	
	getNextCrypto(): SuggestedNextKeyPair {
		if (!this.main) { throw new Error("Main message part is not set."); }
		return this.main[MANAGED_FIELDS.NEXT_CRYPTO];
	}
	
}
Object.freeze(MsgOpener.prototype);
Object.freeze(MsgOpener);

Object.freeze(exports);