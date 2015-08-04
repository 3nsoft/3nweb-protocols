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
 * This module produces users object, which managers users, and manages
 * storage. The whole storage reliance set is located behind user's factory,
 * which is created by this module.
 */

import Q = require('q');
import stream = require('stream');
import storeFactMod = require('./storage-factory');
import storeMod = require('./store');
import ownerApi = require('../../lib-common/service-api/3nstorage/owner');

export var SC = storeMod.SC;

export interface BlobGetOpts {
	objId: string;
	version: number;
	offset: number;
	maxLen: number;
}

export interface BlobSaveOpts {
	objId: string;
	appendMode: boolean;
	transactionId: string;
	chunkLen: number;
	offset?: number;
}

export interface ObjReader extends storeMod.ObjReader {}

interface IGetParam<T> {
	(userId: string): Q.Promise<T>;
}
interface ISetParam<T> {
	(userId: string, param: T): Q.Promise<boolean>;
}

export interface IAdd {
	(userId: string, keyDerivParams: any): Q.Promise<boolean>;
}
export interface IExists {
	(userId: string): Q.Promise<boolean>;
}
export interface IStartTransaction {
	(userId: string, objId: string, trans: ownerApi.TransactionParams):
		Q.Promise<string>;
}
export interface ICompleteTransaction {
	(userId: string, objId: string, transactionId: string): Q.Promise<void>;
}
export interface IGetBytes {
	(userId: string, opts: BlobGetOpts): Q.Promise<ObjReader>;
}
export interface ISaveBytes {
	(userId: string, bytes: stream.Stream,
		opts: BlobSaveOpts): Q.Promise<void>;
}
export interface IGetSpaceQuota extends IGetParam<number> {}
export interface IGetKeyDerivParams extends IGetParam<any> {}
export interface ISetKeyDerivParams extends ISetParam<any> {}
/**
 * This is an external interface, behind which all storage machinery is hidding.
 */
export interface Factory {
	add: IAdd;
	exists: IExists;
	getKeyDerivParams: IGetKeyDerivParams;
	setKeyDerivParams: ISetKeyDerivParams;
	getSpaceQuota: IGetSpaceQuota;
	startTransaction: IStartTransaction;
	finalizeTransaction: ICompleteTransaction;
	cancelTransaction: ICompleteTransaction;
	getRootHeader: IGetBytes;
	getRootSegments: IGetBytes;
	saveRootHeader: ISaveBytes;
	saveRootSegments: ISaveBytes;
	getObjHeader: IGetBytes;
	getObjSegments: IGetBytes;
	saveObjHeader: ISaveBytes;
	saveObjSegments: ISaveBytes;
}

export function makeFactory(rootFolder: string): Factory {
	
	var sf = storeFactMod.makeFactory(rootFolder);
	
	function makeParamGetter<T>(staticGetter:
			(store: storeMod.Store) => Q.Promise<T>):
			(userId: string) => Q.Promise<T> {
		return (userId: string) => {
			return sf.getStore(userId)
			.then((store: storeMod.Store) => {
				if (!store) { throw SC.USER_UNKNOWN; }
				return staticGetter(store);
			});
		};		
	}
	
	function makeParamSetter<T>(staticSetter:
			(store: storeMod.Store, param: T,
				setDefault: boolean) => Q.Promise<boolean>):
			(userId: string, param: T,
				setDefault?: boolean) => Q.Promise<boolean> {
		return (userId: string, param: T, setDefault?: boolean) => {
			return sf.getStore(userId)
			.then((store: storeMod.Store) => {
				if (!store) { throw SC.USER_UNKNOWN; }
				return staticSetter(store, param, setDefault);
			});
		};		
	}
	
	function makeBlobSaver(dest: storeMod.BytesPlace,
			isRoot?: boolean): ISaveBytes {
		return (userId: string, bytes: stream.Readable,
				opts: BlobSaveOpts): Q.Promise<void> => {
			var objId = opts.objId;
			if ((isRoot && objId) || (!isRoot && !objId)) {
				throw new Error("Mixed object types' functions.");
			}
			return sf.getStore(userId)
			.then((store: storeMod.Store) => {
				if (!store) { throw SC.USER_UNKNOWN; }
				if (opts.appendMode) {
					return store.appendObj(objId, opts.transactionId, dest,
						bytes, opts.chunkLen);
				} else {
					return store.saveObjChunk(objId, opts.transactionId,
						dest, opts.offset, opts.chunkLen, bytes);
				}
			});
		};
	}
	
	function makeBlobGetter(dest: storeMod.BytesPlace,
			isRoot?: boolean): IGetBytes {
		return (userId: string, opts: BlobGetOpts): Q.Promise<ObjReader> => {
			var objId = opts.objId;
			if ((isRoot && objId) || (!isRoot && !objId)) {
				throw new Error("Mixed object types' functions.");
			}
			return sf.getStore(userId)
			.then((store: storeMod.Store) => {
				if (!store) { throw SC.USER_UNKNOWN; }
				return store.getObj(objId, dest,
					opts.version, opts.offset, opts.maxLen);
			});
		};
	}
	
	function makeTransactionCloser(cancel: boolean): ICompleteTransaction {
		return (userId: string, objId: string, transactionId: string):
				Q.Promise<void> => {
			return sf.getStore(userId)
			.then((store) => {
				if (!store) { throw SC.USER_UNKNOWN; }
				return store.completeTransaction(objId, transactionId, cancel);
			});
		};
	}
	
	var factory: Factory = {
		
		add: (userId: string, keyDerivParams: any): Q.Promise<boolean> => {
			return <Q.Promise<boolean>> sf.makeNewStoreFor(userId)
			.then((store) => {
				if (!store) { return false; }
				return storeMod.Store.setKeyDerivParams(
					store, keyDerivParams, false);
			});
		},
		
		exists: (userId: string): Q.Promise<boolean> => {
			return sf.getStore(userId)
			.then((store) => { return !!store; });
		},
		
		getSpaceQuota: makeParamGetter(storeMod.Store.getSpaceQuota),
		getKeyDerivParams: makeParamGetter(storeMod.Store.getKeyDerivParams),
		setKeyDerivParams: makeParamSetter(storeMod.Store.setKeyDerivParams),
		
		startTransaction: (userId: string, objId: string,
				trans: ownerApi.TransactionParams): Q.Promise<string> => {
			return sf.getStore(userId)
			.then((store) => {
				if (!store) { throw SC.USER_UNKNOWN; }
				return store.startTransaction(objId, trans);
			});
		},
		
		finalizeTransaction: makeTransactionCloser(false),
		cancelTransaction: makeTransactionCloser(true),
		
		saveRootHeader: makeBlobSaver(storeMod.BytesPlace.Header, true),
		saveRootSegments: makeBlobSaver(storeMod.BytesPlace.Segments, true),
		saveObjHeader: makeBlobSaver(storeMod.BytesPlace.Header, false),
		saveObjSegments: makeBlobSaver(storeMod.BytesPlace.Segments, false),
		
		getRootHeader: makeBlobGetter(storeMod.BytesPlace.Header, true),
		getRootSegments: makeBlobGetter(storeMod.BytesPlace.Segments, true),
		getObjHeader: makeBlobGetter(storeMod.BytesPlace.Header, false),
		getObjSegments: makeBlobGetter(storeMod.BytesPlace.Segments, false)
		
	};
	Object.freeze(factory);
	return factory;
}
Object.freeze(exports);