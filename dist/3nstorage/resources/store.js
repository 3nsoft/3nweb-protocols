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
 * Everything in this module is assumed to be inside of a storage reliance set.
 *
 * Store files are laid out on disk in the following way:
 * (a) store is just a folder with stuff inside;
 * (b) main store folder contains following folders:
 * (b.1) objects - is a folder for object folders;
 * (b.2) archived - is a folder for archived object folders;
 * (b.3) rmdir - is a folder for folders that are in a process of being
 *               recursively removed;
 * (b.4) info - is a folder for information files about this storage;
 * (c) object folder's name is object's id;
 * (d) object folder contains:
 * (d.1) current.v - is a file with the current version of an object;
 * (d.2) N.hsxp - is a file with an N'th version object's header;
 * (d.3) N.sxsp - is a file with an N'th version object's segments;
 *                this file is present only if this N'th version is not expressed
 *                with a diff, relative to another version;
 * (d.4) N.diff - is a json file that describes diff, which will recreate N'th
 *                version;
 *                this file is present only when N'th version is expressed with
 *                a diff, relative to some other version;
 * (d.5) N.sxsp.diff - is a file with diff's bytes;
 *                this file is present only when N'th version is expressed with
 *                a diff, relative to some other version;
 * (d.6) transaction - is a json file with current transaction's info;
 *                     this file is present only for duration of a transaction,
 *                     and also acts as a transaction lock;
 * (d.7) new.hxsp - is a transaction file for new header;
 * (d.8) new.sxsp - is a transaction file for new segments, when a new version is
 *                  sent as is, and not as a diff, relative to some other version;
 * (d.9) new.diff - is a transaction json file with diff, that represents a new
 *                  version, relative to some other version;
 * (d.10) new.sxsp.diff - is a transaction file with diff bytes.
 *
 */
var Q = require('q');
var fs = require('fs');
var ChildProcMod = require('child_process');
var exec = ChildProcMod.exec;
var fops = require('../../lib-server/resources/file_ops');
var random = require('../../lib-server/random');
var fErrMod = require('../../lib-common/file-err');
var nacl = require('ecma-nacl');
var xsp = nacl.fileXSP;
var confUtil = require('../../lib-server/conf-util');
exports.SC = {
    USER_UNKNOWN: 'user-unknown',
    OBJ_EXIST: 'obj-already-exist',
    OBJ_UNKNOWN: 'obj-unknown',
    WRONG_OBJ_STATE: 'wrong-obj-state',
    WRITE_OVERFLOW: 'write-overflow',
    CONCURRENT_TRANSACTION: "concurrent-transactions",
    TRANSACTION_UNKNOWN: "transactions-unknown",
    INCOMPATIBLE_TRANSACTION: "incompatible-transaction",
    NOT_ENOUGH_SPACE: "not-enough-space"
};
Object.freeze(exports.SC);
var SPECIAL_VERSION = {
    NEW: 'new'
};
Object.freeze(SPECIAL_VERSION);
(function (BytesPlace) {
    BytesPlace[BytesPlace["Header"] = 0] = "Header";
    BytesPlace[BytesPlace["Segments"] = 1] = "Segments";
    BytesPlace[BytesPlace["Diff"] = 2] = "Diff";
})(exports.BytesPlace || (exports.BytesPlace = {}));
var BytesPlace = exports.BytesPlace;
Object.freeze(BytesPlace);
var FNAME_END = [];
FNAME_END[0 /* Header */] = '.hxsp';
FNAME_END[1 /* Segments */] = '.sxsp';
FNAME_END[2 /* Diff */] = '.sxsp.diff';
Object.freeze(FNAME_END);
var DEFAULT_FILE_WRITE_BUFFER_SIZE = 4 * 1024;
var DEFAULT_FILE_READ_BUFFER_SIZE = 64 * 1024;
/**
 * @param json
 * @param path
 * @return a promise, resolvable, when given json object has been written to
 * named file.
 */
function writeJSONFile(json, path) {
    return Q.nfcall(fs.writeFile, path, JSON.stringify(json), { encoding: 'utf8', flag: 'w' }).then(function () {
        return true;
    });
}
/**
 * @param path
 * @return a promise, resolvable to json object, read from the named file.
 */
