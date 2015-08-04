(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
/**
 * This contains functions for 3NStorage account setup.
 */
var Q = require('q');
var xhrUtils = require('../../../lib-client/xhr-utils');
var log = require('../../../lib-client/page-logging');
var midWithLogging = require('../../../lib-client/mid-proc-with-logging');
var midUser = require('../../../lib-client/user-with-mid-session');
var nacl = require('ecma-nacl');
var hex = require('../../../lib-common/hex');
var base64 = require('../../../lib-common/base64');
var random = require('../../../lib-client/random');
var keyGen = require('../../../lib-client/workers/key-gen-main');
var xspFS = require('../../../lib-client/3nstorage/xsp-fs/index');
var stores = require('../../../lib-client/3nstorage/stores');
var DO_NOT_REPORT = "do not report error";
var Account = (function (_super) {
    __extends(Account, _super);
    function Account(address) {
        _super.call(this, address, {
            login: 'login/mailerid/',
            logout: 'close-session'
        });
        this.accountExist = null;
        this.midSigner = null;
        var loc = location.href;
        if (loc.indexOf('?') >= 0) {
            loc = loc.substring(0, loc.lastIndexOf('?'));
        }
        if (loc.indexOf('#') >= 0) {
            loc = loc.substring(0, loc.lastIndexOf('#'));
        }
        this.serviceURI = loc;
        Object.seal(this);
    }
    Account.prototype.checkIfAccountExist = function () {
        var _this = this;
        var deferred = Q.defer();
        var url = './exists-account';
        var xhr = xhrUtils.makeBodylessRequest('GET', url, function () {
            if (xhr.status == 200) {
                _this.accountExist = true;
                deferred.resolve(true);
            }
            else if (xhr.status == 474) {
                _this.accountExist = false;
                deferred.resolve(false);
            }
            else {
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.send();
        return deferred.promise;
    };
    Account.prototype.createAccount = function (keyGenParams) {
        var deferred = Q.defer();
        var url = './make-account';
        var xhr = xhrUtils.makeJsonRequest('POST', url, function () {
            if ((xhr.status == 201) || (xhr.status == 473)) {
                deferred.resolve();
            }
            else {
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.sendJSON(keyGenParams);
        return deferred.promise;
    };
    return Account;
})(midUser.ServiceUser);
exports.Account = Account;
function signinWithMailerIdAndCheckIfAccExist(form) {
    try {
        log.clear();
        var address = form.address.value;
        var acc = new Account(address);
        midWithLogging.provisionAssertionSigner(form).then(function (assertSigner) {
            acc.midSigner = assertSigner;
            form.reset();
            return midWithLogging.startAndAuthSession(acc, acc.midSigner);
        }).then(function () {
            userData.account = acc;
            return acc.checkIfAccountExist();
        }).then(function (accExist) {
            pageRouter.openView('login-success');
        }).fail(function (err) {
            log.write("ERROR: " + err.message);
            console.error('Error in file ' + err.fileName + ' at ' + err.lineNumber + ': ' + err.message);
        }).done();
    }
    catch (err) {
        console.error(err);
    }
}
exports.signinWithMailerIdAndCheckIfAccExist = signinWithMailerIdAndCheckIfAccExist;
function logout() {
    if (!userData.account) {
        return;
    }
    var sid = userData.account.sessionId;
    userData.account.logout().then(function () {
        console.info("Session '" + sid + "' is closed on the server side.");
        // cleanup info fields related to closed session
        userData.account = null;
        // open signin thingy
        pageRouter.openView('signin');
    }).fail(function (err) {
        log.write("ERROR: " + err.message);
        console.error('Error in file ' + err.fileName + ' at ' + err.lineNumber + ': ' + err.message);
    }).done();
}
exports.logout = logout;
var defaultKeyGenParams = {
    logN: 17,
    r: 8,
    p: 1
};
function genEncrForRoot(form) {
    var secKeyHex = form.seckey.value;
    var pass = form.pass.value;
    var keyGenParams = {
        logN: defaultKeyGenParams.logN,
        r: defaultKeyGenParams.r,
        p: defaultKeyGenParams.p,
        salt: base64.pack(random.bytes(64))
    };
    var skey;
    if (secKeyHex) {
        if (pass) {
            log.write("INCORRECT INFO: provide only either secret key or " + "passphrase, but not both.");
            throw DO_NOT_REPORT;
        }
        else if (secKeyHex.length !== 64) {
            log.write("INCORRECT INFO: secret key should be 32 bytes long,\n" + "which is 64 hex charaters,\nwhile only " + secKeyHex.length + " are given.");
            throw DO_NOT_REPORT;
        }
        else {
            try {
                skey = hex.open(secKeyHex);
            }
            catch (err) {
                log.write("INCORRECT INFO: given secret key cannot be " + "interpreted as hex form of binary: " + err.message);
                throw DO_NOT_REPORT;
            }
        }
    }
    else {
        if (!pass) {
            log.write("MISSING INFO: provide either secret key " + ",\nor passphrase, from which keys are derived.");
            throw DO_NOT_REPORT;
        }
    }
    form.reset();
    function encGen() {
        var keyProm;
        if (skey) {
            log.write("Using provided secret key for file system's root " + "master encryptor.");
            keyProm = Q.when(skey);
        }
        else {
            log.write("Start deriving a secret key from a given passphrase. " + "This key is used for file system's root master encryptor.");
            keyProm = keyGen.deriveKeyFromPass(pass, keyGenParams);
        }
        return keyProm.then(function (skey) {
            var enc = nacl.secret_box.formatWN.makeEncryptor(skey, random.bytes(nacl.secret_box.NONCE_LENGTH));
            nacl.arrays.wipe(skey);
            return enc;
        });
    }
    return { encGen: encGen, keyGenParams: keyGenParams };
}
function makeAndSaveRoot(encGen) {
    log.write("Connecting to storage service directly within owner api.");
    var remoteStore;
    var promise = stores.make3NStorageOwner('https://localhost:8080/3nstorage', function () {
        return Q.when(userData.account.midSigner);
    }).then(function (store) {
        remoteStore = store;
        return encGen();
    }).then(function (enc) {
        log.write("Setting up default file tree structure in a storage's " + "file system, and encrypting root with a derived secret key.");
        var fs = xspFS.makeNewRoot(remoteStore, enc);
        log.write("Flushing file system changes to the server.");
        fs.flush();
        return fs.getSavingProc().then(function () {
            return fs.close();
        });
    }).then(function () {
        log.write("All changes are written to server. Do check in browser's " + "console particulars of requests. Check server's data folder to " + "verify that server only handles versioned encrypted blobs, " + "without any knowledge of file hierarchy.");
    });
    return promise;
}
function createAccount(form) {
    try {
        log.clear();
        var encAndParams = genEncrForRoot(form);
        userData.account.createAccount(encAndParams.keyGenParams).then(function () {
            log.write("Account with storage server is opened for " + userData.account.userId);
            return makeAndSaveRoot(encAndParams.encGen);
        }).then(function () {
            pageRouter.hideElem("make-new-account");
            pageRouter.showElem("account-exists");
        }).fail(function (err) {
            if (err === DO_NOT_REPORT) {
                return;
            }
            log.write("ERROR: " + err.message);
            console.error('Error in file ' + err.fileName + ' at ' + err.lineNumber + ': ' + err.message);
        }).done();
    }
    catch (err) {
        console.error(err);
    }
}
exports.createAccount = createAccount;
Object.freeze(exports);

},{"../../../lib-client/3nstorage/stores":4,"../../../lib-client/3nstorage/xsp-fs/index":8,"../../../lib-client/mid-proc-with-logging":11,"../../../lib-client/page-logging":12,"../../../lib-client/random":13,"../../../lib-client/user-with-mid-session":16,"../../../lib-client/workers/key-gen-main":19,"../../../lib-client/xhr-utils":20,"../../../lib-common/base64":21,"../../../lib-common/hex":23,"ecma-nacl":"ecma-nacl","q":"q"}],2:[function(require,module,exports){
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
/*
 * This file brings all modules into one piece.
 */
/// <reference path="../../../typings/tsd.d.ts" />
var routers = require('../../../lib-client/simple-router');
var account = require('./account');
var userData = {
    account: null,
};
window.userData = userData;
var router = new routers.Router(window, function () {
    return (userData.account ? 'login-success' : 'signin');
});
window.pageRouter = router;
window.onload = function () {
    // Chrome needs a timeout, to do switch on the "nextTick"
    setTimeout(router.openHashTag.bind(router));
};
router.addView('signin', function () {
    if (userData.account) {
        router.openView('login-success');
    }
    else {
        router.showElem("mid-login");
    }
}, function () {
    router.hideElem("mid-login");
}, true);
router.addView('login-success', function () {
    if (userData.account) {
        router.showElem("login-success");
        var elems = document.getElementsByClassName("login-address");
        for (var i = 0; i < elems.length; i += 1) {
            elems[i].textContent = userData.account.userId;
        }
        if (userData.account.accountExist) {
            router.hideElem("make-new-account");
            router.showElem("account-exists");
        }
        else {
            router.showElem("make-new-account");
            router.hideElem("account-exists");
        }
    }
    else {
        router.openView('signin');
    }
}, function () {
    router.hideElem("login-success");
});
window.signinWithMailerIdAndCheckIfAccExist = account.signinWithMailerIdAndCheckIfAccExist;
window.createAccount = account.createAccount;
window.logout = account.logout;

},{"../../../lib-client/simple-router":15,"./account":1}],3:[function(require,module,exports){
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
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
/**
 * This defines functions that implement ASMail reception protocol.
 */
var xhrUtils = require('../xhr-utils');
var Q = require('q');
var api = require('../../lib-common/service-api/3nstorage/owner');
var baseServiceUser = require('../user-with-mid-session');
var serviceLocator = require('../service-locator');
var keyGenUtils = require('../workers/key-gen-common');
var byteSrcMod = require('../byte-source');
var DEFAULT_MAX_SENDING_CHUNK = 1024 * 1024;
var DEFAULT_MAX_GETTING_CHUNK = 2 * 1024 * 1024;
function makeTransactionParamsFor(obj, newObj) {
    if (newObj === void 0) { newObj = false; }
    var hLen = obj.header.totalSize();
    if (hLen === null) {
        hLen = -1;
    }
    var sLen = obj.segments.totalSize();
    if (sLen === null) {
        sLen = -1;
    }
    var p = {
        sizes: {
            header: hLen,
            segments: sLen
        }
    };
    if (newObj) {
        p.isNewObj = true;
    }
    return p;
}
var StorageOwner = (function (_super) {
    __extends(StorageOwner, _super);
    function StorageOwner(user) {
        _super.call(this, user, {
            login: api.midLogin.MID_URL_PART,
            logout: api.closeSession.URL_END,
            canBeRedirected: true
        });
        this.keyDerivParams = null;
        this.maxChunkSize = null;
        Object.seal(this);
    }
    StorageOwner.prototype.setStorageUrl = function (serviceUrl) {
        var _this = this;
        var promise = serviceLocator.storageInfoAt(serviceUrl).then(function (info) {
            _this.serviceURI = info.owner;
        });
        return promise;
    };
    StorageOwner.prototype.rejectOnNot200 = function (deferred, xhr) {
        if (xhr.status != 200) {
            if (xhr.status == api.ERR_SC.needAuth) {
                this.sessionId = null;
            }
            xhrUtils.reject(deferred, xhr);
            return true;
        }
        return false;
    };
    StorageOwner.prototype.setSessionParams = function () {
        var _this = this;
        var url = this.serviceURI + api.sessionParams.URL_END;
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('GET', url, function () {
            if (_this.rejectOnNot200(deferred, xhr)) {
                return;
            }
            var reply = xhr.response;
            try {
                keyGenUtils.paramsFromJson('?', reply.keyDerivParams);
                if (('number' !== typeof reply.maxChunkSize) || (reply.maxChunkSize < 1000)) {
                    throw "Bad or missing maxChunkSize parameter.";
                }
                _this.keyDerivParams = reply.keyDerivParams;
                _this.maxChunkSize = reply.maxChunkSize;
                deferred.resolve();
            }
            catch (err) {
                if ('string' == typeof err) {
                    xhrUtils.reject(deferred, xhr.status, err);
                }
                else {
                    xhrUtils.reject(deferred, xhr.status, err.message);
                }
            }
        }, deferred, this.sessionId);
        xhr.responseType = "json";
        xhr.send();
        return deferred.promise;
    };
    /**
     * This does MailerId login with a subsequent getting of session parameters
     * from
     * @param assertionSigner
     * @return a promise, resolvable, when mailerId login and getting parameters'
     * successfully completes.
     */
    StorageOwner.prototype.login = function (midSigner) {
        var _this = this;
        if (this.sessionId) {
            throw new Error("Session is already opened.");
        }
        var promise = _super.prototype.login.call(this, midSigner).then(function () {
            return _this.setSessionParams();
        });
        return promise;
    };
    /**
     * @param objId must be null for root object, and a string id for other ones
     * @return a promise, resolvable to transaction id.
     */
    StorageOwner.prototype.startTransaction = function (objId, transParams) {
        var _this = this;
        var url = this.serviceURI + ((objId === null) ? api.startRootTransaction.URL_END : api.startTransaction.getReqUrlEnd(objId));
        var deferred = Q.defer();
        var xhr = xhrUtils.makeJsonRequest('POST', url, function () {
            if (_this.rejectOnNot200(deferred, xhr)) {
                return;
            }
            var reply = xhr.response;
            if ('string' !== typeof reply.transactionId) {
                xhrUtils.reject(deferred, xhr.status, "Bad or missing transactionId parameter.");
            }
            else {
                deferred.resolve(reply.transactionId);
            }
        }, deferred, this.sessionId);
        xhr.responseType = "json";
        xhr.sendJSON(transParams);
        return deferred.promise;
    };
    /**
     * @param objId must be null for root object, and a string id for other ones
     * @param transactionId
     * @return a promise, resolvable to transaction id.
     */
    StorageOwner.prototype.cancelTransaction = function (objId, transactionId) {
        var _this = this;
        var url = this.serviceURI + ((objId === null) ? api.cancelRootTransaction.getReqUrlEnd(transactionId) : api.cancelTransaction.getReqUrlEnd(objId, transactionId));
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('POST', url, function () {
            if (_this.rejectOnNot200(deferred, xhr)) {
                return;
            }
            deferred.resolve();
        }, deferred, this.sessionId);
        xhr.send();
        return deferred.promise;
    };
    /**
     * @param objId must be null for root object, and a string id for other ones
     * @param transactionId
     * @return a promise, resolvable to transaction id.
     */
    StorageOwner.prototype.completeTransaction = function (objId, transactionId) {
        var _this = this;
        var url = this.serviceURI + ((objId === null) ? api.finalizeRootTransaction.getReqUrlEnd(transactionId) : api.finalizeTransaction.getReqUrlEnd(objId, transactionId));
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('POST', url, function () {
            if (_this.rejectOnNot200(deferred, xhr)) {
                return;
            }
            deferred.resolve();
        }, deferred, this.sessionId);
        xhr.send();
        return deferred.promise;
    };
    StorageOwner.prototype.getBytes = function (url) {
        var _this = this;
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('GET', url, function () {
            if (_this.rejectOnNot200(deferred, xhr)) {
                return;
            }
            try {
                var ver = parseInt(xhr.getResponseHeader(api.HTTP_HEADER.objVersion), 10);
                if (isNaN(ver)) {
                    throw "Response is malformed, proper version missing.";
                }
                var reply = xhr.response;
                if (!reply || ('object' !== typeof reply)) {
                    throw "Response is malformed, it is not an object.";
                }
                deferred.resolve({
                    bytes: new Uint8Array(reply),
                    ver: ver
                });
            }
            catch (e) {
                xhrUtils.reject(deferred, 200, ('string' === typeof e) ? e : e.message);
            }
        }, deferred, this.sessionId);
        xhr.responseType = "arraybuffer";
        xhr.send();
        return deferred.promise;
    };
    StorageOwner.prototype.getAllBytesSequentially = function (objId, isHeader, sink, ver, ofs) {
        var _this = this;
        if (ver === void 0) { ver = null; }
        if (ofs === void 0) { ofs = 0; }
        var opts = {
            ofs: ofs,
            len: DEFAULT_MAX_GETTING_CHUNK
        };
        if ('number' === typeof ver) {
            opts.ver = ver;
        }
        var url = this.serviceURI;
        if (objId === null) {
            if (isHeader) {
                url += api.rootHeader.getReqUrlEnd(opts);
            }
            else {
                url += api.rootSegs.getReqUrlEnd(opts);
            }
        }
        else {
            if (isHeader) {
                url += api.objHeader.getReqUrlEnd(objId, opts);
            }
            else {
                url += api.objSegs.getReqUrlEnd(objId, opts);
            }
        }
        var promise = this.getBytes(url).then(function (bytesAndVer) {
            if (ver === null) {
                ver = bytesAndVer.ver;
                sink.setObjVersion(ver);
            }
            else if (ver !== bytesAndVer.ver) {
                throw new Error("Server sent bytes for object version " + bytesAndVer.ver + ", while it has been asked for version " + ver);
            }
            if (bytesAndVer.bytes.length === 0) {
                sink.swallow(null);
                return;
            }
            sink.swallow(bytesAndVer.bytes);
            if (opts.len > bytesAndVer.bytes.length) {
                sink.swallow(null);
                return;
            }
            return _this.getAllBytesSequentially(objId, isHeader, sink, ver, ofs);
        });
        return promise;
    };
    StorageOwner.prototype.getObj = function (objId, ver) {
        var _this = this;
        if (ver === void 0) { ver = null; }
        var pipe = new byteSrcMod.SinkBackedObjSource();
        var headerSink = {
            setObjVersion: pipe.sink.setObjVersion,
            swallow: pipe.sink.header.swallow,
            setTotalSize: pipe.sink.header.setTotalSize
        };
        var segmentsSink = {
            setObjVersion: pipe.sink.setObjVersion,
            swallow: pipe.sink.segments.swallow,
            setTotalSize: pipe.sink.segments.setTotalSize
        };
        this.getAllBytesSequentially(objId, true, headerSink, ver).then(function () {
            return _this.getAllBytesSequentially(objId, false, segmentsSink, ver);
        }).done();
        return pipe.src;
    };
    StorageOwner.prototype.getObjHeader = function (objId, ver) {
        if (ver === void 0) { ver = null; }
        var pipe = new byteSrcMod.SinkBackedObjSource();
        var headerSink = {
            setObjVersion: pipe.sink.setObjVersion,
            swallow: pipe.sink.header.swallow,
            setTotalSize: pipe.sink.header.setTotalSize
        };
        this.getAllBytesSequentially(objId, true, headerSink, ver).done();
        return {
            getObjVersion: pipe.getObjVersion,
            read: pipe.src.header.read,
            totalSize: pipe.src.header.totalSize
        };
    };
    StorageOwner.prototype.sendBytes = function (url, bytes) {
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBinaryRequest('PUT', url, function () {
            if (xhr.status == 201) {
                deferred.resolve();
            }
            else {
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.send(bytes);
        return deferred.promise;
    };
    StorageOwner.prototype.sendAllBytesNonAppending = function (objId, transactionId, isHeader, src, ofs) {
        var _this = this;
        if (ofs === void 0) { ofs = 0; }
        var opts = {
            trans: transactionId,
            append: false,
            ofs: ofs
        };
        var url = this.serviceURI;
        if (objId === null) {
            if (isHeader) {
                url += api.rootHeader.putReqUrlEnd(opts);
            }
            else {
                url += api.rootSegs.putReqUrlEnd(opts);
            }
        }
        else {
            if (isHeader) {
                url += api.objHeader.putReqUrlEnd(objId, opts);
            }
            else {
                url += api.objSegs.putReqUrlEnd(objId, opts);
            }
        }
        var chunkLen = Math.min(this.maxChunkSize, DEFAULT_MAX_SENDING_CHUNK);
        var promise = src.read(chunkLen, chunkLen).then(function (bytes) {
            if (!bytes) {
                return;
            }
            return _this.sendBytes(url, bytes).then(function () {
                ofs += bytes.length;
                return _this.sendAllBytesNonAppending(objId, transactionId, isHeader, src, ofs);
            });
        });
        return promise;
    };
    StorageOwner.prototype.saveObj = function (objId, obj, newObj) {
        var _this = this;
        var transactionId;
        var transParams = makeTransactionParamsFor(obj, newObj);
        if ((transParams.sizes.header < 0) || (transParams.sizes.segments < 0)) {
            throw new Error("Sending limitless file is not implemented, yet");
        }
        var promise = this.startTransaction(objId, transParams).then(function (transId) {
            transactionId = transId;
            return _this.sendAllBytesNonAppending(objId, transactionId, true, obj.header);
        }).then(function () {
            return _this.sendAllBytesNonAppending(objId, transactionId, false, obj.segments);
        }).fail(function (err) {
            if (transactionId) {
                return _this.cancelTransaction(objId, transactionId).then(function () {
                    throw err;
                }, function () {
                    throw err;
                });
            }
            throw err;
        }).then(function () {
            _this.completeTransaction(objId, transactionId);
        });
        return promise;
    };
    return StorageOwner;
})(baseServiceUser.ServiceUser);
exports.StorageOwner = StorageOwner;
Object.freeze(StorageOwner.prototype);
Object.freeze(StorageOwner);
Object.freeze(exports);

},{"../../lib-common/service-api/3nstorage/owner":26,"../byte-source":9,"../service-locator":14,"../user-with-mid-session":16,"../workers/key-gen-common":18,"../xhr-utils":20,"q":"q"}],4:[function(require,module,exports){
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
var Q = require('q');
var remoteServ = require('./service');
var StorageOwner = (function () {
    function StorageOwner(getMidSigner) {
        this.remoteStorage = null;
        this.loginProc = null;
        this.getMidSigner = getMidSigner;
        Object.seal(this);
    }
    StorageOwner.makeAndLogin = function (serviceUrl, getMidSigner) {
        var s = new StorageOwner(getMidSigner);
        var promise = s.getMidSigner().then(function (signer) {
            s.remoteStorage = new remoteServ.StorageOwner(signer.address);
            return s.remoteStorage.setStorageUrl(serviceUrl).then(function () {
                return s.remoteStorage.login(signer);
            });
        }).then(function () {
            return s.wrap();
        });
        return promise;
    };
    StorageOwner.prototype.login = function () {
        var _this = this;
        if (this.loginProc) {
            return this.loginProc;
        }
        this.loginProc = this.getMidSigner().then(function (signer) {
        }).fin(function () {
            _this.loginProc = null;
        });
        return this.loginProc;
    };
    StorageOwner.prototype.getRootKeyDerivParams = function () {
        return this.remoteStorage.keyDerivParams;
    };
    StorageOwner.prototype.getObj = function (objId) {
        var _this = this;
        if (this.remoteStorage.sessionId) {
            return Q.when(this.remoteStorage.getObj(objId));
        }
        return this.login().then(function () {
            return _this.remoteStorage.getObj(objId);
        });
    };
    StorageOwner.prototype.getObjHeader = function (objId) {
        var _this = this;
        if (this.remoteStorage.sessionId) {
            return Q.when(this.remoteStorage.getObjHeader(objId));
        }
        return this.login().then(function () {
            return _this.remoteStorage.getObjHeader(objId);
        });
    };
    StorageOwner.prototype.saveObj = function (objId, obj, newObj) {
        var _this = this;
        if (this.remoteStorage.sessionId) {
            return this.remoteStorage.saveObj(objId, obj, newObj);
        }
        return this.login().then(function () {
            return _this.remoteStorage.saveObj(objId, obj, newObj);
        });
    };
    StorageOwner.prototype.close = function () {
        var _this = this;
        return (this.remoteStorage.sessionId ? this.remoteStorage.logout() : Q.when()).fin(function () {
            _this.getMidSigner = null;
            _this.remoteStorage = null;
        }).fail(function (err) {
            return;
        });
    };
    StorageOwner.prototype.wrap = function () {
        return {
            getObj: this.getObj.bind(this),
            getObjHeader: this.getObjHeader.bind(this),
            saveObj: this.saveObj.bind(this),
            close: this.close.bind(this),
            getRootKeyDerivParams: this.getRootKeyDerivParams.bind(this)
        };
    };
    return StorageOwner;
})();
Object.freeze(StorageOwner.prototype);
Object.freeze(StorageOwner);
exports.make3NStorageOwner = StorageOwner.makeAndLogin;
Object.freeze(exports);

},{"./service":3,"q":"q"}],5:[function(require,module,exports){
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
var random = require('../../random');
var nacl = require('ecma-nacl');
var utf8 = require('../../../lib-common/utf8');
var byteSrcMod = require('../../byte-source');
var SEG_SIZE = 16; // in 256-byte blocks
var FileCrypto = (function () {
    function FileCrypto(keyHolder) {
        this.keyHolder = keyHolder;
    }
    FileCrypto.prototype.wipe = function () {
        if (this.keyHolder) {
            this.keyHolder.destroy();
            this.keyHolder = null;
        }
    };
    FileCrypto.makeForNewFile = function (parentEnc, arrFactory) {
        var keyHolder = nacl.fileXSP.makeNewFileKeyHolder(parentEnc, random.bytes, arrFactory);
        parentEnc.destroy();
        var fc = new FileCrypto(keyHolder);
        return fc;
    };
    /**
     * @param parentDecr
     * @param src for the whole xsp object
     * @param arrFactory
     * @return folder crypto object with null mkey, which should be set
     * somewhere else.
     */
    FileCrypto.makeForExistingFile = function (parentDecr, headerSrc, arrFactory) {
        var promise = headerSrc.read(0, null, true).then(function (header) {
            var keyHolder = nacl.fileXSP.makeFileKeyHolder(parentDecr, header, arrFactory);
            parentDecr.destroy();
            return new FileCrypto(keyHolder);
        });
        return promise;
    };
    FileCrypto.prototype.decryptedBytesSource = function (src) {
        if (!this.keyHolder) {
            throw new Error("Cannot use wiped object.");
        }
        return byteSrcMod.makeDecryptedByteSource(src, this.keyHolder.segReader);
    };
    FileCrypto.prototype.encryptingByteSink = function (objSink) {
        if (!this.keyHolder) {
            throw new Error("Cannot use wiped object.");
        }
        return byteSrcMod.makeEncryptingByteSink(objSink, this.keyHolder.newSegWriter(SEG_SIZE, random.bytes));
    };
    FileCrypto.prototype.pack = function (bytes) {
        if (!this.keyHolder) {
            throw new Error("Cannot use wiped object.");
        }
        var segWriter = this.keyHolder.newSegWriter(SEG_SIZE, random.bytes);
        var objSrc = byteSrcMod.makeObjByteSourceFromArrays(bytes, segWriter);
        segWriter.destroy();
        return objSrc;
    };
    return FileCrypto;
})();
exports.FileCrypto = FileCrypto;
Object.freeze(FileCrypto.prototype);
Object.freeze(FileCrypto);
var FolderCrypto = (function () {
    function FolderCrypto(keyHolder) {
        this.mkey = null;
        this.arrFactory = nacl.arrays.makeFactory();
        this.keyHolder = keyHolder;
    }
    FolderCrypto.makeForNewFolder = function (parentEnc, arrFactory) {
        var keyHolder = nacl.fileXSP.makeNewFileKeyHolder(parentEnc, random.bytes, arrFactory);
        parentEnc.destroy();
        var fc = new FolderCrypto(keyHolder);
        fc.mkey = random.bytes(nacl.secret_box.KEY_LENGTH);
        return fc;
    };
    /**
     * @param parentDecr
     * @param objSrc
     * @param arrFactory
     * @return folder crypto object with null mkey, which should be set
     * somewhere else.
     */
    FolderCrypto.makeForExistingFolder = function (parentDecr, objSrc, arrFactory) {
        var keyHolder;
        var byteSrc = byteSrcMod.makeDecryptedByteSource(objSrc, function (header) {
            keyHolder = nacl.fileXSP.makeFileKeyHolder(parentDecr, header, arrFactory);
            parentDecr.destroy();
            return keyHolder.segReader(header);
        });
        return byteSrc.read(0, null, true).then(function (bytes) {
            var fc = new FolderCrypto(keyHolder);
            var folderJson = fc.setMKeyAndParseRestOfBytes(bytes);
            return { crypto: fc, folderJson: folderJson };
        });
    };
    FolderCrypto.prototype.pack = function (json) {
        if (!this.keyHolder) {
            throw new Error("Cannot use wiped object.");
        }
        var segWriter = this.keyHolder.newSegWriter(SEG_SIZE, random.bytes);
        var completeContent = [this.mkey, utf8.pack(JSON.stringify(json))];
        var objSrc = byteSrcMod.makeObjByteSourceFromArrays(completeContent, segWriter);
        segWriter.destroy();
        return objSrc;
    };
    FolderCrypto.prototype.setMKeyAndParseRestOfBytes = function (bytes) {
        if (bytes.length < nacl.secret_box.KEY_LENGTH) {
            throw new Error("Too few bytes folder object.");
        }
        var mkeyPart = bytes.subarray(0, nacl.secret_box.KEY_LENGTH);
        this.mkey = new Uint8Array(mkeyPart);
        nacl.arrays.wipe(mkeyPart);
        return JSON.parse(utf8.open(bytes.subarray(nacl.secret_box.KEY_LENGTH)));
    };
    FolderCrypto.prototype.childMasterDecr = function () {
        if (!this.mkey) {
            throw new Error("Master key is not set.");
        }
        return nacl.secret_box.formatWN.makeDecryptor(this.mkey, this.arrFactory);
    };
    FolderCrypto.prototype.childMasterEncr = function () {
        if (!this.mkey) {
            throw new Error("Master key is not set.");
        }
        return nacl.secret_box.formatWN.makeEncryptor(this.mkey, random.bytes(nacl.secret_box.NONCE_LENGTH), 1, this.arrFactory);
    };
    FolderCrypto.prototype.openAndSetFrom = function (src) {
        var _this = this;
        if (!this.keyHolder) {
            throw new Error("Cannot use wiped object.");
        }
        var byteSrc = byteSrcMod.makeDecryptedByteSource(src, this.keyHolder.segReader);
        return byteSrc.read(0, null, true).then(function (bytes) {
            return _this.setMKeyAndParseRestOfBytes(bytes);
        });
    };
    FolderCrypto.prototype.wipe = function () {
        if (this.keyHolder) {
            this.keyHolder.destroy();
            this.keyHolder = null;
        }
        if (this.mkey) {
            nacl.arrays.wipe(this.mkey);
            this.mkey = null;
        }
    };
    FolderCrypto.prototype.clone = function (arrFactory) {
        var fc = new FolderCrypto(this.keyHolder.clone(arrFactory));
        if (this.mkey) {
            fc.mkey = new Uint8Array(this.mkey);
        }
        return fc;
    };
    return FolderCrypto;
})();
exports.FolderCrypto = FolderCrypto;
Object.freeze(FolderCrypto.prototype);
Object.freeze(FolderCrypto);
Object.freeze(exports);

},{"../../../lib-common/utf8":31,"../../byte-source":9,"../../random":13,"ecma-nacl":"ecma-nacl"}],6:[function(require,module,exports){
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
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
/**
 * Everything in this module is assumed to be inside of a file system
 * reliance set, exposing to outside only folder's wrap.
 */
var fErrMod = require('../../../lib-common/file-err');
var Q = require('q');
var byteSrcMod = require('../../byte-source');
var fsCryptoMod = require('./fs-crypto');
var FSEntity = (function () {
    function FSEntity(fs, name, objId, parentId) {
        this.crypto = null;
        this.fs = fs;
        this.name = name;
        this.objId = objId;
        this.parentId = parentId;
    }
    FSEntity.prototype.pushCompleteSavingTask = function (encrObjSrc, isNew) {
        return this.fs.addSavingTask(this.objId, encrObjSrc, isNew);
    };
    return FSEntity;
})();
var File = (function (_super) {
    __extends(File, _super);
    function File(fs, name, objId, parentId) {
        _super.call(this, fs, name, objId, parentId);
        if (!name || !objId || !parentId) {
            throw new Error("Bad file parameter(s) given");
        }
        Object.seal(this);
    }
    File.prototype.readSrc = function () {
        var _this = this;
        return this.fs.storage.getObj(this.objId).then(function (objSrc) {
            return _this.crypto.decryptedBytesSource(objSrc);
        });
    };
    File.prototype.writeSink = function () {
        var pipe = new byteSrcMod.SinkBackedObjSource();
        return {
            sink: this.crypto.encryptingByteSink(pipe.sink),
            writeCompletion: this.pushCompleteSavingTask(pipe.src, false)
        };
    };
    File.prototype.save = function (bytes) {
        return this.pushCompleteSavingTask(this.crypto.pack(bytes), false);
    };
    File.prototype.saveNew = function () {
        return this.pushCompleteSavingTask(this.crypto.pack([]), true);
    };
    File.prototype.wrap = function () {
        var _this = this;
        var wrap = {
            getName: function () {
                return _this.name;
            },
            getObjId: function () {
                return _this.objId;
            },
            readSrc: this.readSrc.bind(this),
            // TODO put into fs defering logic for buffering of general sink,
            //		as simple implementation is not handling properly initially unknown
            //			writeSink: this.writeSink.bind(this),
            save: this.save.bind(this)
        };
        Object.freeze(wrap);
        return wrap;
    };
    return File;
})(FSEntity);
exports.File = File;
function makeFileJson(objId, name) {
    var f = {
        name: name,
        objId: objId
    };
    return f;
}
var EMPTY_BYTE_ARR = new Uint8Array(0);
var Folder = (function (_super) {
    __extends(Folder, _super);
    function Folder(fs, name, objId, parentId) {
        if (name === void 0) { name = null; }
        if (objId === void 0) { objId = null; }
        if (parentId === void 0) { parentId = null; }
        _super.call(this, fs, name, objId, parentId);
        this.folderJson = null;
        /**
         * files field contains only instantiated file and folder objects,
         * therefore, it should not be used to check existing names in this folder.
         */
        this.files = {};
        if (!name && (objId || parentId)) {
            throw new Error("Root folder must " + "have both objId and parent as nulls.");
        }
        else if (objId === null) {
            new Error("Missing objId for non-root folder");
        }
        Object.seal(this);
    }
    Folder.newRoot = function (fs, masterEnc) {
        var rf = new Folder(fs);
        rf.setEmptyFolderJson();
        rf.crypto = fsCryptoMod.FolderCrypto.makeForNewFolder(masterEnc, fs.arrFactory);
        rf.save(true);
        return rf;
    };
    Folder.rootFromFolder = function (fs, f) {
        if (f.parentId === null) {
            throw new Error("Given folder is already root");
        }
        var rf = new Folder(fs, f.name, f.objId, null);
        rf.setFolderJson(f.folderJson);
        rf.crypto = f.crypto.clone(fs.arrFactory);
        return rf;
    };
    Folder.rootFromObjBytes = function (fs, name, objId, src, masterDecr) {
        var rf = new Folder(fs, name, objId);
        return fsCryptoMod.FolderCrypto.makeForExistingFolder(masterDecr, src, fs.arrFactory).then(function (partsForInit) {
            rf.crypto = partsForInit.crypto;
            rf.setFolderJson(partsForInit.folderJson);
            return rf;
        });
    };
    Folder.prototype.registerInFolderJson = function (f, isFolder) {
        if (isFolder === void 0) { isFolder = false; }
        var fj = {
            name: f.name,
            objId: f.objId,
        };
        if (isFolder) {
            fj.isFolder = true;
        }
        this.folderJson.files[fj.name] = fj;
    };
    Folder.prototype.addObj = function (f) {
        this.files[f.name] = f;
        this.fs.objs[f.objId] = f;
    };
    Folder.prototype.list = function () {
        return Object.keys(this.folderJson.files);
    };
    Folder.prototype.listFolders = function () {
        var _this = this;
        return Object.keys(this.folderJson.files).filter(function (name) {
            return !!_this.folderJson.files[name].isFolder;
        });
    };
    Folder.prototype.getFileJson = function (name, nullOnMissing) {
        if (nullOnMissing === void 0) { nullOnMissing = false; }
        var fj = this.folderJson.files[name];
        if (fj) {
            return fj;
        }
        else if (nullOnMissing) {
            return null;
        }
        else {
            throw fErrMod.makeErr(fErrMod.Code.noFile, "File '" + name + "' does not exist");
        }
    };
    Folder.prototype.getFolder = function (name, nullOnMissing) {
        var _this = this;
        if (nullOnMissing === void 0) { nullOnMissing = false; }
        try {
            var childInfo = this.getFileJson(name, nullOnMissing);
            if (!childInfo) {
                return Q.when(null);
            }
            if (!childInfo.isFolder) {
                throw fErrMod.makeErr(fErrMod.Code.notDirectory, "Entry '" + name + "' in folder '" + this.name + "' is not a folder");
            }
            var child = this.files[childInfo.name];
            if (child) {
                return Q.when(child);
            }
            if (Array.isArray(childInfo.objId)) {
                throw new Error("This implementation does not support " + "folders, spread over several objects.");
            }
            var promise = this.fs.storage.getObj(childInfo.objId).then(function (src) {
                return fsCryptoMod.FolderCrypto.makeForExistingFolder(_this.crypto.childMasterDecr(), src, _this.fs.arrFactory);
            }).then(function (partsForInit) {
                var f = new Folder(_this.fs, childInfo.name, childInfo.objId, _this.objId);
                f.crypto = partsForInit.crypto;
                f.setFolderJson(partsForInit.folderJson);
                _this.addObj(f);
                return f;
            });
            return promise;
        }
        catch (err) {
            return Q.reject(err);
        }
    };
    Folder.prototype.getFile = function (name, nullOnMissing) {
        var _this = this;
        if (nullOnMissing === void 0) { nullOnMissing = false; }
        try {
            var childInfo = this.getFileJson(name, nullOnMissing);
            if (!childInfo) {
                return Q.when(null);
            }
            if (childInfo.isFolder) {
                throw fErrMod.makeErr(fErrMod.Code.isDirectory, "Entry '" + name + "' in folder '" + this.name + "' is not a file");
            }
            var child = this.files[name];
            if (child) {
                return Q.when(child);
            }
            if (Array.isArray(childInfo.objId)) {
                throw new Error("This implementation does not support " + "files, spread over several objects.");
            }
            var promise = this.fs.storage.getObjHeader(childInfo.objId).then(function (headerSrc) {
                return fsCryptoMod.FileCrypto.makeForExistingFile(_this.crypto.childMasterDecr(), headerSrc, _this.fs.arrFactory);
            }).then(function (fc) {
                var f = new File(_this.fs, name, childInfo.objId, _this.objId);
                f.crypto = fc;
                _this.addObj(f);
                return f;
            });
            return promise;
        }
        catch (err) {
            return Q.reject(err);
        }
    };
    Folder.prototype.createFolder = function (name) {
        if (this.getFileJson(name, true)) {
            throw fErrMod.makeErr(fErrMod.Code.fileExists, "File '" + name + "' alread exists");
        }
        var f = new Folder(this.fs, name, this.fs.generateNewObjId(), this.objId);
        f.setEmptyFolderJson();
        f.crypto = fsCryptoMod.FolderCrypto.makeForNewFolder(this.crypto.childMasterEncr(), this.fs.arrFactory);
        this.registerInFolderJson(f, true);
        this.addObj(f);
        f.save(true);
        this.save();
        return f;
    };
    Folder.prototype.createFile = function (name) {
        if (this.getFileJson(name, true)) {
            throw fErrMod.makeErr(fErrMod.Code.fileExists, "File '" + name + "' alread exists");
        }
        var f = new File(this.fs, name, this.fs.generateNewObjId(), this.objId);
        f.crypto = fsCryptoMod.FileCrypto.makeForNewFile(this.crypto.childMasterEncr(), this.fs.arrFactory);
        this.registerInFolderJson(f);
        this.addObj(f);
        f.saveNew();
        this.save();
        return f;
    };
    Folder.prototype.getFolderInThisSubTree = function (path, createIfMissing) {
        var _this = this;
        if (path.length === 0) {
            return Q.when(this);
        }
        var promise = this.getFolder(path[0]).fail(function (err) {
            if (err.code !== fErrMod.Code.noFile) {
                throw err;
            }
            if (!createIfMissing) {
                throw err;
            }
            return _this.createFolder(path[0]);
        }).then(function (f) {
            if (path.length > 1) {
                return f.getFolderInThisSubTree(path.slice(1), createIfMissing);
            }
            else {
                return f;
            }
        });
        return promise;
    };
    Folder.prototype.save = function (isNew) {
        if (isNew === void 0) { isNew = false; }
        return this.pushCompleteSavingTask(this.crypto.pack(this.folderJson), isNew);
    };
    Folder.prototype.setEmptyFolderJson = function () {
        this.folderJson = {
            files: {}
        };
    };
    Folder.prototype.setFolderJson = function (folderJson) {
        // TODO sanitize folderJson before using it
        this.folderJson = folderJson;
    };
    Folder.prototype.update = function (encrSrc) {
        var _this = this;
        return this.fs.storage.getObj(this.objId).then(function (src) {
            return _this.crypto.openAndSetFrom(src);
        }).then(function (folderJson) {
            _this.setFolderJson(folderJson);
        });
    };
    Folder.prototype.wrap = function () {
        var _this = this;
        var wrap = {
            getName: function () {
                return _this.name;
            },
            getObjId: function () {
                return _this.objId;
            },
            list: this.list.bind(this),
            listFolders: this.listFolders.bind(this),
            getFolderInThisSubTree: function (path, createIfMissing) {
                if (createIfMissing === void 0) { createIfMissing = false; }
                return _this.getFolderInThisSubTree(path, createIfMissing).then(function (f) {
                    return f.wrap();
                });
            },
            getFolder: function (name, nullOnMissing) {
                if (nullOnMissing === void 0) { nullOnMissing = false; }
                return _this.getFolder(name, nullOnMissing).then(function (f) {
                    return (f ? f.wrap() : null);
                });
            },
            createFolder: function (name) {
                return _this.createFolder(name).wrap();
            },
            getFile: function (name, nullOnMissing) {
                if (nullOnMissing === void 0) { nullOnMissing = false; }
                return _this.getFile(name, nullOnMissing).then(function (f) {
                    return (f ? f.wrap() : null);
                });
            },
            createFile: function (name) {
                return _this.createFile(name).wrap();
            }
        };
        Object.freeze(wrap);
        return wrap;
    };
    return Folder;
})(FSEntity);
exports.Folder = Folder;
Object.freeze(Folder.prototype);
Object.freeze(Folder);
Object.freeze(exports);

},{"../../../lib-common/file-err":22,"../../byte-source":9,"./fs-crypto":5,"q":"q"}],7:[function(require,module,exports){
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
var folderMod = require('./fs-entities');
var random = require('../../random');
var Q = require('q');
var nacl = require('ecma-nacl');
var OBJID_LEN = 40;
exports.sysFolders = {
    appData: 'Apps Data',
    userFiles: 'User Files'
};
Object.freeze(exports.sysFolders);
var FS = (function () {
    function FS(storage) {
        this.arrFactory = nacl.arrays.makeFactory();
        this.objs = {};
        this.savingProc = null;
        this.root = null;
        this.isSubRoot = true;
        this.objsToSave = { ordered: [], byId: {} };
        this.storage = storage;
        Object.seal(this);
    }
    FS.prototype.getSavingProc = function () {
        return this.savingProc;
    };
    /**
     * @return new objId, with null placed under this id, reserving it in
     * objs map.
     */
    FS.prototype.generateNewObjId = function () {
        var id = random.stringOfB64UrlSafeChars(OBJID_LEN);
        if ('undefined' === typeof this.objs[id]) {
            this.objs[id] = null;
            return id;
        }
        else {
            return this.generateNewObjId();
        }
    };
    FS.prototype.setRoot = function (root) {
        if (this.root) {
            throw new Error("Root is already set.");
        }
        this.root = root;
        if ('string' === typeof root.objId) {
            this.objs[root.objId] = root;
        }
    };
    FS.prototype.makeSubRoot = function (f) {
        var fs = new FS(this.storage);
        var folder = this.objs[f.getObjId()];
        fs.setRoot(folderMod.Folder.rootFromFolder(fs, folder));
        fs.isSubRoot = true;
        return fs.wrap();
    };
    FS.makeNewRoot = function (storage, masterEnc) {
        var fs = new FS(storage);
        fs.setRoot(folderMod.Folder.newRoot(fs, masterEnc));
        fs.root.createFolder(exports.sysFolders.appData);
        fs.root.createFolder(exports.sysFolders.userFiles);
        return fs.wrap();
    };
    FS.makeExisting = function (storage, rootObjId, masterDecr, rootName) {
        if (rootName === void 0) { rootName = null; }
        var fs = new FS(storage);
        var promise = storage.getObj(rootObjId).then(function (objSrc) {
            return folderMod.Folder.rootFromObjBytes(fs, rootName, rootObjId, objSrc, masterDecr);
        }).then(function (root) {
            fs.setRoot(root);
            return fs.wrap();
        });
        return promise;
    };
    FS.prototype.doSavingIteratively = function () {
        var _this = this;
        var task = this.objsToSave.ordered.shift();
        if (!task) {
            this.savingProc = null;
            return;
        }
        delete this.objsToSave.byId[task.objId];
        return this.storage.saveObj(task.objId, task.encrObjSrc, task.newObj).then(function () {
            task.deferredSaving.resolve();
            return _this.doSavingIteratively();
        }, function (err) {
            task.deferredSaving.reject(err);
            return task.deferredSaving.promise;
        });
    };
    FS.prototype.flush = function () {
        var _this = this;
        if (this.savingProc) {
            return;
        }
        if (this.objsToSave.ordered.length === 0) {
            return;
        }
        this.savingProc = Q.when().then(function () {
            return _this.doSavingIteratively();
        }).fail(function (err) {
            _this.savingProc = null;
            throw err;
        });
    };
    FS.prototype.close = function (closeStorage) {
        var _this = this;
        if (closeStorage === void 0) { closeStorage = true; }
        this.flush();
        this.savingProc = (this.savingProc ? this.savingProc : Q.when()).then(function () {
            // TODO add destroing of obj's (en)decryptors
            if (!closeStorage) {
                return;
            }
            return _this.storage.close();
        }).then(function () {
            _this.root = null;
            _this.storage = null;
            _this.objs = null;
            _this.objsToSave = null;
            _this.savingProc = null;
        });
        return this.savingProc;
    };
    FS.prototype.addSavingTask = function (objId, encrObjSrc, isNew) {
        var task = this.objsToSave.byId[objId];
        if (task) {
            if (!task.newObj && isNew) {
                throw new Error("Illegal indication " + "of new file, for an already existing one.");
            }
            // we fast resolve existing task's deferred, as write has not
            // started, since task can still be found in above container,
            // and we replace source with a new one, and set new deferred
            task.encrObjSrc = encrObjSrc;
            task.deferredSaving.resolve();
            task.deferredSaving = Q.defer();
        }
        else {
            task = {
                objId: objId,
                encrObjSrc: encrObjSrc,
                newObj: isNew,
                deferredSaving: Q.defer()
            };
            this.objsToSave.byId[task.objId] = task;
            this.objsToSave.ordered.push(task);
        }
        this.flush();
        return task.deferredSaving.promise;
    };
    FS.prototype.getRoot = function () {
        return this.root.wrap();
    };
    FS.prototype.changeObjId = function (obj, newId) {
        throw new Error("Not implemented, yet");
    };
    FS.prototype.move = function (destFolder, newName) {
        throw new Error("Not implemented, yet");
    };
    FS.prototype.wrap = function () {
        var wrap = {
            getRoot: this.getRoot.bind(this),
            flush: this.flush.bind(this),
            close: this.close.bind(this),
            getSavingProc: this.getSavingProc.bind(this),
            makeSubRoot: this.makeSubRoot.bind(this)
        };
        Object.freeze(wrap);
        return wrap;
    };
    return FS;
})();
exports.FS = FS;
Object.freeze(FS.prototype);
Object.freeze(FS);
Object.freeze(exports);

},{"../../random":13,"./fs-entities":6,"ecma-nacl":"ecma-nacl","q":"q"}],8:[function(require,module,exports){
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
var fsMod = require('./fs');
exports.sysFolders = fsMod.sysFolders;
exports.makeNewRoot = fsMod.FS.makeNewRoot;
exports.makeExisting = fsMod.FS.makeExisting;
Object.freeze(exports);

},{"./fs":7}],9:[function(require,module,exports){
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
var Q = require('q');
var nacl = require('ecma-nacl');
var BytesFIFOBuffer = (function () {
    function BytesFIFOBuffer() {
        this.queue = [];
        this.queueLen = 0;
        Object.seal(this);
    }
    Object.defineProperty(BytesFIFOBuffer.prototype, "length", {
        get: function () {
            return this.queueLen;
        },
        enumerable: true,
        configurable: true
    });
    BytesFIFOBuffer.prototype.push = function (bytes) {
        this.queue.push(bytes);
        this.queueLen += bytes.length;
    };
    BytesFIFOBuffer.prototype.extractAllBytesFrom = function () {
        if (this.queue.length === 1) {
            return this.queue.pop();
        }
        else if (this.queue.length === 0) {
            return null;
        }
        var extractLen = 0;
        for (var i = 0; i < this.queue.length; i += 1) {
            extractLen += this.queue[i].length;
        }
        var extract = new Uint8Array(extractLen);
        var offset = 0;
        var chunk;
        for (var i = 0; i < this.queue.length; i += 1) {
            chunk = this.queue[i];
            extract.set(chunk, offset);
            offset += chunk.length;
        }
        for (var i = 0; i < this.queue.length; i += 1) {
            this.queue.pop();
        }
        return extract;
    };
    BytesFIFOBuffer.prototype.extractSomeBytesFrom = function (extractLen) {
        if (this.queue.length === 0) {
            return null;
        }
        var extract = new Uint8Array(extractLen);
        var offset = 0;
        var chunk;
        while (offset < extractLen) {
            chunk = this.queue[0];
            if ((offset + chunk.length) <= extractLen) {
                extract.set(chunk, offset);
                offset += chunk.length;
                this.queue.shift();
            }
            else {
                extract.set(chunk.subarray(0, extractLen - offset), offset);
                this.queue[0] = chunk.subarray(extractLen - offset);
                break;
            }
        }
        return extract;
    };
    /**
     * @param min is a minimum required number of bytes
     * @param max is a maximum number of bytes, which must be a
     * positive number, greater or equal to min, or it can be null, when
     * there is no maximum limit.
     * @return an array of bytes, or null, if there are not enough bytes.
     */
    BytesFIFOBuffer.prototype.getBytes = function (min, max) {
        if (this.queue.length === 0) {
            return null;
        }
        if (this.queueLen < min) {
            return null;
        }
        var extract = ((max === null) || (this.queueLen <= max)) ? this.extractAllBytesFrom() : this.extractSomeBytesFrom(max);
        if (extract) {
            this.queueLen -= extract.length;
        }
        return extract;
    };
    return BytesFIFOBuffer;
})();
var SinkBackedByteSource = (function () {
    function SinkBackedByteSource() {
        var _this = this;
        this.totalSize = null;
        this.isTotalSizeSet = false;
        this.collectedBytes = 0;
        this.isComplete = false;
        this.buf = new BytesFIFOBuffer();
        this.deferredRead = null;
        this.src = {
            read: this.readBytes.bind(this),
            totalSize: function () {
                return _this.totalSize;
            }
        };
        Object.freeze(this.src);
        this.sink = {
            swallow: this.swallowBytes.bind(this),
            setTotalSize: this.setTotalSize.bind(this)
        };
        Object.freeze(this.sink);
        Object.seal(this);
    }
    SinkBackedByteSource.prototype.setTotalSize = function (size) {
        if (this.isTotalSizeSet) {
            throw new Error("Total size has already been set");
        }
        else if ((size !== null) && (size < this.collectedBytes)) {
            throw new Error("Given size is less than number of " + "already collected bytes.");
        }
        this.isTotalSizeSet = true;
        if ('number' === typeof size) {
            this.totalSize = size;
        }
    };
    SinkBackedByteSource.prototype.readBytes = function (min, max, toSrcEnd) {
        if (min === void 0) { min = 0; }
        if (max === void 0) { max = null; }
        if (toSrcEnd === void 0) { toSrcEnd = false; }
        if (min < 0) {
            min = 0;
        }
        if (toSrcEnd) {
            max = null;
        }
        if (('number' === typeof max) && ((max < 1) || (max < min))) {
            throw new Error("Given bad min-max parameters.");
        }
        if (('number' === typeof max) && (max < min)) {
            throw new Error("Bad min-max parameters are given.");
        }
        if (this.isComplete) {
            return Q.when(this.buf.getBytes(0, max));
        }
        if (this.deferredRead) {
            throw new Error("There is already pending read");
        }
        if (!toSrcEnd) {
            var bufferedBytes = this.buf.getBytes(min, max);
            if (bufferedBytes) {
                return Q.when(bufferedBytes);
            }
        }
        this.deferredRead = {
            deferred: Q.defer(),
            min: min,
            max: max,
            toSrcEnd: !!toSrcEnd
        };
        return this.deferredRead.deferred.promise;
    };
    SinkBackedByteSource.prototype.swallowBytes = function (bytes) {
        if (this.isComplete) {
            if (bytes === null) {
                return;
            }
            else {
                throw new Error("Complete sink cannot except any more bytes.");
            }
        }
        var boundsErr = null;
        if (bytes === null) {
            this.isComplete = true;
            if (this.totalSize === null) {
                this.totalSize = this.collectedBytes;
            }
            else if (this.totalSize < this.collectedBytes) {
                boundsErr = new Error("Stopping bytes at " + this.collectedBytes + ", which is sooner than declared total size " + this.totalSize + ".");
            }
        }
        else {
            if (bytes.length === 0) {
                return;
            }
            if (this.totalSize !== null) {
                var maxBytesExpectation = this.totalSize - this.collectedBytes;
                if (bytes.length >= maxBytesExpectation) {
                    this.isComplete = true;
                    if (bytes.length > maxBytesExpectation) {
                        boundsErr = new Error("More bytes given than sink was " + "set to accept; swallowing only part of bytes.");
                        if (maxBytesExpectation === 0) {
                            throw boundsErr;
                        }
                        bytes = bytes.subarray(0, maxBytesExpectation);
                    }
                }
            }
            this.buf.push(bytes);
            this.collectedBytes += bytes.length;
        }
        if (!this.deferredRead) {
            return;
        }
        if (this.isComplete) {
            this.deferredRead.deferred.resolve(this.buf.getBytes(0, this.deferredRead.max));
        }
        else {
            var bufferedBytes = this.buf.getBytes(this.deferredRead.min, this.deferredRead.max);
            if (bufferedBytes) {
                this.deferredRead.deferred.resolve(bufferedBytes);
            }
        }
        if (boundsErr) {
            throw boundsErr;
        }
    };
    return SinkBackedByteSource;
})();
exports.SinkBackedByteSource = SinkBackedByteSource;
var SinkBackedObjSource = (function () {
    function SinkBackedObjSource() {
        this.version = null;
        this.header = new SinkBackedByteSource();
        this.segs = new SinkBackedByteSource();
        this.sink = {
            header: this.header.sink,
            segments: this.segs.sink,
            setObjVersion: this.setObjVersion.bind(this)
        };
        Object.freeze(this.sink);
        this.src = {
            header: this.header.src,
            segments: this.segs.src,
            getObjVersion: this.getObjVersion.bind(this)
        };
    }
    SinkBackedObjSource.prototype.setObjVersion = function (v) {
        if (this.version === null) {
            this.version = v;
        }
        else if (v !== this.version) {
            throw new Error("Expect object version " + this.version + ", but getting version " + v + " instead");
        }
    };
    SinkBackedObjSource.prototype.getObjVersion = function () {
        return this.version;
    };
    return SinkBackedObjSource;
})();
exports.SinkBackedObjSource = SinkBackedObjSource;
function packAndSink(byteArrs, segWriter, segInd, sink, toObjEnd) {
    if (toObjEnd === void 0) { toObjEnd = false; }
    var dataLenPacked = 0;
    var numOfSegs = 0;
    var i = 0;
    var buf = null;
    var joint;
    var segDataLen;
    while ((buf !== null) || (i < byteArrs.length)) {
        if (buf === null) {
            buf = byteArrs[i];
            i += 1;
            if (buf.length === 0) {
                buf = null;
                continue;
            }
        }
        segDataLen = segWriter.segmentSize(segInd) - nacl.secret_box.POLY_LENGTH;
        if (buf.length >= segDataLen) {
            // Sink buf completely, or just part of it.
            sink.swallow(segWriter.packSeg(buf.subarray(0, segDataLen), segInd).seg);
            dataLenPacked += segDataLen;
            numOfSegs += 1;
            segInd += 1;
            buf = (buf.length > segDataLen) ? buf.subarray(segDataLen) : null;
        }
        else if (i < byteArrs.length) {
            if (byteArrs[i].length === 0) {
                i += 1;
            }
            else if ((buf.length + byteArrs[i].length) > segDataLen) {
                // buf and initial part of the next array are sinked.
                joint = new Uint8Array(segDataLen);
                joint.set(buf, 0);
                joint.set(byteArrs[i].subarray(0, segDataLen - buf.length), buf.length);
                joint = null;
                sink.swallow(segWriter.packSeg(joint, segInd).seg);
                dataLenPacked += segDataLen;
                numOfSegs += 1;
                segInd += 1;
                // buf is set to non-packed part of the next array.
                buf = byteArrs[i].subarray(segDataLen - buf.length);
                i += 1;
            }
            else {
                // Add next array to buf.
                joint = new Uint8Array(buf.length + byteArrs[i].length);
                joint.set(buf, 0);
                joint.set(byteArrs[i], buf.length);
                buf = joint;
                i += 1;
                joint = null;
            }
        }
        else if (toObjEnd) {
            // There are no arrays left at this point, and, since we must go
            // to the end, we sink buf, risking an exception, if there is
            // a mismatch between writer's expectations and a number of
            // given content bytes.
            sink.swallow(segWriter.packSeg(buf, segInd).seg);
            numOfSegs += 1;
            segInd += 1;
            dataLenPacked += buf.length;
            buf = null;
        }
        else {
            break;
        }
    }
    return {
        numOfSegs: numOfSegs,
        dataLenPacked: dataLenPacked,
        leftOver: buf
    };
}
/**
 * @param bytes is an array of byte arrays with content, and it can be
 * modified after this call, as all encryption is done within this call,
 * and given content array is not used by resultant source over its lifetime.
 * @param segWriter that is used used to encrypt bytes into segments.
 * If it were an existing writer, it should be reset for ingestion of a complete
 * new content. Segments writer can be destroyed after this call, as it is not
 * used by resultant source over its lifetime.
 * @param objVersion
 * @return an object byte source
 */
function makeObjByteSourceFromArrays(arrs, segWriter, objVersion) {
    if (objVersion === void 0) { objVersion = null; }
    var byteArrs = (Array.isArray(arrs) ? arrs : [arrs]);
    // pack segments
    var segsPipe = new SinkBackedByteSource();
    var packRes = packAndSink(byteArrs, segWriter, 0, segsPipe.sink, true);
    segsPipe.sink.swallow(null);
    // pack header
    var headerPipe = new SinkBackedByteSource();
    segWriter.setContentLength(packRes.dataLenPacked);
    headerPipe.sink.swallow(segWriter.packHeader());
    headerPipe.sink.swallow(null);
    // return respective byte sources
    return {
        header: headerPipe.src,
        segments: segsPipe.src,
        getObjVersion: function () {
            return objVersion;
        }
    };
}
exports.makeObjByteSourceFromArrays = makeObjByteSourceFromArrays;
var EncryptingByteSink = (function () {
    function EncryptingByteSink(objSink, segsWriter) {
        this.totalSize = null;
        this.isTotalSizeSet = false;
        this.collectedBytes = 0;
        this.isCompleted = false;
        this.segInd = 0;
        this.segBuf = null;
        this.segsWriter = segsWriter;
        this.objSink = objSink;
        this.setObjVersion = this.objSink.setObjVersion;
        Object.seal(this);
    }
    EncryptingByteSink.prototype.encrAndSink = function (bytes) {
        try {
            if (bytes === null) {
                if (this.segBuf) {
                    packAndSink([this.segBuf], this.segsWriter, this.segInd, this.objSink.segments);
                    this.segBuf = null;
                }
                this.objSink.segments.swallow(null);
            }
            else {
                var segContentLen = this.segsWriter.segmentSize(this.segInd) - nacl.secret_box.POLY_LENGTH;
                var packRes = packAndSink((this.segBuf ? [this.segBuf, bytes] : [bytes]), this.segsWriter, this.segInd, this.objSink.segments);
                this.segInd += packRes.numOfSegs;
                this.segBuf = packRes.leftOver;
            }
        }
        catch (err) {
            this.completeOnErr(err);
            throw err;
        }
    };
    EncryptingByteSink.prototype.setCompleted = function () {
        this.isCompleted = true;
        this.segsWriter.destroy();
        this.segsWriter = null;
    };
    EncryptingByteSink.prototype.completeOnErr = function (err) {
        this.objSink.segments.swallow(null, err);
        if (this.totalSize === null) {
            this.objSink.header.swallow(null, err);
        }
        this.setCompleted();
    };
    EncryptingByteSink.prototype.swallow = function (bytes, err) {
        if (this.isCompleted) {
            if (bytes === null) {
                return;
            }
            else {
                throw new Error("Complete sink cannot except any more bytes.");
            }
        }
        var boundsErr = null;
        if (bytes === null) {
            if (err) {
                this.completeOnErr(err);
                return;
            }
            if (this.totalSize === null) {
                this.setTotalSize(this.collectedBytes);
            }
            else if (this.totalSize < this.collectedBytes) {
                boundsErr = new Error("Stopping bytes at " + this.collectedBytes + ", which is sooner than declared total size " + this.totalSize + ".");
            }
            this.encrAndSink(null);
            this.setCompleted();
        }
        else {
            if (bytes.length === 0) {
                return;
            }
            if (this.totalSize !== null) {
                var maxBytesExpectation = this.totalSize - this.collectedBytes;
                if (bytes.length >= maxBytesExpectation) {
                    this.isCompleted = true;
                    if (bytes.length > maxBytesExpectation) {
                        boundsErr = new Error("More bytes given than sink was " + "set to accept; swallowing only part of bytes.");
                        if (maxBytesExpectation === 0) {
                            throw boundsErr;
                        }
                        bytes = bytes.subarray(0, maxBytesExpectation);
                    }
                }
            }
            this.encrAndSink(bytes);
        }
        if (boundsErr) {
            throw boundsErr;
        }
    };
    EncryptingByteSink.prototype.setTotalSize = function (size) {
        if (this.isTotalSizeSet) {
            throw new Error("Total size has already been set");
        }
        else if ((size !== null) && (size < this.collectedBytes)) {
            throw new Error("Given size is less than number of " + "already collected bytes.");
        }
        this.isTotalSizeSet = true;
        if ('number' === typeof size) {
            this.totalSize = size;
            this.segsWriter.setContentLength(size);
        }
        this.objSink.header.swallow(this.segsWriter.packHeader());
        this.objSink.header.swallow(null);
    };
    EncryptingByteSink.prototype.wrap = function () {
        var wrap = {
            swallow: this.swallow.bind(this),
            setTotalSize: this.setTotalSize.bind(this),
            setObjVersion: this.setObjVersion
        };
        Object.freeze(wrap);
        return wrap;
    };
    return EncryptingByteSink;
})();
function makeEncryptingByteSink(objSink, segsWriter) {
    return (new EncryptingByteSink(objSink, segsWriter)).wrap();
}
exports.makeEncryptingByteSink = makeEncryptingByteSink;
var DecryptingByteSource = (function () {
    function DecryptingByteSource(objSrc, segReaderGen) {
        var _this = this;
        this.segsReader = null;
        this.readInProgress = null;
        this.segInd = 0;
        this.segBuf = null;
        this.buf = new BytesFIFOBuffer();
        this.decryptedAll = false;
        this.segs = objSrc.segments;
        this.getObjVersion = objSrc.getObjVersion;
        this.initProgress = objSrc.header.read(0, null, true).then(function (header) {
            _this.segsReader = segReaderGen(header);
            _this.decryptedAll = (_this.segsReader.isEndlessFile() ? false : (_this.segsReader.numberOfSegments() === 0));
            _this.initProgress = null;
        });
        Object.seal(this);
    }
    DecryptingByteSource.prototype.setDecryptedAll = function () {
        this.decryptedAll = true;
        this.segsReader.destroy();
        this.segsReader = null;
    };
    DecryptingByteSource.prototype.readRecursively = function (min, max, toSrcEnd) {
        var _this = this;
        if (toSrcEnd) {
            max = null;
        }
        if (this.decryptedAll) {
            return Q.when(this.buf.getBytes(0, max));
        }
        var minReadFromSegs = this.segsReader.segmentSize(this.segInd);
        if (this.segBuf) {
            minReadFromSegs -= this.segBuf.length;
        }
        var promise = this.segs.read(minReadFromSegs).then(function (segBytes) {
            var openedSeg;
            if (!segBytes) {
                if (_this.decryptedAll) {
                    return _this.buf.getBytes(0, max);
                }
                else if (_this.segBuf && _this.segsReader.isEndlessFile()) {
                    openedSeg = _this.segsReader.openSeg(_this.segBuf, _this.segInd);
                    _this.buf.push(openedSeg.data);
                    _this.setDecryptedAll();
                    _this.segBuf = null;
                    return _this.buf.getBytes(0, max);
                }
                else {
                    throw new Error("Unexpected end of byte source.");
                }
            }
            var segSize = _this.segsReader.segmentSize(_this.segInd);
            var mergedBytes;
            var offset;
            if (_this.segBuf) {
                if (segSize <= (_this.segBuf.length + segBytes.length)) {
                    mergedBytes = new Uint8Array(segSize);
                    offset = 0;
                    mergedBytes.set(_this.segBuf, offset);
                    offset += _this.segBuf.length;
                    mergedBytes.set(segBytes.subarray(0, (segSize - offset)), offset);
                    segBytes = segBytes.subarray((segSize - offset));
                    _this.segBuf = null;
                    openedSeg = _this.segsReader.openSeg(mergedBytes, _this.segInd);
                    if (openedSeg.last) {
                        _this.setDecryptedAll();
                        _this.buf.push(openedSeg.data);
                        return _this.buf.getBytes(0, max);
                    }
                    _this.segInd += 1;
                    segSize = _this.segsReader.segmentSize(_this.segInd);
                }
                else {
                    mergedBytes = new Uint8Array(_this.segBuf.length + segBytes.length);
                    mergedBytes.set(_this.segBuf, 0);
                    mergedBytes.set(segBytes, _this.segBuf.length);
                    _this.segBuf = mergedBytes;
                    return _this.readRecursively(min, max, toSrcEnd);
                }
            }
            offset = 0;
            while ((segBytes.length - offset) >= segSize) {
                openedSeg = _this.segsReader.openSeg(segBytes.subarray(offset), _this.segInd);
                if (openedSeg.last) {
                    _this.setDecryptedAll();
                    _this.buf.push(openedSeg.data);
                    return _this.buf.getBytes(0, max);
                }
                _this.buf.push(openedSeg.data);
                offset += openedSeg.segLen;
                _this.segInd += 1;
                segSize = _this.segsReader.segmentSize(_this.segInd);
            }
            if ((segBytes.length - offset) > 0) {
                _this.segBuf = new Uint8Array(segBytes.length - offset);
                _this.segBuf.set(segBytes.subarray(offset));
            }
            if (toSrcEnd) {
                return _this.readRecursively(min, max, toSrcEnd);
            }
            var bytes = _this.buf.getBytes(0, max);
            if (bytes) {
                return bytes;
            }
            else {
                return _this.readRecursively(min, max, toSrcEnd);
            }
        });
        return promise;
    };
    DecryptingByteSource.prototype.read = function (min, max, toSrcEnd) {
        var _this = this;
        if (min === void 0) { min = 0; }
        if (max === void 0) { max = null; }
        if (toSrcEnd === void 0) { toSrcEnd = false; }
        if (this.readInProgress) {
            throw new Error("There is already pending read");
        }
        if (this.initProgress) {
            this.readInProgress = this.initProgress.then(function () {
                return _this.readRecursively(min, max, toSrcEnd);
            });
        }
        else {
            this.readInProgress = this.readRecursively(min, max, toSrcEnd);
        }
        return this.readInProgress.fin(function () {
            _this.readInProgress = null;
        });
    };
    DecryptingByteSource.prototype.totalSize = function () {
        return this.segsReader.contentLength();
    };
    DecryptingByteSource.prototype.wrap = function () {
        var wrap = {
            read: this.read.bind(this),
            totalSize: this.totalSize.bind(this),
            getObjVersion: this.getObjVersion
        };
        Object.freeze(wrap);
        return wrap;
    };
    return DecryptingByteSource;
})();
/**
 * @param src
 * @param fileKeyDecr is a decryptor to extract file key
 */
function makeDecryptedByteSource(src, segReaderGen) {
    return (new DecryptingByteSource(src, segReaderGen)).wrap();
}
exports.makeDecryptedByteSource = makeDecryptedByteSource;
Object.freeze(exports);

},{"ecma-nacl":"ecma-nacl","q":"q"}],10:[function(require,module,exports){
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
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Q = require('q');
var xhrUtils = require('../xhr-utils');
var serviceLocator = require('../service-locator');
var pkl = require('../user-with-pkl-session');
var jwk = require('../../lib-common/jwkeys');
var mid = require('../../lib-common/mid-sigs-NaCl-Ed');
var certProvApi = require('../../lib-common/service-api/mailer-id/provisioning');
var Uri = require('jsuri');
var DEFAULT_ASSERTION_VALIDITY = 20 * 60;
function getRandom(n) {
    var arr = new Uint8Array(n);
    window.crypto.getRandomValues(arr);
    return arr;
}
/**
 * Certificate provisioner is an object that can do all MailerId's provisioning
 * requests.
 * Provisioning is done for given user id, and is performed at service location,
 * identified by a given uri.
 */
var MailerIdProvisioner = (function (_super) {
    __extends(MailerIdProvisioner, _super);
    /**
     * @param userId
     * @param uri identifies place of MailerId service.
     */
    function MailerIdProvisioner(userId, serviceUri) {
        _super.call(this, userId, {
            login: '',
            logout: ''
        });
        this.userCert = null;
        this.provCert = null;
        this.midDomain = null;
        this.rootCert = null;
        this.serviceURI = serviceUri;
        this.entryURI = this.serviceURI;
        Object.seal(this);
    }
    MailerIdProvisioner.prototype.setUrlAndDomain = function () {
        var _this = this;
        var promise = serviceLocator.mailerIdInfoAt(this.entryURI).then(function (info) {
            _this.midDomain = (new Uri(_this.serviceURI)).host();
            _this.serviceURI = info.provisioning;
            _this.rootCert = info.currentCert;
        });
        return promise;
    };
    /**
     * @param pkey is a public key, that needs to be certified.
     * @param duration is a desired duration of certificate's validity.
     * Server may provide shorter duration, if asked duration is too long for its
     * security policy.
     * @return a promise, resolvable to a string with certificate, generated by
     * the MailerId server.
     */
    MailerIdProvisioner.prototype.getCertificates = function (pkey, duration) {
        var _this = this;
        var deferred = Q.defer();
        var url = this.serviceURI + certProvApi.certify.URL_END;
        var xhr = xhrUtils.makeBinaryRequest('POST', url, function () {
            if (xhr.status == 200) {
                try {
                    var certs = _this.encryptor.openJSON(new Uint8Array(xhr.response));
                    if (!certs.userCert || !certs.provCert) {
                        throw new Error("Certificates are missing.");
                    }
                    var pkeyAndId = mid.relyingParty.verifyChainAndGetUserKey({ user: certs.userCert, prov: certs.provCert, root: _this.rootCert }, _this.midDomain, jwk.getKeyCert(certs.userCert).issuedAt + 1);
                    if (pkeyAndId.address !== _this.userId) {
                        throw new Error("Certificate is for a wrong address.");
                    }
                    var keyInCert = jwk.keyToJson(pkeyAndId.pkey);
                    if ((keyInCert.use !== pkey.use) || (keyInCert.alg !== pkey.alg) || (keyInCert.kid !== pkey.kid) || (keyInCert.k !== pkey.k)) {
                        throw new Error("Certificate is for a wrong key.");
                    }
                    _this.userCert = certs.userCert;
                    _this.provCert = certs.provCert;
                    deferred.resolve();
                }
                catch (err) {
                    xhrUtils.reject(deferred, 200, "Malformed reply: " + err.message);
                }
            }
            else {
                xhrUtils.reject(deferred, xhr);
            }
            _this.encryptor.destroy();
        }, deferred, this.sessionId);
        xhr.responseType = "arraybuffer";
        // pack, encrypt and send them
        xhr.send(this.encryptor.packJSON({
            pkey: pkey,
            duration: duration
        }));
        var promise = deferred.promise.fin(function () {
            _this.sessionId = null;
            _this.encryptor.destroy();
            _this.encryptor = null;
        });
        return promise;
    };
    MailerIdProvisioner.prototype.provisionSigner = function (genOfDHKeyCalcPromise, certDuration, assertDuration) {
        var _this = this;
        if (!assertDuration || (assertDuration < 0)) {
            assertDuration = DEFAULT_ASSERTION_VALIDITY;
        }
        var pair = mid.user.generateSigningKeyPair(getRandom);
        var promise = this.setUrlAndDomain().then(function () {
            return _super.prototype.login.call(_this, genOfDHKeyCalcPromise);
        }).then(function () {
            return _this.getCertificates(pair.pkey, certDuration).then(function () {
                return mid.user.makeMailerIdSigner(pair.skey, _this.userCert, _this.provCert, assertDuration);
            });
        });
        return promise;
    };
    MailerIdProvisioner.prototype.login = function (genOfDHKeyCalcPromise) {
        throw Error("This function is not used in provisioner");
    };
    MailerIdProvisioner.prototype.logout = function () {
        throw Error("This function is not used in provisioner");
    };
    return MailerIdProvisioner;
})(pkl.ServiceUser);
exports.MailerIdProvisioner = MailerIdProvisioner;
Object.freeze(exports);

},{"../../lib-common/jwkeys":24,"../../lib-common/mid-sigs-NaCl-Ed":25,"../../lib-common/service-api/mailer-id/provisioning":28,"../service-locator":14,"../user-with-pkl-session":17,"../xhr-utils":20,"jsuri":"jsuri","q":"q"}],11:[function(require,module,exports){
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
 * This file contains functionality to perform mailerid-based signin,
 * logging intermediate steps for clarity of this demonstration.
 */
var nacl = require('ecma-nacl');
var log = require('./page-logging');
var keyGen = require('./workers/key-gen-main');
var midSigs = require('../lib-common/mid-sigs-NaCl-Ed');
var midProv = require('./mailer-id/provisioner');
function getRandom(n) {
    var arr = new Uint8Array(n);
    window.crypto.getRandomValues(arr);
    return arr;
}
/**
 * @param form from which address and passphrase are taken.
 * @return promise, that resolves to assertion signer.
 */
function provisionAssertionSigner(form) {
    // get address and pass from the form
    var address = form.address.value;
    var pass = form.pass.value;
    if (!pass) {
        log.write("MISSING INFO: provide a passphrase for " + address + ", from which mailerId login secret key is derived.");
        throw new Error("Missing passphrase");
    }
    // prepare a generator of a promise that resolves into DH key calculator
    var genOfDHKeyCalcPromise = function (keyGenParams) {
        return keyGen.deriveKeyFromPass(pass, keyGenParams).then(function (skey) {
            return function (serverPubKey) {
                return nacl.box.calc_dhshared_key(serverPubKey, skey);
            };
        });
    };
    var keyPair = midSigs.user.generateSigningKeyPair(getRandom);
    log.write("Generated a pair of keys, that will be used to sign " + "assertions, exactly like in browserId, from which mailerId " + "is different in using universal Public Key Login, and " + "having session-id as an audience parameter in the assertion.");
    log.write("In this test run we do not look into DNS, and check directly " + "localhost:8080/mailerid");
    var certProv = new midProv.MailerIdProvisioner(address, 'https://localhost:8080/mailerid');
    var promise = certProv.setUrlAndDomain().then(function () {
        log.write("Loging into MailerId provider, to provision a certificate.");
        // This is an expanded pkl login, which is not available in provisioner
        // directly, and is a copy-paste from provisioner's super class
        return certProv.startSession().then(function () {
            return genOfDHKeyCalcPromise(certProv.keyDerivationParams);
        }).then(function (dhsharedKeyCalculator) {
            return certProv.openSessionKey(dhsharedKeyCalculator);
        }).then(function () {
            return certProv.completeLoginExchange();
        });
    }).then(function () {
        log.write("Login into MailerId is complete, session id and encryption " + "are established.");
        log.write("Asking MailerId provider to certify key, which will be used " + "to create assertions. Asking for 6 hours certificate duration.");
        return certProv.getCertificates(keyPair.pkey, 6 * 60 * 60);
    }).then(function () {
        log.write("Certificate is received. It can now be used to sign into " + "any service, that accepts MailerId. Signer will make signatures " + "with validity no longer than 15 minutes.");
        return midSigs.user.makeMailerIdSigner(keyPair.skey, certProv.userCert, certProv.provCert, 15 * 60);
    });
    return promise;
}
exports.provisionAssertionSigner = provisionAssertionSigner;
/**
 * @param midAssertionSigner
 * @return a promise resolvable to authenticated session id.
 */
function startAndAuthSession(servUser, midSigner) {
    var midUser = servUser;
    log.write("Asking ASMail server to start session, and provide an " + "session id, which will be used in MailerId assertion.");
    var promise = midUser.startSession().then(function () {
        log.write("Making MailerId assertion for current session, and " + "sending it with key certificates to service, " + "which is a relying party in this MailerId exchange.");
        return midUser.authenticateSession(midSigner);
    }).then(function () {
        log.write("Server successfully authenticates our session.");
    }, function (err) {
        throw new Error("Server is not authenticating our session. " + "It replied with status code " + err.status + ", saying " + err.message);
    });
    return promise;
}
exports.startAndAuthSession = startAndAuthSession;

},{"../lib-common/mid-sigs-NaCl-Ed":25,"./mailer-id/provisioner":10,"./page-logging":12,"./workers/key-gen-main":19,"ecma-nacl":"ecma-nacl"}],12:[function(require,module,exports){
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
function write(str) {
    var p = document.createElement('p');
    p.textContent = '> ' + str;
    var logs = document.getElementById("log");
    logs.appendChild(p);
    p.scrollIntoView();
    console.log('> ' + str);
}
exports.write = write;
function writeLink(str, href, newWindow) {
    var a = document.createElement('a');
    a.textContent = str;
    a.href = href;
    if (newWindow) {
        a.target = "_blank";
    }
    var logs = document.getElementById("log");
    logs.appendChild(a);
    logs.appendChild(document.createElement('br'));
    a.scrollIntoView();
}
exports.writeLink = writeLink;
function clear() {
    document.getElementById("log").innerHTML = '';
}
exports.clear = clear;
Object.freeze(exports);

},{}],13:[function(require,module,exports){
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
var base64 = require('../lib-common/base64');
function bytes(numOfBytes) {
    var arr = new Uint8Array(numOfBytes);
    crypto.getRandomValues(arr);
    return arr;
}
exports.bytes = bytes;
function uint8() {
    return bytes(1)[0];
}
exports.uint8 = uint8;
function stringOfB64UrlSafeChars(numOfChars) {
    var numOfbytes = 3 * (1 + Math.floor(numOfChars / 4));
    var byteArr = bytes(numOfbytes);
    return base64.urlSafe.pack(byteArr).substring(0, numOfChars);
}
exports.stringOfB64UrlSafeChars = stringOfB64UrlSafeChars;
function stringOfB64Chars(numOfChars) {
    var numOfbytes = 3 * (1 + Math.floor(numOfChars / 4));
    var byteArr = bytes(numOfbytes);
    return base64.pack(byteArr).substring(0, numOfChars);
}
exports.stringOfB64Chars = stringOfB64Chars;
Object.freeze(exports);

},{"../lib-common/base64":21}],14:[function(require,module,exports){
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
var Q = require('q');
var xhrUtils = require('./xhr-utils');
var jwk = require('../lib-common/jwkeys');
var Uri = require('jsuri');
function readJSONLocatedAt(url) {
    var uri = new Uri(url);
    if (uri.protocol() !== 'https') {
        throw new Error("Url protocol must be https.");
    }
    url = uri.toString();
    var deferred = Q.defer();
    var xhr = xhrUtils.makeBodylessRequest('GET', url, function () {
        if (xhr.status == 200) {
            if (xhr.response === null) {
                xhrUtils.reject(deferred, 200, "Response is malformed: it is not JSON.");
            }
            else {
                deferred.resolve({
                    uri: uri,
                    json: xhr.response
                });
            }
        }
        else {
            xhrUtils.reject(deferred, xhr);
        }
    }, deferred, this.sessionId);
    xhr.responseType = "json";
    xhr.send();
    return deferred.promise;
}
function transformRelToAbsUri(uri, path) {
    var u = new Uri(uri.toString());
    u.path(path);
    return u.toString();
}
/**
 * @param url
 * @return a promise, resolvable to ASMailRoutes object.
 */
function asmailInfoAt(url) {
    return readJSONLocatedAt(url).then(function (data) {
        var json = data.json;
        var uri = data.uri;
        var transform = {};
        if ('string' === typeof json.delivery) {
            transform.delivery = transformRelToAbsUri(uri, json.delivery);
        }
        if ('string' === typeof json.retrieval) {
            transform.retrieval = transformRelToAbsUri(uri, json.retrieval);
        }
        if ('string' === typeof json.config) {
            transform.config = transformRelToAbsUri(uri, json.config);
        }
        Object.freeze(transform);
        return transform;
    });
}
exports.asmailInfoAt = asmailInfoAt;
/**
 * @param url
 * @return a promise, resolvable to MailerIdRoutes object.
 */
function mailerIdInfoAt(url) {
    return readJSONLocatedAt(url).then(function (data) {
        var json = data.json;
        var uri = data.uri;
        var transform = {};
        if ('string' === typeof json.provisioning) {
            transform.provisioning = transformRelToAbsUri(uri, json.provisioning);
        }
        else {
            throw new Error("File " + uri.toString() + " is malformed.");
        }
        if (('object' === typeof json["current-cert"]) && jwk.isLikeSignedKeyCert(json["current-cert"])) {
            transform.currentCert = json["current-cert"];
        }
        else {
            throw new Error("File " + uri.toString() + " is malformed.");
        }
        Object.freeze(transform);
        return transform;
    });
}
exports.mailerIdInfoAt = mailerIdInfoAt;
/**
 * @param url
 * @return a promise, resolvable to StorageRoutes object.
 */
function storageInfoAt(url) {
    return readJSONLocatedAt(url).then(function (data) {
        var json = data.json;
        var uri = data.uri;
        var transform = {};
        if ('string' === typeof json.owner) {
            transform.owner = transformRelToAbsUri(uri, json.owner);
        }
        if ('string' === typeof json.shared) {
            transform.shared = transformRelToAbsUri(uri, json.shared);
        }
        if ('string' === typeof json.config) {
            transform.config = transformRelToAbsUri(uri, json.config);
        }
        return transform;
    });
}
exports.storageInfoAt = storageInfoAt;
Object.freeze(exports);

},{"../lib-common/jwkeys":24,"./xhr-utils":20,"jsuri":"jsuri","q":"q"}],15:[function(require,module,exports){
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
var log = require('./page-logging');
/**
 * This classes switches between views.
 * View name is an id of html element that is brought into view.
 */
var Router = (function () {
    function Router(w, defaultView) {
        this.openedView = null;
        this.views = {};
        this.getDefaultView = defaultView;
        this.w = w;
        this.w.onpopstate = this.openHashTag.bind(this);
        Object.seal(this);
    }
    Router.prototype.openHashTag = function () {
        var hTag = this.w.location.hash;
        if (hTag) {
            this.openView(hTag.substring(1), true);
        }
        else {
            this.openView(this.getDefaultView(), true);
        }
    };
    Router.prototype.addView = function (nameOrView, open, close, noLogCleanOnClose) {
        var v;
        if ('string' === typeof nameOrView) {
            if (!open) {
                throw new Error("open func is missing");
            }
            if (!close) {
                throw new Error("open func is missing");
            }
            v = {
                name: nameOrView,
                open: open,
                close: close,
                cleanLogOnExit: !noLogCleanOnClose
            };
            Object.freeze(v);
            this.views[v.name] = v;
        }
        else if (!nameOrView) {
            throw new Error("View object is not given");
        }
        else {
            v = nameOrView;
            this.views[v.name] = v;
        }
    };
    Router.prototype.openView = function (viewName, doNotRecordInHistory) {
        if (this.openedView && (viewName === this.openedView.name)) {
            return;
        }
        var v = this.views[viewName];
        if (!v) {
            throw new Error("Unknown view: " + viewName);
        }
        if (this.openedView) {
            this.openedView.close();
        }
        v.open();
        if (!doNotRecordInHistory) {
            this.w.history.pushState({ view: viewName }, this.w.document.title, "#" + viewName);
        }
        if (this.openedView && this.openedView.cleanLogOnExit) {
            log.clear();
        }
        this.openedView = v;
    };
    Router.prototype.showElem = function (elemId) {
        this.w.document.getElementById(elemId).style.display = "block";
    };
    Router.prototype.hideElem = function (elemId) {
        this.w.document.getElementById(elemId).style.display = "none";
    };
    return Router;
})();
exports.Router = Router;
Object.freeze(Router);
Object.freeze(Router.prototype);
Object.freeze(exports);

},{"./page-logging":12}],16:[function(require,module,exports){
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
 * This defines a base class for some service's client that logs in with
 * MailerId and uses respectively authenticated session.
 */
var xhrUtils = require('./xhr-utils');
var Q = require('q');
var Uri = require('jsuri');
var loginApi = require('../lib-common/service-api/mailer-id/login');
var ServiceUser = (function () {
    function ServiceUser(userId, opts) {
        this.sessionId = null;
        this.uri = null;
        this.redirectedFrom = null;
        this.userId = userId;
        this.loginUrlPart = opts.login;
        if ((this.loginUrlPart.length > 0) && (this.loginUrlPart[this.loginUrlPart.length - 1] !== '/')) {
            this.loginUrlPart += '/';
        }
        this.logoutUrlEnd = opts.logout;
        this.canBeRedirected = !!opts.canBeRedirected;
    }
    Object.defineProperty(ServiceUser.prototype, "serviceURI", {
        get: function () {
            return this.uri;
        },
        set: function (uriString) {
            var uriObj = new Uri(uriString);
            if (uriObj.protocol() !== 'https') {
                throw new Error("Url protocol must be https.");
            }
            if (!uriObj.host()) {
                throw new Error("Host name is missing.");
            }
            var p = uriObj.path();
            if (p[p.length - 1] !== '/') {
                uriObj.setPath(p + '/');
            }
            this.uri = uriObj.toString();
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ServiceUser.prototype, "serviceDomain", {
        get: function () {
            return (new Uri(this.uri)).host();
        },
        enumerable: true,
        configurable: true
    });
    ServiceUser.prototype.startSession = function () {
        var _this = this;
        var deferred = Q.defer();
        var url = this.serviceURI + this.loginUrlPart + loginApi.startSession.URL_END;
        var xhr = xhrUtils.makeJsonRequest('POST', url, function () {
            try {
                if (xhr.status == loginApi.startSession.SC.ok) {
                    var r = xhr.response;
                    if (!r || ('string' !== typeof r.sessionId)) {
                        throw "Resource " + url + " is malformed.";
                    }
                    _this.sessionId = r.sessionId;
                    deferred.resolve();
                }
                else if (_this.canBeRedirected && (xhr.status == loginApi.startSession.SC.redirect)) {
                    var rd = xhr.response;
                    if (!rd || ('string' !== typeof rd.redirect)) {
                        throw "Resource " + url + " is malformed.";
                    }
                    // refuse second redirect
                    if (_this.redirectedFrom !== null) {
                        throw "Redirected too many times. First redirect " + "was from " + _this.redirectedFrom + " to " + _this.serviceURI + ". Second and forbidden " + "redirect is to " + rd.redirect;
                    }
                    // set params
                    _this.redirectedFrom = _this.serviceURI;
                    _this.serviceURI = rd.redirect;
                    // start redirect call
                    deferred.resolve(_this.startSession());
                }
                else {
                    xhrUtils.reject(deferred, xhr);
                }
            }
            catch (errStr) {
                xhrUtils.reject(deferred, xhr.status, errStr);
            }
        }, deferred);
        xhr.responseType = "json";
        xhr.sendJSON({
            userId: this.userId
        });
        return deferred.promise;
    };
    ServiceUser.prototype.authenticateSession = function (midSigner) {
        var _this = this;
        var deferred = Q.defer();
        var url = this.serviceURI + this.loginUrlPart + loginApi.authSession.URL_END;
        var xhr = xhrUtils.makeJsonRequest('POST', url, function () {
            if (xhr.status == loginApi.authSession.SC.ok) {
                deferred.resolve();
            }
            else {
                if (xhr.status == loginApi.authSession.SC.authFailed) {
                    _this.sessionId = null;
                }
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.sendJSON({
            assertion: midSigner.generateAssertionFor(this.serviceDomain, this.sessionId),
            userCert: midSigner.userCert,
            provCert: midSigner.providerCert
        });
        return deferred.promise;
    };
    /**
     * This starts and authorizes a new session.
     * @param assertionSigner
     * @return a promise, resolvable, when mailerId login successfully
     * completes.
     */
    ServiceUser.prototype.login = function (midSigner) {
        var _this = this;
        if (this.sessionId) {
            throw new Error("Session is already opened.");
        }
        var promise = this.startSession().then(function () {
            return _this.authenticateSession(midSigner);
        });
        return promise;
    };
    /**
     * This method closes current session.
     * @return a promise for request completion.
     */
    ServiceUser.prototype.logout = function () {
        var _this = this;
        var url = this.serviceURI + this.logoutUrlEnd;
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('POST', url, function () {
            if (xhr.status == 200) {
                deferred.resolve();
            }
            else {
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.send();
        return deferred.promise.fin(function () {
            _this.sessionId = null;
        });
    };
    return ServiceUser;
})();
exports.ServiceUser = ServiceUser;
Object.freeze(exports);

},{"../lib-common/service-api/mailer-id/login":27,"./xhr-utils":20,"jsuri":"jsuri","q":"q"}],17:[function(require,module,exports){
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
 * This defines a base class for some service's client that logs in with
 * Public Key Login process and uses respectively authenticated session.
 */
var xhrUtils = require('./xhr-utils');
var Q = require('q');
var base64 = require('../lib-common/base64');
var nacl = require('ecma-nacl');
var Uri = require('jsuri');
var sessionEncr = require('../lib-common/session-encryptor');
var loginApi = require('../lib-common/service-api/pub-key-login');
var sbox = nacl.secret_box;
var PUB_KEY_LENGTH = nacl.box.KEY_LENGTH;
var ServiceUser = (function () {
    function ServiceUser(userId, opts) {
        this.sessionId = null;
        this.redirectedFrom = null;
        this.encryptor = null;
        this.encChallenge = null;
        this.serverPubKey = null;
        this.serverVerificationBytes = null;
        this.keyDerivationParams = null;
        this.userId = userId;
        this.loginUrlPart = opts.login;
        if ((this.loginUrlPart.length > 0) && (this.loginUrlPart[this.loginUrlPart.length - 1] !== '/')) {
            this.loginUrlPart += '/';
        }
        this.logoutUrlEnd = opts.logout;
        this.canBeRedirected = !!opts.canBeRedirected;
    }
    Object.defineProperty(ServiceUser.prototype, "serviceURI", {
        get: function () {
            return this.uri;
        },
        set: function (uriString) {
            var uriObj = new Uri(uriString);
            if (uriObj.protocol() !== 'https') {
                throw new Error("Url protocol must be https.");
            }
            if (!uriObj.host()) {
                throw new Error("Host name is missing.");
            }
            var p = uriObj.path();
            if (p[p.length - 1] !== '/') {
                uriObj.setPath(p + '/');
            }
            this.uri = uriObj.toString();
        },
        enumerable: true,
        configurable: true
    });
    ServiceUser.prototype.startSession = function () {
        var _this = this;
        var deferred = Q.defer();
        var url = this.serviceURI + this.loginUrlPart + loginApi.start.URL_END;
        var xhr = xhrUtils.makeJsonRequest('POST', url, function () {
            try {
                if (xhr.status == loginApi.start.SC.ok) {
                    var r = xhr.response;
                    // set sessionid
                    if (!r || ('string' !== typeof r.sessionId)) {
                        throw "Resource " + url + " is malformed.";
                    }
                    _this.sessionId = r.sessionId;
                    // set server public key
                    if ('string' !== typeof r.serverPubKey) {
                        throw "Response from server is malformed, " + "as serverPubKey string is missing.";
                    }
                    try {
                        _this.serverPubKey = base64.open(r.serverPubKey);
                        if (_this.serverPubKey.length !== PUB_KEY_LENGTH) {
                            throw "Server's key has a wrong size.";
                        }
                    }
                    catch (err) {
                        throw "Response from server is malformed: " + "bad serverPubKey string. Error: " + (('string' === typeof err) ? err : err.message);
                    }
                    // get encrypted session key from json body
                    if ('string' !== typeof r.sessionKey) {
                        throw "Response from server is malformed, " + "as sessionKey string is missing.";
                    }
                    try {
                        _this.encChallenge = base64.open(r.sessionKey);
                        if (_this.encChallenge.length !== (sbox.NONCE_LENGTH + sbox.KEY_LENGTH)) {
                            throw "Byte chunk with session key " + "has a wrong size.";
                        }
                    }
                    catch (err) {
                        throw "Response from server is malformed: " + "bad sessionKey string. Error: " + (('string' === typeof err) ? err : err.message);
                    }
                    // get key derivation parameters
                    if ('object' !== typeof r.keyDerivParams) {
                        throw "Response from server is malformed, " + "as keyDerivParams string is missing.";
                    }
                    _this.keyDerivationParams = r.keyDerivParams;
                    // done
                    deferred.resolve();
                }
                else if (_this.canBeRedirected && (xhr.status == loginApi.start.SC.redirect)) {
                    var rd = xhr.response;
                    if (!rd || ('string' !== typeof rd.redirect)) {
                        throw "Resource " + url + " is malformed.";
                    }
                    // refuse second redirect
                    if (_this.redirectedFrom !== null) {
                        throw "Redirected too many times. First redirect " + "was from " + _this.redirectedFrom + " to " + _this.serviceURI + ". Second and forbidden " + "redirect is to " + rd.redirect;
                    }
                    // set params
                    _this.redirectedFrom = _this.serviceURI;
                    _this.serviceURI = rd.redirect;
                    // start redirect call
                    deferred.resolve(_this.startSession());
                }
                else {
                    xhrUtils.reject(deferred, xhr);
                }
            }
            catch (errStr) {
                xhrUtils.reject(deferred, xhr.status, errStr);
            }
        }, deferred, this.sessionId);
        xhr.responseType = "json";
        xhr.sendJSON({
            userId: this.userId
        });
        return deferred.promise;
    };
    ServiceUser.prototype.openSessionKey = function (dhsharedKeyCalculator) {
        // encrypted challenge has session key packaged into WN format, with
        // poly part cut out. Therefore, usual open method will not do as it
        // does poly check. We should recall that cipher is a stream with data
        // xor-ed into it. Encrypting zeros gives us stream bytes, which can
        // be xor-ed into the data part of challenge bytes to produce a key.
        var dhsharedKey = dhsharedKeyCalculator(this.serverPubKey);
        var nonce = new Uint8Array(this.encChallenge.subarray(0, sbox.NONCE_LENGTH));
        var sessionKey = new Uint8Array(this.encChallenge.subarray(sbox.NONCE_LENGTH));
        var zeros = new Uint8Array(sbox.KEY_LENGTH);
        var streamBytes = sbox.pack(zeros, nonce, dhsharedKey);
        streamBytes = streamBytes.subarray(streamBytes.length - sbox.KEY_LENGTH);
        for (var i = 0; i < sbox.KEY_LENGTH; i += 1) {
            sessionKey[i] ^= streamBytes[i];
        }
        // since there was no poly, we are not sure, if we are talking to server
        // that knows our public key. Server shall give us these bytes, and we
        // should prepare ours for comparison.
        this.serverVerificationBytes = sbox.pack(sessionKey, nonce, dhsharedKey);
        this.serverVerificationBytes = this.serverVerificationBytes.subarray(0, sbox.POLY_LENGTH);
        nacl.nonce.advanceOddly(nonce);
        this.encryptor = sessionEncr.makeSessionEncryptor(sessionKey, nonce);
        // encrypt session key for completion of login exchange
        this.encChallenge = this.encryptor.pack(sessionKey);
        // cleanup arrays
        nacl.arrays.wipe(dhsharedKey, nonce, sessionKey);
    };
    ServiceUser.prototype.completeLoginExchange = function () {
        var _this = this;
        var deferred = Q.defer();
        var url = this.serviceURI + this.loginUrlPart + loginApi.complete.URL_END;
        var xhr = xhrUtils.makeBinaryRequest('POST', url, function () {
            if (xhr.status == loginApi.complete.SC.ok) {
                var bytesToVerify = new Uint8Array(xhr.response);
                // compare bytes to check, if server is can be trusted
                if (nacl.compareVectors(bytesToVerify, _this.serverVerificationBytes)) {
                    deferred.resolve();
                    _this.serverVerificationBytes = null;
                }
                else {
                    var err = (new Error("Server verification failed."));
                    err.serverNotTrusted = true;
                    deferred.reject(err);
                }
            }
            else {
                if (xhr.status == loginApi.complete.SC.authFailed) {
                    _this.sessionId = null;
                }
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.responseType = "arraybuffer";
        xhr.send(this.encChallenge);
        this.encChallenge = null;
        return deferred.promise;
    };
    /**
     * @param genOfDHKeyCalcPromise is a function that takes key derivation
     * parameters, and returns promise of DH key calculating function, which
     * in its order takes server's public key as a single parameter.
     * @return promise, resolvable when PKL process completes.
     */
    ServiceUser.prototype.login = function (genOfDHKeyCalcPromise) {
        var _this = this;
        var promise = this.startSession().then(function () {
            return genOfDHKeyCalcPromise(_this.keyDerivationParams);
        }).then(function (dhsharedKeyCalculator) {
            return _this.openSessionKey(dhsharedKeyCalculator);
        }).then(function () {
            return _this.completeLoginExchange();
        });
        return promise;
    };
    /**
     * This method closes current session.
     * @return a promise for request completion.
     */
    ServiceUser.prototype.logout = function () {
        var _this = this;
        var url = this.serviceURI + this.logoutUrlEnd;
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('POST', url, function () {
            if (xhr.status == 200) {
                deferred.resolve();
            }
            else {
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.send();
        return deferred.promise.fin(function () {
            _this.sessionId = null;
            _this.encryptor.destroy();
            _this.encryptor = null;
        });
    };
    return ServiceUser;
})();
exports.ServiceUser = ServiceUser;
Object.freeze(exports);

},{"../lib-common/base64":21,"../lib-common/service-api/pub-key-login":29,"../lib-common/session-encryptor":30,"./xhr-utils":20,"ecma-nacl":"ecma-nacl","jsuri":"jsuri","q":"q"}],18:[function(require,module,exports){
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
 * This is for shared things between main and other-thread parts of a worker.
 */
var base64 = require('../../lib-common/base64');
var utf8 = require('../../lib-common/utf8');
function paramsFromJson(passStr, paramsInJson) {
    var salt;
    var pass;
    try {
        if (('number' !== typeof paramsInJson.logN) || (paramsInJson.logN < 10)) {
            throw "Bad parameter logN.";
        }
        if (('number' !== typeof paramsInJson.r) || (paramsInJson.r < 1)) {
            throw "Bad parameter r.";
        }
        if (('number' !== typeof paramsInJson.p) || (paramsInJson.p < 1)) {
            throw "Bad parameter p.";
        }
        salt = base64.open(paramsInJson.salt);
        pass = utf8.pack(passStr);
    }
    catch (e) {
        if ('string' === typeof e) {
            throw new Error(e);
        }
        else {
            throw new Error("Bad parameter:\n" + e.message);
        }
    }
    return {
        logN: paramsInJson.logN,
        r: paramsInJson.r,
        p: paramsInJson.p,
        pass: pass,
        salt: salt
    };
}
exports.paramsFromJson = paramsFromJson;
function paramsToWorkMsg(params) {
    return {
        json: {
            pass: params.pass.buffer,
            salt: params.salt.buffer,
            logN: params.logN,
            r: params.r,
            p: params.p
        },
        buffers: [params.pass.buffer, params.salt.buffer]
    };
}
exports.paramsToWorkMsg = paramsToWorkMsg;
function workMsgToParams(msgData) {
    return {
        logN: msgData.logN,
        r: msgData.r,
        p: msgData.p,
        pass: new Uint8Array(msgData.pass),
        salt: new Uint8Array(msgData.salt)
    };
}
exports.workMsgToParams = workMsgToParams;
Object.freeze(exports);

},{"../../lib-common/base64":21,"../../lib-common/utf8":31}],19:[function(require,module,exports){
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
var Q = require('q');
var log = require('../../lib-client/page-logging');
var keyGenUtil = require('./key-gen-common');
/**
 * @param pass is a passphrase, from which a key should be generated.
 * @param keyGenParams is an object with parameters needed for key generation
 * from passphrase.
 * @return a promise, resolvable to Uint8Array with generated key.
 */
function deriveKeyFromPass(pass, keyGenParams) {
    // derive secret key from the password 
    // this needs a web-worker, as scrypt is intense 
    var deferred = Q.defer();
    var worker = new Worker('./key-gen-worker.js');
    worker.addEventListener('message', function (e) {
        if (e.data.progress) {
            log.write("Derivation progress: " + e.data.progress + "%");
            return;
        }
        if (e.data.key) {
            deferred.resolve(new Uint8Array(e.data.key));
            log.write("Secret key has been derived from a password.");
        }
        else {
            log.write("Error occured in key-deriving web-worker: " + e.data.error);
            throw new Error("Cannot derive secret key. Error message: " + e.data.error);
        }
        worker.terminate();
        worker = null;
    });
    log.write("Starting derivation of secret key from given passphrase, using " + "Ecma-NaCl implementation of scrypt. Parameters are salt: " + keyGenParams.salt + ", " + "logN: " + keyGenParams.logN + ", r: " + keyGenParams.r + ", p: " + keyGenParams.p + ". Memory use is on the order of " + Math.floor(keyGenParams.r * Math.pow(2, 7 + keyGenParams.logN - 20)) + "MB.");
    var workMsg = keyGenUtil.paramsToWorkMsg(keyGenUtil.paramsFromJson(pass, keyGenParams));
    worker.postMessage(workMsg.json, workMsg.buffers);
    return deferred.promise;
}
exports.deriveKeyFromPass = deriveKeyFromPass;
Object.freeze(exports);

},{"../../lib-client/page-logging":12,"./key-gen-common":18,"q":"q"}],20:[function(require,module,exports){
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
exports.SESSION_ID_HEADER = "X-Session-Id";
function makeRequest(contentType, method, url, onLoad, onError, sessionId) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.onload = onLoad;
    if ('function' === typeof onError) {
        xhr.onerror = onError;
    }
    else {
        var deferred = onError;
        xhr.onerror = function () {
            deferred.reject(new Error("Cannot connect to " + url));
        };
    }
    if (contentType) {
        xhr.setRequestHeader('Content-Type', contentType);
    }
    if (sessionId) {
        xhr.setRequestHeader(exports.SESSION_ID_HEADER, sessionId);
    }
    return xhr;
}
/**
 * This assembles XMLHttpRequest with 'Content-Type: application/json'.
 * Session id header is added, if string id is given.
 * @param method
 * @param url
 * @param onLoad
 * @param onError it can either be an actual error handling function,
 * or a deferred object that gets rejected in a default way.
 * @param sessionId
 * @return JSONHttpRequest object, which is a XMLHttpRequest with attached
 * sendJSON() method.
 */
function makeJsonRequest(method, url, onLoad, onError, sessionId) {
    var jhr = makeRequest('application/json', method, url, onLoad, onError, sessionId);
    jhr.sendJSON = function (json) {
        jhr.send(JSON.stringify(json));
    };
    return jhr;
}
exports.makeJsonRequest = makeJsonRequest;
/**
 * This assembles XMLHttpRequest with 'Content-Type: application/octet-stream'.
 * Session id header is added, if string id is given.
 * @param method
 * @param url
 * @param onLoad
 * @param onError it can either be an actual error handling function,
 * or a deferred object that gets rejected in a default way.
 * @param sessionId
 * @returns XMLHttpRequest object, setup and ready for send(blob).
 */
function makeBinaryRequest(method, url, onLoad, onError, sessionId) {
    return makeRequest('application/octet-stream', method, url, onLoad, onError, sessionId);
}
exports.makeBinaryRequest = makeBinaryRequest;
/**
 * This assembles XMLHttpRequest with 'Content-Type: text/plain'.
 * Session id header is added, if string id is given.
 * @param method
 * @param url
 * @param onLoad
 * @param onError it can either be an actual error handling function,
 * or a deferred object that gets rejected in a default way.
 * @param sessionId
 * @returns XMLHttpRequest object, setup and ready for send(string).
 */
function makeTextRequest(method, url, onLoad, onError, sessionId) {
    return makeRequest('text/plain', method, url, onLoad, onError, sessionId);
}
exports.makeTextRequest = makeTextRequest;
/**
 * This assembles XMLHttpRequest without 'Content-Type'.
 * Session id header is added, if string id is given.
 * @param method
 * @param url
 * @param onLoad
 * @param onError it can either be an actual error handling function,
 * or a deferred object that gets rejected in a default way.
 * @param sessionId
 * @returns XMLHttpRequest object, setup and ready for send(string).
 */
function makeBodylessRequest(method, url, onLoad, onError, sessionId) {
    var xhr = makeRequest(null, method, url, onLoad, onError, sessionId);
    var initSend = xhr.send;
    xhr.send = function (data) {
        if ('undefined' !== typeof data) {
            throw new Error("There should be no data in a body-less request.");
        }
        initSend.call(xhr);
    };
    return xhr;
}
exports.makeBodylessRequest = makeBodylessRequest;
/**
 * This sets a reject in a given deferred to HttpError with a given message,
 * status field, and XMLHttpRequest, if it has been given.
 * @param deferred is deferred object that has its rejected state set by this
 * function.
 * @param xhr is XMLHttpRequest object of the original request, or numberic
 * status code. In the first case, status code is taken from it, as well as
 * error message. Error message is taken from json's error field, or, response
 * is taken, if return type is text.
 * Else, statusText is used as a message.
 *
 */
function reject(deferred, statusOrXhr, errMsg) {
    var msg;
    var status;
    var xhr;
    if ("number" === typeof statusOrXhr) {
        msg = errMsg;
        status = statusOrXhr;
    }
    else {
        xhr = statusOrXhr;
        status = xhr.status;
        if ((xhr.responseType === '') || (xhr.responseType === 'text')) {
            msg = ((xhr.response !== null) ? xhr.response : xhr.statusText);
        }
        else if (xhr.responseType === 'json') {
            msg = (((xhr.response !== null) && xhr.response.error) ? xhr.response.error : xhr.statusText);
        }
        else {
            msg = xhr.statusText;
        }
    }
    var err = (new Error(msg));
    err.status = status;
    err.xhr = xhr;
    deferred.reject(err);
}
exports.reject = reject;
Object.freeze(exports);

},{}],21:[function(require,module,exports){
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
 * This module provides an object with functions that encode array of octets
 * (binary data) into base64 strings.
 * Bytes, array of octets, are assumed to be in Uint8Array form, and the same
 * is produced in decoding.
 *
 * Base64 implemented here uses alphabet, described in
 * https://tools.ietf.org/html/rfc4648 (RFC 4648),
 * i.e. last to chars are '+' and '/', with '=' used for padding, in a
 * strict correspondence of steps, described in RFC document.
 * Base64 encoder will not tolerate neither non-alphabet characters, nor
 * missing padding characters, if these are required, as per quoted RFC
 * document.
 *
 * There is an urlSafe object with url safe version of base64.
 */
/**
 * We shall use some numerical constants, which we display here for readable
 * reference.
 * Note that placing them in variables shall add lookup penalty, as this is
 * dynamic javascript.
 * 3   === parseInt('11',2)
 * 15  === parseInt('1111',2)
 * 63  === parseInt('111111',2)
*/
function encodeBytesToBase64Universal(bytes, intToLetDict, pad) {
    var paddedSectionLength = (bytes.length % 3);
    var fullTriplesLength = (bytes.length - paddedSectionLength);
    var chars = new Array(4 * (fullTriplesLength / 3 + (paddedSectionLength === 0 ? 0 : 1)));
    var charIndex = 0;
    var n;
    var b1;
    var b2;
    var b3;
    for (var i = 0; i < fullTriplesLength; i += 3) {
        b1 = bytes[i];
        b2 = bytes[i + 1];
        b3 = bytes[i + 2];
        // 1st six bits
        n = (b1 >>> 2);
        chars[charIndex] = intToLetDict[n];
        charIndex += 1;
        // 2nd six bits
        n = ((b1 & 3) << 4) | (b2 >>> 4);
        chars[charIndex] = intToLetDict[n];
        charIndex += 1;
        // 3rd six bits
        n = ((b2 & 15) << 2) | (b3 >>> 6);
        chars[charIndex] = intToLetDict[n];
        charIndex += 1;
        // 4th six bits
        n = (b3 & 63);
        chars[charIndex] = intToLetDict[n];
        charIndex += 1;
    }
    if (paddedSectionLength === 1) {
        b1 = bytes[fullTriplesLength];
        // 1st six bits
        n = (b1 >>> 2);
        chars[charIndex] = intToLetDict[n];
        charIndex += 1;
        // last 2 bits, padded with zeros
        n = ((b1 & 3) << 4);
        chars[charIndex] = intToLetDict[n];
        chars[charIndex + 1] = pad;
        chars[charIndex + 2] = pad;
    }
    else if (paddedSectionLength === 2) {
        b1 = bytes[fullTriplesLength];
        b2 = bytes[fullTriplesLength + 1];
        // 1st six bits
        n = (b1 >>> 2);
        chars[charIndex] = intToLetDict[n];
        charIndex += 1;
        // 2nd six bits
        n = ((b1 & 3) << 4) | (b2 >>> 4);
        chars[charIndex] = intToLetDict[n];
        charIndex += 1;
        // last 4 bits, padded with zeros
        n = ((b2 & 15) << 2);
        chars[charIndex] = intToLetDict[n];
        chars[charIndex + 1] = pad;
    }
    return chars.join('');
}
function getNumberFrom(letToIntDict, ch) {
    var n = letToIntDict[ch];
    if ('undefined' === typeof n) {
        throw new Error("String contains character '" + ch + "', which is not present in base64 representation alphabet.");
    }
    return n;
}
function decodeUniversalBase64String(str, letToIntDict, pad) {
    if ((str.length % 4) > 0) {
        throw new Error("Given string's length is not multiple of four, while " + "base64 representation with mandatory padding expects such length.");
    }
    if (str.length === 0) {
        return new Uint8Array(0);
    }
    var numOfBytesInPaddedSection = 0;
    if (str[str.length - 2] === pad) {
        numOfBytesInPaddedSection = 1;
    }
    else if (str[str.length - 1] === pad) {
        numOfBytesInPaddedSection = 2;
    }
    var bytes = new Uint8Array((str.length / 4 - 1) * 3 + (numOfBytesInPaddedSection === 0 ? 3 : numOfBytesInPaddedSection));
    var strLenOfCompleteGroups = (str.length - (numOfBytesInPaddedSection === 0 ? 0 : 4));
    var byteIndex = 0;
    var b;
    var n;
    for (var i = 0; i < strLenOfCompleteGroups; i += 4) {
        // 1st octet
        n = getNumberFrom(letToIntDict, str[i]);
        b = n << 2;
        n = getNumberFrom(letToIntDict, str[i + 1]);
        b |= (n >>> 4);
        bytes[byteIndex] = b;
        byteIndex += 1;
        // 2nd octet
        b = (n & 15) << 4;
        n = getNumberFrom(letToIntDict, str[i + 2]);
        b |= (n >>> 2);
        bytes[byteIndex] = b;
        byteIndex += 1;
        // 3rd octet
        b = (n & 3) << 6;
        n = getNumberFrom(letToIntDict, str[i + 3]);
        b |= n;
        bytes[byteIndex] = b;
        byteIndex += 1;
    }
    if (numOfBytesInPaddedSection === 1) {
        // 1st octet only
        n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups]);
        b = n << 2;
        n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups + 1]);
        b |= (n >>> 4);
        bytes[byteIndex] = b;
    }
    else if (numOfBytesInPaddedSection === 2) {
        // 1st octet
        n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups]);
        b = n << 2;
        n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups + 1]);
        b |= (n >>> 4);
        bytes[byteIndex] = b;
        // 2nd octet
        b = (n & 15) << 4;
        n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups + 2]);
        b |= (n >>> 2);
        bytes[byteIndex + 1] = b;
    }
    return bytes;
}
function makeLetToIntDict(intToLetDict) {
    var dict = {}, l;
    for (var i = 0; i < intToLetDict.length; i += 1) {
        l = intToLetDict[i];
        dict[l] = i;
    }
    return dict;
}
// This is a standard base64 alphabet, and corresponding functions
var BASE64_INT_TO_LETTER_DICTIONARY = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var BASE64_LETTER_TO_INT_DICTIONARY = makeLetToIntDict(BASE64_INT_TO_LETTER_DICTIONARY);
var BASE64_PAD = '=';
function pack(bytes) {
    return encodeBytesToBase64Universal(bytes, BASE64_INT_TO_LETTER_DICTIONARY, BASE64_PAD);
}
exports.pack = pack;
function open(str) {
    return decodeUniversalBase64String(str, BASE64_LETTER_TO_INT_DICTIONARY, BASE64_PAD);
}
exports.open = open;
//This is a URL/filesystem safe base64 alphabet, and corresponding functions
var URL_SAFE_BASE64_INT_TO_LETTER_DICTIONARY = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
var URL_SAFE_BASE64_LETTER_TO_INT_DICTIONARY = makeLetToIntDict(URL_SAFE_BASE64_INT_TO_LETTER_DICTIONARY);
var urlSafe;
(function (urlSafe) {
    function open(str) {
        return decodeUniversalBase64String(str, URL_SAFE_BASE64_LETTER_TO_INT_DICTIONARY, BASE64_PAD);
    }
    urlSafe.open = open;
    function pack(bytes) {
        return encodeBytesToBase64Universal(bytes, URL_SAFE_BASE64_INT_TO_LETTER_DICTIONARY, BASE64_PAD);
    }
    urlSafe.pack = pack;
})(urlSafe = exports.urlSafe || (exports.urlSafe = {}));
Object.freeze(urlSafe);
Object.freeze(exports);

},{}],22:[function(require,module,exports){
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
exports.Code = {
    noFile: 'ENOENT',
    fileExists: 'EEXIST',
    notDirectory: 'ENOTDIR',
    isDirectory: 'EISDIR'
};
function makeErr(code, msg) {
    var err = new Error(msg);
    err.code = code;
    return err;
}
exports.makeErr = makeErr;

},{}],23:[function(require,module,exports){
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
/*
 * This module provides hex encoding of binary array into a string.
 */
var HEX_INT_TO_LETTER_DICTIONARY = "0123456789abcdef";
var HEX_LETTER_TO_INT_DICTIONARY = (function () {
    var map = {}, ch;
    for (var i = 0; i < HEX_INT_TO_LETTER_DICTIONARY.length; i += 1) {
        ch = HEX_INT_TO_LETTER_DICTIONARY[i];
        map[ch] = i;
    }
    // This adds ability to read lower case letters
    var upperDict = HEX_INT_TO_LETTER_DICTIONARY.toUpperCase();
    for (var i = 10; i < upperDict.length; i += 1) {
        ch = upperDict[i];
        map[ch] = i;
    }
    return map;
})();
function pack(bytes) {
    var chars = new Array(bytes.length * 2);
    var b;
    for (var i = 0; i < bytes.length; i += 1) {
        b = bytes[i];
        chars[2 * i] = HEX_INT_TO_LETTER_DICTIONARY[b >>> 4];
        chars[2 * i + 1] = HEX_INT_TO_LETTER_DICTIONARY[b & 15];
    }
    return chars.join('');
}
exports.pack = pack;
function open(str) {
    if ((str.length % 2) > 0) {
        throw new Error("Given string has odd number of charaters, while " + "in hex representation every byte is represented by two letters.");
    }
    var bytes = new Uint8Array(str.length / 2);
    var b;
    var ch;
    var n;
    for (var i = 0; i < str.length; i += 2) {
        ch = str[i];
        n = HEX_LETTER_TO_INT_DICTIONARY[ch];
        if ('undefined' === typeof n) {
            throw new Error("String contains, at position " + i + ", character '" + ch + "', which is not present in hex representation alphabet.");
        }
        b = (n << 4);
        ch = str[i + 1];
        n = HEX_LETTER_TO_INT_DICTIONARY[ch];
        if ('undefined' === typeof n) {
            throw new Error("String contains, at position " + (i + 1) + ", character '" + ch + "', which is not present in hex representation alphabet.");
        }
        b = (b | n);
        bytes[i / 2] = b;
    }
    return bytes;
}
exports.open = open;
Object.freeze(exports);

},{}],24:[function(require,module,exports){
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
/*
 * This module defines json form of keys and signed objects.
 */
var base64 = require('./base64');
var utf8 = require('./utf8');
function isLikeJsonKey(jkey) {
    return (('object' === typeof jkey) && !!jkey && ('string' === typeof jkey.alg) && !!jkey.alg && ('string' === typeof jkey.kid) && !!jkey.kid && ('string' === typeof jkey.k) && !!jkey.k && ('string' === typeof jkey.kid && !!jkey.kid));
}
exports.isLikeJsonKey = isLikeJsonKey;
function isLikeSignedLoad(load) {
    return (('object' === typeof load) && !!load && ('string' === typeof load.alg) && !!load.alg && ('string' === typeof load.kid) && !!load.kid && ('string' === typeof load.sig) && !!load.sig && ('string' === typeof load.load && !!load.load));
}
exports.isLikeSignedLoad = isLikeSignedLoad;
function isLikeKeyCert(cert) {
    return (('object' === typeof cert) && !!cert && ('number' === typeof cert.expiresAt) && ('number' === typeof cert.issuedAt) && (cert.expiresAt > cert.issuedAt) && ('string' === typeof cert.issuer) && !!cert.issuer && ('object' === typeof cert.cert) && !!cert.cert && ('object' === typeof cert.cert.principal) && !!cert.cert.principal && ('string' === typeof cert.cert.principal.address) && !!cert.cert.principal.address && isLikeJsonKey(cert.cert.publicKey));
}
exports.isLikeKeyCert = isLikeKeyCert;
function isLikeSignedKeyCert(load) {
    if (!isLikeSignedLoad(load)) {
        return false;
    }
    try {
        return isLikeKeyCert(JSON.parse(utf8.open(base64.open(load.load))));
    }
    catch (e) {
        return false;
    }
}
exports.isLikeSignedKeyCert = isLikeSignedKeyCert;
function keyFromJson(key, use, alg, klen) {
    if (key.use === use) {
        if (key.alg === alg) {
            var bytes = base64.open(key.k);
            if (bytes.length !== klen) {
                throw new Error("Key " + key.kid + " has a wrong number of bytes");
            }
            return {
                use: key.use,
                alg: key.alg,
                kid: key.kid,
                k: bytes
            };
        }
        else {
            throw new Error("Key " + key.kid + ", should be used with unsupported algorithm '" + key.alg + "'");
        }
    }
    else {
        throw new Error("Key " + key.kid + " has incorrect use '" + key.use + "', instead of '" + use + "'");
    }
}
exports.keyFromJson = keyFromJson;
function keyToJson(key) {
    return {
        use: key.use,
        alg: key.alg,
        kid: key.kid,
        k: base64.pack(key.k)
    };
}
exports.keyToJson = keyToJson;
function getKeyCert(signedCert) {
    return JSON.parse(utf8.open(base64.open(signedCert.load)));
}
exports.getKeyCert = getKeyCert;
function getPubKey(signedCert) {
    return getKeyCert(signedCert).cert.publicKey;
}
exports.getPubKey = getPubKey;
function getPrincipalAddress(signedCert) {
    return getKeyCert(signedCert).cert.principal.address;
}
exports.getPrincipalAddress = getPrincipalAddress;
Object.freeze(exports);

},{"./base64":21,"./utf8":31}],25:[function(require,module,exports){
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
/*
 * This library handles signing and verification of signatures, used
 * in MailerId.
 */
var nacl = require("ecma-nacl");
var jwk = require("./jwkeys");
var utf8 = require("./utf8");
var base64 = require('./base64');
/**
 * This enumerates MailerId's different use-roles of keys, involved in
 * establishing a trust.
 */
exports.KEY_USE = {
    /**
     * This is a MailerId trust root.
     * It signs certificate for itself, and it signs certificates for provider
     * keys, which have shorter life span, than the root.
     * Root may revoke itself, and may revoke provider key.
     */
    ROOT: "mid-root",
    /**
     * This is a provider key, which is used to certify users' signing keys.
     */
    PROVIDER: "mid-provider",
    /**
     * With this key, MailerId user signs assertions and mail keys.
     */
    SIGN: "mid-sign",
};
Object.freeze(exports.KEY_USE);
function genSignKeyPair(use, kidLen, random, arrFactory) {
    var pair = nacl.signing.generate_keypair(random(32), arrFactory);
    var pkey = {
        use: use,
        alg: nacl.signing.JWK_ALG_NAME,
        kid: base64.pack(random(kidLen)),
        k: base64.pack(pair.pkey)
    };
    var skey = {
        use: pkey.use,
        alg: pkey.alg,
        kid: pkey.kid,
        k: pair.skey
    };
    return { pkey: pkey, skey: skey };
}
function makeCert(pkey, principalAddr, issuer, issuedAt, expiresAt, signKey, arrFactory) {
    if (signKey.alg !== nacl.signing.JWK_ALG_NAME) {
        throw new Error("Given signing key is used with another algorithm.");
    }
    var cert = {
        cert: {
            publicKey: pkey,
            principal: { address: principalAddr }
        },
        issuer: issuer,
        issuedAt: issuedAt,
        expiresAt: expiresAt
    };
    var certBytes = utf8.pack(JSON.stringify(cert));
    var sigBytes = nacl.signing.signature(certBytes, signKey.k, arrFactory);
    return {
        alg: signKey.alg,
        kid: signKey.kid,
        sig: base64.pack(sigBytes),
        load: base64.pack(certBytes)
    };
}
var idProvider;
(function (idProvider) {
    idProvider.KID_BYTES_LENGTH = 9;
    idProvider.MAX_USER_CERT_VALIDITY = 24 * 60 * 60;
    function makeSelfSignedCert(address, validityPeriod, sjkey, arrFactory) {
        var skey = jwk.keyFromJson(sjkey, exports.KEY_USE.ROOT, nacl.signing.JWK_ALG_NAME, nacl.signing.SECRET_KEY_LENGTH);
        var pkey = {
            use: sjkey.use,
            alg: sjkey.alg,
            kid: sjkey.kid,
            k: base64.pack(nacl.signing.extract_pkey(skey.k))
        };
        var now = Math.floor(Date.now() / 1000);
        return makeCert(pkey, address, address, now, now + validityPeriod, skey, arrFactory);
    }
    idProvider.makeSelfSignedCert = makeSelfSignedCert;
    /**
     * One should keep MailerId root key offline, as this key is used only to
     * sign provider keys, which have to work online.
     * @param address is an address of an issuer
     * @param validityPeriod validity period of a generated self-signed
     * certificate in milliseconds
     * @param random
     * @param arrFactory optional array factory
     * @return Generated root key and a self-signed certificate for respective
     * public key.
     */
    function generateRootKey(address, validityPeriod, random, arrFactory) {
        if (validityPeriod < 1) {
            throw new Error("Illegal validity period.");
        }
        var rootPair = genSignKeyPair(exports.KEY_USE.ROOT, idProvider.KID_BYTES_LENGTH, random, arrFactory);
        var now = Math.floor(Date.now() / 1000);
        var rootCert = makeCert(rootPair.pkey, address, address, now, now + validityPeriod, rootPair.skey, arrFactory);
        return { cert: rootCert, skey: jwk.keyToJson(rootPair.skey) };
    }
    idProvider.generateRootKey = generateRootKey;
    /**
     * @param address is an address of an issuer
     * @param validityPeriod validity period of a generated self-signed
     * certificate in seconds
     * @param rootJKey root key in json format
     * @param random
     * @param arrFactory optional array factory
     * @return Generated provider's key and a certificate for a respective
     * public key.
     */
    function generateProviderKey(address, validityPeriod, rootJKey, random, arrFactory) {
        if (validityPeriod < 1) {
            throw new Error("Illegal validity period.");
        }
        var rootKey = jwk.keyFromJson(rootJKey, exports.KEY_USE.ROOT, nacl.signing.JWK_ALG_NAME, nacl.signing.SECRET_KEY_LENGTH);
        var provPair = genSignKeyPair(exports.KEY_USE.PROVIDER, idProvider.KID_BYTES_LENGTH, random, arrFactory);
        var now = Math.floor(Date.now() / 1000);
        var rootCert = makeCert(provPair.pkey, address, address, now, now + validityPeriod, rootKey, arrFactory);
        return { cert: rootCert, skey: jwk.keyToJson(provPair.skey) };
    }
    idProvider.generateProviderKey = generateProviderKey;
    /**
     * @param issuer is a domain of certificate issuer, at which issuer's public
     * key can be found to check the signature
     * @param validityPeriod is a default validity period in seconds, for
     * which certifier shall be making certificates
     * @param signJKey is a certificates signing key
     * @param arrFactory is an optional array factory
     * @return MailerId certificates generator, which shall be used on identity
     * provider's side
     */
    function makeIdProviderCertifier(issuer, validityPeriod, signJKey, arrFactory) {
        if (!issuer) {
            throw new Error("Given issuer is illegal.");
        }
        if ((validityPeriod < 1) || (validityPeriod > idProvider.MAX_USER_CERT_VALIDITY)) {
            throw new Error("Given certificate validity is illegal.");
        }
        var signKey = jwk.keyFromJson(signJKey, exports.KEY_USE.PROVIDER, nacl.signing.JWK_ALG_NAME, nacl.signing.SECRET_KEY_LENGTH);
        signJKey = null;
        if (!arrFactory) {
            arrFactory = nacl.arrays.makeFactory();
        }
        return {
            certify: function (publicKey, address, validFor) {
                if (!signKey) {
                    throw new Error("Certifier is already destroyed.");
                }
                if (publicKey.use !== exports.KEY_USE.SIGN) {
                    throw new Error("Given public key is not used for signing.");
                }
                if ('number' === typeof validFor) {
                    if (validFor > validityPeriod) {
                        validFor = validityPeriod;
                    }
                    else if (validFor < 0) {
                        new Error("Given certificate validity is illegal.");
                    }
                }
                else {
                    validFor = validityPeriod;
                }
                var now = Math.floor(Date.now() / 1000);
                return makeCert(publicKey, address, issuer, now, now + validFor, signKey, arrFactory);
            },
            destroy: function () {
                if (!signKey) {
                    return;
                }
                nacl.arrays.wipe(signKey.k);
                signKey = null;
                arrFactory.wipeRecycled();
                arrFactory = null;
            }
        };
    }
    idProvider.makeIdProviderCertifier = makeIdProviderCertifier;
})(idProvider = exports.idProvider || (exports.idProvider = {}));
Object.freeze(idProvider);
var relyingParty;
(function (relyingParty) {
    function verifyCertAndGetPubKey(signedCert, use, validAt, arrFactory, issuer, issuerPKey) {
        var cert = jwk.getKeyCert(signedCert);
        if ((validAt < cert.issuedAt) || (cert.expiresAt <= validAt)) {
            throw new Error("Certificate is not valid at a given moment.");
        }
        if (issuer) {
            if (!issuerPKey) {
                throw new Error("Missing issuer key.");
            }
            if ((cert.issuer !== issuer) || (signedCert.kid !== issuerPKey.kid)) {
                throw new Error(use + " certificate is not signed by issuer key.");
            }
        }
        var pkey = jwk.keyFromJson(cert.cert.publicKey, use, nacl.signing.JWK_ALG_NAME, nacl.signing.PUBLIC_KEY_LENGTH);
        var certOK = nacl.signing.verify(base64.open(signedCert.sig), base64.open(signedCert.load), (issuer ? issuerPKey.k : pkey.k), arrFactory);
        if (!certOK) {
            throw new Error(use + " certificate failed validation.");
        }
        return { pkey: pkey, address: cert.cert.principal.address };
    }
    /**
     * @param certs is a chain of certificate to be verified.
     * @param rootAddr is MailerId service's domain.
     * @param validAt is an epoch time moment (in second), at which user
     * certificate must be valid. Provider certificate must be valid at
     * creation of user's certificate. Root certificate must be valid at
     * creation of provider's certificate.
     * @return user's MailerId signing key with user's address.
     */
    function verifyChainAndGetUserKey(certs, rootAddr, validAt, arrFactory) {
        // check root and get the key
        var provCertIssueMoment = jwk.getKeyCert(certs.prov).issuedAt;
        var root = verifyCertAndGetPubKey(certs.root, exports.KEY_USE.ROOT, provCertIssueMoment, arrFactory);
        if (rootAddr !== root.address) {
            throw new Error("Root's address is different from a given one.");
        }
        // check provider and get the key
        var userCertIssueMoment = jwk.getKeyCert(certs.user).issuedAt;
        var provider = verifyCertAndGetPubKey(certs.prov, exports.KEY_USE.PROVIDER, userCertIssueMoment, arrFactory, root.address, root.pkey);
        // check that provider cert comes from the same issuer as root
        if (root.address !== provider.address) {
            throw new Error("Provider's address is different from that of root.");
        }
        // check user certificate and get the key
        return verifyCertAndGetPubKey(certs.user, exports.KEY_USE.SIGN, validAt, arrFactory, provider.address, provider.pkey);
    }
    relyingParty.verifyChainAndGetUserKey = verifyChainAndGetUserKey;
    function verifyAssertion(midAssertion, certChain, rootAddr, validAt, arrFactory) {
        var userInfo = verifyChainAndGetUserKey(certChain, rootAddr, validAt, arrFactory);
        var loadBytes = base64.open(midAssertion.load);
        if (!nacl.signing.verify(base64.open(midAssertion.sig), loadBytes, userInfo.pkey.k, arrFactory)) {
            throw new Error("Assertion fails verification.");
        }
        var assertion = JSON.parse(utf8.open(loadBytes));
        if (assertion.user !== userInfo.address) {
            throw new Error("Assertion is for one user, while chain is for another.");
        }
        if (!assertion.sessionId) {
            throw new Error("Assertion is malformed.");
        }
        if ((validAt < assertion.issuedAt) || (assertion.expiresAt <= validAt)) {
            throw new Error("Assertion is not valid at a given moment.");
        }
        return {
            sessionId: assertion.sessionId,
            relyingPartyDomain: assertion.rpDomain,
            user: userInfo.address
        };
    }
    relyingParty.verifyAssertion = verifyAssertion;
    /**
     * This function does verification of a single certificate with known
     * signing key.
     * If your task requires verification starting with principal's MailerId,
     * use verifyPubKey function that also accepts and checks MailerId
     * certificates chain.
     * @param keyCert is a certificate that should be checked
     * @param principalAddress is an expected principal's address in a given
     * certificate. Exception is thrown, if certificate does not match this
     * expectation.
     * @param signingKey is a public key, with which given certificate is
     * validated cryptographically. Exception is thrown, if crypto-verification
     * fails.
     * @param validAt is an epoch time moment (in second), for which verification
     * should be done.
     * @param arrFactory is an optional array factory.
     * @return a key from a given certificate.
     */
    function verifyKeyCert(keyCert, principalAddress, signingKey, validAt, arrFactory) {
        var certBytes = base64.open(keyCert.load);
        if (!nacl.signing.verify(base64.open(keyCert.sig), base64.open(keyCert.load), signingKey.k, arrFactory)) {
            throw new Error("Key certificate fails verification.");
        }
        var cert = jwk.getKeyCert(keyCert);
        if (cert.cert.principal.address !== principalAddress) {
            throw new Error("Key certificate is for incorrect user.");
        }
        if ((validAt < cert.issuedAt) || (cert.expiresAt <= validAt)) {
            throw new Error("Certificate is not valid at a given moment.");
        }
        return cert.cert.publicKey;
    }
    relyingParty.verifyKeyCert = verifyKeyCert;
    /**
     * @param pubKeyCert certificate with a public key, that needs to be
     * verified.
     * @param principalAddress is an expected principal's address in both key
     * certificate, and in MailerId certificate chain. Exception is thrown,
     * if certificate does not match this expectation.
     * @param certChain is MailerId certificate chain for named principal.
     * @param rootAddr is MailerId root's domain.
     * @param validAt is an epoch time moment (in second), for which key
     * certificate verification should be done.
     * @param arrFactory is an optional array factory.
     * @return a key from a given certificate.
     */
    function verifyPubKey(pubKeyCert, principalAddress, certChain, rootAddr, validAt, arrFactory) {
        var chainValidityMoment = jwk.getKeyCert(pubKeyCert).issuedAt;
        var principalInfo = verifyChainAndGetUserKey(certChain, rootAddr, chainValidityMoment, arrFactory);
        if (principalInfo.address !== principalAddress) {
            throw new Error("MailerId certificate chain is for incorrect user.");
        }
        return verifyKeyCert(pubKeyCert, principalAddress, principalInfo.pkey, validAt, arrFactory);
    }
    relyingParty.verifyPubKey = verifyPubKey;
})(relyingParty = exports.relyingParty || (exports.relyingParty = {}));
Object.freeze(relyingParty);
function correlateSKeyWithItsCert(skey, cert) {
    var pkey = jwk.keyFromJson(cert.cert.publicKey, skey.use, nacl.signing.JWK_ALG_NAME, nacl.signing.PUBLIC_KEY_LENGTH);
    if (!((pkey.kid === skey.kid) && (pkey.use === skey.use) && (pkey.alg === skey.alg) && nacl.compareVectors(nacl.signing.extract_pkey(skey.k), pkey.k))) {
        throw new Error("Key does not correspond to certificate.");
    }
}
var user;
(function (user) {
    user.KID_BYTES_LENGTH = 9;
    user.MAX_SIG_VALIDITY = 30 * 60;
    function generateSigningKeyPair(random, arrFactory) {
        return genSignKeyPair(exports.KEY_USE.SIGN, user.KID_BYTES_LENGTH, random, arrFactory);
    }
    user.generateSigningKeyPair = generateSigningKeyPair;
    /**
     * @param signKey which will be used to sign assertions/keys. Note that
     * this key shall be wiped, when signer is destroyed, as key is neither
     * long-living, nor should be shared.
     * @param cert is user's certificate, signed by identity provider.
     * @param provCert is provider's certificate, signed by respective mid root.
     * @param validityPeriod
     * @param arrFactory is an optional array factory
     * @return signer for user of MailerId to generate assertions, and to sign
     * keys.
     */
    function makeMailerIdSigner(signKey, userCert, provCert, validityPeriod, arrFactory) {
        var certificate = jwk.getKeyCert(userCert);
        if (signKey.use !== exports.KEY_USE.SIGN) {
            throw new Error("Given key " + signKey.kid + " has incorrect use: " + signKey.use);
        }
        correlateSKeyWithItsCert(signKey, certificate);
        if (('number' !== typeof validityPeriod) || (validityPeriod < 1) || (validityPeriod > user.MAX_SIG_VALIDITY)) {
            throw new Error("Given assertion validity is illegal: " + validityPeriod);
        }
        if (!arrFactory) {
            arrFactory = nacl.arrays.makeFactory();
        }
        var signer = {
            address: certificate.cert.principal.address,
            userCert: userCert,
            providerCert: provCert,
            issuer: certificate.issuer,
            certExpiresAt: certificate.expiresAt,
            validityPeriod: validityPeriod,
            generateAssertionFor: function (rpDomain, sessionId, validFor) {
                if (!signKey) {
                    throw new Error("Signer is already destroyed.");
                }
                if ('number' === typeof validFor) {
                    if (validFor > validityPeriod) {
                        validFor = validityPeriod;
                    }
                    else if (validFor < 0) {
                        new Error("Given certificate validity is illegal.");
                    }
                }
                else {
                    validFor = validityPeriod;
                }
                var now = Math.floor(Date.now() / 1000);
                if (now >= certificate.expiresAt) {
                    throw new Error("Signing key has already expiried.");
                }
                var assertion = {
                    rpDomain: rpDomain,
                    sessionId: sessionId,
                    user: certificate.cert.principal.address,
                    issuedAt: now,
                    expiresAt: now + validFor
                };
                var assertionBytes = utf8.pack(JSON.stringify(assertion));
                var sigBytes = nacl.signing.signature(assertionBytes, signKey.k, arrFactory);
                return {
                    alg: signKey.alg,
                    kid: signKey.kid,
                    sig: base64.pack(sigBytes),
                    load: base64.pack(assertionBytes)
                };
            },
            certifyPublicKey: function (pkey, validFor) {
                if (!signKey) {
                    throw new Error("Signer is already destroyed.");
                }
                if (validFor < 0) {
                    new Error("Given certificate validity is illegal.");
                }
                var now = Math.floor(Date.now() / 1000);
                if (now >= certificate.expiresAt) {
                    throw new Error("Signing key has already expiried.");
                }
                return makeCert(pkey, certificate.cert.principal.address, certificate.cert.principal.address, now, now + validFor, signKey, arrFactory);
            },
            destroy: function () {
                if (!signKey) {
                    return;
                }
                nacl.arrays.wipe(signKey.k);
                signKey = null;
                arrFactory.wipeRecycled();
                arrFactory = null;
            }
        };
        Object.freeze(signer);
        return signer;
    }
    user.makeMailerIdSigner = makeMailerIdSigner;
})(user = exports.user || (exports.user = {}));
Object.freeze(user);
Object.freeze(exports);

},{"./base64":21,"./jwkeys":24,"./utf8":31,"ecma-nacl":"ecma-nacl"}],26:[function(require,module,exports){
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
 * This defines interfaces for mail retrieval requests.
 */
var midApi = require('../mailer-id/login');
var Uri = require('jsuri');
exports.ERR_SC = {
    malformed: 400,
    needAuth: 401,
    server: 500,
    contentTooLong: 413,
    contentLenMissing: 411,
    wrongContentType: 415,
    noSpace: 480
};
Object.freeze(exports.ERR_SC);
exports.HTTP_HEADER = {
    contentType: 'Content-Type',
    contentLength: 'Content-Length',
    objVersion: 'X-Version'
};
Object.freeze(exports.HTTP_HEADER);
exports.BIN_TYPE = 'application/octet-stream';
var midLogin;
(function (midLogin) {
    midLogin.MID_URL_PART = 'login/mailerid/';
    midLogin.START_URL_END = midLogin.MID_URL_PART + midApi.startSession.URL_END;
    midLogin.AUTH_URL_END = midLogin.MID_URL_PART + midApi.authSession.URL_END;
})(midLogin = exports.midLogin || (exports.midLogin = {}));
Object.freeze(midLogin);
var closeSession;
(function (closeSession) {
    closeSession.URL_END = 'session/close';
})(closeSession = exports.closeSession || (exports.closeSession = {}));
Object.freeze(closeSession);
var sessionParams;
(function (sessionParams) {
    sessionParams.URL_END = 'session/params';
})(sessionParams = exports.sessionParams || (exports.sessionParams = {}));
Object.freeze(sessionParams);
function getOptsToString(opts) {
    if (!opts) {
        return '';
    }
    var url = new Uri();
    if ('number' === typeof opts.ofs) {
        url.addQueryParam('ofs', '' + opts.ofs);
    }
    if ('number' === typeof opts.len) {
        url.addQueryParam('len', '' + opts.len);
    }
    if ('number' === typeof opts.ver) {
        url.addQueryParam('ver', '' + opts.ver);
    }
    return url.toString();
}
function putOptsToString(opts) {
    var url = new Uri();
    url.addQueryParam('trans', '' + opts.trans);
    if (opts.append) {
        url.addQueryParam('append', 'true');
        return url.toString();
    }
    else {
        if ('number' === typeof opts.ofs) {
            url.addQueryParam('ofs', opts.ofs);
            return url.toString();
        }
        else {
            throw new Error('Incorrect options are given.');
        }
    }
}
var rootHeader;
(function (rootHeader) {
    rootHeader.EXPRESS_URL_END = 'root/header';
    function getReqUrlEnd(opts) {
        return rootHeader.EXPRESS_URL_END + getOptsToString(opts);
    }
    rootHeader.getReqUrlEnd = getReqUrlEnd;
    function putReqUrlEnd(opts) {
        return rootHeader.EXPRESS_URL_END + putOptsToString(opts);
    }
    rootHeader.putReqUrlEnd = putReqUrlEnd;
    rootHeader.SC = {
        okGet: 200,
        okPut: 201,
        missing: 474
    };
    Object.freeze(rootHeader.SC);
})(rootHeader = exports.rootHeader || (exports.rootHeader = {}));
Object.freeze(rootHeader);
var rootSegs;
(function (rootSegs) {
    rootSegs.EXPRESS_URL_END = 'root/segments';
    function getReqUrlEnd(opts) {
        return rootSegs.EXPRESS_URL_END + getOptsToString(opts);
    }
    rootSegs.getReqUrlEnd = getReqUrlEnd;
    function putReqUrlEnd(opts) {
        return rootSegs.EXPRESS_URL_END + putOptsToString(opts);
    }
    rootSegs.putReqUrlEnd = putReqUrlEnd;
    rootSegs.SC = rootHeader.SC;
})(rootSegs = exports.rootSegs || (exports.rootSegs = {}));
Object.freeze(rootHeader);
var objHeader;
(function (objHeader) {
    objHeader.EXPRESS_URL_END = 'obj/:objId/header';
    function getReqUrlEnd(objId, opts) {
        return 'obj/' + objId + '/header' + getOptsToString(opts);
    }
    objHeader.getReqUrlEnd = getReqUrlEnd;
    function putReqUrlEnd(objId, opts) {
        return 'obj/' + objId + '/header' + putOptsToString(opts);
    }
    objHeader.putReqUrlEnd = putReqUrlEnd;
    objHeader.SC = {
        okGet: 200,
        okPut: 201,
        unknownObj: 474
    };
    Object.freeze(objHeader.SC);
})(objHeader = exports.objHeader || (exports.objHeader = {}));
Object.freeze(objHeader);
var objSegs;
(function (objSegs) {
    objSegs.EXPRESS_URL_END = 'obj/:objId/segments';
    function getReqUrlEnd(objId, opts) {
        return 'obj/' + objId + '/segments' + getOptsToString(opts);
    }
    objSegs.getReqUrlEnd = getReqUrlEnd;
    function putReqUrlEnd(objId, opts) {
        return 'obj/' + objId + '/segments' + putOptsToString(opts);
    }
    objSegs.putReqUrlEnd = putReqUrlEnd;
    objSegs.SC = objHeader.SC;
})(objSegs = exports.objSegs || (exports.objSegs = {}));
Object.freeze(objSegs);
var startTransaction;
(function (startTransaction) {
    startTransaction.EXPRESS_URL_END = 'obj/:objId/transaction/start';
    function getReqUrlEnd(objId) {
        return 'obj/' + objId + '/transaction/start';
    }
    startTransaction.getReqUrlEnd = getReqUrlEnd;
    startTransaction.SC = {
        ok: 200,
        unknownObj: 474,
        objAlreadyExists: 473,
        concurrentTransaction: 483,
        incompatibleObjState: 484
    };
    Object.freeze(startTransaction.SC);
})(startTransaction = exports.startTransaction || (exports.startTransaction = {}));
Object.freeze(startTransaction);
var startRootTransaction;
(function (startRootTransaction) {
    startRootTransaction.URL_END = 'root/transaction/start';
})(startRootTransaction = exports.startRootTransaction || (exports.startRootTransaction = {}));
Object.freeze(startRootTransaction);
var finalizeTransaction;
(function (finalizeTransaction) {
    finalizeTransaction.EXPRESS_URL_END = 'obj/:objId/transaction/finalize/:transactionId';
    function getReqUrlEnd(objId, transactionId) {
        return 'obj/' + objId + '/transaction/finalize/' + transactionId;
    }
    finalizeTransaction.getReqUrlEnd = getReqUrlEnd;
    finalizeTransaction.SC = {
        ok: 200,
        unknownObj: 474,
        unknownTransaction: 484
    };
    Object.freeze(finalizeTransaction.SC);
})(finalizeTransaction = exports.finalizeTransaction || (exports.finalizeTransaction = {}));
Object.freeze(finalizeTransaction);
var cancelTransaction;
(function (cancelTransaction) {
    cancelTransaction.EXPRESS_URL_END = 'obj/:objId/transaction/cancel/:transactionId';
    function getReqUrlEnd(objId, transactionId) {
        return 'obj/' + objId + '/transaction/cancel/' + transactionId;
    }
    cancelTransaction.getReqUrlEnd = getReqUrlEnd;
    cancelTransaction.SC = finalizeTransaction.SC;
})(cancelTransaction = exports.cancelTransaction || (exports.cancelTransaction = {}));
Object.freeze(cancelTransaction);
var finalizeRootTransaction;
(function (finalizeRootTransaction) {
    finalizeRootTransaction.EXPRESS_URL_END = 'root/transaction/finalize/:transactionId';
    function getReqUrlEnd(transactionId) {
        return 'root/transaction/finalize/' + transactionId;
    }
    finalizeRootTransaction.getReqUrlEnd = getReqUrlEnd;
    finalizeRootTransaction.SC = finalizeTransaction.SC;
})(finalizeRootTransaction = exports.finalizeRootTransaction || (exports.finalizeRootTransaction = {}));
Object.freeze(finalizeRootTransaction);
var cancelRootTransaction;
(function (cancelRootTransaction) {
    cancelRootTransaction.EXPRESS_URL_END = 'root/transaction/cancel/:transactionId';
    function getReqUrlEnd(transactionId) {
        return 'root/transaction/cancel/' + transactionId;
    }
    cancelRootTransaction.getReqUrlEnd = getReqUrlEnd;
    cancelRootTransaction.SC = finalizeTransaction.SC;
})(cancelRootTransaction = exports.cancelRootTransaction || (exports.cancelRootTransaction = {}));
Object.freeze(cancelRootTransaction);
Object.freeze(exports);

},{"../mailer-id/login":27,"jsuri":"jsuri"}],27:[function(require,module,exports){
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
exports.ERR_SC = {
    duplicate: 475,
    malformed: 400
};
Object.freeze(exports.ERR_SC);
var startSession;
(function (startSession) {
    startSession.URL_END = 'start-session';
    startSession.SC = {
        unknownUser: 474,
        redirect: 373,
        ok: 200
    };
    Object.freeze(startSession.SC);
})(startSession = exports.startSession || (exports.startSession = {}));
Object.freeze(startSession);
var authSession;
(function (authSession) {
    authSession.URL_END = 'authorize-session';
    authSession.SC = {
        authFailed: 403,
        ok: 200
    };
    Object.freeze(authSession.SC);
})(authSession = exports.authSession || (exports.authSession = {}));
Object.freeze(authSession);
Object.freeze(exports);

},{}],28:[function(require,module,exports){
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
var pklApi = require('../pub-key-login');
var pkl;
(function (pkl) {
    pkl.START_URL_END = pklApi.start.URL_END;
    pkl.COMPL_URL_END = pklApi.complete.URL_END;
})(pkl = exports.pkl || (exports.pkl = {}));
var certify;
(function (certify) {
    certify.URL_END = 'certify';
    certify.SC = {
        cryptoVerifFail: 403,
        malformed: 400,
        ok: 200
    };
    Object.freeze(certify.SC);
})(certify = exports.certify || (exports.certify = {}));
Object.freeze(exports);

},{"../pub-key-login":29}],29:[function(require,module,exports){
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
 * This defines interfaces for public key login routes.
 */
exports.ERR_SC = {
    duplicate: 475,
    malformed: 400
};
Object.freeze(exports.ERR_SC);
var start;
(function (start) {
    start.URL_END = 'start-login-exchange';
    start.SC = {
        unknownUser: 474,
        redirect: 373,
        ok: 200
    };
    Object.freeze(start.SC);
})(start = exports.start || (exports.start = {}));
Object.freeze(start);
var complete;
(function (complete) {
    complete.URL_END = 'complete-login-exchange';
    complete.SC = {
        authFailed: 403,
        ok: 200
    };
    Object.freeze(complete.SC);
})(complete = exports.complete || (exports.complete = {}));
Object.freeze(complete);
Object.freeze(exports);

},{}],30:[function(require,module,exports){
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
/*
 * This creates encryptor, which uses session key, established with PKL.
 */
var nacl = require('ecma-nacl');
var utf8 = require('./utf8');
function makeSessionEncryptor(key, nextNonce) {
    var encr = nacl.secret_box.formatWN.makeEncryptor(key, nextNonce, 2);
    var decr = nacl.secret_box.formatWN.makeDecryptor(key);
    return {
        open: decr.open,
        openJSON: function (bytesWN) {
            return JSON.parse(utf8.open(decr.open(bytesWN)));
        },
        pack: encr.pack,
        packJSON: function (json) {
            return encr.pack(utf8.pack(JSON.stringify(json)));
        },
        getDelta: encr.getDelta,
        destroy: function () {
            if (!encr) {
                return;
            }
            encr.destroy();
            encr = null;
            decr.destroy();
            decr = null;
        }
    };
}
exports.makeSessionEncryptor = makeSessionEncryptor;

},{"./utf8":31,"ecma-nacl":"ecma-nacl"}],31:[function(require,module,exports){
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
 * This module provides an object with functions that encode strings to bytes, and decode strings from bytes.
 * Bytes, array of octets, are generated in Uint8Array form, and assume the same form for decoding.
 * Only utf8 is implemented, so far.
 * If someone needs to implement another unicode encoding, they may do so.
 * If someone needs non-unicode, they should be stopped from this historic madness, by re-evaluating their
 * app's requirements, and re-thinking overall system design.
 */
/**
 * Following utf8 encoding table, found in https://en.wikipedia.org/wiki/UTF-8 with RFC3629 restricting
 * code point values to no more than 0x10FFFF.
 *
 * Below we shall use some numerical constants, which we display here for readable reference.
 * Note that placing them in variables shall add lookup penalty, as this is dynamic javascript.
 * 7   === parseInt('111',2)
 * 15  === parseInt('1111',2)
 * 31  === parseInt('11111',2)
 * 63  === parseInt('111111',2)
 * 128 === parseInt('10000000',2)
 * 192 === parseInt('11000000',2)
 * 224 === parseInt('11100000',2)
 * 240 === parseInt('11110000',2)
 * 248 === parseInt('11111000',2)
 */
function unicodePointToUtf8Bytes(ucp) {
    var bytes;
    if (ucp <= 0x7F) {
        // 1 byte of the form 0xxxxxxx
        bytes = new Uint8Array(1);
        bytes[0] = ucp;
    }
    else if (ucp <= 0x7FF) {
        // 2 bytes, the first one is 110xxxxx, and the last one is 10xxxxxx
        bytes = new Uint8Array(2);
        bytes[1] = 128 | (ucp & 63);
        ucp >>>= 6;
        bytes[0] = 192 | ucp;
    }
    else if (ucp <= 0xFFFF) {
        // 3 bytes, the first one is 1110xxxx, and last 2 are 10xxxxxx
        bytes = new Uint8Array(3);
        for (var i = 2; i > 0; i -= 1) {
            bytes[i] = 128 | (ucp & 63);
            ucp >>>= 6;
        }
        bytes[0] = 224 | ucp;
    }
    else if (ucp <= 0x10FFFF) {
        // 4 bytes, the first one is 11110xxx, and last 3 are 10xxxxxx
        bytes = new Uint8Array(4);
        for (var i = 3; i > 0; i -= 1) {
            bytes[i] = 128 | (ucp & 63);
            ucp >>>= 6;
        }
        bytes[0] = 240 | ucp;
    }
    else {
        throw new Error("Unicode char point is greater than 0x7FFFFFFF, which cannot be encoded into utf8.");
    }
    return bytes;
}
function pack(str) {
    var byteCounter = 0, charVocabulary = {}, ch, charBytes;
    for (var i = 0; i < str.length; i += 1) {
        ch = str[i];
        charBytes = charVocabulary[ch];
        if ('undefined' === typeof charBytes) {
            charBytes = unicodePointToUtf8Bytes(ch.charCodeAt(0));
            charVocabulary[ch] = charBytes;
        }
        byteCounter += charBytes.length;
    }
    var allBytes = new Uint8Array(byteCounter);
    byteCounter = 0;
    for (var i = 0; i < str.length; i += 1) {
        ch = str[i];
        charBytes = charVocabulary[ch];
        allBytes.set(charBytes, byteCounter);
        byteCounter += charBytes.length;
    }
    return allBytes;
}
exports.pack = pack;
function addSecondaryBytesIntoCodePoint(codePoint, utf8Bytes, pos, numOfSecBytes) {
    "use strict";
    var b;
    for (var i = 0; i < numOfSecBytes; i += 1) {
        b = utf8Bytes[pos + i];
        if ('undefined' === typeof b) {
            throw new Error("Encountered end of byte array in the middle of multi-byte " + "code point, at position " + (pos + 1));
        }
        if ((b & 192) !== 128) {
            throw new Error("Encountered at position " + (pos + i) + " byte " + b.toString(2) + ", which should be a secondary utf8 byte like 10xxxxxx, but isn't.");
        }
        codePoint <<= 6;
        codePoint += (b & 63);
    }
    return codePoint;
}
function open(utf8Bytes) {
    var byteCounter = 0, charCount = 0, charArr = new Array(utf8Bytes.length), b, ch, codePoint;
    while (byteCounter < utf8Bytes.length) {
        b = utf8Bytes[byteCounter];
        if ((b & 128) === 0) {
            // 1 byte of the form 0xxxxxxx
            codePoint = b;
            byteCounter += 1;
        }
        else if ((b & 224) === 192) {
            // 2 bytes, the first one is 110xxxxx, and the last one is 10xxxxxx
            codePoint = (b & 31);
            codePoint = addSecondaryBytesIntoCodePoint(codePoint, utf8Bytes, byteCounter + 1, 1);
            byteCounter += 2;
        }
        else if ((b & 240) === 224) {
            // 3 bytes, the first one is 1110xxxx, and last 2 are 10xxxxxx
            codePoint = (b & 15);
            codePoint = addSecondaryBytesIntoCodePoint(codePoint, utf8Bytes, byteCounter + 1, 2);
            byteCounter += 3;
        }
        else if ((b & 248) === 240) {
            // 4 bytes, the first one is 11110xxx, and last 3 are 10xxxxxx
            codePoint = (b & 7);
            codePoint = addSecondaryBytesIntoCodePoint(codePoint, utf8Bytes, byteCounter + 1, 3);
            byteCounter += 4;
        }
        else {
            throw new Error("Encountered at position " + byteCounter + " byte " + b.toString(2) + ", which should not be present in a utf8 encoded block.");
        }
        ch = String.fromCharCode(codePoint);
        charArr[charCount] = ch;
        charCount += 1;
    }
    return charArr.join('');
}
exports.open = open;
Object.freeze(exports);

},{}]},{},[2]);
