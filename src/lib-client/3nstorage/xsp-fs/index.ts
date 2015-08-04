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
 * This file is an interface of an xsp file system, behind which file system's
 * reliance set is located.
 */

import byteSrcMod = require('../../byte-source');
import fsMod = require('./fs');
import nacl = require('ecma-nacl');
import keyGenUtils = require('../../workers/key-gen-common');

export interface Storage {
	getRootKeyDerivParams(): keyGenUtils.ScryptGenParamsInJson;
	getObj(objId: string): Q.Promise<byteSrcMod.ObjBytesSource>;
	getObjHeader(objId: string): Q.Promise<byteSrcMod.BytesSource>;
	saveObj(objId: string, obj: byteSrcMod.ObjBytesSource,
		newObj?: boolean): Q.Promise<void>;
	close(): Q.Promise<void>;
}

export var sysFolders = fsMod.sysFolders;

export interface FileSystem {
	getRoot(): Folder;
	flush(): void;
	close(closeStorage?: boolean): Q.Promise<void>;
	getSavingProc(): Q.Promise<void>;
	makeSubRoot(f: Folder): FileSystem;
}

export interface File {
	getName(): string;
	getObjId(): string;
	readSrc(): Q.Promise<byteSrcMod.BytesSource>;
	save(bytes: Uint8Array|Uint8Array[]): Q.Promise<void>;
// TODO uncomment writeSink() when ObjSource will have deferred for signalling
//		when totalSize is set in it (alternatively, make it to be promise)
//	writeSink(): { sink: byteSrcMod.ByteSink; writeCompletion: Q.Promise<void>; };
}

export interface Folder {
	getName(): string;
	getObjId(): string;
	list(): string[];
	listFolders(): string[];
	getFolderInThisSubTree(path: string[], createIfMissing?: boolean):
		Q.Promise<Folder>;
	getFolder(name: string, nullOnMissing?: boolean): Q.Promise<Folder>;
	createFolder(name: string): Folder;
	getFile(name: string, nullOnMissing?: boolean): Q.Promise<File>;
	createFile(name: string): File;
}

export var makeNewRoot = fsMod.FS.makeNewRoot;

export var makeExisting = fsMod.FS.makeExisting;


Object.freeze(exports);