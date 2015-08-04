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

},{}],2:[function(require,module,exports){
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

},{"../lib-common/base64":8}],3:[function(require,module,exports){
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

},{"./page-logging":1}],4:[function(require,module,exports){
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

},{"../lib-common/base64":8,"../lib-common/service-api/pub-key-login":10,"../lib-common/session-encryptor":11,"./xhr-utils":7,"ecma-nacl":"ecma-nacl","jsuri":"jsuri","q":"q"}],5:[function(require,module,exports){
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

},{"../../lib-common/base64":8,"../../lib-common/utf8":12}],6:[function(require,module,exports){
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

},{"../../lib-client/page-logging":1,"./key-gen-common":5,"q":"q"}],7:[function(require,module,exports){
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

},{}],8:[function(require,module,exports){
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

},{}],9:[function(require,module,exports){
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

},{}],10:[function(require,module,exports){
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

},{}],11:[function(require,module,exports){
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

},{"./utf8":12,"ecma-nacl":"ecma-nacl"}],12:[function(require,module,exports){
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
/*
 * This file brings all modules into one piece.
 */
/// <reference path="../../../typings/tsd.d.ts" />
var routing = require('../../../lib-client/simple-router');
var user = require('./user-creation');
var login = require('./user-login');
var router = new routing.Router(window, function () {
    return 'start-view';
});
window.onload = function () {
    // Chrome needs a timeout, to do switch on the "nextTick"
    setTimeout(router.openHashTag.bind(router));
};
router.addView('start-view', function () {
    router.showElem('start-view');
}, function () {
    router.hideElem('start-view');
});
router.addView('new-account-view', function () {
    router.showElem('new-account-view');
}, function () {
    document.getElementById('new-account-form').reset();
    router.hideElem('new-account-view');
});
router.addView('login-view', function () {
    router.showElem('login-view');
}, function () {
    document.getElementById('login-form').reset();
    router.hideElem('login-view');
});
window.openView = router.openView.bind(router);
window.processNewUserInfoAndSend = user.processNewUserInfoAndSend;
window.loginUser = login.loginUser;

},{"../../../lib-client/simple-router":3,"./user-creation":14,"./user-login":15}],14:[function(require,module,exports){
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
 * This defines functions used by user creation part.
 */
var hex = require('../../../lib-common/hex');
var base64 = require('../../../lib-common/base64');
var Q = require('q');
var nacl = require('ecma-nacl');
var xhr = require('../../../lib-client/xhr-utils');
var random = require('../../../lib-client/random');
var log = require('../../../lib-client/page-logging');
var keyGen = require('../../../lib-client/workers/key-gen-main');
function processNewUserInfoAndSend(form) {
    try {
        var username = form.username.value;
        var pubkey = form.pubkey.value;
        var pass = form.pass.value;
        var keyGenParams = {
            salt: base64.pack(random.bytes(64)),
            logN: 17,
            r: 8,
            p: 1
        };
        // Note that with these parameters scrypt shall use memory around:
        // (2^7)*r*N === (2^7)*(2^3)*(2^17) === 2^27 === (2^7)*(2^20) === 128MB
        // If we choose logN === 14, then scrypt uses only 16MB, and in 2015 we
        // already have Intel Xeon Processor E7-4890 v2 with 37.5M (!) of Cache.
        // The point of scrypt is to use so much memory that it will not fit
        // into cache of any known processor.
        log.clear();
        if (!username) {
            log.write("MISSING INFO: provide username for new account.");
            return;
        }
        var promiseOfPubKey;
        if (pubkey) {
            if (pass) {
                log.write("INCORRECT INFO: provide only either public key or\n" + "passphrase, but not both.");
                return;
            }
            else if (pubkey.length < 64) {
                log.write("INCORRECT INFO: public key should be 32 bytes long,\n" + "which is 64 hex charaters,\nwhile only " + pubkey.length + " are given.");
                return;
            }
            else {
                promiseOfPubKey = Q.fcall(function () {
                    return hex.open(pubkey);
                }).fail(function (err) {
                    log.write("INCORRECT INFO: given public key cannot be" + " interpreted as hex form of binary: " + err.message);
                    throw new Error(err);
                });
            }
        }
        else {
            if (pass) {
                promiseOfPubKey = keyGen.deriveKeyFromPass(pass, keyGenParams).then(function (skey) {
                    var pkey = nacl.box.generate_pubkey(skey);
                    log.write("Public key has been calculated and is (in hex): " + hex.pack(pkey));
                    return pkey;
                });
            }
            else {
                log.write("MISSING INFO: provide either public key for " + username + ",\nor passphrase, from which keys are derived.");
                return;
            }
        }
        promiseOfPubKey.then(function (pkey) {
            log.write("Sending username and user's public key to the server " + "to create a test account. Check request body to see, how " + "simple and short is JWK form of keys of developer-friendly " + "NaCl's cryptographic functions.");
            var deferred = Q.defer();
            var url = "/mailerid-users/add-user";
            var req = xhr.makeJsonRequest('PUT', url, function () {
                if (req.status == 201) {
                    deferred.resolve();
                    log.write("Server created a new test account record.");
                }
                else if (req.status == 473) {
                    log.write("Given user name is already present on the " + "server, try another one.");
                    xhr.reject(deferred, req);
                }
                else {
                    xhr.reject(deferred, req);
                }
            }, deferred);
            req.sendJSON({
                id: username,
                pkey: {
                    use: 'login-pub-key',
                    alg: 'NaCl-box-CXSP',
                    k: base64.pack(pkey)
                },
                params: keyGenParams
            });
            return deferred.promise;
        }).then(function () {
            // cleanup 
            form.reset();
            // show further info in the log 
            log.write("You may sign into account page to view the Public Key " + "Login in process:");
            log.writeLink("Sign in", "#login-view");
            log.write("And you may use this new test account with services " + "that use MailerId protocol, and see its process:");
            log.writeLink("ASMail service", "https://localhost:8080/asmail-users/", true);
            log.writeLink("3NStorage service", "https://localhost:8080/3nstorage-users/", true);
        }).fail(function (err) {
            log.write("ERROR: " + err.message);
            console.error('Error in file ' + err.fileName + ' at ' + err.lineNumber + ': ' + err.message);
        }).done();
    }
    catch (err) {
        console.error(err);
    }
}
exports.processNewUserInfoAndSend = processNewUserInfoAndSend;

},{"../../../lib-client/page-logging":1,"../../../lib-client/random":2,"../../../lib-client/workers/key-gen-main":6,"../../../lib-client/xhr-utils":7,"../../../lib-common/base64":8,"../../../lib-common/hex":9,"ecma-nacl":"ecma-nacl","q":"q"}],15:[function(require,module,exports){
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
var hex = require('../../../lib-common/hex');
var Q = require('q');
var nacl = require('ecma-nacl');
var xhr = require('../../../lib-client/xhr-utils');
var log = require('../../../lib-client/page-logging');
var keyGen = require('../../../lib-client/workers/key-gen-main');
var pkl = require('../../../lib-client/user-with-pkl-session');
function loginUser(form) {
    try {
        var username = form.username.value;
        var secretkey = form.seckey.value;
        var pass = form.pass.value;
        log.clear();
        if (!username) {
            log.write("MISSING INFO: provide username for new account.");
            return;
        }
        var promiseOfSecretKey = null;
        if (secretkey) {
            if (pass) {
                log.write("INCORRECT INFO: provide only either secret key or " + "passphrase, but not both.");
                return;
            }
            else if (secretkey.length !== 64) {
                log.write("INCORRECT INFO: secret key should be 32 bytes long,\n" + "which is 64 hex charaters,\nwhile only " + secretkey.length + " are given.");
                return;
            }
            else {
                promiseOfSecretKey = Q.fcall(function () {
                    return hex.open(secretkey);
                }).fail(function (err) {
                    log.write("INCORRECT INFO: given secret key cannot be " + "interpreted as hex form of binary: " + err.message);
                    throw new Error(err);
                });
            }
        }
        else {
            if (!pass) {
                log.write("MISSING INFO: provide either secret key for " + username + ",\nor passphrase, from which keys are derived.");
                return;
            }
        }
        var pklUser = new pkl.ServiceUser(username, {
            login: 'login/pub-key/',
            logout: ''
        });
        var loc = location.href;
        if (loc.indexOf('?') >= 0) {
            loc = loc.substring(0, loc.lastIndexOf('?'));
        }
        if (loc.indexOf('#') >= 0) {
            loc = loc.substring(0, loc.lastIndexOf('#'));
        }
        pklUser.serviceURI = loc;
        log.write("Making an initial request, providing a username, and waiting" + " for reply with a challenge. Server's challenge is NaCl's box " + "envelope without (!) message authenticating code. MAC is send to " + "client only with server's final OK. MAC tells client that server " + "does have its public key. The delay in MAC's transmission protects " + "from a start of an offline attack on password-generated keys.");
        pklUser.startSession().fail(function (err) {
            if (err.status === 474) {
                log.write("Given user name is not known to the server.");
            }
            throw err;
        }).then(function () {
            log.write("New session id==='" + pklUser.sessionId + "' has been opened. " + "Received challenge contains random session key, encrypted with " + "shared (in Diffie-Hellman sense) key.");
            if (!promiseOfSecretKey) {
                promiseOfSecretKey = keyGen.deriveKeyFromPass(pass, pklUser.keyDerivationParams);
            }
            return promiseOfSecretKey.then(function (secretkey) {
                pklUser.openSessionKey(function (serverPubKey) {
                    return nacl.box.calc_dhshared_key(serverPubKey, secretkey);
                });
            });
        }).then(function () {
            log.write("Session key has been extracted from the challenge and " + "encrypted with itself, to be send back to server, to confirm " + "that this client has secret key, which corresponds to public " + "key on server's file.");
            return pklUser.completeLoginExchange();
        }).fail(function (err) {
            if (err.serverNotTrusted) {
                log.write("ERROR: Server verification bytes are not accepted. " + "This indicates that server cannot be trusted, as it does " + "not possess proper key, and OK response on challenge " + "decryption was fake.");
                throw new Error("Server is faking knowledge of user's public key.");
            }
            else if (err.status === 403) {
                log.write("Server is not accepting confirmation of " + "decrypting ability.");
            }
            throw err;
            return null; // else ts complains
        }).then(function () {
            // cleanup 
            form.reset();
            // log 
            log.write("Server has accepted confirmation. Server's reply with " + "an original challenge's MAC is verified and server is deemed " + "trusted. Session is authorized now. As a side effect of this, " + "both sides have common session key. This whole login exchange " + "must happen within tls-protected connection. Session key, though," + " may be used for a paranoid level of encryption of further " + "hyper-sensitive exchanges.");
        }).then(function () {
            log.write("Requesting account info inside this authenticated " + "session, displaying use of extra encryption with session key." + " This means receiving pure binary data, which is possible in" + " version 2 of XMLHTTPRequest. We'll have no more insane passing" + " of binary as ascii text!");
            var deferred = Q.defer();
            var url = "/mailerid-users/get-user-info";
            var req = xhr.makeBodylessRequest('GET', url, function () {
                if (req.status == 200) {
                    deferred.resolve(new Uint8Array(req.response));
                }
                else {
                    xhr.reject(deferred, req);
                }
            }, deferred, pklUser.sessionId);
            req.responseType = "arraybuffer";
            req.send();
            return deferred.promise;
        }).then(function (encResp) {
            var info = pklUser.encryptor.openJSON(encResp);
            log.write("User info on file is " + JSON.stringify(info, null, ' '));
        }).fail(function (err) {
            log.write("ERROR: " + err.message);
            console.error('Error in file ' + err.fileName + ' at ' + err.lineNumber + ': ' + err.message);
        }).done();
    }
    catch (err) {
        console.error(err);
    }
}
exports.loginUser = loginUser;

},{"../../../lib-client/page-logging":1,"../../../lib-client/user-with-pkl-session":4,"../../../lib-client/workers/key-gen-main":6,"../../../lib-client/xhr-utils":7,"../../../lib-common/hex":9,"ecma-nacl":"ecma-nacl","q":"q"}]},{},[13]);
