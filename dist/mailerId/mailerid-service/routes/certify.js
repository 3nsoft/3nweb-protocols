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
var utf8 = require('../../../lib-common/utf8');
var api = require('../../../lib-common/service-api/mailer-id/provisioning');
var SC = api.certify.SC;
function makeHandler(certifyingFunc) {
    if ('function' !== typeof certifyingFunc) {
        throw new TypeError("Given argument 'certifyingFunc' must be function, but is not.");
    }
    return function (req, res, next) {
        var session = req.session;
        var c = new Uint8Array(req.body);
        var encryptor = session.params.encryptor;
        var email = session.params.userId;
        var bodyBytes;
        // decrypt request body
        try {
            bodyBytes = encryptor.open(c);
        }
        catch (err) {
            session.close();
            res.status(SC.cryptoVerifFail).send('Bytes fail cryptographic verification.');
            return;
        }
        var signedCerts;
        // extract parameters and certify
        try {
            var reqParams = JSON.parse(utf8.open(bodyBytes));
            if (!reqParams.pkey) {
                throw new Error("Missing field");
            }
            signedCerts = certifyingFunc(reqParams.pkey, email, reqParams.duration);
        }
        catch (err) {
            session.close();
            res.status(SC.malformed).send('Missing or incorrectly formatted payload.');
            return;
        }
        res.status(SC.ok).send(new Buffer(encryptor.pack(utf8.pack(JSON.stringify(signedCerts)))));
        session.close();
    };
}
exports.makeHandler = makeHandler;
Object.freeze(exports);
