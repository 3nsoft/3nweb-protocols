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
var Uri = require('jsuri');
exports.ERR_SC = {
    duplicateReq: 475,
    earlyReq: 476,
    malformed: 400,
    server: 500,
    contentTooLong: 413,
    contentLenMissing: 411,
    wrongContentType: 415
};
Object.freeze(exports.ERR_SC);
var preFlight;
(function (preFlight) {
    preFlight.URL_END = 'pre-flight';
    preFlight.SC = {
        ok: 200,
        unknownRecipient: 474,
        senderNotAllowed: 403,
        inboxFull: 480,
        redirect: 373
    };
    Object.freeze(preFlight.SC);
})(preFlight = exports.preFlight || (exports.preFlight = {}));
Object.freeze(preFlight);
var sessionStart;
(function (sessionStart) {
    sessionStart.URL_END = 'start-session';
    sessionStart.SC = preFlight.SC;
})(sessionStart = exports.sessionStart || (exports.sessionStart = {}));
Object.freeze(sessionStart);
var authSender;
(function (authSender) {
    authSender.URL_END = 'authorize-sender';
    authSender.SC = {
        ok: 200,
        authFailed: 403
    };
    Object.freeze(authSender.SC);
})(authSender = exports.authSender || (exports.authSender = {}));
Object.freeze(authSender);
var initPubKey;
(function (initPubKey) {
    initPubKey.URL_END = 'init-pub-key';
    initPubKey.SC = {
        ok: 200,
        unknownKey: 474
    };
    Object.freeze(initPubKey.SC);
})(initPubKey = exports.initPubKey || (exports.initPubKey = {}));
Object.freeze(initPubKey);
var msgMeta;
(function (msgMeta) {
    msgMeta.URL_END = 'msg/meta';
    msgMeta.SC = {
        ok: 201
    };
})(msgMeta = exports.msgMeta || (exports.msgMeta = {}));
Object.freeze(msgMeta);
function optsToString(opts) {
    var url = new Uri();
    if ('number' === typeof opts.total) {
        url.addQueryParam('total', '' + opts.total);
    }
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
var msgObjHeader;
(function (msgObjHeader) {
    msgObjHeader.EXPRESS_URL_END = 'msg/obj/:objId/header';
    function genUrlEnd(objId, opts) {
        return 'msg/obj/' + objId + '/header' + optsToString(opts);
    }
    msgObjHeader.genUrlEnd = genUrlEnd;
    msgObjHeader.SC = {
        ok: 201,
        objAlreadyExists: 473,
        unknownObj: 474
    };
    Object.freeze(msgObjHeader.SC);
})(msgObjHeader = exports.msgObjHeader || (exports.msgObjHeader = {}));
Object.freeze(msgObjHeader);
var msgObjSegs;
(function (msgObjSegs) {
    msgObjSegs.EXPRESS_URL_END = 'msg/obj/:objId/segments';
    function genUrlEnd(objId, opts) {
        return 'msg/obj/' + objId + '/segments' + optsToString(opts);
    }
    msgObjSegs.genUrlEnd = genUrlEnd;
    msgObjSegs.SC = msgObjHeader.SC;
})(msgObjSegs = exports.msgObjSegs || (exports.msgObjSegs = {}));
Object.freeze(msgObjSegs);
var completion;
(function (completion) {
    completion.URL_END = 'msg-complete';
})(completion = exports.completion || (exports.completion = {}));
Object.freeze(completion);
Object.freeze(exports);
