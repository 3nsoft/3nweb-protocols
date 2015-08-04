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
var base64 = require('../../../lib-common/base64');
var nacl = require('ecma-nacl');
var KEY_USE = 'login-pub-key';
function throwupOnBadPKeyJSON(pkey) {
    if (pkey.use !== KEY_USE) {
        throw new Error("Given key is not indicated as public use.");
    }
    if (pkey.alg === nacl.box.JWK_ALG_NAME) {
        if ("string" !== typeof pkey.k) {
            throw new Error("NaCl-box key is missing 'k' field with key in base64 encoding.");
        }
        var keyBytes;
        try {
            keyBytes = base64.open(pkey.k);
        }
        catch (err) {
            throw new Error("Given key string value cannot be interpreted as base64.");
        }
        if (keyBytes.length !== nacl.box.KEY_LENGTH) {
            throw new Error("Given key length is incorrect for NaCl-box.");
        }
    }
    else {
        throw new Error("Given key algorithm '" + pkey.alg + "' is not supported.");
    }
}
function makeHandler(userCreatingFunc) {
    if ('function' !== typeof userCreatingFunc) {
        throw new TypeError("Given argument 'userCreatingFunc' must be function, but is not.");
    }
    return function (req, res) {
        var id = req.body.id;
        var pkey = req.body.pkey;
        var params = req.body.params;
        // check for missing things
        if (!id || !pkey || !params) {
            res.status(400).send("Missing user info fields.");
            return;
        }
        try {
            throwupOnBadPKeyJSON(pkey);
        }
        catch (err) {
            res.status(400).send(err.message);
            return;
        }
        var newUserCreated = userCreatingFunc({
            id: id,
            pkey: pkey,
            params: params
        });
        if (newUserCreated) {
            res.status(201).end();
        }
        else {
            res.status(473).send("Account with id '" + id + "' already exists.");
        }
    };
}
exports.makeHandler = makeHandler;
;
