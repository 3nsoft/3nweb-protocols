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
