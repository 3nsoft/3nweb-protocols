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
var nacl = require('ecma-nacl');
var mid = require('../../lib-common/mid-sigs-NaCl-Ed');
var jwk = require('../../lib-common/jwkeys');
var random = require('../../lib-server/random');
var fs = require('fs');
var fErrMod = require('../../lib-common/file-err');
exports.issuer = 'localhost';
exports.ROOT_CERT_VALIDITY = 365 * 24 * 60 * 60;
exports.PROVIDER_CERT_VALIDITY = 10 * 24 * 60 * 60;
exports.MAX_USER_CERT_VALIDITY = 24 * 60 * 60;
var THIS_DOMAIN = 'localhost';
function loadOrGenerateRootCert(path) {
    var certsAndKey;
    try {
        certsAndKey = JSON.parse(fs.readFileSync(path, { encoding: 'utf8', flag: 'r' }));
    }
    catch (err) {
        if (err.code === fErrMod.Code.noFile) {
            return createFirstCert(path);
        }
        else {
            throw err;
        }
    }
    try {
        var pkeyBytes = nacl.signing.extract_pkey(jwk.keyFromJson(certsAndKey.skey, mid.KEY_USE.ROOT, nacl.signing.JWK_ALG_NAME, nacl.signing.SECRET_KEY_LENGTH).k);
        var rootPKey = {
            k: pkeyBytes,
            kid: certsAndKey.skey.kid,
            alg: certsAndKey.skey.alg,
            use: certsAndKey.skey.use
        };
        mid.relyingParty.verifyKeyCert(certsAndKey.certs.current, THIS_DOMAIN, rootPKey, Math.floor(Date.now() / 1000));
        return certsAndKey;
    }
    catch (err) {
        return updateCert(path, certsAndKey.certs);
    }
}
function createFirstCert(path) {
    console.log("\nMailerId service: Creating and saving new root certificate.");
    var root = mid.idProvider.generateRootKey(THIS_DOMAIN, exports.ROOT_CERT_VALIDITY, random.bytes);
    var toSave = {
        skey: root.skey,
        certs: {
            current: root.cert,
            previous: []
        }
    };
    fs.writeFileSync(path, JSON.stringify(toSave), { encoding: 'utf8', flag: 'wx' });
    return toSave;
}
function updateCert(path, certs) {
    console.log("\nMailerId service: Updating root certificate.");
    var root = mid.idProvider.generateRootKey(THIS_DOMAIN, exports.ROOT_CERT_VALIDITY, random.bytes);
    var toSave = {
        skey: root.skey,
        certs: {
            current: root.cert,
            previous: [certs.current].concat(certs.previous)
        }
    };
    fs.writeFileSync(path, JSON.stringify(toSave), { encoding: 'utf8', flag: 'w' });
    return toSave;
}
/**
 * Notice:
 * 1) root key is statically placed here;
 * 2) certifier is not checking expiration of its provider certificate.
 */
var midRoot = {
    cert: null,
    skey: {
        use: mid.KEY_USE.ROOT,
        alg: nacl.signing.JWK_ALG_NAME,
        kid: 'EPQ6Xdz9aiaY',
        k: 'RD3grZ1Kvmox8WAhNZofhu7JKQsXd3l1wQEGmVifu7V' +
            'Tl+MrO5MPUvDL1UA1gk8woN0FbbPpDeC22PD0X5EtLw=='
    }
};
midRoot.cert = mid.idProvider.makeSelfSignedCert('localhost', 180 * 24 * 60 * 60, midRoot.skey);
Object.freeze(midRoot.cert);
Object.freeze(midRoot.skey);
Object.freeze(midRoot);
function makeSingleProcCertifier(keyAndCertsPath) {
    var certsAndKey = loadOrGenerateRootCert(keyAndCertsPath);
    var rootCerts = certsAndKey.certs;
    var provider = mid.idProvider.generateProviderKey(exports.issuer, exports.PROVIDER_CERT_VALIDITY, certsAndKey.skey, random.bytes);
    certsAndKey = null;
    Object.freeze(provider.cert);
    var certifier = mid.idProvider.makeIdProviderCertifier(exports.issuer, exports.MAX_USER_CERT_VALIDITY, provider.skey);
    var fact = {
        certify: function (userPKey, address, validFor) {
            return {
                userCert: certifier.certify(userPKey, address, validFor),
                provCert: provider.cert
            };
        },
        getRootCert: function () {
            return rootCerts.current;
        },
        getPrevCerts: function () {
            return rootCerts.previous;
        }
    };
    Object.freeze(fact);
    return fact;
}
exports.makeSingleProcCertifier = makeSingleProcCertifier;
Object.freeze(exports);
