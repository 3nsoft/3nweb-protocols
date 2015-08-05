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
var storeFactMod = require('./storage-factory');
var storeMod = require('./store');
exports.SC = storeMod.SC;
function makeFactory(rootFolder) {
    var sf = storeFactMod.makeFactory(rootFolder);
    function makeParamGetter(staticGetter) {
        return function (userId) {
            return sf.getStore(userId)
                .then(function (store) {
                if (!store) {
                    throw exports.SC.USER_UNKNOWN;
                }
                return staticGetter(store);
            });
        };
    }
    function makeParamSetter(staticSetter) {
        return function (userId, param, setDefault) {
            return sf.getStore(userId)
                .then(function (store) {
                if (!store) {
                    throw exports.SC.USER_UNKNOWN;
                }
                return staticSetter(store, param, setDefault);
            });
        };
    }
    function makeBlobSaver(dest, isRoot) {
        return function (userId, bytes, opts) {
            var objId = opts.objId;
            if ((isRoot && objId) || (!isRoot && !objId)) {
                throw new Error("Mixed object types' functions.");
            }
            return sf.getStore(userId)
                .then(function (store) {
                if (!store) {
                    throw exports.SC.USER_UNKNOWN;
                }
                if (opts.appendMode) {
                    return store.appendObj(objId, opts.transactionId, dest, bytes, opts.chunkLen);
                }
                else {
                    return store.saveObjChunk(objId, opts.transactionId, dest, opts.offset, opts.chunkLen, bytes);
                }
            });
        };
    }
    function makeBlobGetter(dest, isRoot) {
        return function (userId, opts) {
            var objId = opts.objId;
            if ((isRoot && objId) || (!isRoot && !objId)) {
                throw new Error("Mixed object types' functions.");
            }
            return sf.getStore(userId)
                .then(function (store) {
                if (!store) {
                    throw exports.SC.USER_UNKNOWN;
                }
                return store.getObj(objId, dest, opts.version, opts.offset, opts.maxLen);
            });
        };
    }
    function makeTransactionCloser(cancel) {
        return function (userId, objId, transactionId) {
            return sf.getStore(userId)
                .then(function (store) {
                if (!store) {
                    throw exports.SC.USER_UNKNOWN;
                }
                return store.completeTransaction(objId, transactionId, cancel);
            });
        };
    }
    var factory = {
        add: function (userId, keyDerivParams) {
            return sf.makeNewStoreFor(userId)
                .then(function (store) {
                if (!store) {
                    return false;
                }
                return storeMod.Store.setKeyDerivParams(store, keyDerivParams, false);
            });
        },
        exists: function (userId) {
            return sf.getStore(userId)
                .then(function (store) { return !!store; });
        },
        getSpaceQuota: makeParamGetter(storeMod.Store.getSpaceQuota),
        getKeyDerivParams: makeParamGetter(storeMod.Store.getKeyDerivParams),
        setKeyDerivParams: makeParamSetter(storeMod.Store.setKeyDerivParams),
        startTransaction: function (userId, objId, trans) {
            return sf.getStore(userId)
                .then(function (store) {
                if (!store) {
                    throw exports.SC.USER_UNKNOWN;
                }
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
exports.makeFactory = makeFactory;
Object.freeze(exports);
