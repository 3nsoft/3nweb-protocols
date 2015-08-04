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

import sessions = require('./sessions');
import Q = require('q');
import random = require('../random');

/**
 * @param timeout is a session timeout in seconds
 * @return Factory which works properly in a single process application,
 * clearing up sessions that past given timeout.
 */
export function makeSingleProcFactory(timeout: number): sessions.Factory {
	if (('number' !== typeof timeout) || (timeout <= 0)) {
		throw new Error("Given timeout must be a number greater than zero."); }
	var sessionsDict: { [sid: string]: sessions.Session<any> } = {};
	var idGenerator: sessions.IdGenerator = () => {
		var deferred = Q.defer<string>();
		var newSessionId: string;
		do {
			newSessionId = random.stringOfB64Chars(40);
		} while ('undefined' !== typeof sessionsDict[newSessionId]);
		deferred.resolve(newSessionId);
		return deferred.promise;
	}
	var sessionCount = 0;
	var timeoutMillis = timeout*1000;
	var timeoutCodeIntervalId: number = null;
	var checkSessionsForTimeout = () => {
		var now = Date.now();
		var sIds = Object.keys(sessionsDict);
		var s: sessions.Session<any>;
		for (var i=0; i<sIds.length; i+=1) {
			s = sessionsDict[sIds[i]];
			if ((now - s.lastAccessedAt) >= timeoutMillis) { s.close(); }
		}
	}
	var checkPeriod = timeoutMillis/2;
	var container: sessions.SessionsContainer = {
			add: (s: sessions.Session<any>): Q.Promise<void> => {
				sessionsDict[s.id] = s;
				sessionCount += 1;
				if (sessionCount === 1) {
					timeoutCodeIntervalId = <any> setInterval(
							checkSessionsForTimeout, checkPeriod);
				}
				return Q.when();
			},
			remove: (s: sessions.Session<any>): Q.Promise<void> => {
				delete sessionsDict[s.id];
				sessionCount -= 1;
				if (sessionCount === 0) {
					clearInterval(timeoutCodeIntervalId);
					timeoutCodeIntervalId = null;
				}
				return Q.when();
			},
			get: (sId: string): Q.Promise<sessions.Session<any>> => {
				return Q.when(sessionsDict[sId]);
			}
	};
	return sessions.makeSessionFactory(idGenerator, container);
};