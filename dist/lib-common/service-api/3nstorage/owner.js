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
