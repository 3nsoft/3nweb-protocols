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
 * reliance set, exposing to outside only folder's wrap.
 */

import fErrMod = require('../../../lib-common/file-err');
import nacl = require('ecma-nacl');
import Q = require('q');
import base64 = require('../../../lib-common/base64');
import utf8 = require('../../../lib-common/utf8');
import random = require('../../random');
import byteSrcMod = require('../../byte-source');
import xspUtil = require('../../xsp-utils');
import fsMod = require('./fs');
import xspMod = require('./index');
import fsCryptoMod = require('./fs-crypto');

class FSEntity<TofFSCrypto> {
	
	name: string;
	objId: string;
	parentId: string;
	fs: fsMod.FS;
	crypto: TofFSCrypto = null;
	
	constructor(fs: fsMod.FS, name: string, objId: string, parentId: string) {
		this.fs = fs;
		this.name = name;
		this.objId = objId;
		this.parentId = parentId;
	}
	
	pushCompleteSavingTask(encrObjSrc: byteSrcMod.ObjBytesSource, isNew: boolean):
			Q.Promise<void> {
		return this.fs.addSavingTask(this.objId, encrObjSrc, isNew);
	}
	
}

export class File extends FSEntity<fsCryptoMod.FileCrypto> {
	
	constructor(fs: fsMod.FS, name: string, objId: string, parentId: string) {
		super(fs, name, objId, parentId);
		if (!name || !objId || !parentId) { throw new Error(
			"Bad file parameter(s) given"); }
		Object.seal(this);
	}
	
	readSrc(): Q.Promise<byteSrcMod.BytesSource> {
		return this.fs.storage.getObj(this.objId)
		.then((objSrc) => {
			return this.crypto.decryptedBytesSource(objSrc);
		});
	}
	
	writeSink(): { sink: byteSrcMod.VersionedByteSink; 
			writeCompletion: Q.Promise<void>; } {
		var pipe = new byteSrcMod.SinkBackedObjSource();
		return {
			sink: this.crypto.encryptingByteSink(pipe.sink),
			writeCompletion: this.pushCompleteSavingTask(pipe.src, false)
		}
	}
	
	save(bytes: Uint8Array|Uint8Array[]): Q.Promise<void> {
		return this.pushCompleteSavingTask(this.crypto.pack(bytes), false);
	}
	
	saveNew(): Q.Promise<void> {
		return this.pushCompleteSavingTask(this.crypto.pack([]), true);
	}
	
	wrap(): xspMod.File {
		var wrap: xspMod.File = {
			getName: (): string => {
				return this.name;
			},
			getObjId: (): string => {
				return this.objId;
			},
			readSrc: this.readSrc.bind(this),
// TODO put into fs defering logic for buffering of general sink,
//		as simple implementation is not handling properly initially unknown
//			writeSink: this.writeSink.bind(this),
			save: this.save.bind(this)
		}
		Object.freeze(wrap);
		return wrap;
	}
	
}

export interface FileJson {
	/**
	 * This is a usual file name.
	 */
	name: string;
	/**
	 * This is an id of file's object, or an array of ordered objects
	 * that constitute the whole of file.
	 * An array may have specific use case for file editing, and it allows
	 * for a general hiding a big file among smaller ones.
	 */
	objId: string|string[];
	/**
	 * This field is to be used, when extra bytes are added to file content
	 * to hide its size, by making it bigger.
	 */
	contentLen?: number;
	/**
	 * If this field is present and is true, it indicates that entity is a
	 * folder, is not a simple file.
	 */
	isFolder?: boolean;
}

export interface FolderJson {
	files: {
		[name: string]: FileJson;
	};
}

function makeFileJson(objId: string, name: string): FileJson {
	var f: FileJson = {
		name: name,
		objId: objId
	};
	return f;
}

var EMPTY_BYTE_ARR = new Uint8Array(0);

export class Folder extends FSEntity<fsCryptoMod.FolderCrypto> {
	
	private folderJson: FolderJson = null;
	
	/**
	 * files field contains only instantiated file and folder objects,
	 * therefore, it should not be used to check existing names in this folder.
	 */
	private files: {
		[name: string]: Folder|File;
	} = {};
	
	constructor(fs: fsMod.FS, name: string = null, objId: string = null,
			parentId: string = null) {
		super(fs, name, objId, parentId);
		if (!name && (objId || parentId)) {
			throw new Error("Root folder must "+
				"have both objId and parent as nulls.");
		} else if (objId === null) {
			new Error("Missing objId for non-root folder");
		}
		Object.seal(this);
	}
	
