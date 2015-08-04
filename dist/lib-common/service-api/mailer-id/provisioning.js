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
