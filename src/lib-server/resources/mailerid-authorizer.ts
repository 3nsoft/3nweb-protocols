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

import Q = require('q');
import https = require('https');
import http = require('http');
import express = require('express');
import jwk = require('../../lib-common/jwkeys');
import mid = require('../../lib-common/mid-sigs-NaCl-Ed');

/**
 * Usually this function should get domain of MailerId provider, do dns lookup,
 * from which information about actual server, is used to get provider's public
 * key.
 * @return a promise, resolvable to MailerId provider's current root certificate.
 */
function getRootCertOfLocalhostTestMailerIdProvider():
		Q.Promise<{ cert: jwk.SignedLoad; address: string; }> {
	var deferred = Q.defer<{ cert: jwk.SignedLoad; address: string; }>();
	var options = {
			hostname: 'localhost',
			port: 8080,
			path: '/mailerid/',
			method: 'GET',
			// values below allow for self-signed certificate, used in this test
			rejectUnauthorized: false,
			requestCert: true,
			agent: false
	};
	var req = https.request(options, (res: http.ClientResponse) => {
		if (res.statusCode == 200) {
			res.setEncoding('utf8');
			var collectedString = '';
			res.on('data', function(chunk) {
				collectedString += chunk;
			});
			res.on('end', function() {
				var infoObj = JSON.parse(collectedString);
				var cert = infoObj['current-cert'];
				if (cert) {
					deferred.resolve({
						cert: cert,
						address: options.hostname
					});
				} else {
					deferred.reject(new Error("Info file " +
							"localhost:8080/mailerid, is malformed."));
				}
			});
			res.on('error', function(err) {
				deferred.reject(err);
			});
		} else {
			deferred.reject(new Error(
					"Cannot get localhost:8080/mailerid, returned " +
					"status code is "+res.statusCode));
		}
	});
	req.end();
	return deferred.promise;
}

export function validate(rpDomain: string, sessionId: string,
		assertion: jwk.SignedLoad, userCert: jwk.SignedLoad,
		provCert: jwk.SignedLoad): Q.Promise<string> {
	var validAt = Date.now() / 1000;
	var promise = getRootCertOfLocalhostTestMailerIdProvider()
	.then((root) => {
		try {
			var assertInfo = mid.relyingParty.verifyAssertion(assertion,
				{ user: userCert, prov: provCert, root: root.cert },
				root.address, validAt);
			if ((assertInfo.relyingPartyDomain === rpDomain) &&
					(assertInfo.sessionId === sessionId)) {
				return assertInfo.user;
			} else {
				return null;
			}
		} catch (e) {
			return null;
		}
	}, (e) => {
		return null;
	});
	return promise;
}

Object.freeze(exports);