	static newRoot(fs: fsMod.FS, masterEnc: nacl.secret_box.Encryptor): Folder {
		var rf = new Folder(fs);
		rf.setEmptyFolderJson();
		rf.crypto = fsCryptoMod.FolderCrypto.makeForNewFolder(
			masterEnc, fs.arrFactory);
		rf.save(true);
		return rf;
	}
	
	static rootFromFolder(fs: fsMod.FS, f: Folder): Folder {
		if (f.parentId === null) {
			throw new Error("Given folder is already root");
		}
		var rf = new Folder(fs, f.name, f.objId, null);
		rf.setFolderJson(f.folderJson);
		rf.crypto = f.crypto.clone(fs.arrFactory);
		return rf;
	}
	
	static rootFromObjBytes(fs: fsMod.FS, name: string, objId: string,
			src: byteSrcMod.ObjBytesSource,
			masterDecr: nacl.secret_box.Decryptor): Q.Promise<Folder> {
		var rf = new Folder(fs, name, objId);
		return fsCryptoMod.FolderCrypto.makeForExistingFolder(
			masterDecr, src, fs.arrFactory)
		.then((partsForInit) => {
			rf.crypto = partsForInit.crypto;
			rf.setFolderJson(partsForInit.folderJson);
			return rf;
		});
	}
	
	private registerInFolderJson(f: Folder|File, isFolder = false): void {
		var fj: FileJson = {
			name: f.name,
			objId: f.objId,
		};
		if (isFolder) { fj.isFolder = true; }
		this.folderJson.files[fj.name] = fj;
	}
	
	private addObj(f: Folder|File): void {
		this.files[f.name] = f;
		this.fs.objs[f.objId] = f;
	}
	
	list(): string[] {
		return Object.keys(this.folderJson.files);
	}
	
	listFolders(): string[] {
		return Object.keys(this.folderJson.files).filter((name) => {
			return !!this.folderJson.files[name].isFolder;
		});
	}
	
	private getFileJson(name: string, nullOnMissing = false): FileJson {
		var fj = this.folderJson.files[name];
		if (fj) {
			return fj;
		} else if (nullOnMissing) {
			return null;
		} else {
			throw fErrMod.makeErr(fErrMod.Code.noFile,
				"File '"+name+"' does not exist");
		}
	}
	
	getFolder(name: string, nullOnMissing = false): Q.Promise<Folder> {
		try {
			var childInfo = this.getFileJson(name, nullOnMissing);
			if (!childInfo) { return Q.when<Folder>(null); }
			if (!childInfo.isFolder) {
				throw fErrMod.makeErr(fErrMod.Code.notDirectory,
					"Entry '"+name+"' in folder '"+this.name+"' is not a folder");
			}
			var child = <Folder> this.files[childInfo.name];
			if (child) { return Q.when(child); }
			if (Array.isArray(childInfo.objId)) {
				throw new Error("This implementation does not support "+
					"folders, spread over several objects.");
			}
			var promise = this.fs.storage.getObj(<string> childInfo.objId)
			.then((src) => {
				return fsCryptoMod.FolderCrypto.makeForExistingFolder(
					this.crypto.childMasterDecr(), src, this.fs.arrFactory)
			})
			.then((partsForInit) => {
				var f = new Folder(this.fs, childInfo.name,
					<string> childInfo.objId, this.objId);
				f.crypto = partsForInit.crypto;
				f.setFolderJson(partsForInit.folderJson);
				this.addObj(f);
				return f;
			});
			return promise;
		} catch (err) {
			return Q.reject<Folder>(err);
		}
	}
	
	getFile(name: string, nullOnMissing = false): Q.Promise<File> {
		try {
			var childInfo = this.getFileJson(name, nullOnMissing);
			if (!childInfo) { return Q.when<File>(null); }
			if (childInfo.isFolder) {
				throw fErrMod.makeErr(fErrMod.Code.isDirectory,
					"Entry '"+name+"' in folder '"+this.name+"' is not a file");
			}
			var child = <File> this.files[name];
			if (child) { return Q.when(child); }
			if (Array.isArray(childInfo.objId)) {
				throw new Error("This implementation does not support "+
					"files, spread over several objects.");
			}
			var promise = this.fs.storage.getObjHeader(<string> childInfo.objId)
			.then((headerSrc) => {
				return fsCryptoMod.FileCrypto.makeForExistingFile(
					this.crypto.childMasterDecr(), headerSrc, this.fs.arrFactory);
			})
			.then((fc) => {
				var f = new File(this.fs, name, <string> childInfo.objId, this.objId);
				f.crypto = fc;
				this.addObj(f);
				return f;
			});
			return promise;
		} catch (err) {
			return Q.reject<File>(err);
		}
	}
	
