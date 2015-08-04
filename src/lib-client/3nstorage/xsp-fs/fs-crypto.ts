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
 * Everything in this module is assumed to be inside of a file system
 * reliance set.
 */

import random = require('../../random');
import Q = require('q');
import nacl = require('ecma-nacl');
import utf8 = require('../../../lib-common/utf8');
import fsMod = require('./fs');
import fsEntitiesMod = require('./fs-entities');
import byteSrcMod = require('../../byte-source');

var SEG_SIZE = 16;	// in 256-byte blocks

export class FileCrypto {
	
	private keyHolder: nacl.fileXSP.FileKeyHolder
	
	constructor(keyHolder: nacl.fileXSP.FileKeyHolder) {
		this.keyHolder = keyHolder;
	}
	
	wipe(): void {
		if (this.keyHolder) {
			this.keyHolder.destroy();
			this.keyHolder = null;
		}
	}
	
	static makeForNewFile(
			parentEnc: nacl.secret_box.Encryptor,
			arrFactory: nacl.arrays.Factory): FileCrypto {
		var keyHolder = nacl.fileXSP.makeNewFileKeyHolder(
			parentEnc, random.bytes, arrFactory);
		parentEnc.destroy();
		var fc = new FileCrypto(keyHolder);
		return fc;
	}
	
	/**
	 * @param parentDecr
	 * @param src for the whole xsp object
	 * @param arrFactory
	 * @return folder crypto object with null mkey, which should be set
	 * somewhere else.
	 */
	static makeForExistingFile(parentDecr: nacl.secret_box.Decryptor,
			headerSrc: byteSrcMod.BytesSource, arrFactory: nacl.arrays.Factory):
			Q.Promise<FileCrypto> {
		var promise = headerSrc.read(0, null, true)
		.then((header) => {
			var keyHolder = nacl.fileXSP.makeFileKeyHolder(
				parentDecr, header, arrFactory);
			parentDecr.destroy();
			return new FileCrypto(keyHolder);
		});
		return promise;
	}
	
	decryptedBytesSource(src: byteSrcMod.ObjBytesSource): byteSrcMod.VersionedBytesSource {
		if (!this.keyHolder) { throw new Error("Cannot use wiped object."); }
		return byteSrcMod.makeDecryptedByteSource(
			src, this.keyHolder.segReader);
	}
	
	encryptingByteSink(objSink: byteSrcMod.ObjBytesSink):
			byteSrcMod.VersionedByteSink {
		if (!this.keyHolder) { throw new Error("Cannot use wiped object."); }
		return byteSrcMod.makeEncryptingByteSink(objSink,
			this.keyHolder.newSegWriter(SEG_SIZE, random.bytes));
	}
	
	pack(bytes: Uint8Array|Uint8Array[]): byteSrcMod.ObjBytesSource {
		if (!this.keyHolder) { throw new Error("Cannot use wiped object."); }
		var segWriter = this.keyHolder.newSegWriter(SEG_SIZE, random.bytes);
		var objSrc = byteSrcMod.makeObjByteSourceFromArrays(bytes, segWriter);
		segWriter.destroy();
		return objSrc;
	}
	
}
Object.freeze(FileCrypto.prototype);
Object.freeze(FileCrypto);

export class FolderCrypto {
	
	private mkey: Uint8Array = null;
	private arrFactory = nacl.arrays.makeFactory();
	private keyHolder: nacl.fileXSP.FileKeyHolder
	
	constructor(keyHolder: nacl.fileXSP.FileKeyHolder) {
		this.keyHolder = keyHolder;
	}
	
	static makeForNewFolder(
			parentEnc: nacl.secret_box.Encryptor,
			arrFactory: nacl.arrays.Factory): FolderCrypto {
		var keyHolder = nacl.fileXSP.makeNewFileKeyHolder(
			parentEnc, random.bytes, arrFactory);
		parentEnc.destroy();
		var fc = new FolderCrypto(keyHolder);
		fc.mkey = random.bytes(nacl.secret_box.KEY_LENGTH);
		return fc;
	}
	
