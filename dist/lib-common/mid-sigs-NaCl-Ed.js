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
/*
 * This library handles signing and verification of signatures, used
 * in MailerId.
 */
var nacl = require("ecma-nacl");
var jwk = require("./jwkeys");
var utf8 = require("./utf8");
var base64 = require('./base64');
/**
 * This enumerates MailerId's different use-roles of keys, involved in
 * establishing a trust.
 */
exports.KEY_USE = {
    /**
     * This is a MailerId trust root.
     * It signs certificate for itself, and it signs certificates for provider
     * keys, which have shorter life span, than the root.
     * Root may revoke itself, and may revoke provider key.
     */
    ROOT: "mid-root",
    /**
     * This is a provider key, which is used to certify users' signing keys.
     */
    PROVIDER: "mid-provider",
    /**
     * With this key, MailerId user signs assertions and mail keys.
     */
    SIGN: "mid-sign",
};
Object.freeze(exports.KEY_USE);
function genSignKeyPair(use, kidLen, random, arrFactory) {
    var pair = nacl.signing.generate_keypair(random(32), arrFactory);
    var pkey = {
        use: use,
        alg: nacl.signing.JWK_ALG_NAME,
        kid: base64.pack(random(kidLen)),
        k: base64.pack(pair.pkey)
    };
    var skey = {
        use: pkey.use,
        alg: pkey.alg,
        kid: pkey.kid,
        k: pair.skey
    };
    return { pkey: pkey, skey: skey };
}
function makeCert(pkey, principalAddr, issuer, issuedAt, expiresAt, signKey, arrFactory) {
    if (signKey.alg !== nacl.signing.JWK_ALG_NAME) {
        throw new Error("Given signing key is used with another algorithm.");
    }
    var cert = {
        cert: {
            publicKey: pkey,
            principal: { address: principalAddr }
        },
        issuer: issuer,
        issuedAt: issuedAt,
        expiresAt: expiresAt
    };
    var certBytes = utf8.pack(JSON.stringify(cert));
    var sigBytes = nacl.signing.signature(certBytes, signKey.k, arrFactory);
    return {
        alg: signKey.alg,
        kid: signKey.kid,
        sig: base64.pack(sigBytes),
        load: base64.pack(certBytes)
    };
}
var idProvider;
(function (idProvider) {
    idProvider.KID_BYTES_LENGTH = 9;
    idProvider.MAX_USER_CERT_VALIDITY = 24 * 60 * 60;
    function makeSelfSignedCert(address, validityPeriod, sjkey, arrFactory) {
        var skey = jwk.keyFromJson(sjkey, exports.KEY_USE.ROOT, nacl.signing.JWK_ALG_NAME, nacl.signing.SECRET_KEY_LENGTH);
        var pkey = {
            use: sjkey.use,
            alg: sjkey.alg,
            kid: sjkey.kid,
            k: base64.pack(nacl.signing.extract_pkey(skey.k))
        };
        var now = Math.floor(Date.now() / 1000);
        return makeCert(pkey, address, address, now, now + validityPeriod, skey, arrFactory);
    }
    idProvider.makeSelfSignedCert = makeSelfSignedCert;
    /**
     * One should keep MailerId root key offline, as this key is used only to
     * sign provider keys, which have to work online.
     * @param address is an address of an issuer
     * @param validityPeriod validity period of a generated self-signed
     * certificate in milliseconds
     * @param random
     * @param arrFactory optional array factory
     * @return Generated root key and a self-signed certificate for respective
     * public key.
     */
    function generateRootKey(address, validityPeriod, random, arrFactory) {
        if (validityPeriod < 1) {
            throw new Error("Illegal validity period.");
        }
        var rootPair = genSignKeyPair(exports.KEY_USE.ROOT, idProvider.KID_BYTES_LENGTH, random, arrFactory);
        var now = Math.floor(Date.now() / 1000);
        var rootCert = makeCert(rootPair.pkey, address, address, now, now + validityPeriod, rootPair.skey, arrFactory);
        return { cert: rootCert, skey: jwk.keyToJson(rootPair.skey) };
    }
    idProvider.generateRootKey = generateRootKey;
    /**
     * @param address is an address of an issuer
     * @param validityPeriod validity period of a generated self-signed
     * certificate in seconds
     * @param rootJKey root key in json format
     * @param random
     * @param arrFactory optional array factory
     * @return Generated provider's key and a certificate for a respective
     * public key.
     */
    function generateProviderKey(address, validityPeriod, rootJKey, random, arrFactory) {
        if (validityPeriod < 1) {
            throw new Error("Illegal validity period.");
        }
        var rootKey = jwk.keyFromJson(rootJKey, exports.KEY_USE.ROOT, nacl.signing.JWK_ALG_NAME, nacl.signing.SECRET_KEY_LENGTH);
        var provPair = genSignKeyPair(exports.KEY_USE.PROVIDER, idProvider.KID_BYTES_LENGTH, random, arrFactory);
        var now = Math.floor(Date.now() / 1000);
        var rootCert = makeCert(provPair.pkey, address, address, now, now + validityPeriod, rootKey, arrFactory);
        return { cert: rootCert, skey: jwk.keyToJson(provPair.skey) };
    }
    idProvider.generateProviderKey = generateProviderKey;
    /**
     * @param issuer is a domain of certificate issuer, at which issuer's public
     * key can be found to check the signature
     * @param validityPeriod is a default validity period in seconds, for
     * which certifier shall be making certificates
     * @param signJKey is a certificates signing key
     * @param arrFactory is an optional array factory
     * @return MailerId certificates generator, which shall be used on identity
     * provider's side
     */
    function makeIdProviderCertifier(issuer, validityPeriod, signJKey, arrFactory) {
        if (!issuer) {
            throw new Error("Given issuer is illegal.");
        }
        if ((validityPeriod < 1) || (validityPeriod > idProvider.MAX_USER_CERT_VALIDITY)) {
            throw new Error("Given certificate validity is illegal.");
        }
        var signKey = jwk.keyFromJson(signJKey, exports.KEY_USE.PROVIDER, nacl.signing.JWK_ALG_NAME, nacl.signing.SECRET_KEY_LENGTH);
        signJKey = null;
        if (!arrFactory) {
            arrFactory = nacl.arrays.makeFactory();
        }
        return {
            certify: function (publicKey, address, validFor) {
                if (!signKey) {
                    throw new Error("Certifier is already destroyed.");
                }
                if (publicKey.use !== exports.KEY_USE.SIGN) {
                    throw new Error("Given public key is not used for signing.");
                }
                if ('number' === typeof validFor) {
                    if (validFor > validityPeriod) {
                        validFor = validityPeriod;
                    }
                    else if (validFor < 0) {
                        new Error("Given certificate validity is illegal.");
                    }
                }
                else {
                    validFor = validityPeriod;
                }
                var now = Math.floor(Date.now() / 1000);
                return makeCert(publicKey, address, issuer, now, now + validFor, signKey, arrFactory);
            },
            destroy: function () {
                if (!signKey) {
                    return;
                }
                nacl.arrays.wipe(signKey.k);
                signKey = null;
                arrFactory.wipeRecycled();
                arrFactory = null;
            }
        };
    }
    idProvider.makeIdProviderCertifier = makeIdProviderCertifier;
})(idProvider = exports.idProvider || (exports.idProvider = {}));
Object.freeze(idProvider);
var relyingParty;
(function (relyingParty) {
    function verifyCertAndGetPubKey(signedCert, use, validAt, arrFactory, issuer, issuerPKey) {
        var cert = jwk.getKeyCert(signedCert);
        if ((validAt < cert.issuedAt) || (cert.expiresAt <= validAt)) {
            throw new Error("Certificate is not valid at a given moment.");
        }
        if (issuer) {
            if (!issuerPKey) {
                throw new Error("Missing issuer key.");
            }
            if ((cert.issuer !== issuer) || (signedCert.kid !== issuerPKey.kid)) {
                throw new Error(use + " certificate is not signed by issuer key.");
            }
        }
        var pkey = jwk.keyFromJson(cert.cert.publicKey, use, nacl.signing.JWK_ALG_NAME, nacl.signing.PUBLIC_KEY_LENGTH);
        var certOK = nacl.signing.verify(base64.open(signedCert.sig), base64.open(signedCert.load), (issuer ? issuerPKey.k : pkey.k), arrFactory);
        if (!certOK) {
            throw new Error(use + " certificate failed validation.");
        }
        return { pkey: pkey, address: cert.cert.principal.address };
    }
    /**
     * @param certs is a chain of certificate to be verified.
     * @param rootAddr is MailerId service's domain.
     * @param validAt is an epoch time moment (in second), at which user
     * certificate must be valid. Provider certificate must be valid at
     * creation of user's certificate. Root certificate must be valid at
     * creation of provider's certificate.
     * @return user's MailerId signing key with user's address.
     */
    function verifyChainAndGetUserKey(certs, rootAddr, validAt, arrFactory) {
        // check root and get the key
        var provCertIssueMoment = jwk.getKeyCert(certs.prov).issuedAt;
        var root = verifyCertAndGetPubKey(certs.root, exports.KEY_USE.ROOT, provCertIssueMoment, arrFactory);
        if (rootAddr !== root.address) {
            throw new Error("Root's address is different from a given one.");
        }
        // check provider and get the key
        var userCertIssueMoment = jwk.getKeyCert(certs.user).issuedAt;
        var provider = verifyCertAndGetPubKey(certs.prov, exports.KEY_USE.PROVIDER, userCertIssueMoment, arrFactory, root.address, root.pkey);
        // check that provider cert comes from the same issuer as root
        if (root.address !== provider.address) {
            throw new Error("Provider's address is different from that of root.");
        }
        // check user certificate and get the key
        return verifyCertAndGetPubKey(certs.user, exports.KEY_USE.SIGN, validAt, arrFactory, provider.address, provider.pkey);
    }
    relyingParty.verifyChainAndGetUserKey = verifyChainAndGetUserKey;
    function verifyAssertion(midAssertion, certChain, rootAddr, validAt, arrFactory) {
        var userInfo = verifyChainAndGetUserKey(certChain, rootAddr, validAt, arrFactory);
        var loadBytes = base64.open(midAssertion.load);
        if (!nacl.signing.verify(base64.open(midAssertion.sig), loadBytes, userInfo.pkey.k, arrFactory)) {
            throw new Error("Assertion fails verification.");
        }
        var assertion = JSON.parse(utf8.open(loadBytes));
        if (assertion.user !== userInfo.address) {
            throw new Error("Assertion is for one user, while chain is for another.");
        }
        if (!assertion.sessionId) {
            throw new Error("Assertion is malformed.");
        }
        if ((validAt < assertion.issuedAt) || (assertion.expiresAt <= validAt)) {
            throw new Error("Assertion is not valid at a given moment.");
        }
        return {
            sessionId: assertion.sessionId,
            relyingPartyDomain: assertion.rpDomain,
            user: userInfo.address
        };
    }
    relyingParty.verifyAssertion = verifyAssertion;
    /**
     * This function does verification of a single certificate with known
     * signing key.
     * If your task requires verification starting with principal's MailerId,
     * use verifyPubKey function that also accepts and checks MailerId
     * certificates chain.
     * @param keyCert is a certificate that should be checked
     * @param principalAddress is an expected principal's address in a given
     * certificate. Exception is thrown, if certificate does not match this
     * expectation.
     * @param signingKey is a public key, with which given certificate is
     * validated cryptographically. Exception is thrown, if crypto-verification
     * fails.
     * @param validAt is an epoch time moment (in second), for which verification
     * should be done.
     * @param arrFactory is an optional array factory.
     * @return a key from a given certificate.
     */
    function verifyKeyCert(keyCert, principalAddress, signingKey, validAt, arrFactory) {
        var certBytes = base64.open(keyCert.load);
        if (!nacl.signing.verify(base64.open(keyCert.sig), base64.open(keyCert.load), signingKey.k, arrFactory)) {
            throw new Error("Key certificate fails verification.");
        }
        var cert = jwk.getKeyCert(keyCert);
        if (cert.cert.principal.address !== principalAddress) {
            throw new Error("Key certificate is for incorrect user.");
        }
        if ((validAt < cert.issuedAt) || (cert.expiresAt <= validAt)) {
            throw new Error("Certificate is not valid at a given moment.");
        }
        return cert.cert.publicKey;
    }
    relyingParty.verifyKeyCert = verifyKeyCert;
    /**
     * @param pubKeyCert certificate with a public key, that needs to be
     * verified.
     * @param principalAddress is an expected principal's address in both key
     * certificate, and in MailerId certificate chain. Exception is thrown,
     * if certificate does not match this expectation.
     * @param certChain is MailerId certificate chain for named principal.
     * @param rootAddr is MailerId root's domain.
     * @param validAt is an epoch time moment (in second), for which key
     * certificate verification should be done.
     * @param arrFactory is an optional array factory.
     * @return a key from a given certificate.
     */
    function verifyPubKey(pubKeyCert, principalAddress, certChain, rootAddr, validAt, arrFactory) {
        var chainValidityMoment = jwk.getKeyCert(pubKeyCert).issuedAt;
        var principalInfo = verifyChainAndGetUserKey(certChain, rootAddr, chainValidityMoment, arrFactory);
        if (principalInfo.address !== principalAddress) {
            throw new Error("MailerId certificate chain is for incorrect user.");
        }
        return verifyKeyCert(pubKeyCert, principalAddress, principalInfo.pkey, validAt, arrFactory);
    }
    relyingParty.verifyPubKey = verifyPubKey;
})(relyingParty = exports.relyingParty || (exports.relyingParty = {}));
Object.freeze(relyingParty);
function correlateSKeyWithItsCert(skey, cert) {
    var pkey = jwk.keyFromJson(cert.cert.publicKey, skey.use, nacl.signing.JWK_ALG_NAME, nacl.signing.PUBLIC_KEY_LENGTH);
    if (!((pkey.kid === skey.kid) && (pkey.use === skey.use) && (pkey.alg === skey.alg) && nacl.compareVectors(nacl.signing.extract_pkey(skey.k), pkey.k))) {
        throw new Error("Key does not correspond to certificate.");
    }
}
var user;
(function (user) {
    user.KID_BYTES_LENGTH = 9;
    user.MAX_SIG_VALIDITY = 30 * 60;
    function generateSigningKeyPair(random, arrFactory) {
        return genSignKeyPair(exports.KEY_USE.SIGN, user.KID_BYTES_LENGTH, random, arrFactory);
    }
    user.generateSigningKeyPair = generateSigningKeyPair;
    /**
     * @param signKey which will be used to sign assertions/keys. Note that
     * this key shall be wiped, when signer is destroyed, as key is neither
     * long-living, nor should be shared.
     * @param cert is user's certificate, signed by identity provider.
     * @param provCert is provider's certificate, signed by respective mid root.
     * @param validityPeriod
     * @param arrFactory is an optional array factory
     * @return signer for user of MailerId to generate assertions, and to sign
     * keys.
     */
    function makeMailerIdSigner(signKey, userCert, provCert, validityPeriod, arrFactory) {
        var certificate = jwk.getKeyCert(userCert);
        if (signKey.use !== exports.KEY_USE.SIGN) {
            throw new Error("Given key " + signKey.kid + " has incorrect use: " + signKey.use);
        }
        correlateSKeyWithItsCert(signKey, certificate);
        if (('number' !== typeof validityPeriod) || (validityPeriod < 1) || (validityPeriod > user.MAX_SIG_VALIDITY)) {
            throw new Error("Given assertion validity is illegal: " + validityPeriod);
        }
        if (!arrFactory) {
            arrFactory = nacl.arrays.makeFactory();
        }
        var signer = {
            address: certificate.cert.principal.address,
            userCert: userCert,
            providerCert: provCert,
            issuer: certificate.issuer,
            certExpiresAt: certificate.expiresAt,
            validityPeriod: validityPeriod,
            generateAssertionFor: function (rpDomain, sessionId, validFor) {
                if (!signKey) {
                    throw new Error("Signer is already destroyed.");
                }
                if ('number' === typeof validFor) {
                    if (validFor > validityPeriod) {
                        validFor = validityPeriod;
                    }
                    else if (validFor < 0) {
                        new Error("Given certificate validity is illegal.");
                    }
                }
                else {
                    validFor = validityPeriod;
                }
                var now = Math.floor(Date.now() / 1000);
                if (now >= certificate.expiresAt) {
                    throw new Error("Signing key has already expiried.");
                }
                var assertion = {
                    rpDomain: rpDomain,
                    sessionId: sessionId,
                    user: certificate.cert.principal.address,
                    issuedAt: now,
                    expiresAt: now + validFor
                };
                var assertionBytes = utf8.pack(JSON.stringify(assertion));
                var sigBytes = nacl.signing.signature(assertionBytes, signKey.k, arrFactory);
                return {
                    alg: signKey.alg,
                    kid: signKey.kid,
                    sig: base64.pack(sigBytes),
                    load: base64.pack(assertionBytes)
                };
            },
            certifyPublicKey: function (pkey, validFor) {
                if (!signKey) {
                    throw new Error("Signer is already destroyed.");
                }
                if (validFor < 0) {
                    new Error("Given certificate validity is illegal.");
                }
                var now = Math.floor(Date.now() / 1000);
                if (now >= certificate.expiresAt) {
                    throw new Error("Signing key has already expiried.");
                }
                return makeCert(pkey, certificate.cert.principal.address, certificate.cert.principal.address, now, now + validFor, signKey, arrFactory);
            },
            destroy: function () {
                if (!signKey) {
                    return;
                }
                nacl.arrays.wipe(signKey.k);
                signKey = null;
                arrFactory.wipeRecycled();
                arrFactory = null;
            }
        };
        Object.freeze(signer);
        return signer;
    }
    user.makeMailerIdSigner = makeMailerIdSigner;
})(user = exports.user || (exports.user = {}));
Object.freeze(user);
Object.freeze(exports);