	createFolder(name: string): Folder {
		if (this.getFileJson(name, true)) {
			throw fErrMod.makeErr(fErrMod.Code.fileExists,
				"File '"+name+"' alread exists");
		}
		var f = new Folder(this.fs, name,
			this.fs.generateNewObjId(), this.objId);
		f.setEmptyFolderJson();
		f.crypto = fsCryptoMod.FolderCrypto.makeForNewFolder(
			this.crypto.childMasterEncr(), this.fs.arrFactory);
		this.registerInFolderJson(f, true);
		this.addObj(f);
		f.save(true);
		this.save();
		return f;
	}
	
	createFile(name: string): File {
		if (this.getFileJson(name, true)) {
			throw fErrMod.makeErr(fErrMod.Code.fileExists,
				"File '"+name+"' alread exists");
		}
		var f = new File(this.fs, name, this.fs.generateNewObjId(), this.objId);
		f.crypto = fsCryptoMod.FileCrypto.makeForNewFile(
			this.crypto.childMasterEncr(), this.fs.arrFactory);
		this.registerInFolderJson(f);
		this.addObj(f);
		f.saveNew();
		this.save();
		return f;
	}
	
	getFolderInThisSubTree(path: string[], createIfMissing: boolean):
			Q.Promise<Folder> {
		if (path.length === 0) { return Q.when(this); }
		var promise = this.getFolder(path[0])
		.fail((err: fErrMod.FileError) => {
			if (err.code !== fErrMod.Code.noFile) { throw err; }
			if (!createIfMissing) { throw err; }
			return this.createFolder(path[0]);
		})
		.then((f) => {
			if (path.length > 1) {
				return f.getFolderInThisSubTree(
					path.slice(1), createIfMissing);
			} else {
				return f;
			}
		});
		return <any> promise;
	}
	
	save(isNew = false): Q.Promise<void> {
		return this.pushCompleteSavingTask(
			this.crypto.pack(this.folderJson), isNew);
	}
	
	private setEmptyFolderJson(): void {
		this.folderJson = {
			files: {}
		};
	}
	
	private setFolderJson(folderJson: FolderJson): void {
		// TODO sanitize folderJson before using it
		
		this.folderJson = folderJson;
	}
	
	update(encrSrc: byteSrcMod.ObjBytesSource): Q.Promise<void> {
		return this.fs.storage.getObj(this.objId)
		.then((src) => {
			return this.crypto.openAndSetFrom(src);
		})
		.then((folderJson) => {
			this.setFolderJson(folderJson);
		});
	}
	
	wrap(): xspMod.Folder {
		var wrap: xspMod.Folder = {
			getName: (): string => {
				return this.name;
			},
			getObjId: (): string => {
				return this.objId;
			},
			list: this.list.bind(this),
			listFolders: this.listFolders.bind(this),
			getFolderInThisSubTree: (path: string[], createIfMissing = false):
					Q.Promise<xspMod.Folder> => {
				return this.getFolderInThisSubTree(path, createIfMissing)
				.then((f) => { return f.wrap(); });
			},
			getFolder: (name: string, nullOnMissing = false):
					Q.Promise<xspMod.Folder> => {
				return this.getFolder(name, nullOnMissing)
				.then((f) => { return (f ? f.wrap() : null); });
			},
			createFolder: (name: string): xspMod.Folder => {
				return this.createFolder(name).wrap();
			},
			getFile: (name: string, nullOnMissing = false):
					Q.Promise<xspMod.File> => {
				return this.getFile(name, nullOnMissing)
				.then((f) => { return (f ? f.wrap() : null); });
			},
			createFile: (name: string): xspMod.File => {
				return this.createFile(name).wrap();
			}
		};
		Object.freeze(wrap);
		return wrap;
	}
	
}
Object.freeze(Folder.prototype);
Object.freeze(Folder);

Object.freeze(exports);