	/**
	 * @param parentDecr
	 * @param objSrc
	 * @param arrFactory
	 * @return folder crypto object with null mkey, which should be set
	 * somewhere else.
	 */
	static makeForExistingFolder(parentDecr: nacl.secret_box.Decryptor,
			objSrc: byteSrcMod.ObjBytesSource, arrFactory: nacl.arrays.Factory):
			Q.Promise<{ crypto: FolderCrypto; folderJson: fsEntitiesMod.FolderJson; }> {
		var keyHolder: nacl.fileXSP.FileKeyHolder;
		var byteSrc = byteSrcMod.makeDecryptedByteSource(objSrc,
			(header: Uint8Array) => {
				keyHolder = nacl.fileXSP.makeFileKeyHolder(
					parentDecr, header, arrFactory);
				parentDecr.destroy();
				return keyHolder.segReader(header);
			});
		return byteSrc.read(0, null, true)
		.then((bytes) => {
			var fc = new FolderCrypto(keyHolder);
			var folderJson = fc.setMKeyAndParseRestOfBytes(bytes)
			return { crypto: fc, folderJson: folderJson };
		});
	}
	
	pack(json: fsEntitiesMod.FolderJson): byteSrcMod.ObjBytesSource {
		if (!this.keyHolder) { throw new Error("Cannot use wiped object."); }
		var segWriter = this.keyHolder.newSegWriter(SEG_SIZE, random.bytes);
		var completeContent = [ this.mkey, utf8.pack(JSON.stringify(json)) ];
		var objSrc = byteSrcMod.makeObjByteSourceFromArrays(
			completeContent, segWriter);
		segWriter.destroy();
		return objSrc;
	}
	
	private setMKeyAndParseRestOfBytes(bytes: Uint8Array):
			fsEntitiesMod.FolderJson {
		if (bytes.length < nacl.secret_box.KEY_LENGTH) {
			throw new Error("Too few bytes folder object.");
		}
		var mkeyPart = bytes.subarray(0, nacl.secret_box.KEY_LENGTH);
		this.mkey = new Uint8Array(mkeyPart);
		nacl.arrays.wipe(mkeyPart);
		return JSON.parse(utf8.open(
			bytes.subarray(nacl.secret_box.KEY_LENGTH)));
	}
	
	childMasterDecr(): nacl.secret_box.Decryptor {
		if (!this.mkey) { throw new Error("Master key is not set."); }
		return nacl.secret_box.formatWN.makeDecryptor(
			this.mkey, this.arrFactory);
	}
	
	childMasterEncr(): nacl.secret_box.Encryptor {
		if (!this.mkey) { throw new Error("Master key is not set."); }
		return nacl.secret_box.formatWN.makeEncryptor(
			this.mkey, random.bytes(nacl.secret_box.NONCE_LENGTH),
			1, this.arrFactory);
	}
	
	openAndSetFrom(src: byteSrcMod.ObjBytesSource):
			Q.Promise<fsEntitiesMod.FolderJson> {
		if (!this.keyHolder) { throw new Error("Cannot use wiped object."); }
		var byteSrc = byteSrcMod.makeDecryptedByteSource(
			src, this.keyHolder.segReader);
		return byteSrc.read(0, null, true)
		.then((bytes) => {
			return this.setMKeyAndParseRestOfBytes(bytes);
		});
	}
	
	wipe(): void {
		if (this.keyHolder) {
			this.keyHolder.destroy();
			this.keyHolder = null;
		}
		if (this.mkey) {
			nacl.arrays.wipe(this.mkey);
			this.mkey = null;
		}
	}
	
	clone(arrFactory: nacl.arrays.Factory): FolderCrypto {
		var fc = new FolderCrypto(this.keyHolder.clone(arrFactory));
		if (this.mkey) {
			fc.mkey = new Uint8Array(this.mkey);
		}
		return fc;
	}
	
}
Object.freeze(FolderCrypto.prototype);
Object.freeze(FolderCrypto);

Object.freeze(exports);