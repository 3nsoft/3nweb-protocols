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
    server: 500
};
Object.freeze(exports.ERR_SC);
var midLogin;
(function (midLogin) {
    midLogin.MID_URL_PART = 'login/mailerid/';
    midLogin.START_URL_END = midLogin.MID_URL_PART + midApi.startSession.URL_END;
    midLogin.AUTH_URL_END = midLogin.MID_URL_PART + midApi.authSession.URL_END;
})(midLogin = exports.midLogin || (exports.midLogin = {}));
Object.freeze(midLogin);
var closeSession;
(function (closeSession) {
    closeSession.URL_END = 'close-session';
})(closeSession = exports.closeSession || (exports.closeSession = {}));
Object.freeze(closeSession);
var listMsgs;
(function (listMsgs) {
    listMsgs.URL_END = 'msg/ids';
})(listMsgs = exports.listMsgs || (exports.listMsgs = {}));
Object.freeze(listMsgs);
var rmMsg;
(function (rmMsg) {
    rmMsg.EXPRESS_URL_END = 'msg/:msgId';
    function genUrlEnd(msgId) {
        return 'msg/' + msgId;
    }
    rmMsg.genUrlEnd = genUrlEnd;
    rmMsg.SC = {
        ok: 200,
        unknownMsg: 474
    };
    Object.freeze(rmMsg.SC);
})(rmMsg = exports.rmMsg || (exports.rmMsg = {}));
Object.freeze(rmMsg);
var msgMetadata;
(function (msgMetadata) {
    msgMetadata.EXPRESS_URL_END = 'msg/:msgId/meta';
    function genUrlEnd(msgId) {
        return 'msg/' + msgId + '/meta';
    }
    msgMetadata.genUrlEnd = genUrlEnd;
    msgMetadata.SC = {
        ok: 200,
        unknownMsg: 474
    };
    Object.freeze(msgMetadata.SC);
})(msgMetadata = exports.msgMetadata || (exports.msgMetadata = {}));
Object.freeze(msgMetadata);
function optsToString(opts) {
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
    return url.toString();
}
var msgObjHeader;
(function (msgObjHeader) {
    msgObjHeader.EXPRESS_URL_END = 'msg/:msgId/obj/:objId/header';
    function genUrlEnd(msgId, objId, opts) {
        return 'msg/' + msgId + '/obj/' + objId + '/header' + optsToString(opts);
    }
    msgObjHeader.genUrlEnd = genUrlEnd;
    msgObjHeader.SC = {
        ok: 200,
        unknownMsgOrObj: 474
    };
    Object.freeze(msgObjHeader.SC);
})(msgObjHeader = exports.msgObjHeader || (exports.msgObjHeader = {}));
Object.freeze(msgObjHeader);
var msgObjSegs;
(function (msgObjSegs) {
    msgObjSegs.EXPRESS_URL_END = 'msg/:msgId/obj/:objId/segments';
    function genUrlEnd(msgId, objId, opts) {
        return 'msg/' + msgId + '/obj/' + objId + '/segments' + optsToString(opts);
    }
    msgObjSegs.genUrlEnd = genUrlEnd;
    msgObjSegs.SC = msgObjHeader.SC;
})(msgObjSegs = exports.msgObjSegs || (exports.msgObjSegs = {}));
Object.freeze(msgObjSegs);
Object.freeze(exports);
