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
 * This module constructs memory-backed sessions factories.
 */
var sessions = require('./sessions');
var Q = require('q');
var random = require('../random');
/**
 * @param timeout is a session timeout in seconds
 * @return Factory which works properly in a single process application,
 * clearing up sessions that past given timeout.
 */
function makeSingleProcFactory(timeout) {
    if (('number' !== typeof timeout) || (timeout <= 0)) {
        throw new Error("Given timeout must be a number greater than zero.");
    }
    var sessionsDict = {};
    var idGenerator = function () {
        var deferred = Q.defer();
        var newSessionId;
        do {
            newSessionId = random.stringOfB64Chars(40);
        } while ('undefined' !== typeof sessionsDict[newSessionId]);
        deferred.resolve(newSessionId);
        return deferred.promise;
    };
    var sessionCount = 0;
    var timeoutMillis = timeout * 1000;
    var timeoutCodeIntervalId = null;
    var checkSessionsForTimeout = function () {
        var now = Date.now();
        var sIds = Object.keys(sessionsDict);
        var s;
        for (var i = 0; i < sIds.length; i += 1) {
            s = sessionsDict[sIds[i]];
            if ((now - s.lastAccessedAt) >= timeoutMillis) {
                s.close();
            }
        }
    };
    var checkPeriod = timeoutMillis / 2;
    var container = {
        add: function (s) {
            sessionsDict[s.id] = s;
            sessionCount += 1;
            if (sessionCount === 1) {
                timeoutCodeIntervalId = setInterval(checkSessionsForTimeout, checkPeriod);
            }
            return Q.when();
        },
        remove: function (s) {
            delete sessionsDict[s.id];
            sessionCount -= 1;
            if (sessionCount === 0) {
                clearInterval(timeoutCodeIntervalId);
                timeoutCodeIntervalId = null;
            }
            return Q.when();
        },
        get: function (sId) {
            return Q.when(sessionsDict[sId]);
        }
    };
    return sessions.makeSessionFactory(idGenerator, container);
}
exports.makeSingleProcFactory = makeSingleProcFactory;
;
