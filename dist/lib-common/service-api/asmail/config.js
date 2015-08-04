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
var midApi = require('../mailer-id/login');
exports.ERR_SC = {
    server: 500
};
Object.freeze(exports.ERR_SC);
exports.PARAM_SC = {
    malformed: 400,
    ok: 200
};
Object.freeze(exports.PARAM_SC);
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
var p;
(function (p) {
    var initPubKey;
    (function (initPubKey) {
        initPubKey.URL_END = 'param/init-pub-key';
    })(initPubKey = p.initPubKey || (p.initPubKey = {}));
})(p = exports.p || (exports.p = {}));
Object.freeze(p.initPubKey);
var p;
(function (p) {
    var authSenderPolicy;
    (function (authSenderPolicy) {
        authSenderPolicy.URL_END = 'param/auth-sender/policy';
    })(authSenderPolicy = p.authSenderPolicy || (p.authSenderPolicy = {}));
})(p = exports.p || (exports.p = {}));
Object.freeze(p.authSenderPolicy);
var p;
(function (p) {
    var authSenderWhitelist;
    (function (authSenderWhitelist) {
        authSenderWhitelist.URL_END = 'param/auth-sender/whitelist';
    })(authSenderWhitelist = p.authSenderWhitelist || (p.authSenderWhitelist = {}));
})(p = exports.p || (exports.p = {}));
Object.freeze(p.authSenderWhitelist);
var p;
(function (p) {
    var authSenderBlacklist;
    (function (authSenderBlacklist) {
        authSenderBlacklist.URL_END = 'param/auth-sender/blacklist';
    })(authSenderBlacklist = p.authSenderBlacklist || (p.authSenderBlacklist = {}));
})(p = exports.p || (exports.p = {}));
Object.freeze(p.authSenderBlacklist);
var p;
(function (p) {
    var authSenderInvites;
    (function (authSenderInvites) {
        authSenderInvites.URL_END = 'param/auth-sender/invites';
    })(authSenderInvites = p.authSenderInvites || (p.authSenderInvites = {}));
})(p = exports.p || (exports.p = {}));
Object.freeze(p.authSenderInvites);
var p;
(function (p) {
    var anonSenderPolicy;
    (function (anonSenderPolicy) {
        anonSenderPolicy.URL_END = 'param/anon-sender/policy';
    })(anonSenderPolicy = p.anonSenderPolicy || (p.anonSenderPolicy = {}));
})(p = exports.p || (exports.p = {}));
Object.freeze(p.anonSenderPolicy);
var p;
(function (p) {
    var anonSenderInvites;
    (function (anonSenderInvites) {
        anonSenderInvites.URL_END = 'param/anon-sender/invites';
    })(anonSenderInvites = p.anonSenderInvites || (p.anonSenderInvites = {}));
})(p = exports.p || (exports.p = {}));
Object.freeze(p.anonSenderInvites);
Object.freeze(p);
Object.freeze(exports);