function readJSONFile(path) {
    var promise = Q.nfcall(fs.readFile, path).then(function (buf) {
        return JSON.parse(buf.toString('utf8'));
    });
    return promise;
}
function setDefaultParameters(store) {
    var filePromises = [];
    // space quota
    filePromises.push(Store.setSpaceQuota(store, null, true));
    return Q.all(filePromises);
}
// This is a memoizer for space usage with a little extra.
var SpaceTracker = (function () {
    function SpaceTracker() {
        this.space = {};
        Object.freeze(this);
    }
    // XXX this is a hack, which should be replaced when sqlite is used.
    //		This hack is needed as du fails when files disappear have way
    //		in its processing. In other words du is not concurrency tollerant
    //		thing. Thus, we try call a few times here, and this simple approach
    //		is a good enough for the demo, but may not be ok for production.
    SpaceTracker.prototype.diskUsed = function (path, runNum) {
        var _this = this;
        if (runNum === void 0) { runNum = 0; }
        return Q.nfcall(exec, "du -k -s " + path).then(function (stdOut) {
            var kUsed = parseInt(stdOut);
            if (isNaN(kUsed)) {
                throw new Error("Shell utility du outputs a string, " + "which cannot be parsed as an integer.");
            }
            return kUsed * 1024;
        }, function (err) {
            if (runNum < 5) {
                return _this.diskUsed(path, runNum + 1);
            }
            else {
                console.warn("\n3NStorage service (" + Date() + "):\n" + "\twas not capable to properly estimate disk usage of " + path + "\n");
                return Q.when(0);
            }
        });
    };
    /**
     * @param store
     * @return a promise, resolvable to space info object.
     */
    SpaceTracker.prototype.updateSpaceInfo = function (store) {
        var usedSpace = 0;
        var promise = this.diskUsed(store.path).then(function (bUsed) {
            usedSpace = bUsed;
            return store.getSpaceQuota();
        }).then(function (quota) {
            return {
                free: Math.max(0, quota - usedSpace),
                used: usedSpace
            };
        });
        return promise;
    };
    SpaceTracker.prototype.change = function (store, delta) {
        var s = this.space[store.userId];
        function changeS() {
            if ((delta > 0) && ((s.free - delta) < 0)) {
                throw exports.SC.NOT_ENOUGH_SPACE;
            }
            s.free -= delta;
            s.used += delta;
        }
        if (s) {
            changeS();
        }
        else {
            return this.updateSpaceInfo(store).then(function (spaceInfo) {
                s = spaceInfo;
                changeS();
            });
        }
    };
    SpaceTracker.prototype.reset = function (userId) {
        delete this.space[userId];
    };
    return SpaceTracker;
})();
Object.freeze(SpaceTracker.prototype);
Object.freeze(SpaceTracker);
var spaceTracker = new SpaceTracker();
var Store = (function () {
    function Store(userId, storePath, writeBufferSize, readBufferSize) {
        this.userId = userId;
        this.path = storePath;
        this.fileWritingBufferSize = (writeBufferSize ? confUtil.stringToNumOfBytes(writeBufferSize) : DEFAULT_FILE_WRITE_BUFFER_SIZE);
        this.fileReadingBufferSize = (readBufferSize ? confUtil.stringToNumOfBytes(readBufferSize) : DEFAULT_FILE_READ_BUFFER_SIZE);
        Object.freeze(this);
    }
    /**
     * Creates on a disk a directory and file structure for a given store
     * object.
     * @param store
     * @return a promise, resolvable, when store's disk structure has been
     * constructed.
     */
    Store.initStore = function (store) {
        var promise = Q.all([Q.nfcall(fs.mkdir, store.path + '/objects'), Q.nfcall(fs.mkdir, store.path + '/transactions'), Q.nfcall(fs.mkdir, store.path + '/root'), Q.nfcall(fs.mkdir, store.path + '/info')]).then(function () {
            return Q.nfcall(fs.writeFile, store.path + '/info/userid', store.userId, { encoding: 'utf8', flag: 'wx' });
        }).then(function () {
            return setDefaultParameters(store);
        });
        return promise;
    };
    Store.prototype.objFolder = function (objId) {
        return (objId ? this.path + '/objects/' + objId : this.path + '/root');
    };
    /**
     * @param objId
     * @return a promise, resolvable to version number for currently existing
     * object, or resolvable to string for special states, like being new, etc.
     */
    Store.prototype.getObjVersion = function (objId) {
        var filePath = this.objFolder(objId) + '/current.v';
        var promise = Q.nfcall(fs.readFile, filePath).then(function (buf) {
            var str = buf.toString('utf8');
            var v = parseInt(str);
            if (isNaN(v)) {
                return str;
            }
            else {
                return v;
            }
        }).fail(function (err) {
            if (err.code === fErrMod.Code.noFile) {
                throw exports.SC.OBJ_UNKNOWN;
            }
            else {
                throw err;
            }
            return null; // this unreachable code is to please compiler
        });
        return promise;
    };
    /**
     * @param objId
     * @param ver is a number for a regular available version, which is current
     * now, or it can be a string for states of object like being archived, etc.
     * @return a promise, resolvable when a new version is set.
     */
    Store.prototype.setObjVersion = function (objId, ver) {
        var filePath = this.objFolder(objId) + '/current.v';
        return Q.nfcall(fs.writeFile, filePath, '' + ver, { encoding: 'utf8', flag: 'w' });
    };
    Store.prototype.makeNewObj = function (objId) {
        var _this = this;
        if (!objId) {
            throw new Error("Missing object id.");
        }
        var promise = Q.nfcall(fs.mkdir, this.objFolder(objId)).fail(function (err) {
            if (err.code === fErrMod.Code.fileExists) {
                throw exports.SC.OBJ_EXIST;
            }
            throw err;
        }).then(function () {
            return _this.setObjVersion(objId, SPECIAL_VERSION.NEW);
        });
        return promise;
    };
    Store.prototype.transactionFolder = function (objId) {
        return (objId ? this.path + '/transactions/' + objId : this.path + '/root/transaction');
    };
    Store.prototype.saveTransactionParams = function (objId, transaction) {
        return Q.nfcall(fs.writeFile, this.transactionFolder(objId) + '/transaction', JSON.stringify(transaction), { encoding: 'utf8', flag: 'w' });
    };
    Store.prototype.getTransactionParams = function (objId) {
        var promise = readJSONFile(this.transactionFolder(objId) + '/transaction').fail(function (err) {
            if (err.code === fErrMod.Code.noFile) {
                throw exports.SC.TRANSACTION_UNKNOWN;
            }
            throw err;
        });
        return promise;
    };
    Store.prototype.allocateHeaderAndSegsFiles = function (objId, version, headerSize, segsSize) {
        return [fops.createEmptyFile(this.transactionFolder(objId) + '/new' + FNAME_END[0 /* Header */], headerSize), fops.createEmptyFile(this.transactionFolder(objId) + '/new' + FNAME_END[1 /* Segments */], segsSize)];
    };
    Store.prototype.startTransaction = function (objId, reqTrans) {
        var _this = this;
        if (reqTrans.diff) {
            throw new Error("Processing diffs is not implemented, yet.");
        }
        var trans = {
            transactionId: random.stringOfB64UrlSafeChars(10),
            isNewObj: !!reqTrans.isNewObj,
            sizes: reqTrans.sizes
        };
        var promise = Q.nfcall(fs.mkdir, this.transactionFolder(objId)).fail(function (err) {
            if (err.code === fErrMod.Code.fileExists) {
                throw exports.SC.CONCURRENT_TRANSACTION;
            }
            throw err;
        }).then(function () {
            var tasks = [];
            if (trans.isNewObj) {
                trans.version = 1;
                if (objId !== null) {
                    tasks.push(_this.makeNewObj(objId));
                }
            }
            else {
                // get current version, and set new one to be v+1
                tasks.push(_this.getObjVersion(objId).then(function (currentVersion) {
                    if ('number' !== typeof currentVersion) {
                        throw exports.SC.WRONG_OBJ_STATE;
                    }
                    trans.version = currentVersion + 1;
                }));
            }
            if (trans.isNewObj || !trans.diff) {
                // create empty files of appropriate size, if space allows
                var headerSize = ((trans.sizes.header > 0) ? trans.sizes.header : 0);
                var segsSize = ((trans.sizes.segments > 0) ? trans.sizes.segments : 0);
                var t = spaceTracker.change(_this, headerSize + segsSize);
                if (t) {
                    tasks.push(t.then(function () {
                        return Q.all(_this.allocateHeaderAndSegsFiles(objId, trans.version, headerSize, segsSize));
                    }));
                }
                else {
                    tasks = tasks.concat(_this.allocateHeaderAndSegsFiles(objId, trans.version, headerSize, segsSize));
                }
            }
            else {
                throw new Error("Processing diffs is not implemented, yet.");
            }
            return Q.all(tasks);
        }).then(function () {
            return _this.saveTransactionParams(objId, trans);
        }).fail(function (err) {
            return _this.completeTransaction(objId, trans.transactionId, true).fail(function (err2) {
            }).then(function () {
                throw err;
            });
        }).then(function () {
            return trans.transactionId;
        });
        return promise;
    };
    Store.prototype.applyNonDiffTransactionFiles = function (transFolder, objFolder, trans, objId) {
        var _this = this;
        // move header and segments files from transaction folder to
        // obj's one, setting proper current version
        var promise = Q.all([Q.nfcall(fs.rename, transFolder + '/new' + FNAME_END[0 /* Header */], objFolder + '/' + trans.version + FNAME_END[0 /* Header */]), Q.nfcall(fs.rename, transFolder + '/new' + FNAME_END[1 /* Segments */], objFolder + '/' + trans.version + FNAME_END[1 /* Segments */])]).then(function () {
            return _this.setObjVersion(objId, trans.version);
        });
        return promise;
    };
    Store.prototype.applyDiffTransactionFiles = function (transFolder, objFolder, trans, objId) {
        throw new Error("Processing diffs is not implemented, yet.");
    };
    Store.prototype.completeTransaction = function (objId, transactionId, cancel) {
        var _this = this;
        var transFolder = this.transactionFolder(objId);
        var objFolder = this.objFolder(objId);
        var promise = this.getTransactionParams(objId).then(function (trans) {
            if (trans.transactionId !== transactionId) {
                throw exports.SC.TRANSACTION_UNKNOWN;
            }
            if (cancel) {
                if (trans.isNewObj && (objId !== null)) {
                    return fops.rmdir(objFolder).fail(function (err) {
                    }); // swallow errors here
                }
            }
            else if (trans.diff) {
                return _this.applyDiffTransactionFiles(transFolder, objFolder, trans, objId);
            }
            else {
                return _this.applyNonDiffTransactionFiles(transFolder, objFolder, trans, objId);
            }
        }).then(function () {
            return fops.rmdir(transFolder).fail(function (err) {
            }); // swallow errors here
        });
        return promise;
    };
    Store.prototype.appendObj = function (objId, transactionId, ftype, bytes, bytesLen) {
        var _this = this;
        var filePath = null;
        var promise = this.getTransactionParams(objId).then(function (trans) {
            if (trans.transactionId !== transactionId) {
                throw exports.SC.TRANSACTION_UNKNOWN;
            }
            filePath = _this.transactionFolder(objId) + '/new' + FNAME_END[ftype];
            if (trans.sizes) {
                if (ftype === 1 /* Segments */) {
                    if (trans.sizes.segments < 0) {
                        return fops.getFileSize(filePath);
                    }
                    else {
                        throw exports.SC.INCOMPATIBLE_TRANSACTION;
                    }
                }
                else if (ftype === 0 /* Header */) {
                    if (trans.sizes.header < 0) {
                        return fops.getFileSize(filePath);
                    }
                    else {
                        throw exports.SC.INCOMPATIBLE_TRANSACTION;
                    }
                }
                else if (ftype === 2 /* Diff */) {
                    throw exports.SC.INCOMPATIBLE_TRANSACTION;
                }
                else {
                    throw new Error("Unknown destination for bytes.");
                }
            }
            else if (trans.diff) {
                if (ftype === 2 /* Diff */) {
                    throw new Error("Processing diffs is not implemented, yet.");
                }
                else if ((ftype === 0 /* Header */) || (ftype === 1 /* Segments */)) {
                    throw exports.SC.INCOMPATIBLE_TRANSACTION;
                }
                else {
                    throw new Error("Unknown destination for bytes.");
                }
            }
            else {
                throw new Error("Illegal transaction: no file sizes, no diff.");
            }
        }).then(function (initFileSize) {
            return spaceTracker.change(_this, bytesLen).then(function () {
                return fops.streamToExistingFile(filePath, initFileSize, bytesLen, bytes, _this.fileWritingBufferSize).fail(function (err) {
                    return Q.nfcall(fs.truncate, filePath, initFileSize).then(function () {
                        throw err;
                    }, function () {
                        throw err;
                    });
                });
            });
        });
        return promise;
    };
    Store.prototype.saveObjChunk = function (objId, transactionId, ftype, offset, chunkLen, chunk) {
        var _this = this;
        var filePath = null;
        var promise = this.getTransactionParams(objId).then(function (trans) {
            if (trans.transactionId !== transactionId) {
                throw exports.SC.TRANSACTION_UNKNOWN;
            }
            filePath = _this.transactionFolder(objId) + '/new' + FNAME_END[ftype];
            if (trans.sizes) {
                if (ftype === 1 /* Segments */) {
                    if (trans.sizes.segments < 0) {
                        throw exports.SC.INCOMPATIBLE_TRANSACTION;
                    }
                    else if ((offset + chunkLen) > trans.sizes.segments) {
                        throw exports.SC.WRITE_OVERFLOW;
                    }
                    else {
                        return trans.sizes.segments;
                    }
                }
                else if (ftype === 0 /* Header */) {
                    if (trans.sizes.header < 0) {
                        throw exports.SC.INCOMPATIBLE_TRANSACTION;
                    }
                    else if ((offset + chunkLen) > trans.sizes.header) {
                        throw exports.SC.WRITE_OVERFLOW;
                    }
                    else {
                        return trans.sizes.header;
                    }
                }
                else if (ftype === 2 /* Diff */) {
                    throw exports.SC.INCOMPATIBLE_TRANSACTION;
                }
                else {
                    throw new Error("Unknown destination for bytes.");
                }
            }
            else if (trans.diff) {
                if (ftype === 2 /* Diff */) {
                    throw new Error("Processing diffs is not implemented, yet.");
                }
                else if ((ftype === 0 /* Header */) || (ftype === 1 /* Segments */)) {
                    throw exports.SC.INCOMPATIBLE_TRANSACTION;
                }
                else {
                    throw new Error("Unknown destination for bytes.");
                }
            }
            else {
                throw new Error("Illegal transaction: no file sizes, no diff.");
            }
        }).then(function () {
            return fops.streamToExistingFile(filePath, offset, chunkLen, chunk, _this.fileWritingBufferSize);
        });
        return promise;
    };
    /**
     * @param objId is a string object id for non-root objects, and null for
     * root object.
     * @param ftype
     * @param version is an integer version, or null, for current version.
     * @param offset is a read start point.
     * @param maxLen is a maximum number of bytes to read. Null indicates that
     * all bytes can be read.
     * @return
     */
    Store.prototype.getObj = function (objId, ftype, version, offset, maxLen) {
        var _this = this;
        var filePath;
        var promise;
        if (version === null) {
            promise = this.getObjVersion(objId).then(function (v) {
                if ('number' !== typeof v) {
                    throw exports.SC.WRONG_OBJ_STATE;
                }
                version = v;
                filePath = _this.objFolder(objId) + '/' + version + FNAME_END[ftype];
                return fops.getFileSize(filePath);
            });
        }
        else {
            filePath = this.objFolder(objId) + '/' + version + FNAME_END[ftype];
            promise = fops.getFileSize(filePath);
        }
        promise = promise.then(function (objSize) {
            if (objSize <= offset) {
                return;
            }
            if (maxLen === null) {
                maxLen = objSize;
            }
            else if ((offset + maxLen) >= objSize) {
                maxLen = objSize - offset;
            }
            if (maxLen <= 0) {
                return;
            }
            var reader = {
                len: maxLen,
                version: version,
                pipeTo: function (sink) {
                    return fops.streamFromFile(filePath, offset, maxLen, sink, _this.fileReadingBufferSize);
                }
            };
            Object.freeze(reader);
            return reader;
        }, (function (err) {
            if (err.code === fErrMod.Code.noFile) {
                throw exports.SC.OBJ_UNKNOWN;
            }
            else {
                throw err;
            }
        }));
        return promise;
    };
    Store.getSpaceQuota = function (store) {
        return readJSONFile(store.path + '/info/quota');
    };
    Store.setSpaceQuota = function (store, numOfBytes, setDefault) {
        if (setDefault) {
            numOfBytes = 10 * 1024 * 1024 * 1024;
        }
        else {
            var isOK = ('number' === typeof numOfBytes) && (numOfBytes >= 50 * 1024 * 1024);
            if (!isOK) {
                return Q.when(false);
            }
            numOfBytes = Math.floor(numOfBytes);
            spaceTracker.reset(store.userId);
        }
        return writeJSONFile(numOfBytes, store.path + '/info/quota');
    };
    Store.prototype.getSpaceQuota = function () {
        return Store.getSpaceQuota(this);
    };
    Store.getKeyDerivParams = function (store) {
        return readJSONFile(store.path + '/info/key-deriv-params');
    };
    Store.setKeyDerivParams = function (store, params, setDefault) {
        if (setDefault) {
            params = {};
        }
        else if ('object' !== typeof params) {
            return Q.when(false);
        }
        return writeJSONFile(params, store.path + '/info/key-deriv-params');
    };
    Store.prototype.getKeyDerivParams = function () {
        return Store.getSpaceQuota(this);
    };
    return Store;
})();
exports.Store = Store;
Object.freeze(Store.prototype);
Object.freeze(Store);
Object.freeze(exports);
