(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
 * This file setsvup ASMail app as one piece, and initializes in window object
 * all artifacts that are needed by different parts of this app.
 */
/// <reference path="../../../typings/tsd.d.ts" />
var routers = require('../../../lib-client/simple-router');
var idManage = require('../identity-management');
var log = require('../../../lib-client/page-logging');
var fileStorageMod = require('../file-storage');
var mailConf = require('./mail-conf');
var sending = require('./mail-sending');
var getting = require('./mail-getting');
var jwk = require('../../../lib-common/jwkeys');
var keyringMod = require('../../../lib-client/asmail/keyring/index');
var router = new routers.Router(window, function () {
    return 'deliver-mail';
});
window.pageRouter = router;
var mailerIdentity = idManage.makeManager();
window.mailerIdentity = mailerIdentity;
var keyring = keyringMod.makeKeyRing();
window.keyring = keyring;
var xspStorage = fileStorageMod.makeStorage();
window.xspStorage = xspStorage;
window.onload = function () {
    try {
        mailerIdentity.init().then(function () {
            return xspStorage.init(mailerIdentity.getSigner);
        }).then(function () {
            return keyring.init(xspStorage.keyringStorage());
        }).then(function () {
            return mailConf.init();
        }).then(function () {
            router.openHashTag();
        }).fail(function (err) {
            log.write("ERROR: " + err.message);
            console.error('Error in file ' + err.fileName + ' at ' + err.lineNumber + ': ' + err.message);
        }).done();
    }
    catch (err) {
        console.error(err);
    }
};
function makeSimpleViewObj(divId) {
    return {
        name: divId,
        open: function () {
            $('.nav li.active').removeClass("active");
            var navTab = $(".nav li[name='" + divId + "']");
            if (navTab.length > 0) {
                navTab.addClass("active");
            }
            router.showElem(divId);
        },
        close: function () {
            router.hideElem(divId);
        },
        cleanLogOnExit: true
    };
}
router.addView(makeSimpleViewObj('deliver-mail'));
router.addView(makeSimpleViewObj('retrieve-mail'));
router.addView((function () {
    var v = makeSimpleViewObj('config');
    var initOpenFunc = v.open;
    v.open = function () {
        initOpenFunc();
        // show public key set in the keyring
        var certs = keyring.getPublishedKeyCerts();
        $('.published-key-id').text(certs ? jwk.getPubKey(certs.pkeyCert).kid : "not set");
        // compare it to the one set on the server
        mailConf.displayPKeyOnServer();
    };
    return v;
})());
window.mailCtrl = {
    sendMsg: sending.sendMsg,
    sendPreFlight: sending.sendPreFlight,
    listMsgs: getting.listMsgs,
    rmMsg: getting.rmMsg,
    openMsg: getting.openMsg,
    closeMsgView: getting.closeMsgView
};
window.inbox = {
    msgs: new Array(),
    lastMsgTS: 0
};
window.confCtrl = {
    //	updatePublishedKey: mailConf.updatePublishedIntroKey,
    pushPublishedKeyToServer: mailConf.pushPublishedKeyToServer
};

},{"../../../lib-client/asmail/keyring/index":16,"../../../lib-client/page-logging":25,"../../../lib-client/simple-router":28,"../../../lib-common/jwkeys":37,"../file-storage":5,"../identity-management":6,"./mail-conf":2,"./mail-getting":3,"./mail-sending":4}],2:[function(require,module,exports){
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
var mailServConf = require('../../../lib-client/asmail/service-config');
var log = require('../../../lib-client/page-logging');
var jwk = require('../../../lib-common/jwkeys');
var random = require('../../../lib-client/random');
function promiseCallWithMailConf(func) {
    var mailServiceConf = new mailServConf.MailConfigurator(mailerIdentity.getId());
    var promise = mailServiceConf.setConfigUrl('https://localhost:8080/asmail').then(function () {
        return mailerIdentity.getSigner();
    }).then(function (signer) {
        return mailServiceConf.login(signer);
    }).then(function () {
        return func(mailServiceConf);
    }).then(function () {
        return mailServiceConf.logout();
    }).fail(function (err) {
        return mailServiceConf.logout().fail(function (err) {
        }); // swallowing any error on final logout only
    });
    return promise;
}
function callWithMailConf(func) {
    promiseCallWithMailConf(func).fail(function (err) {
        log.write("ERROR: " + err.message);
        console.error('Error in file ' + err.fileName + ' at ' + err.lineNumber + ': ' + err.message);
    }).done();
}
function getAndDisplayPubKeyInfo(mailConf) {
    return mailConf.getInitPubKey().then(function (certs) {
        $('.published-key-id-on-server').text(certs ? jwk.getPubKey(certs.pkeyCert).kid : 'not set');
    });
}
function displayPKeyOnServer() {
    callWithMailConf(function (mailConf) {
        log.write("Fetching a public key, registered on the server.");
        return getAndDisplayPubKeyInfo(mailConf);
    });
}
exports.displayPKeyOnServer = displayPKeyOnServer;
function init() {
    return promiseCallWithMailConf(function (mailConf) {
        return mailConf.getInitPubKey().then(function (certsOnServer) {
            if (!certsOnServer) {
                log.write("Public key is not registered on ASMail server.");
            }
            var certsInRing = keyring.getPublishedKeyCerts();
            if (certsInRing) {
                if (!certsOnServer) {
                    log.write("Registering existing introductory public key " + "on ASMail server.");
                    return mailConf.setInitPubKey(certsInRing);
                }
                var kidOnServer = jwk.getPubKey(certsOnServer.pkeyCert).kid;
                var kidInRing = jwk.getPubKey(certsInRing.pkeyCert).kid;
                if (kidOnServer === kidInRing) {
                    log.write("Introductory key, registered on ASMail server " + "is the same as the one in the keyring.");
                }
                else {
                    log.write("Introductory key, registered on ASMail server " + "has id '" + kidOnServer + "', while key in the keyring " + "has id '" + kidInRing + "'.");
                    log.write("Registering correct public key " + "on ASMail server.");
                    return mailConf.setInitPubKey(certsInRing);
                }
            }
            else {
                log.write("No introductory key in the keyring.");
                return generateNewIntroKey().then(function () {
                    certsInRing = keyring.getPublishedKeyCerts();
                    log.write("Registering new public key on ASMail server.");
                    return mailConf.setInitPubKey(certsInRing);
                });
            }
        }).then(function () {
            return mailConf.getAnonSenderInvites().then(function (invites) {
                if (Object.keys(invites).length > 0) {
                    log.write("There are invitation tokens for anonymous " + "senders registered on ASMail server.");
                    return;
                }
                log.write("There are no invitation tokens for anonymous " + "senders registered on ASMail server. " + "We generate one, and record it with ASMail server.");
                invites[random.stringOfB64Chars(40)] = 1024 * 1024 * 1024;
                return mailConf.setAnonSenderInvites(invites);
            });
        });
    });
}
exports.init = init;
function getSingleAnonSenderInvite() {
    var token;
    var promise = promiseCallWithMailConf(function (mailConf) {
        return mailConf.getAnonSenderInvites().then(function (invites) {
            if (Object.keys(invites).length === 0) {
                log.write("There are no invitation tokens for anonymous " + "senders registered on ASMail server. " + "We generate one, and record it with ASMail server.");
                token = random.stringOfB64Chars(40);
                invites[token] = 1024 * 1024 * 1024;
                return mailConf.setAnonSenderInvites(invites);
            }
            else {
                token = Object.keys(invites)[0];
            }
        });
    });
    return promise.then(function () {
        return token;
    });
}
exports.getSingleAnonSenderInvite = getSingleAnonSenderInvite;
// XXX may be updating and pushing public key should be one function
function pushPublishedKeyToServer() {
    log.clear();
    callWithMailConf(function (mailConf) {
        log.write("Registering introductory key certificates on the server.");
        var certs = keyring.getPublishedKeyCerts();
        return mailConf.setInitPubKey(certs).then(function () {
            return getAndDisplayPubKeyInfo(mailConf);
        });
    });
}
exports.pushPublishedKeyToServer = pushPublishedKeyToServer;
function generateNewIntroKey() {
    log.write("Generating new introductory public key and certifying it.");
    return mailerIdentity.getSigner().then(function (signer) {
        keyring.updatePublishedKey(signer);
        var kid = jwk.getPubKey(keyring.getPublishedKeyCerts().pkeyCert).kid;
        $('.published-key-id').text(kid);
    });
}
Object.freeze(exports);

},{"../../../lib-client/asmail/service-config":22,"../../../lib-client/page-logging":25,"../../../lib-client/random":26,"../../../lib-common/jwkeys":37}],3:[function(require,module,exports){
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
var serviceLocator = require('../../../lib-client/service-locator');
var Q = require('q');
var recipientMod = require('../../../lib-client/asmail/recipient');
var log = require('../../../lib-client/page-logging');
var keyringMod = require('../../../lib-client/asmail/keyring/index');
var msgMod = require('../../../lib-client/asmail/msg');
var msgReceiver = null;
function openInbox() {
    if (msgReceiver && msgReceiver.sessionId) {
        return Q.when(msgReceiver);
    }
    log.write("Starting session for message retrieval ...");
    msgReceiver = new recipientMod.MailRecipient(mailerIdentity.getId());
    var promise = msgReceiver.setRetrievalUrl('https://localhost:8080/asmail').then(function () {
        if (mailerIdentity.isProvisionedAndValid()) {
            log.write("Reusing already provisioned MailerId assertion " + "signer for " + msgReceiver.userId);
            return mailerIdentity.getSigner();
        }
        else {
            log.write("Start provisioning MailerId assertion signer for " + msgReceiver.userId);
            return mailerIdentity.provision().then(function () {
                log.write(msgReceiver.userId + " can now be authorized by MailerId assertion.");
                return mailerIdentity.getSigner();
            });
        }
    }).then(function (midSigner) {
        return msgReceiver.login(midSigner).then(function () {
            log.write("LOGED IN: opened session " + msgReceiver.sessionId);
            return msgReceiver;
        });
    });
    return promise;
}
function getMsgMetaAndSetOpener(msgIds, i) {
    if (i === void 0) { i = 0; }
    if (i >= msgIds.length) {
        return;
    }
    var msgId = msgIds[i];
    log.write("Getting a metadata object for message " + msgId);
    return msgReceiver.getMsgMeta(msgId).then(function (meta) {
        log.write("MSG META REQUEST: status 200 -- for msg " + msgId);
        var msg = new msgMod.MsgOpener(msgId, meta);
        inbox.msgs.push(msg);
        var decrs = keyring.getDecryptorFor(msg.meta.extMeta);
        if (decrs) {
            log.write("Found " + decrs.length + " keys, based on metadata for msg " + msgId + ". Will try if any fits.");
        }
        else {
            log.write("No keys found to decrypt msg " + msgId);
            return;
        }
        return msgReceiver.getObjHead(msg.msgId, msg.meta.extMeta.objIds[0]).then(function (header) {
            for (var i = 0; i < decrs.length; i += 1) {
                try {
                    msg.setCrypto(decrs[i], header);
                    break;
                }
                catch (err) {
                    if (!err.failedCipherVerification) {
                        throw err;
                    }
                }
            }
            for (var i = 0; i < decrs.length; i += 1) {
                decrs[i].decryptor.destroy();
            }
            if (msg.isCryptoSet()) {
                log.write("Decryptor is set for msg " + msgId);
            }
            else {
                log.write("No keys are found to be able to open msg " + msgId);
            }
        });
    }).then(function () {
        if ((i + 1) < msgIds.length) {
            return getMsgMetaAndSetOpener(msgIds, i + 1);
        }
    });
}
function sizeToReadableForm(s) {
    if (s > 1024 * 1024 * 1024) {
        return Math.round(s / (1024 * 1024 * 1024) * 10) / 10 + ' GBs';
    }
    else if (s > 1024 * 1024) {
        return Math.round(s / (1024 * 1024) * 10) / 10 + ' MBs';
    }
    else if (s > 1024) {
        return Math.round(s / 1024 * 10) / 10 + ' KBs';
    }
    else {
        return s + ' Bs';
    }
}
function updateMsgList() {
    var tbody = $('#msg-inbox > tbody');
    tbody.empty();
    if (inbox.msgs.length === 0) {
        tbody.append('<tr><td colspan="7">No Messages</td></tr>');
        return;
    }
    inbox.msgs.forEach(function (msg, i) {
        var tr = document.createElement('tr');
        // 1st column: Date -- show time when deivery was completed
        var td = document.createElement('td');
        $(td).text((new Date(msg.meta.deliveryCompletion)).toISOString());
        tr.appendChild(td);
        // 2nd column: server's msg id
        td = document.createElement('td');
        $(td).text(msg.msgId.substring(0, 9) + '...');
        tr.appendChild(td);
        // 3rd column: msg size
        td = document.createElement('td');
        $(td).text(sizeToReadableForm(msg.totalSize));
        tr.appendChild(td);
        // 4th column: information about keys
        td = document.createElement('td');
        if (msg.meta.extMeta.pid) {
            $(td).text('Established key pair: ' + msg.meta.extMeta.pid);
        }
        else {
            $(td).text('Intro key used: ' + msg.meta.extMeta.recipientKid.substring(0, 9) + '...');
        }
        tr.appendChild(td);
        // 5th column: status
        td = document.createElement('td');
        if (msg.isCryptoSet()) {
            $(td).text('Keys found');
        }
        else {
            $(td).text('Keys not found');
        }
        tr.appendChild(td);
        // 6th column: status
        td = document.createElement('td');
        if (msg.isCryptoSet()) {
            if (msg.sender.address) {
                $(td).text(msg.sender.address);
            }
            else {
                $(td).text("Will be verified on opening main");
            }
        }
        tr.appendChild(td);
        // 7th column: action buttons
        td = document.createElement('td');
        var htmlWithButtons = '';
        if (msg.isCryptoSet()) {
            htmlWithButtons += '<button class="btn btn-primary btn-sm"' + 'onclick="mailCtrl.openMsg(' + i + ')">Open</button>';
        }
        htmlWithButtons += '<button class="btn btn-warning btn-sm"' + 'onclick="mailCtrl.rmMsg(' + i + ')">Remove</button>';
        $(td).html(htmlWithButtons);
        tr.appendChild(td);
        // append this row
        tbody.append(tr);
    });
}
function listMsgs() {
    try {
        log.clear();
        openInbox().then(function () {
            log.write("Getting a list of messages");
            return msgReceiver.listMsgs();
        }).then(function (msgIds) {
            log.write("LIST MESSAGES REQUEST: status 200 -- there are " + msgIds.length + " messages available.");
            // filter out already known messages
            msgIds = msgIds.filter(function (msgId) {
                return !inbox.msgs.some(function (msg) {
                    return msg.msgId === msgId;
                });
            });
            if (msgIds.length === 0) {
                log.write("There are no new messages.");
                return;
            }
            return getMsgMetaAndSetOpener(msgIds);
        }).then(function () {
            if (inbox.msgs.length === 0) {
                return;
            }
            inbox.msgs = inbox.msgs.sort(function (a, b) {
                return (a.meta.deliveryCompletion - b.meta.deliveryCompletion);
            });
            inbox.lastMsgTS = inbox.msgs[inbox.msgs.length - 1].meta.deliveryCompletion;
            updateMsgList();
        }).fail(function (err) {
            if (err.noReport) {
                return;
            }
            log.write("ERROR: " + err.message);
            console.error('Error in file ' + err.fileName + ' at ' + err.lineNumber + ': ' + err.message);
        }).done();
    }
    catch (err) {
        console.error(err);
    }
}
exports.listMsgs = listMsgs;
function rmMsg(msgInd) {
    try {
        log.clear();
        var msg = inbox.msgs[msgInd];
        if (!msg) {
            updateMsgList();
            return;
        }
        openInbox().then(function () {
            log.write("Removing message " + msg.msgId);
            return msgReceiver.removeMsg(msg.msgId);
        }).then(function () {
            inbox.msgs.splice(msgInd, 1);
            updateMsgList();
        }, function (err) {
            if (err.status == 474) {
                inbox.msgs.splice(msgInd, 1);
            }
            updateMsgList();
        }).fail(function (err) {
            if (err.noReport) {
                return;
            }
            log.write("ERROR: " + err.message);
            console.error('Error in file ' + err.fileName + ' at ' + err.lineNumber + ': ' + err.message);
        }).done();
    }
    catch (err) {
        console.error(err);
    }
}
exports.rmMsg = rmMsg;
function displayPlainTextMsg(msg) {
    var msgDisplay = $('#msg-display');
    var bodyTxt = msg.getMainBody().text.plain;
    var txtDisplay = msgDisplay.find('.msg-plain-txt');
    if (bodyTxt) {
        bodyTxt.split(/\r?\n/).forEach(function (txt) {
            var p = document.createElement('p');
            $(p).text(txt);
            txtDisplay.append(p);
        });
    }
    var subject = msg.main[msgMod.HEADERS.SUBJECT];
    msgDisplay.find('.msg-subject').text(subject ? subject : '');
    msgDisplay.find('.sender-addr').text(msg.sender.address);
    var trust;
    if (msg.sender.usedKeyInfo === keyringMod.KEY_ROLE.SUGGESTED) {
        trust = "Sender of this message is cryptographically trusted, as (s)he " + "uses established key chain, and, in particular, this message " + "is encrypted to recently suggested pair, which hasn't been used, " + "till now.";
    }
    else if (msg.sender.usedKeyInfo === keyringMod.KEY_ROLE.IN_USE) {
        trust = "Sender of this message is cryptographically trusted, as (s)he " + "uses established key chain, and, in particular, this message " + "is encrypted to recently a pair, which has already been used.";
    }
    else if (msg.sender.usedKeyInfo === keyringMod.KEY_ROLE.OLD) {
        trust = "Sender of this message is cryptographically trusted, as (s)he " + "uses established key chain. But, this message is encrypted to " + "an old pair, which has already been superseded by a new one.";
    }
    else if (msg.sender.usedKeyInfo === keyringMod.KEY_ROLE.PUBLISHED_INTRO) {
        trust = (keyring.isKnownCorrespondent(msg.sender.address) ? "Sender used currently published introductory key, as a stranger, " + "but (s)he is already added to a keyring as a trusted party." : "Sender of this message is a stranger, as (s)he uses an " + "introductory key, currently published on server.");
    }
    else if (msg.sender.usedKeyInfo === keyringMod.KEY_ROLE.PREVIOUSLY_PUBLISHED_INTRO) {
        trust = (keyring.isKnownCorrespondent(msg.sender.address) ? "Sender used previously published introductory key, as a stranger, " + "but (s)he is already added to keyring as a trusted party." : "Sender of this message is a stranger, as (s)he uses an " + "introductory key, previously published on server.");
    }
    else if (msg.sender.usedKeyInfo === keyringMod.KEY_ROLE.INTRODUCTORY) {
        trust = (keyring.isKnownCorrespondent(msg.sender.address) ? "Sender used offline introductory key, as a stranger, " + "but (s)he is already added to a keyring as a trusted party." : "Sender of this message is a stranger, as (s)he uses an " + "introductory key, distributed not through the server.");
    }
    else {
        trust = ">>> Program encounted unimplemented key role <<<";
    }
    msgDisplay.find('.sender-trust').text(trust);
    var startTrustBtn = msgDisplay.find('.start-trust');
    if (keyring.isKnownCorrespondent(msg.sender.address)) {
        startTrustBtn.css('display', 'none').off();
        keyring.absorbSuggestedNextKeyPair(msg.sender.address, msg.getNextCrypto(), msg.meta.deliveryStart);
    }
    else {
        startTrustBtn.css('display', 'block').click(function () {
            keyring.absorbSuggestedNextKeyPair(msg.sender.address, msg.getNextCrypto(), msg.meta.deliveryStart);
            startTrustBtn.css('display', 'none').off();
        });
    }
    msgDisplay.css('display', 'block');
}
function closeMsgView() {
    var msgDisplay = $('#msg-display');
    msgDisplay.css('display', 'none');
    msgDisplay.find('.msg-plain-txt').empty();
    msgDisplay.find('.msg-subject').empty();
    msgDisplay.find('.sender-addr').empty();
    msgDisplay.find('.start-trust').css('display', 'none').off();
}
exports.closeMsgView = closeMsgView;
function getMidRoot(domain) {
    log.write("To verify sender's introductory key, we need to get MailerId " + "root certificate. A DNS look up should be done here to " + "located sender's MailerId service. In this test we " + "assume that location is https://localhost:8080/mailerid");
    return serviceLocator.mailerIdInfoAt('https://localhost:8080/mailerid').then(function (data) {
        log.write("Response from https://localhost:8080/mailerid " + "provides a current MailerId root certificate.");
        return { cert: data.currentCert, domain: 'localhost' };
    });
}
function openMsg(msgInd) {
    try {
        log.clear();
        var msg = inbox.msgs[msgInd];
        if (!msg) {
            updateMsgList();
            return;
        }
        var promiseToOpenMain;
        if (msg.main) {
            promiseToOpenMain = Q.when();
        }
        else if (!msg.isCryptoSet()) {
            updateMsgList();
            return;
        }
        else {
            promiseToOpenMain = openInbox().then(function () {
                log.write("Downloading all segments of main object (id: " + msg.meta.extMeta.objIds[0] + ") in one request.");
                return msgReceiver.getObjSegs(msg.msgId, msg.meta.extMeta.objIds[0]);
            }).then(function (bytes) {
                log.write("Decrypting main object.");
                if (msg.sender.address) {
                    return msg.setMain(bytes).then(function () {
                        keyring.absorbSuggestedNextKeyPair(msg.sender.address, msg.getNextCrypto(), msg.meta.deliveryStart);
                    });
                }
                else {
                    return msg.setMain(bytes, getMidRoot);
                }
            });
        }
        promiseToOpenMain.then(function () {
            var b = msg.getMainBody();
            if (b.text && ('string' === typeof b.text.plain)) {
                displayPlainTextMsg(msg);
            }
            else {
                alert("Display of other\n message types\n is not implemented.");
            }
        }).fail(function (err) {
            if (err.noReport) {
                return;
            }
            log.write("ERROR: " + err.message);
            console.error('Error in file ' + err.fileName + ' at ' + err.lineNumber + ': ' + err.message);
        }).done();
    }
    catch (err) {
        console.error(err);
    }
}
exports.openMsg = openMsg;
Object.freeze(exports);

},{"../../../lib-client/asmail/keyring/index":16,"../../../lib-client/asmail/msg":19,"../../../lib-client/asmail/recipient":20,"../../../lib-client/page-logging":25,"../../../lib-client/service-locator":27,"q":"q"}],4:[function(require,module,exports){
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
var serviceLocator = require('../../../lib-client/service-locator');
var Q = require('q');
var senderMod = require('../../../lib-client/asmail/sender');
var msgMod = require('../../../lib-client/asmail/msg');
var log = require('../../../lib-client/page-logging');
var midSigs = require('../../../lib-common/mid-sigs-NaCl-Ed');
var mailConf = require('./mail-conf');
function sendPreFlight(form) {
    try {
        log.clear();
        var needsAuth = form.auth.checked;
        var recipient = form.recipient.value;
        var sender = (needsAuth ? mailerIdentity.getId() : null);
        if (!recipient) {
            alert("Recipient's address is missing");
            form.recipient.focus();
            return;
        }
        log.write("Making a pre-flight request ...");
        var inviteToken = keyring.getInviteForSendingTo(recipient);
        var mSender = (inviteToken ? new senderMod.MailSender(sender, recipient, inviteToken) : new senderMod.MailSender(sender, recipient));
        mSender.setDeliveryUrl('https://localhost:8080/asmail').then(function () {
            log.write("Response from https://localhost:8080/asmail " + "tells that message delivery should be done at " + mSender.deliveryURI);
            return mSender.performPreFlight().then(function () {
                log.write("PRE-FLIGHT: status 200 -- OK, maximum message " + "size is " + mSender.maxMsgLength + " bytes.");
            }, function (err) {
                if (err.status == 474) {
                    log.write("PRE-FLIGHT: status 474 -- unknown recipient. " + "Server says: " + err.message);
                    err.noReport = true;
                }
                else if (err.status == 403) {
                    log.write("PRE-FLIGHT: status 403 -- leaving mail is not " + "allowed. Server says: " + err.message);
                    err.noReport = true;
                }
                else if (err.status == 480) {
                    log.write("PRE-FLIGHT: status 480 -- mailbox is full. " + "Server says: " + err.message);
                    err.noReport = true;
                }
                throw err;
            });
        }).fail(function (err) {
            if (err.noReport) {
                return;
            }
            log.write("ERROR: " + err.message);
            console.error('Error in file ' + err.fileName + ' at ' + err.lineNumber + ': ' + err.message);
        }).done();
    }
    catch (err) {
        console.error(err);
    }
}
exports.sendPreFlight = sendPreFlight;
function extractMsg(form) {
    var msg = new msgMod.MsgPacker();
    msg.setPlainTextBody(form.msgTextBody.value);
    msg.setHeader('Subject', form.msgSubject.value);
    msg.setHeader('From', mailerIdentity.getId());
    msg.setHeader('To', form.recipient.value);
    return msg;
}
function sendObj(mSender, objId, bytes) {
    var offset = null;
    function sendHead(isFirst) {
        if (isFirst) {
            offset = 0;
        }
        var chunkSize = Math.min(bytes.head.length - offset, mSender.maxChunkSize);
        var chunk = bytes.head.subarray(offset, offset + chunkSize);
        return mSender.sendObjHeadChunk(objId, offset, chunk, (isFirst ? bytes.head.length : null)).then(function () {
            offset += chunkSize;
            if (offset < bytes.head.length) {
                return sendHead();
            }
        });
    }
    var segsLen = 0;
    for (var i = 0; i < bytes.segs.length; i += 1) {
        segsLen += bytes.segs[i].length;
    }
    var segInd = 0;
    var posInSeg = 0;
    function sendSegs(isFirst) {
        if (segInd >= bytes.segs.length) {
            return;
        }
        if (isFirst) {
            offset = 0;
        }
        var chunk = new Uint8Array(Math.min(mSender.maxChunkSize, segsLen));
        var ofs = 0;
        var d;
        var seg;
        while (ofs < chunk.length) {
            seg = bytes.segs[segInd];
            d = seg.length - posInSeg;
            d = Math.min(d, chunk.length - ofs);
            chunk.set(seg.subarray(posInSeg, posInSeg + d), ofs);
            ofs += d;
            posInSeg += d;
            if (posInSeg === seg.length) {
                segInd += 1;
                posInSeg = 0;
            }
        }
        chunk = chunk.subarray(0, ofs);
        return mSender.sendObjSegsChunk(objId, offset, chunk, (isFirst ? segsLen : null)).then(function () {
            offset += ofs;
            if (offset < segsLen) {
                sendSegs();
            }
        });
    }
    var promise = sendHead(true).then(function () {
        return sendSegs(true);
    });
    return promise;
}
function extractAndVerifyPKey(address, certs, validAt, rootCert, rootAddr) {
    try {
        return midSigs.relyingParty.verifyPubKey(certs.pkeyCert, address, { user: certs.userCert, prov: certs.provCert, root: rootCert }, rootAddr, validAt);
    }
    catch (e) {
        return null;
    }
}
function sendMsg(form) {
    try {
        log.clear();
        var needsAuth = form.auth.checked;
        var recipient = form.recipient.value;
        var sender = (needsAuth ? mailerIdentity.getId() : null);
        var msg = extractMsg(form);
        if (!recipient) {
            alert("Recipient's address is missing");
            form.recipient.focus();
            return;
        }
        log.write("Sending a message ...");
        var inviteToSendNow = keyring.getInviteForSendingTo(recipient);
        var mSender = (inviteToSendNow ? new senderMod.MailSender(sender, recipient, inviteToSendNow) : new senderMod.MailSender(sender, recipient));
        var promise = mSender.setDeliveryUrl('https://localhost:8080/asmail').then(function () {
            log.write("Response from https://localhost:8080/asmail " + "tells that message delivery should be done at " + mSender.deliveryURI);
        }).then(function () {
            return mSender.startSession().then(function () {
                log.write("1st REQUEST: status 200 -- OK, maximum message size is " + mSender.maxMsgLength + " bytes.");
            }, (function (err) {
                if (err.status == 474) {
                    log.write("1st REQUEST: status 474 -- unknown recipient. " + "Server says: " + err.message);
                    err.noReport = true;
                }
                else if (err.status == 403) {
                    log.write("1st REQUEST: status 403 -- leaving mail is " + "not allowed. Server says: " + err.message);
                    err.noReport = true;
                }
                else if (err.status == 480) {
                    log.write("1st REQUEST: status 480 -- mailbox is full. " + "Server says: " + err.message);
                    err.noReport = true;
                }
                throw err;
            }));
        });
        // 2nd request, applicable only to authenticated sending
        if (sender) {
            promise = promise.then(function () {
                if (mailerIdentity.isProvisionedAndValid()) {
                    log.write("Reusing already provisioned MailerId assertion " + "signer for " + mSender.sender);
                }
                else {
                    log.write("Start provisioning MailerId assertion signer for " + mSender.sender);
                }
                return mailerIdentity.getSigner();
            }).then(function (signer) {
                log.write(mSender.sender + " can now be authorized by MailerId assertion.");
                return mSender.authorizeSender(signer).then(function () {
                    log.write("2nd REQUEST: status 200 -- OK, sender address " + mSender.sender + " has been successfully authenticated.");
                }, (function (err) {
                    if (err.status == 403) {
                        log.write("2nd REQUEST: status 403 -- authentication " + "failure. Server says: " + err.message);
                    }
                    err.noReport = true;
                    throw err;
                }));
            });
        }
        var introPKeyFromServer = null;
        promise.then(function () {
            // 3rd request, is needed only when recipient is not known
            if (keyring.isKnownCorrespondent(mSender.recipient)) {
                log.write("There are " + mSender.recipient + " keys in the keyring. " + "3rd request is skipped, and keys from a keyring will " + "be used.");
                return;
            }
            log.write("There is a need to look up " + mSender.recipient + " introductory key on the mail server.");
            return mSender.getRecipientsInitPubKey().then(function (certs) {
                log.write("3rd REQUEST: status 200 --received " + mSender.recipient + " public key certificates.");
                return certs;
            }, (function (err) {
                if (err.status == 474) {
                    log.write("3rd REQUEST: status 474 -- no public key found " + "on the server. Server says: " + err.message);
                    log.writeLink("Set test keys for " + mSender.recipient, "#config", true);
                    err.noReport = true;
                    throw err;
                }
            })).then(function (certs) {
                log.write("To verify recipient's key, we need to get MailerId " + "root certificate. A DNS look up should be done here to " + "located recipient's MailerId service. In this test we " + "assume that location is https://localhost:8080/mailerid");
                return serviceLocator.mailerIdInfoAt('https://localhost:8080/mailerid').then(function (data) {
                    log.write("Response from https://localhost:8080/mailerid " + "provides a current MailerId root certificate.");
                    var rootCert = data.currentCert;
                    var rootAddr = 'localhost';
                    var now = Date.now() / 1000;
                    var pkey = extractAndVerifyPKey(mSender.recipient, certs, now, rootCert, rootAddr);
                    if (pkey) {
                        log.write("Certificates for " + mSender.recipient + " passes validation.");
                        introPKeyFromServer = pkey;
                    }
                    else {
                        log.writeLink("Update test keys for " + mSender.recipient + " as those on file fail verificattion.", "#config", true);
                        throw new Error("Public key certificates for " + mSender.recipient + " fail verification.");
                    }
                });
            });
        }).then(function () {
            return mailConf.getSingleAnonSenderInvite();
        }).then(function (inviteForReplies) {
            // encrypting message
            var msgCrypto = keyring.generateKeysForSendingTo(mSender.recipient, inviteForReplies, introPKeyFromServer);
            msg.setNextKeyPair(msgCrypto.pairs.next);
            var maxChunkSize = null;
            var dataToSend = null;
            var prom;
            if (msgCrypto.pairs.current.pid) {
                msg.setMetaForEstablishedKeyPair(msgCrypto.pairs.current.pid);
                log.write("Encrypting current message to established pair '" + msg.meta.pid + "' and suggesting to use next a new pair '" + msg.main.data['Next Crypto'].pid + "'");
                prom = Q.when();
            }
            else {
                log.write("Encrypting current message to recipient's key '" + msgCrypto.pairs.current.recipientKid + "' and a freshly " + "generated key '" + msgCrypto.pairs.current.senderPKey.kid + "'");
                prom = mailerIdentity.getSigner().then(function (signer) {
                    log.write("Using MailerId, sign new key '" + msgCrypto.pairs.current.senderPKey.kid + "', so as to put at least some trust into it.");
                    msg.setMetaForNewKey(msgCrypto.pairs.current.recipientKid, msgCrypto.pairs.current.senderPKey.k, signer.certifyPublicKey(msgCrypto.pairs.current.senderPKey, 30 * 24 * 60 * 60), signer.userCert, signer.providerCert);
                });
            }
            prom = prom.then(function () {
                dataToSend = msg.encrypt(msgCrypto.encryptor);
                msgCrypto.encryptor.destroy();
            }).then(function () {
                log.write("Sending a plaintext metadata. Notice that it only " + "contains info about encryption key(s) and ids of " + "objects, that constitute this message.");
                return mSender.sendMetadata(dataToSend.meta);
            }).then(function (resp) {
                maxChunkSize = resp.maxChunkSize;
                log.write("4th REQUEST: status 201 -- OK. Server assigned " + "this message an id '" + mSender.msgId + "'. Server indicated that " + maxChunkSize + " is a maximum bytes chunk size");
            }).then(function () {
                var tasksChain = null;
                dataToSend.meta.objIds.forEach(function (objId) {
                    if (tasksChain) {
                        tasksChain = tasksChain.then(function () {
                            return sendObj(mSender, objId, dataToSend.bytes[objId]);
                        });
                    }
                    else {
                        tasksChain = sendObj(mSender, objId, dataToSend.bytes[objId]);
                    }
                });
                return tasksChain;
            }).then(function () {
                log.write("5th REQUESTs: all have status 201 -- OK. All " + "object bytes have been successfully delivered to server.");
                return mSender.completeDelivery();
            }).then(function () {
                log.write("6th REQUEST: status 200 -- OK. This request " + "finalizes message sending, letting server know that " + "it has received the whole of the inteded message.");
                form.reset();
            });
            return prom;
        }).fail(function (err) {
            if (err.noReport) {
                return;
            }
            log.write("ERROR: " + err.message);
            console.error('Error in file ' + err.fileName + ' at ' + err.lineNumber + ': ' + err.message);
        }).done();
    }
    catch (err) {
        console.error(err);
    }
}
exports.sendMsg = sendMsg;
Object.freeze(exports);

},{"../../../lib-client/asmail/msg":19,"../../../lib-client/asmail/sender":21,"../../../lib-client/page-logging":25,"../../../lib-client/service-locator":27,"../../../lib-common/mid-sigs-NaCl-Ed":38,"./mail-conf":2,"q":"q"}],5:[function(require,module,exports){
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
var Q = require("q");
var nacl = require('ecma-nacl');
var utf8 = require('../../lib-common/utf8');
var xspFS = require('../../lib-client/3nstorage/xsp-fs/index');
var storesMod = require('../../lib-client/3nstorage/stores');
var keyGen = require('../../lib-client/workers/key-gen-main');
var log = require('../../lib-client/page-logging');
var fErrMod = require('../../lib-common/file-err');
var KEYRING_APP_DATA_FOLDER = 'org.3nweb.demo.protocols.keyring';
var KEYRING_FNAME = 'keyring.json';
var FileStorage = (function () {
    function FileStorage() {
        this.remoteStore = null;
        this.keyringFS = null;
        this.deferredMasterPass = null;
    }
    /**
     * @return a promise, resolvable to an object with pass field.
     */
    FileStorage.prototype.promiseMasterPassForRoot = function () {
        pageRouter.showElem('storage-credentials');
        document.forms['storage-key-entry'].pass.focus();
        this.deferredMasterPass = Q.defer();
        return this.deferredMasterPass.promise;
    };
    FileStorage.prototype.completeCredentialsEntry = function (form, cancel) {
        function hideForm() {
            form.reset();
            pageRouter.hideElem('storage-credentials');
        }
        try {
            if (cancel) {
                hideForm();
                this.deferredMasterPass.reject(new Error("User canceled entry of master password for storage root."));
                return;
            }
            var pass = form.pass.value;
            if (!pass) {
                alert("Passphrase is missing.\nPlease, type it in.");
                return;
            }
            hideForm();
            this.deferredMasterPass.resolve(pass);
        }
        catch (err) {
            log.write("ERROR: " + err.message);
            console.error('Error in file ' + err.fileName + ' at ' + err.lineNumber + ': ' + err.message);
        }
    };
    FileStorage.prototype.init = function (signerGen) {
        var _this = this;
        var promise = storesMod.make3NStorageOwner('https://localhost:8080/3nstorage', signerGen).then(function (remoteStore) {
            _this.remoteStore = remoteStore;
            return _this.promiseMasterPassForRoot();
        }).then(function (pass) {
            return keyGen.deriveKeyFromPass(pass, _this.remoteStore.getRootKeyDerivParams());
        }).then(function (mkey) {
            var masterDecr = nacl.secret_box.formatWN.makeDecryptor(mkey);
            nacl.arrays.wipe(mkey);
            return xspFS.makeExisting(_this.remoteStore, null, masterDecr);
        }).then(function (rootFS) {
            var tasks = [_this.setKeyringFS(rootFS)];
            return Q.all(tasks).fin(function () {
                return rootFS.close(false);
            });
        });
        return promise;
    };
    FileStorage.prototype.setKeyringFS = function (rootFS) {
        var _this = this;
        if (this.keyringFS) {
            throw new Error("File system is already set");
        }
        var promise = rootFS.getRoot().getFolderInThisSubTree([xspFS.sysFolders.appData, KEYRING_APP_DATA_FOLDER], true).then(function (f) {
            _this.keyringFS = rootFS.makeSubRoot(f);
        });
        return promise;
    };
    FileStorage.prototype.keyringStorage = function () {
        return (new KeyRingStore(this.keyringFS)).wrap();
    };
    FileStorage.prototype.close = function () {
        var tasks = [];
        if (this.keyringFS) {
            tasks.push(this.keyringFS.close(false));
            this.keyringFS = null;
        }
        if (this.remoteStore) {
            tasks.push(this.remoteStore.close());
            this.remoteStore = null;
        }
        return Q.all(tasks);
    };
    FileStorage.prototype.wrap = function () {
        var wrap = {
            completeCredentialsEntry: this.completeCredentialsEntry.bind(this),
            init: this.init.bind(this),
            close: this.close.bind(this),
            keyringStorage: this.keyringStorage.bind(this)
        };
        Object.freeze(wrap);
        return wrap;
    };
    return FileStorage;
})();
Object.freeze(FileStorage);
Object.freeze(FileStorage.prototype);
function makeStorage() {
    return (new FileStorage()).wrap();
}
exports.makeStorage = makeStorage;
var KeyRingStore = (function () {
    function KeyRingStore(keyringFS) {
        if (!keyringFS) {
            throw new Error("No file system given.");
        }
        this.keyringFS = keyringFS;
        Object.seal(this);
    }
    KeyRingStore.prototype.save = function (serialForm) {
        var _this = this;
        if (!this.keyringFS) {
            throw new Error("File system is not setup");
        }
        log.write("Record changes to keyring file");
        var promise = this.keyringFS.getRoot().getFile(KEYRING_FNAME, true).then(function (file) {
            if (!file) {
                log.write("Create keyring file, as it does not exist, yet.");
                file = _this.keyringFS.getRoot().createFile(KEYRING_FNAME);
            }
            return file.save(utf8.pack(serialForm));
        });
        return promise;
    };
    KeyRingStore.prototype.load = function () {
        if (!this.keyringFS) {
            throw new Error("File system is not setup");
        }
        log.write("Loading keyring file");
        var promise = this.keyringFS.getRoot().getFile(KEYRING_FNAME).then(function (file) {
            return file.readSrc().then(function (src) {
                return src.read(0, null, true);
            }).then(function (bytes) {
                return utf8.open(bytes);
            });
        }, function (err) {
            if (err.code === fErrMod.Code.noFile) {
                return null;
            }
            throw err;
        });
        return promise;
    };
    KeyRingStore.prototype.wrap = function () {
        var wrap = {
            load: this.load.bind(this),
            save: this.save.bind(this)
        };
        Object.freeze(wrap);
        return wrap;
    };
    return KeyRingStore;
})();
Object.freeze(KeyRingStore);
Object.freeze(KeyRingStore.prototype);
Object.freeze(exports);

},{"../../lib-client/3nstorage/stores":8,"../../lib-client/3nstorage/xsp-fs/index":12,"../../lib-client/page-logging":25,"../../lib-client/workers/key-gen-main":32,"../../lib-common/file-err":36,"../../lib-common/utf8":47,"ecma-nacl":"ecma-nacl","q":"q"}],6:[function(require,module,exports){
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
var Q = require('q');
var midProv = require('../../lib-client/mailer-id/provisioner');
var log = require('../../lib-client/page-logging');
var keyGen = require('../../lib-client/workers/key-gen-main');
// we make test certs short-living, so as to have expiration events
var CERTIFICATE_DURATION_SECONDS = 60 * 60;
var MIN_SECS_LEFT_ASSUMED_OK = 60;
var Manager = (function () {
    function Manager() {
        this.provisioner = null;
        this.signer = null;
        this.deferredCredentials = null;
        Object.seal(this);
    }
    /**
     * @return a promise, resolvable to an object with fields id and pass.
     */
    Manager.prototype.promiseIdAndPassForPKL = function () {
        var idInput = $('#mailer-id-entry')[0];
        if (this.getId()) {
            idInput.value = this.getId();
            idInput.disabled = true;
        }
        else {
            idInput.disabled = false;
        }
        pageRouter.showElem('mailerid-credentials');
        if (this.getId()) {
            document.forms["mailerid-credentials"].pass.focus();
        }
        else {
            document.forms["mailerid-credentials"].mailerid.focus();
        }
        this.deferredCredentials = Q.defer();
        return this.deferredCredentials.promise;
    };
    Manager.prototype.completeCredentialsEntry = function (form, cancel) {
        function hideForm() {
            form.reset();
            pageRouter.hideElem('mailerid-credentials');
        }
        try {
            if (cancel) {
                hideForm();
                this.deferredCredentials.reject(new Error("User canceled entry of MailerId credentials."));
                return;
            }
            var id = form.mailerid.value;
            var pass = form.pass.value;
            if (!id) {
                alert("Mail address is missing.\nPlease, type it in.");
                return;
            }
            if (!pass) {
                alert("Passphrase is missing.\nPlease, type it in.");
                return;
            }
            hideForm();
            this.deferredCredentials.resolve({ id: id, pass: pass });
        }
        catch (err) {
            log.write("ERROR: " + err.message);
            console.error('Error in file ' + err.fileName + ' at ' + err.lineNumber + ': ' + err.message);
        }
    };
    /**
     * Notice that this function should actually do a DNS lookup to find
     * domain and port of identity providing service, but in this test
     * setting we feed in a location of our test MailerId service at
     * localhost:8080.
     * @return a promise, resolvable, when a new assertion signer is
     * provisioned for a given id.
     */
    Manager.prototype.provision = function () {
        var _this = this;
        var promise = this.promiseIdAndPassForPKL().then(function (idAndPass) {
            if (_this.provisioner) {
                if (_this.provisioner.userId !== idAndPass.id) {
                    throw new Error("Entered id is not the same as the one set for this app.");
                }
            }
            else {
                _this.provisioner = new midProv.MailerIdProvisioner(idAndPass.id, 'https://localhost:8080/mailerid');
            }
            var genOfDHKeyCalcPromise = function (keyGenParams) {
                return keyGen.deriveKeyFromPass(idAndPass.pass, keyGenParams).then(function (skey) {
                    return function (serverPubKey) {
                        return nacl.box.calc_dhshared_key(serverPubKey, skey);
                    };
                });
            };
            return _this.provisioner.provisionSigner(genOfDHKeyCalcPromise, CERTIFICATE_DURATION_SECONDS);
        }).then(function (midSigner) {
            _this.signer = midSigner;
            return _this.signer;
        });
        return promise;
    };
    Manager.prototype.getId = function () {
        return (this.provisioner ? this.provisioner.userId : null);
    };
    Manager.prototype.getSigner = function () {
        var _this = this;
        if (this.isProvisionedAndValid()) {
            return Q.when(this.signer);
        }
        return this.provision().then(function () {
            return _this.signer;
        });
    };
    Manager.prototype.isProvisionedAndValid = function () {
        if (!this.signer) {
            return false;
        }
        return (this.signer.certExpiresAt > (Date.now() / 1000 + MIN_SECS_LEFT_ASSUMED_OK));
    };
    Manager.prototype.init = function () {
        var _this = this;
        var promise = this.provision().then(function () {
            $('title').text(_this.getId());
            $('.user-id').text(_this.getId());
        });
        return promise;
    };
    return Manager;
})();
function makeManager() {
    var m = new Manager();
    var managerWrap = {
        completeCredentialsEntry: m.completeCredentialsEntry.bind(m),
        provision: m.provision.bind(m),
        getId: m.getId.bind(m),
        getSigner: m.getSigner.bind(m),
        isProvisionedAndValid: m.isProvisionedAndValid.bind(m),
        init: m.init.bind(m)
    };
    Object.freeze(managerWrap);
    return managerWrap;
}
exports.makeManager = makeManager;
Object.freeze(exports);

},{"../../lib-client/mailer-id/provisioner":24,"../../lib-client/page-logging":25,"../../lib-client/workers/key-gen-main":32,"ecma-nacl":"ecma-nacl","q":"q"}],7:[function(require,module,exports){
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
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
/**
 * This defines functions that implement ASMail reception protocol.
 */
var xhrUtils = require('../xhr-utils');
var Q = require('q');
var api = require('../../lib-common/service-api/3nstorage/owner');
var baseServiceUser = require('../user-with-mid-session');
var serviceLocator = require('../service-locator');
var keyGenUtils = require('../workers/key-gen-common');
var byteSrcMod = require('../byte-source');
var DEFAULT_MAX_SENDING_CHUNK = 1024 * 1024;
var DEFAULT_MAX_GETTING_CHUNK = 2 * 1024 * 1024;
function makeTransactionParamsFor(obj, newObj) {
    if (newObj === void 0) { newObj = false; }
    var hLen = obj.header.totalSize();
    if (hLen === null) {
        hLen = -1;
    }
    var sLen = obj.segments.totalSize();
    if (sLen === null) {
        sLen = -1;
    }
    var p = {
        sizes: {
            header: hLen,
            segments: sLen
        }
    };
    if (newObj) {
        p.isNewObj = true;
    }
    return p;
}
var StorageOwner = (function (_super) {
    __extends(StorageOwner, _super);
    function StorageOwner(user) {
        _super.call(this, user, {
            login: api.midLogin.MID_URL_PART,
            logout: api.closeSession.URL_END,
            canBeRedirected: true
        });
        this.keyDerivParams = null;
        this.maxChunkSize = null;
        Object.seal(this);
    }
    StorageOwner.prototype.setStorageUrl = function (serviceUrl) {
        var _this = this;
        var promise = serviceLocator.storageInfoAt(serviceUrl).then(function (info) {
            _this.serviceURI = info.owner;
        });
        return promise;
    };
    StorageOwner.prototype.rejectOnNot200 = function (deferred, xhr) {
        if (xhr.status != 200) {
            if (xhr.status == api.ERR_SC.needAuth) {
                this.sessionId = null;
            }
            xhrUtils.reject(deferred, xhr);
            return true;
        }
        return false;
    };
    StorageOwner.prototype.setSessionParams = function () {
        var _this = this;
        var url = this.serviceURI + api.sessionParams.URL_END;
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('GET', url, function () {
            if (_this.rejectOnNot200(deferred, xhr)) {
                return;
            }
            var reply = xhr.response;
            try {
                keyGenUtils.paramsFromJson('?', reply.keyDerivParams);
                if (('number' !== typeof reply.maxChunkSize) || (reply.maxChunkSize < 1000)) {
                    throw "Bad or missing maxChunkSize parameter.";
                }
                _this.keyDerivParams = reply.keyDerivParams;
                _this.maxChunkSize = reply.maxChunkSize;
                deferred.resolve();
            }
            catch (err) {
                if ('string' == typeof err) {
                    xhrUtils.reject(deferred, xhr.status, err);
                }
                else {
                    xhrUtils.reject(deferred, xhr.status, err.message);
                }
            }
        }, deferred, this.sessionId);
        xhr.responseType = "json";
        xhr.send();
        return deferred.promise;
    };
    /**
     * This does MailerId login with a subsequent getting of session parameters
     * from
     * @param assertionSigner
     * @return a promise, resolvable, when mailerId login and getting parameters'
     * successfully completes.
     */
    StorageOwner.prototype.login = function (midSigner) {
        var _this = this;
        if (this.sessionId) {
            throw new Error("Session is already opened.");
        }
        var promise = _super.prototype.login.call(this, midSigner).then(function () {
            return _this.setSessionParams();
        });
        return promise;
    };
    /**
     * @param objId must be null for root object, and a string id for other ones
     * @return a promise, resolvable to transaction id.
     */
    StorageOwner.prototype.startTransaction = function (objId, transParams) {
        var _this = this;
        var url = this.serviceURI + ((objId === null) ? api.startRootTransaction.URL_END : api.startTransaction.getReqUrlEnd(objId));
        var deferred = Q.defer();
        var xhr = xhrUtils.makeJsonRequest('POST', url, function () {
            if (_this.rejectOnNot200(deferred, xhr)) {
                return;
            }
            var reply = xhr.response;
            if ('string' !== typeof reply.transactionId) {
                xhrUtils.reject(deferred, xhr.status, "Bad or missing transactionId parameter.");
            }
            else {
                deferred.resolve(reply.transactionId);
            }
        }, deferred, this.sessionId);
        xhr.responseType = "json";
        xhr.sendJSON(transParams);
        return deferred.promise;
    };
    /**
     * @param objId must be null for root object, and a string id for other ones
     * @param transactionId
     * @return a promise, resolvable to transaction id.
     */
    StorageOwner.prototype.cancelTransaction = function (objId, transactionId) {
        var _this = this;
        var url = this.serviceURI + ((objId === null) ? api.cancelRootTransaction.getReqUrlEnd(transactionId) : api.cancelTransaction.getReqUrlEnd(objId, transactionId));
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('POST', url, function () {
            if (_this.rejectOnNot200(deferred, xhr)) {
                return;
            }
            deferred.resolve();
        }, deferred, this.sessionId);
        xhr.send();
        return deferred.promise;
    };
    /**
     * @param objId must be null for root object, and a string id for other ones
     * @param transactionId
     * @return a promise, resolvable to transaction id.
     */
    StorageOwner.prototype.completeTransaction = function (objId, transactionId) {
        var _this = this;
        var url = this.serviceURI + ((objId === null) ? api.finalizeRootTransaction.getReqUrlEnd(transactionId) : api.finalizeTransaction.getReqUrlEnd(objId, transactionId));
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('POST', url, function () {
            if (_this.rejectOnNot200(deferred, xhr)) {
                return;
            }
            deferred.resolve();
        }, deferred, this.sessionId);
        xhr.send();
        return deferred.promise;
    };
    StorageOwner.prototype.getBytes = function (url) {
        var _this = this;
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('GET', url, function () {
            if (_this.rejectOnNot200(deferred, xhr)) {
                return;
            }
            try {
                var ver = parseInt(xhr.getResponseHeader(api.HTTP_HEADER.objVersion), 10);
                if (isNaN(ver)) {
                    throw "Response is malformed, proper version missing.";
                }
                var reply = xhr.response;
                if (!reply || ('object' !== typeof reply)) {
                    throw "Response is malformed, it is not an object.";
                }
                deferred.resolve({
                    bytes: new Uint8Array(reply),
                    ver: ver
                });
            }
            catch (e) {
                xhrUtils.reject(deferred, 200, ('string' === typeof e) ? e : e.message);
            }
        }, deferred, this.sessionId);
        xhr.responseType = "arraybuffer";
        xhr.send();
        return deferred.promise;
    };
    StorageOwner.prototype.getAllBytesSequentially = function (objId, isHeader, sink, ver, ofs) {
        var _this = this;
        if (ver === void 0) { ver = null; }
        if (ofs === void 0) { ofs = 0; }
        var opts = {
            ofs: ofs,
            len: DEFAULT_MAX_GETTING_CHUNK
        };
        if ('number' === typeof ver) {
            opts.ver = ver;
        }
        var url = this.serviceURI;
        if (objId === null) {
            if (isHeader) {
                url += api.rootHeader.getReqUrlEnd(opts);
            }
            else {
                url += api.rootSegs.getReqUrlEnd(opts);
            }
        }
        else {
            if (isHeader) {
                url += api.objHeader.getReqUrlEnd(objId, opts);
            }
            else {
                url += api.objSegs.getReqUrlEnd(objId, opts);
            }
        }
        var promise = this.getBytes(url).then(function (bytesAndVer) {
            if (ver === null) {
                ver = bytesAndVer.ver;
                sink.setObjVersion(ver);
            }
            else if (ver !== bytesAndVer.ver) {
                throw new Error("Server sent bytes for object version " + bytesAndVer.ver + ", while it has been asked for version " + ver);
            }
            if (bytesAndVer.bytes.length === 0) {
                sink.swallow(null);
                return;
            }
            sink.swallow(bytesAndVer.bytes);
            if (opts.len > bytesAndVer.bytes.length) {
                sink.swallow(null);
                return;
            }
            return _this.getAllBytesSequentially(objId, isHeader, sink, ver, ofs);
        });
        return promise;
    };
    StorageOwner.prototype.getObj = function (objId, ver) {
        var _this = this;
        if (ver === void 0) { ver = null; }
        var pipe = new byteSrcMod.SinkBackedObjSource();
        var headerSink = {
            setObjVersion: pipe.sink.setObjVersion,
            swallow: pipe.sink.header.swallow,
            setTotalSize: pipe.sink.header.setTotalSize
        };
        var segmentsSink = {
            setObjVersion: pipe.sink.setObjVersion,
            swallow: pipe.sink.segments.swallow,
            setTotalSize: pipe.sink.segments.setTotalSize
        };
        this.getAllBytesSequentially(objId, true, headerSink, ver).then(function () {
            return _this.getAllBytesSequentially(objId, false, segmentsSink, ver);
        }).done();
        return pipe.src;
    };
    StorageOwner.prototype.getObjHeader = function (objId, ver) {
        if (ver === void 0) { ver = null; }
        var pipe = new byteSrcMod.SinkBackedObjSource();
        var headerSink = {
            setObjVersion: pipe.sink.setObjVersion,
            swallow: pipe.sink.header.swallow,
            setTotalSize: pipe.sink.header.setTotalSize
        };
        this.getAllBytesSequentially(objId, true, headerSink, ver).done();
        return {
            getObjVersion: pipe.getObjVersion,
            read: pipe.src.header.read,
            totalSize: pipe.src.header.totalSize
        };
    };
    StorageOwner.prototype.sendBytes = function (url, bytes) {
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBinaryRequest('PUT', url, function () {
            if (xhr.status == 201) {
                deferred.resolve();
            }
            else {
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.send(bytes);
        return deferred.promise;
    };
    StorageOwner.prototype.sendAllBytesNonAppending = function (objId, transactionId, isHeader, src, ofs) {
        var _this = this;
        if (ofs === void 0) { ofs = 0; }
        var opts = {
            trans: transactionId,
            append: false,
            ofs: ofs
        };
        var url = this.serviceURI;
        if (objId === null) {
            if (isHeader) {
                url += api.rootHeader.putReqUrlEnd(opts);
            }
            else {
                url += api.rootSegs.putReqUrlEnd(opts);
            }
        }
        else {
            if (isHeader) {
                url += api.objHeader.putReqUrlEnd(objId, opts);
            }
            else {
                url += api.objSegs.putReqUrlEnd(objId, opts);
            }
        }
        var chunkLen = Math.min(this.maxChunkSize, DEFAULT_MAX_SENDING_CHUNK);
        var promise = src.read(chunkLen, chunkLen).then(function (bytes) {
            if (!bytes) {
                return;
            }
            return _this.sendBytes(url, bytes).then(function () {
                ofs += bytes.length;
                return _this.sendAllBytesNonAppending(objId, transactionId, isHeader, src, ofs);
            });
        });
        return promise;
    };
    StorageOwner.prototype.saveObj = function (objId, obj, newObj) {
        var _this = this;
        var transactionId;
        var transParams = makeTransactionParamsFor(obj, newObj);
        if ((transParams.sizes.header < 0) || (transParams.sizes.segments < 0)) {
            throw new Error("Sending limitless file is not implemented, yet");
        }
        var promise = this.startTransaction(objId, transParams).then(function (transId) {
            transactionId = transId;
            return _this.sendAllBytesNonAppending(objId, transactionId, true, obj.header);
        }).then(function () {
            return _this.sendAllBytesNonAppending(objId, transactionId, false, obj.segments);
        }).fail(function (err) {
            if (transactionId) {
                return _this.cancelTransaction(objId, transactionId).then(function () {
                    throw err;
                }, function () {
                    throw err;
                });
            }
            throw err;
        }).then(function () {
            _this.completeTransaction(objId, transactionId);
        });
        return promise;
    };
    return StorageOwner;
})(baseServiceUser.ServiceUser);
exports.StorageOwner = StorageOwner;
Object.freeze(StorageOwner.prototype);
Object.freeze(StorageOwner);
Object.freeze(exports);

},{"../../lib-common/service-api/3nstorage/owner":39,"../byte-source":23,"../service-locator":27,"../user-with-mid-session":29,"../workers/key-gen-common":31,"../xhr-utils":33,"q":"q"}],8:[function(require,module,exports){
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
var Q = require('q');
var remoteServ = require('./service');
var StorageOwner = (function () {
    function StorageOwner(getMidSigner) {
        this.remoteStorage = null;
        this.loginProc = null;
        this.getMidSigner = getMidSigner;
        Object.seal(this);
    }
    StorageOwner.makeAndLogin = function (serviceUrl, getMidSigner) {
        var s = new StorageOwner(getMidSigner);
        var promise = s.getMidSigner().then(function (signer) {
            s.remoteStorage = new remoteServ.StorageOwner(signer.address);
            return s.remoteStorage.setStorageUrl(serviceUrl).then(function () {
                return s.remoteStorage.login(signer);
            });
        }).then(function () {
            return s.wrap();
        });
        return promise;
    };
    StorageOwner.prototype.login = function () {
        var _this = this;
        if (this.loginProc) {
            return this.loginProc;
        }
        this.loginProc = this.getMidSigner().then(function (signer) {
        }).fin(function () {
            _this.loginProc = null;
        });
        return this.loginProc;
    };
    StorageOwner.prototype.getRootKeyDerivParams = function () {
        return this.remoteStorage.keyDerivParams;
    };
    StorageOwner.prototype.getObj = function (objId) {
        var _this = this;
        if (this.remoteStorage.sessionId) {
            return Q.when(this.remoteStorage.getObj(objId));
        }
        return this.login().then(function () {
            return _this.remoteStorage.getObj(objId);
        });
    };
    StorageOwner.prototype.getObjHeader = function (objId) {
        var _this = this;
        if (this.remoteStorage.sessionId) {
            return Q.when(this.remoteStorage.getObjHeader(objId));
        }
        return this.login().then(function () {
            return _this.remoteStorage.getObjHeader(objId);
        });
    };
    StorageOwner.prototype.saveObj = function (objId, obj, newObj) {
        var _this = this;
        if (this.remoteStorage.sessionId) {
            return this.remoteStorage.saveObj(objId, obj, newObj);
        }
        return this.login().then(function () {
            return _this.remoteStorage.saveObj(objId, obj, newObj);
        });
    };
    StorageOwner.prototype.close = function () {
        var _this = this;
        return (this.remoteStorage.sessionId ? this.remoteStorage.logout() : Q.when()).fin(function () {
            _this.getMidSigner = null;
            _this.remoteStorage = null;
        }).fail(function (err) {
            return;
        });
    };
    StorageOwner.prototype.wrap = function () {
        return {
            getObj: this.getObj.bind(this),
            getObjHeader: this.getObjHeader.bind(this),
            saveObj: this.saveObj.bind(this),
            close: this.close.bind(this),
            getRootKeyDerivParams: this.getRootKeyDerivParams.bind(this)
        };
    };
    return StorageOwner;
})();
Object.freeze(StorageOwner.prototype);
Object.freeze(StorageOwner);
exports.make3NStorageOwner = StorageOwner.makeAndLogin;
Object.freeze(exports);

},{"./service":7,"q":"q"}],9:[function(require,module,exports){
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
 * Everything in this module is assumed to be inside of a file system
 * reliance set.
 */
var random = require('../../random');
var nacl = require('ecma-nacl');
var utf8 = require('../../../lib-common/utf8');
var byteSrcMod = require('../../byte-source');
var SEG_SIZE = 16; // in 256-byte blocks
var FileCrypto = (function () {
    function FileCrypto(keyHolder) {
        this.keyHolder = keyHolder;
    }
    FileCrypto.prototype.wipe = function () {
        if (this.keyHolder) {
            this.keyHolder.destroy();
            this.keyHolder = null;
        }
    };
    FileCrypto.makeForNewFile = function (parentEnc, arrFactory) {
        var keyHolder = nacl.fileXSP.makeNewFileKeyHolder(parentEnc, random.bytes, arrFactory);
        parentEnc.destroy();
        var fc = new FileCrypto(keyHolder);
        return fc;
    };
    /**
     * @param parentDecr
     * @param src for the whole xsp object
     * @param arrFactory
     * @return folder crypto object with null mkey, which should be set
     * somewhere else.
     */
    FileCrypto.makeForExistingFile = function (parentDecr, headerSrc, arrFactory) {
        var promise = headerSrc.read(0, null, true).then(function (header) {
            var keyHolder = nacl.fileXSP.makeFileKeyHolder(parentDecr, header, arrFactory);
            parentDecr.destroy();
            return new FileCrypto(keyHolder);
        });
        return promise;
    };
    FileCrypto.prototype.decryptedBytesSource = function (src) {
        if (!this.keyHolder) {
            throw new Error("Cannot use wiped object.");
        }
        return byteSrcMod.makeDecryptedByteSource(src, this.keyHolder.segReader);
    };
    FileCrypto.prototype.encryptingByteSink = function (objSink) {
        if (!this.keyHolder) {
            throw new Error("Cannot use wiped object.");
        }
        return byteSrcMod.makeEncryptingByteSink(objSink, this.keyHolder.newSegWriter(SEG_SIZE, random.bytes));
    };
    FileCrypto.prototype.pack = function (bytes) {
        if (!this.keyHolder) {
            throw new Error("Cannot use wiped object.");
        }
        var segWriter = this.keyHolder.newSegWriter(SEG_SIZE, random.bytes);
        var objSrc = byteSrcMod.makeObjByteSourceFromArrays(bytes, segWriter);
        segWriter.destroy();
        return objSrc;
    };
    return FileCrypto;
})();
exports.FileCrypto = FileCrypto;
Object.freeze(FileCrypto.prototype);
Object.freeze(FileCrypto);
var FolderCrypto = (function () {
    function FolderCrypto(keyHolder) {
        this.mkey = null;
        this.arrFactory = nacl.arrays.makeFactory();
        this.keyHolder = keyHolder;
    }
    FolderCrypto.makeForNewFolder = function (parentEnc, arrFactory) {
        var keyHolder = nacl.fileXSP.makeNewFileKeyHolder(parentEnc, random.bytes, arrFactory);
        parentEnc.destroy();
        var fc = new FolderCrypto(keyHolder);
        fc.mkey = random.bytes(nacl.secret_box.KEY_LENGTH);
        return fc;
    };
    /**
     * @param parentDecr
     * @param objSrc
     * @param arrFactory
     * @return folder crypto object with null mkey, which should be set
     * somewhere else.
     */
    FolderCrypto.makeForExistingFolder = function (parentDecr, objSrc, arrFactory) {
        var keyHolder;
        var byteSrc = byteSrcMod.makeDecryptedByteSource(objSrc, function (header) {
            keyHolder = nacl.fileXSP.makeFileKeyHolder(parentDecr, header, arrFactory);
            parentDecr.destroy();
            return keyHolder.segReader(header);
        });
        return byteSrc.read(0, null, true).then(function (bytes) {
            var fc = new FolderCrypto(keyHolder);
            var folderJson = fc.setMKeyAndParseRestOfBytes(bytes);
            return { crypto: fc, folderJson: folderJson };
        });
    };
    FolderCrypto.prototype.pack = function (json) {
        if (!this.keyHolder) {
            throw new Error("Cannot use wiped object.");
        }
        var segWriter = this.keyHolder.newSegWriter(SEG_SIZE, random.bytes);
        var completeContent = [this.mkey, utf8.pack(JSON.stringify(json))];
        var objSrc = byteSrcMod.makeObjByteSourceFromArrays(completeContent, segWriter);
        segWriter.destroy();
        return objSrc;
    };
    FolderCrypto.prototype.setMKeyAndParseRestOfBytes = function (bytes) {
        if (bytes.length < nacl.secret_box.KEY_LENGTH) {
            throw new Error("Too few bytes folder object.");
        }
        var mkeyPart = bytes.subarray(0, nacl.secret_box.KEY_LENGTH);
        this.mkey = new Uint8Array(mkeyPart);
        nacl.arrays.wipe(mkeyPart);
        return JSON.parse(utf8.open(bytes.subarray(nacl.secret_box.KEY_LENGTH)));
    };
    FolderCrypto.prototype.childMasterDecr = function () {
        if (!this.mkey) {
            throw new Error("Master key is not set.");
        }
        return nacl.secret_box.formatWN.makeDecryptor(this.mkey, this.arrFactory);
    };
    FolderCrypto.prototype.childMasterEncr = function () {
        if (!this.mkey) {
            throw new Error("Master key is not set.");
        }
        return nacl.secret_box.formatWN.makeEncryptor(this.mkey, random.bytes(nacl.secret_box.NONCE_LENGTH), 1, this.arrFactory);
    };
    FolderCrypto.prototype.openAndSetFrom = function (src) {
        var _this = this;
        if (!this.keyHolder) {
            throw new Error("Cannot use wiped object.");
        }
        var byteSrc = byteSrcMod.makeDecryptedByteSource(src, this.keyHolder.segReader);
        return byteSrc.read(0, null, true).then(function (bytes) {
            return _this.setMKeyAndParseRestOfBytes(bytes);
        });
    };
    FolderCrypto.prototype.wipe = function () {
        if (this.keyHolder) {
            this.keyHolder.destroy();
            this.keyHolder = null;
        }
        if (this.mkey) {
            nacl.arrays.wipe(this.mkey);
            this.mkey = null;
        }
    };
    FolderCrypto.prototype.clone = function (arrFactory) {
        var fc = new FolderCrypto(this.keyHolder.clone(arrFactory));
        if (this.mkey) {
            fc.mkey = new Uint8Array(this.mkey);
        }
        return fc;
    };
    return FolderCrypto;
})();
exports.FolderCrypto = FolderCrypto;
Object.freeze(FolderCrypto.prototype);
Object.freeze(FolderCrypto);
Object.freeze(exports);

},{"../../../lib-common/utf8":47,"../../byte-source":23,"../../random":26,"ecma-nacl":"ecma-nacl"}],10:[function(require,module,exports){
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
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
/**
 * Everything in this module is assumed to be inside of a file system
 * reliance set, exposing to outside only folder's wrap.
 */
var fErrMod = require('../../../lib-common/file-err');
var Q = require('q');
var byteSrcMod = require('../../byte-source');
var fsCryptoMod = require('./fs-crypto');
var FSEntity = (function () {
    function FSEntity(fs, name, objId, parentId) {
        this.crypto = null;
        this.fs = fs;
        this.name = name;
        this.objId = objId;
        this.parentId = parentId;
    }
    FSEntity.prototype.pushCompleteSavingTask = function (encrObjSrc, isNew) {
        return this.fs.addSavingTask(this.objId, encrObjSrc, isNew);
    };
    return FSEntity;
})();
var File = (function (_super) {
    __extends(File, _super);
    function File(fs, name, objId, parentId) {
        _super.call(this, fs, name, objId, parentId);
        if (!name || !objId || !parentId) {
            throw new Error("Bad file parameter(s) given");
        }
        Object.seal(this);
    }
    File.prototype.readSrc = function () {
        var _this = this;
        return this.fs.storage.getObj(this.objId).then(function (objSrc) {
            return _this.crypto.decryptedBytesSource(objSrc);
        });
    };
    File.prototype.writeSink = function () {
        var pipe = new byteSrcMod.SinkBackedObjSource();
        return {
            sink: this.crypto.encryptingByteSink(pipe.sink),
            writeCompletion: this.pushCompleteSavingTask(pipe.src, false)
        };
    };
    File.prototype.save = function (bytes) {
        return this.pushCompleteSavingTask(this.crypto.pack(bytes), false);
    };
    File.prototype.saveNew = function () {
        return this.pushCompleteSavingTask(this.crypto.pack([]), true);
    };
    File.prototype.wrap = function () {
        var _this = this;
        var wrap = {
            getName: function () {
                return _this.name;
            },
            getObjId: function () {
                return _this.objId;
            },
            readSrc: this.readSrc.bind(this),
            // TODO put into fs defering logic for buffering of general sink,
            //		as simple implementation is not handling properly initially unknown
            //			writeSink: this.writeSink.bind(this),
            save: this.save.bind(this)
        };
        Object.freeze(wrap);
        return wrap;
    };
    return File;
})(FSEntity);
exports.File = File;
function makeFileJson(objId, name) {
    var f = {
        name: name,
        objId: objId
    };
    return f;
}
var EMPTY_BYTE_ARR = new Uint8Array(0);
var Folder = (function (_super) {
    __extends(Folder, _super);
    function Folder(fs, name, objId, parentId) {
        if (name === void 0) { name = null; }
        if (objId === void 0) { objId = null; }
        if (parentId === void 0) { parentId = null; }
        _super.call(this, fs, name, objId, parentId);
        this.folderJson = null;
        /**
         * files field contains only instantiated file and folder objects,
         * therefore, it should not be used to check existing names in this folder.
         */
        this.files = {};
        if (!name && (objId || parentId)) {
            throw new Error("Root folder must " + "have both objId and parent as nulls.");
        }
        else if (objId === null) {
            new Error("Missing objId for non-root folder");
        }
        Object.seal(this);
    }
    Folder.newRoot = function (fs, masterEnc) {
        var rf = new Folder(fs);
        rf.setEmptyFolderJson();
        rf.crypto = fsCryptoMod.FolderCrypto.makeForNewFolder(masterEnc, fs.arrFactory);
        rf.save(true);
        return rf;
    };
    Folder.rootFromFolder = function (fs, f) {
        if (f.parentId === null) {
            throw new Error("Given folder is already root");
        }
        var rf = new Folder(fs, f.name, f.objId, null);
        rf.setFolderJson(f.folderJson);
        rf.crypto = f.crypto.clone(fs.arrFactory);
        return rf;
    };
    Folder.rootFromObjBytes = function (fs, name, objId, src, masterDecr) {
        var rf = new Folder(fs, name, objId);
        return fsCryptoMod.FolderCrypto.makeForExistingFolder(masterDecr, src, fs.arrFactory).then(function (partsForInit) {
            rf.crypto = partsForInit.crypto;
            rf.setFolderJson(partsForInit.folderJson);
            return rf;
        });
    };
    Folder.prototype.registerInFolderJson = function (f, isFolder) {
        if (isFolder === void 0) { isFolder = false; }
        var fj = {
            name: f.name,
            objId: f.objId,
        };
        if (isFolder) {
            fj.isFolder = true;
        }
        this.folderJson.files[fj.name] = fj;
    };
    Folder.prototype.addObj = function (f) {
        this.files[f.name] = f;
        this.fs.objs[f.objId] = f;
    };
    Folder.prototype.list = function () {
        return Object.keys(this.folderJson.files);
    };
    Folder.prototype.listFolders = function () {
        var _this = this;
        return Object.keys(this.folderJson.files).filter(function (name) {
            return !!_this.folderJson.files[name].isFolder;
        });
    };
    Folder.prototype.getFileJson = function (name, nullOnMissing) {
        if (nullOnMissing === void 0) { nullOnMissing = false; }
        var fj = this.folderJson.files[name];
        if (fj) {
            return fj;
        }
        else if (nullOnMissing) {
            return null;
        }
        else {
            throw fErrMod.makeErr(fErrMod.Code.noFile, "File '" + name + "' does not exist");
        }
    };
    Folder.prototype.getFolder = function (name, nullOnMissing) {
        var _this = this;
        if (nullOnMissing === void 0) { nullOnMissing = false; }
        try {
            var childInfo = this.getFileJson(name, nullOnMissing);
            if (!childInfo) {
                return Q.when(null);
            }
            if (!childInfo.isFolder) {
                throw fErrMod.makeErr(fErrMod.Code.notDirectory, "Entry '" + name + "' in folder '" + this.name + "' is not a folder");
            }
            var child = this.files[childInfo.name];
            if (child) {
                return Q.when(child);
            }
            if (Array.isArray(childInfo.objId)) {
                throw new Error("This implementation does not support " + "folders, spread over several objects.");
            }
            var promise = this.fs.storage.getObj(childInfo.objId).then(function (src) {
                return fsCryptoMod.FolderCrypto.makeForExistingFolder(_this.crypto.childMasterDecr(), src, _this.fs.arrFactory);
            }).then(function (partsForInit) {
                var f = new Folder(_this.fs, childInfo.name, childInfo.objId, _this.objId);
                f.crypto = partsForInit.crypto;
                f.setFolderJson(partsForInit.folderJson);
                _this.addObj(f);
                return f;
            });
            return promise;
        }
        catch (err) {
            return Q.reject(err);
        }
    };
    Folder.prototype.getFile = function (name, nullOnMissing) {
        var _this = this;
        if (nullOnMissing === void 0) { nullOnMissing = false; }
        try {
            var childInfo = this.getFileJson(name, nullOnMissing);
            if (!childInfo) {
                return Q.when(null);
            }
            if (childInfo.isFolder) {
                throw fErrMod.makeErr(fErrMod.Code.isDirectory, "Entry '" + name + "' in folder '" + this.name + "' is not a file");
            }
            var child = this.files[name];
            if (child) {
                return Q.when(child);
            }
            if (Array.isArray(childInfo.objId)) {
                throw new Error("This implementation does not support " + "files, spread over several objects.");
            }
            var promise = this.fs.storage.getObjHeader(childInfo.objId).then(function (headerSrc) {
                return fsCryptoMod.FileCrypto.makeForExistingFile(_this.crypto.childMasterDecr(), headerSrc, _this.fs.arrFactory);
            }).then(function (fc) {
                var f = new File(_this.fs, name, childInfo.objId, _this.objId);
                f.crypto = fc;
                _this.addObj(f);
                return f;
            });
            return promise;
        }
        catch (err) {
            return Q.reject(err);
        }
    };
    Folder.prototype.createFolder = function (name) {
        if (this.getFileJson(name, true)) {
            throw fErrMod.makeErr(fErrMod.Code.fileExists, "File '" + name + "' alread exists");
        }
        var f = new Folder(this.fs, name, this.fs.generateNewObjId(), this.objId);
        f.setEmptyFolderJson();
        f.crypto = fsCryptoMod.FolderCrypto.makeForNewFolder(this.crypto.childMasterEncr(), this.fs.arrFactory);
        this.registerInFolderJson(f, true);
        this.addObj(f);
        f.save(true);
        this.save();
        return f;
    };
    Folder.prototype.createFile = function (name) {
        if (this.getFileJson(name, true)) {
            throw fErrMod.makeErr(fErrMod.Code.fileExists, "File '" + name + "' alread exists");
        }
        var f = new File(this.fs, name, this.fs.generateNewObjId(), this.objId);
        f.crypto = fsCryptoMod.FileCrypto.makeForNewFile(this.crypto.childMasterEncr(), this.fs.arrFactory);
        this.registerInFolderJson(f);
        this.addObj(f);
        f.saveNew();
        this.save();
        return f;
    };
    Folder.prototype.getFolderInThisSubTree = function (path, createIfMissing) {
        var _this = this;
        if (path.length === 0) {
            return Q.when(this);
        }
        var promise = this.getFolder(path[0]).fail(function (err) {
            if (err.code !== fErrMod.Code.noFile) {
                throw err;
            }
            if (!createIfMissing) {
                throw err;
            }
            return _this.createFolder(path[0]);
        }).then(function (f) {
            if (path.length > 1) {
                return f.getFolderInThisSubTree(path.slice(1), createIfMissing);
            }
            else {
                return f;
            }
        });
        return promise;
    };
    Folder.prototype.save = function (isNew) {
        if (isNew === void 0) { isNew = false; }
        return this.pushCompleteSavingTask(this.crypto.pack(this.folderJson), isNew);
    };
    Folder.prototype.setEmptyFolderJson = function () {
        this.folderJson = {
            files: {}
        };
    };
    Folder.prototype.setFolderJson = function (folderJson) {
        // TODO sanitize folderJson before using it
        this.folderJson = folderJson;
    };
    Folder.prototype.update = function (encrSrc) {
        var _this = this;
        return this.fs.storage.getObj(this.objId).then(function (src) {
            return _this.crypto.openAndSetFrom(src);
        }).then(function (folderJson) {
            _this.setFolderJson(folderJson);
        });
    };
    Folder.prototype.wrap = function () {
        var _this = this;
        var wrap = {
            getName: function () {
                return _this.name;
            },
            getObjId: function () {
                return _this.objId;
            },
            list: this.list.bind(this),
            listFolders: this.listFolders.bind(this),
            getFolderInThisSubTree: function (path, createIfMissing) {
                if (createIfMissing === void 0) { createIfMissing = false; }
                return _this.getFolderInThisSubTree(path, createIfMissing).then(function (f) {
                    return f.wrap();
                });
            },
            getFolder: function (name, nullOnMissing) {
                if (nullOnMissing === void 0) { nullOnMissing = false; }
                return _this.getFolder(name, nullOnMissing).then(function (f) {
                    return (f ? f.wrap() : null);
                });
            },
            createFolder: function (name) {
                return _this.createFolder(name).wrap();
            },
            getFile: function (name, nullOnMissing) {
                if (nullOnMissing === void 0) { nullOnMissing = false; }
                return _this.getFile(name, nullOnMissing).then(function (f) {
                    return (f ? f.wrap() : null);
                });
            },
            createFile: function (name) {
                return _this.createFile(name).wrap();
            }
        };
        Object.freeze(wrap);
        return wrap;
    };
    return Folder;
})(FSEntity);
exports.Folder = Folder;
Object.freeze(Folder.prototype);
Object.freeze(Folder);
Object.freeze(exports);

},{"../../../lib-common/file-err":36,"../../byte-source":23,"./fs-crypto":9,"q":"q"}],11:[function(require,module,exports){
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
var folderMod = require('./fs-entities');
var random = require('../../random');
var Q = require('q');
var nacl = require('ecma-nacl');
var OBJID_LEN = 40;
exports.sysFolders = {
    appData: 'Apps Data',
    userFiles: 'User Files'
};
Object.freeze(exports.sysFolders);
var FS = (function () {
    function FS(storage) {
        this.arrFactory = nacl.arrays.makeFactory();
        this.objs = {};
        this.savingProc = null;
        this.root = null;
        this.isSubRoot = true;
        this.objsToSave = { ordered: [], byId: {} };
        this.storage = storage;
        Object.seal(this);
    }
    FS.prototype.getSavingProc = function () {
        return this.savingProc;
    };
    /**
     * @return new objId, with null placed under this id, reserving it in
     * objs map.
     */
    FS.prototype.generateNewObjId = function () {
        var id = random.stringOfB64UrlSafeChars(OBJID_LEN);
        if ('undefined' === typeof this.objs[id]) {
            this.objs[id] = null;
            return id;
        }
        else {
            return this.generateNewObjId();
        }
    };
    FS.prototype.setRoot = function (root) {
        if (this.root) {
            throw new Error("Root is already set.");
        }
        this.root = root;
        if ('string' === typeof root.objId) {
            this.objs[root.objId] = root;
        }
    };
    FS.prototype.makeSubRoot = function (f) {
        var fs = new FS(this.storage);
        var folder = this.objs[f.getObjId()];
        fs.setRoot(folderMod.Folder.rootFromFolder(fs, folder));
        fs.isSubRoot = true;
        return fs.wrap();
    };
    FS.makeNewRoot = function (storage, masterEnc) {
        var fs = new FS(storage);
        fs.setRoot(folderMod.Folder.newRoot(fs, masterEnc));
        fs.root.createFolder(exports.sysFolders.appData);
        fs.root.createFolder(exports.sysFolders.userFiles);
        return fs.wrap();
    };
    FS.makeExisting = function (storage, rootObjId, masterDecr, rootName) {
        if (rootName === void 0) { rootName = null; }
        var fs = new FS(storage);
        var promise = storage.getObj(rootObjId).then(function (objSrc) {
            return folderMod.Folder.rootFromObjBytes(fs, rootName, rootObjId, objSrc, masterDecr);
        }).then(function (root) {
            fs.setRoot(root);
            return fs.wrap();
        });
        return promise;
    };
    FS.prototype.doSavingIteratively = function () {
        var _this = this;
        var task = this.objsToSave.ordered.shift();
        if (!task) {
            this.savingProc = null;
            return;
        }
        delete this.objsToSave.byId[task.objId];
        return this.storage.saveObj(task.objId, task.encrObjSrc, task.newObj).then(function () {
            task.deferredSaving.resolve();
            return _this.doSavingIteratively();
        }, function (err) {
            task.deferredSaving.reject(err);
            return task.deferredSaving.promise;
        });
    };
    FS.prototype.flush = function () {
        var _this = this;
        if (this.savingProc) {
            return;
        }
        if (this.objsToSave.ordered.length === 0) {
            return;
        }
        this.savingProc = Q.when().then(function () {
            return _this.doSavingIteratively();
        }).fail(function (err) {
            _this.savingProc = null;
            throw err;
        });
    };
    FS.prototype.close = function (closeStorage) {
        var _this = this;
        if (closeStorage === void 0) { closeStorage = true; }
        this.flush();
        this.savingProc = (this.savingProc ? this.savingProc : Q.when()).then(function () {
            // TODO add destroing of obj's (en)decryptors
            if (!closeStorage) {
                return;
            }
            return _this.storage.close();
        }).then(function () {
            _this.root = null;
            _this.storage = null;
            _this.objs = null;
            _this.objsToSave = null;
            _this.savingProc = null;
        });
        return this.savingProc;
    };
    FS.prototype.addSavingTask = function (objId, encrObjSrc, isNew) {
        var task = this.objsToSave.byId[objId];
        if (task) {
            if (!task.newObj && isNew) {
                throw new Error("Illegal indication " + "of new file, for an already existing one.");
            }
            // we fast resolve existing task's deferred, as write has not
            // started, since task can still be found in above container,
            // and we replace source with a new one, and set new deferred
            task.encrObjSrc = encrObjSrc;
            task.deferredSaving.resolve();
            task.deferredSaving = Q.defer();
        }
        else {
            task = {
                objId: objId,
                encrObjSrc: encrObjSrc,
                newObj: isNew,
                deferredSaving: Q.defer()
            };
            this.objsToSave.byId[task.objId] = task;
            this.objsToSave.ordered.push(task);
        }
        this.flush();
        return task.deferredSaving.promise;
    };
    FS.prototype.getRoot = function () {
        return this.root.wrap();
    };
    FS.prototype.changeObjId = function (obj, newId) {
        throw new Error("Not implemented, yet");
    };
    FS.prototype.move = function (destFolder, newName) {
        throw new Error("Not implemented, yet");
    };
    FS.prototype.wrap = function () {
        var wrap = {
            getRoot: this.getRoot.bind(this),
            flush: this.flush.bind(this),
            close: this.close.bind(this),
            getSavingProc: this.getSavingProc.bind(this),
            makeSubRoot: this.makeSubRoot.bind(this)
        };
        Object.freeze(wrap);
        return wrap;
    };
    return FS;
})();
exports.FS = FS;
Object.freeze(FS.prototype);
Object.freeze(FS);
Object.freeze(exports);

},{"../../random":26,"./fs-entities":10,"ecma-nacl":"ecma-nacl","q":"q"}],12:[function(require,module,exports){
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
var fsMod = require('./fs');
exports.sysFolders = fsMod.sysFolders;
exports.makeNewRoot = fsMod.FS.makeNewRoot;
exports.makeExisting = fsMod.FS.makeExisting;
Object.freeze(exports);

},{"./fs":11}],13:[function(require,module,exports){
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
 * This file contains common functions used by parts of a keyring.
 */
var nacl = require('ecma-nacl');
var base64 = require('../../../lib-common/base64');
var random = require('../../random');
exports.KID_LENGTH = 16;
exports.PID_LENGTH = 4;
exports.KEY_USE = {
    PUBLIC: 'asmail-pub-key',
    SECRET: 'asmail-sec-key',
    SYMMETRIC: 'asmail-sym-key'
};
Object.freeze(exports.KEY_USE);
exports.KEY_ROLE = {
    SUGGESTED: 'suggested',
    IN_USE: 'in_use',
    OLD: 'old',
    PUBLISHED_INTRO: 'published_intro',
    PREVIOUSLY_PUBLISHED_INTRO: 'prev_published_intro',
    INTRODUCTORY: 'introductory'
};
Object.freeze(exports.KEY_ROLE);
/**
 * @return an object with two fields: skey & pkey, holding JWK form of secret and
 * public keys respectively.
 * These are to be used with NaCl's box (Curve+XSalsa+Poly encryption).
 * Key ids are the same in this intimate pair.
 */
function generateKeyPair() {
    var skeyBytes = random.bytes(nacl.box.KEY_LENGTH);
    var pkeyBytes = nacl.box.generate_pubkey(skeyBytes);
    var kid = random.stringOfB64Chars(exports.KID_LENGTH);
    var alg = nacl.box.JWK_ALG_NAME;
    var skey = {
        use: exports.KEY_USE.SECRET,
        alg: alg,
        kid: kid,
        k: base64.pack(skeyBytes),
    };
    var pkey = {
        use: exports.KEY_USE.PUBLIC,
        alg: alg,
        kid: kid,
        k: base64.pack(pkeyBytes)
    };
    return { skey: skey, pkey: pkey };
}
exports.generateKeyPair = generateKeyPair;
;
/**
 * We have this function for future use by a keyring, that takes symmetric key.
 * This keyring, is specifically tailored to handle short-lived public keys.
 * Therefore, this function is not used at the moment.
 * @return a JWK form of a key for NaCl's secret box (XSalsa+Poly encryption).
 */
function generateSymmetricKey() {
    return {
        use: exports.KEY_USE.SYMMETRIC,
        k: base64.pack(random.bytes(nacl.secret_box.KEY_LENGTH)),
        alg: nacl.secret_box.JWK_ALG_NAME,
        kid: random.stringOfB64Chars(exports.KID_LENGTH)
    };
}
exports.generateSymmetricKey = generateSymmetricKey;
;
function getKeyBytesFrom(key, use, alg, klen) {
    if (key.use === use) {
        if (key.alg === alg) {
            var bytes = base64.open(key.k);
            if (bytes.length !== klen) {
                throw new Error("Key " + key.kid + " has a wrong number of bytes");
            }
            return bytes;
        }
        else {
            throw new Error("Key " + key.kid + ", should be used with unsupported algorithm '" + key.alg + "'");
        }
    }
    else {
        throw new Error("Key " + key.kid + " has incorrect use '" + key.use + "', instead of '" + use + "'");
    }
}
/**
 * This extracts bytes from a given secret key's JWK form
 * @param key is a JWK form of a key
 * @return Uint8Array with key's bytes.
 */
function extractSKeyBytes(key) {
    return getKeyBytesFrom(key, exports.KEY_USE.SECRET, nacl.box.JWK_ALG_NAME, nacl.box.KEY_LENGTH);
}
exports.extractSKeyBytes = extractSKeyBytes;
/**
 * This extracts bytes from a given public key's JWK form
 * @param key is a JWK form of a key
 * @return Uint8Array with key's bytes.
 */
function extractPKeyBytes(key) {
    return getKeyBytesFrom(key, exports.KEY_USE.PUBLIC, nacl.box.JWK_ALG_NAME, nacl.box.KEY_LENGTH);
}
exports.extractPKeyBytes = extractPKeyBytes;
/**
 * This extracts bytes from a given public key's short JWK form
 * @param key is a short JWK form of a key
 * @return Uint8Array with key's bytes.
 */
function extractKeyBytes(key) {
    var bytes = base64.open(key.k);
    if (bytes.length !== nacl.box.KEY_LENGTH) {
        throw new Error("Key " + key.kid + " has a wrong number of bytes");
    }
    return bytes;
}
exports.extractKeyBytes = extractKeyBytes;
///**
// * This puts named fields from a given data into a given object.
// * @param obj
// * @param fieldNames
// * @param data
// */
//export function loadFieldsFromData(
//		obj: any, fieldNames: string[], data: any): void {
//	fieldNames.forEach((fieldName) => {
//		if ('undefined' === typeof data[fieldName]) { throw new Error(
//				"Given data is missing field '"+fieldName+"'"); }
//		obj[fieldName] = data[fieldName];
//	});
//}
//
///**
// * @param obj
// * @param fieldNames
// * @returns an object ready for serialization, with named fields, taken from
// * a given object.
// */
//export function collectFieldsForSerialization(
//		obj: any, fieldNames: string[]): any {
//	var data = {};
//	fieldNames.forEach((fieldName) => {
//		if ('undefined' === typeof obj[fieldName]) { throw new Error(
//				"Given object is missing field '"+fieldName+"'"); }
//		data[fieldName] = obj[fieldName];
//	});
//	return data;
//}
Object.freeze(exports);

},{"../../../lib-common/base64":35,"../../random":26,"ecma-nacl":"ecma-nacl"}],14:[function(require,module,exports){
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
 * This file contains functionality, used inside keyring.
 */
var util = require('./common');
var random = require('../../random');
function generatePids() {
    var pids = [];
    for (var i = 0; i < 5; i += 1) {
        pids[i] = random.stringOfB64Chars(util.PID_LENGTH);
    }
    return pids;
}
var CorrespondentKeys = (function () {
    /**
     * @param kring in which these keys are hanging.
     * @param address of this correspondent.
     * Either an address should be null, or serialData.
     * @param serialData from which this object should be reconstructed.
     * Either serialData should be null, or an address.
     */
    function CorrespondentKeys(kring, address, serialData) {
        this.keys = null;
        this.keyring = kring;
        if (address) {
            this.keys = {
                correspondent: address,
                inviteForSending: null,
                introKey: null,
                sendingPair: null,
                sendingPairTS: 0,
                receptionPairs: {
                    suggested: null,
                    inUse: null,
                    old: null
                }
            };
        }
        else {
            var data = JSON.parse(serialData);
            // TODO checks of deserialized json data
            this.keys = data;
        }
        Object.seal(this);
    }
    Object.defineProperty(CorrespondentKeys.prototype, "correspondent", {
        get: function () {
            return this.keys.correspondent;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(CorrespondentKeys.prototype, "invite", {
        get: function () {
            return this.keys.inviteForSending;
        },
        set: function (invite) {
            this.keys.inviteForSending = invite;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * This attaches all keys into ring's maps.
     * Theis method should be called only once, and only on a deserialized
     * object.
     */
    CorrespondentKeys.prototype.mapAllKeysIntoRing = function () {
        var _this = this;
        // index correspondent's key
        if (this.keys.introKey) {
            this.keyring.introKeyIdToEmailMap.addPair(this.keys.introKey.kid, this.correspondent);
        }
        // index key pairs
        var pairs = [this.keys.receptionPairs.suggested, this.keys.receptionPairs.inUse, this.keys.receptionPairs.old];
        var email = this.correspondent;
        pairs.forEach(function (pair) {
            if (!pair) {
                return;
            }
            pair.pids.forEach(function (pid) {
                _this.keyring.pairIdToEmailMap.addPair(pid, email);
            });
        });
    };
    /**
     * @return json object for serialization.
     */
    CorrespondentKeys.prototype.serialForm = function () {
        return JSON.stringify(this.keys);
    };
    /**
     * Correctly remove previous key and attaches a new correspondent's
     * introductory public key, performing keyring's update and save.
     * @param pkey
     * @param invite
     * correspondent's mail server.
     */
    CorrespondentKeys.prototype.setIntroKey = function (pkey, invite) {
        try {
            util.extractPKeyBytes(pkey);
        }
        catch (err) {
            throw new Error("Given public key cannot be used:\n" + err.message);
        }
        // remove existing key, if there is one, from keyring's index
        if (this.keys.introKey) {
            this.keyring.introKeyIdToEmailMap.removePair(this.keys.introKey.kid, this.correspondent);
        }
        this.keys.introKey = pkey;
        // add new key to keyring's index
        this.keyring.introKeyIdToEmailMap.addPair(this.keys.introKey.kid, this.correspondent);
        this.keys.inviteForSending = invite;
    };
    /**
     * This function generates new suggested reception pair, but only if there
     * is currently none.
     * If there is previous suggested pair, it shall be returned.
     * @param invitation is an invitation string, for use with a new key pair.
     * It can be null. When null, new chain of pairs shall start without a token,
     * while existing one will use whatever token has been used already (if any).
     * @return reception pair, which should be suggested to correspondent.
     */
    CorrespondentKeys.prototype.suggestPair = function (invitation) {
        var nextKeyPair;
        if (this.keys.receptionPairs.suggested) {
            var suggPair = this.keys.receptionPairs.suggested;
            nextKeyPair = {
                pids: suggPair.pids,
                senderKid: suggPair.senderPKey.kid,
                recipientPKey: suggPair.recipientKey.pkey
            };
            if (invitation) {
                nextKeyPair.invitation = invitation;
            }
            else if (suggPair.invitation) {
                nextKeyPair.invitation = suggPair.invitation;
            }
            return nextKeyPair;
        }
        if (!this.keys.sendingPair) {
            throw new Error("Sending pair should be set before calling this function.");
        }
        var corrPKey = this.keys.sendingPair.recipientPKey;
        var pair = {
            pids: generatePids(),
            recipientKey: util.generateKeyPair(),
            senderPKey: corrPKey
        };
        if (invitation) {
            pair.invitation = invitation;
        }
        this.keys.receptionPairs.suggested = pair;
        // add pair to index
        this.keyring.pairIdToEmailMap.addPairs(pair.pids, this.correspondent);
        this.keyring.saveChanges();
        nextKeyPair = {
            pids: pair.pids,
            senderKid: pair.senderPKey.kid,
            recipientPKey: pair.recipientKey.pkey
        };
        if (pair.invitation) {
            nextKeyPair.invitation = pair.invitation;
        }
        return nextKeyPair;
    };
    /**
     * This marks suggested reception pair as being in use, if it has the same
     * id as a given pid.
     * Otherwise, nothing happens.
     * Suggested pair is moved into category in-use, while in-use pair is
     * reclassified as old.
     * @param pid
     */
    CorrespondentKeys.prototype.markPairAsInUse = function (pid) {
        var _this = this;
        if (!this.keys.receptionPairs.suggested || (this.keys.receptionPairs.suggested.pids.indexOf(pid) < 0)) {
            return;
        }
        var mp = this.keys.receptionPairs.inUse;
        this.keys.receptionPairs.inUse = this.keys.receptionPairs.suggested;
        if (mp) {
            var dp = this.keys.receptionPairs.old;
            this.keys.receptionPairs.old = mp;
            if (dp) {
                dp.pids.forEach(function (pid) {
                    _this.keyring.pairIdToEmailMap.removePair(pid, _this.correspondent);
                });
            }
        }
    };
    /**
     * This function is used internally in this.setSendingPair(p) function.
     * @param kid
     * @return a key for receiving, corresponding to given key id.
     */
    CorrespondentKeys.prototype.findReceptionKey = function (kid) {
        for (var fieldName in this.keys.receptionPairs) {
            var rp = this.keys.receptionPairs[fieldName];
            if (!rp) {
                continue;
            }
            if (rp.recipientKey.skey.kid === kid) {
                return rp.recipientKey;
            }
        }
        var keyInfo = this.keyring.introKeys.findKey(kid);
        if (keyInfo) {
            return keyInfo.pair;
        }
        else {
            var err = new Error("Key cannot be found");
            err.unknownKid = true;
            throw err;
        }
    };
    /**
     * This checks given pair and sets a new sending pair.
     * @param pair
     * @param timestamp
     */
    CorrespondentKeys.prototype.setSendingPair = function (pair, timestamp) {
        if (this.keys.sendingPairTS >= timestamp) {
            return;
        }
        var senderKey = this.findReceptionKey(pair.senderKid);
        try {
            util.extractKeyBytes(pair.recipientPKey);
        }
        catch (err) {
            throw new Error("Public key in a given pair cannot be used:\n" + err.message);
        }
        this.keys.sendingPair = {
            pids: pair.pids,
            recipientPKey: pair.recipientPKey,
            senderKey: senderKey
        };
        if (pair.invitation) {
            this.keys.inviteForSending = pair.invitation;
        }
        this.keys.sendingPairTS = timestamp;
    };
    /**
     * @param pid
     * @return pair for receiving messages and a role of a given pair.
     * Undefined is returned when no pair were found.
     */
    CorrespondentKeys.prototype.getReceivingPair = function (pid) {
        var pairs = this.keys.receptionPairs;
        if (pairs.suggested && (pairs.suggested.pids.indexOf(pid) >= 0)) {
            return {
                pair: pairs.suggested,
                role: util.KEY_ROLE.SUGGESTED
            };
        }
        else if (pairs.inUse && (pairs.inUse.pids.indexOf(pid) >= 0)) {
            return {
                pair: pairs.inUse,
                role: util.KEY_ROLE.IN_USE
            };
        }
        else if (pairs.old && (pairs.old.pids.indexOf(pid) >= 0)) {
            return {
                pair: pairs.old,
                role: util.KEY_ROLE.OLD
            };
        }
        return; // explicit return of undefined
    };
    /**
     * @param corrIntroKey is a correspondent's intro key, required, when there
     * is no introKey.
     * @return existing sending pair, or generates a new one.
     */
    CorrespondentKeys.prototype.getSendingPair = function (corrIntroKey) {
        if (corrIntroKey === void 0) { corrIntroKey = null; }
        if (this.keys.sendingPair) {
            return this.keys.sendingPair;
        }
        var senderKey = util.generateKeyPair();
        var recipientPKey = (corrIntroKey ? corrIntroKey : this.keys.introKey);
        if (!recipientPKey) {
            throw new Error("Introductory key for " + this.correspondent + " is neither given, nor present in the ring.");
        }
        this.keys.sendingPair = {
            pids: generatePids(),
            recipientPKey: recipientPKey,
            senderKey: senderKey,
            isSelfGenerated: true
        };
        this.keyring.saveChanges();
        return this.keys.sendingPair;
    };
    return CorrespondentKeys;
})();
exports.CorrespondentKeys = CorrespondentKeys;
Object.freeze(CorrespondentKeys.prototype);
Object.freeze(CorrespondentKeys);
Object.freeze(exports);

},{"../../random":26,"./common":13}],15:[function(require,module,exports){
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
 * This is a one-to-many, one way map from string ids to string emails.
 */
var IdToEmailMap = (function () {
    function IdToEmailMap(kring) {
        this.idToEmail = {};
        this.keyring = kring;
        Object.seal(this);
    }
    /**
     * @param id
     * @return undefined, if id is not known, or string with email, if there is one
     * email registered for a given id, or an array of string emails, if more than
     * one email registered for a given id.
     */
    IdToEmailMap.prototype.getEmails = function (id) {
        var emails = this.idToEmail[id];
        if (emails) {
            return emails;
        }
        if (Array.isArray(emails)) {
            return emails.concat([]);
        }
        return; // undefined in explicit statement
    };
    /**
     * @param id
     * @param email
     * @return true, if given id-email pair is successfully registered,
     * and false, if such registration already existed.
     */
    IdToEmailMap.prototype.addPair = function (id, email) {
        var emails = this.idToEmail[id];
        if (emails) {
            if (emails.indexOf(email) >= 0) {
                return false;
            }
            emails.push(email);
        }
        else {
            this.idToEmail[id] = [email];
        }
        return true;
    };
    /**
     * @param ids is an array of string ids, associated with a given email
     * @param email
     */
    IdToEmailMap.prototype.addPairs = function (ids, email) {
        for (var i = 0; i < ids.length; i += 1) {
            this.addPair(ids[i], email);
        }
    };
    /**
     * This removes given id-email pair.
     * @param id
     * @param email
     * @return true, if pair was found and removed, and false, otherwise.
     */
    IdToEmailMap.prototype.removePair = function (id, email) {
        var emails = this.idToEmail[id];
        if (!emails) {
            return false;
        }
        var emailInd = emails.indexOf(email);
        if (emailInd < 0) {
            return false;
        }
        if (emails.length === 0) {
            delete this.idToEmail[id];
        }
        else {
            emails = emails.slice(0, emailInd).concat(emails.slice(emailInd + 1));
        }
        return true;
    };
    IdToEmailMap.prototype.removePairs = function (ids, email) {
        for (var i = 0; i < ids.length; i += 1) {
            this.removePair(ids[i], email);
        }
    };
    return IdToEmailMap;
})();
exports.IdToEmailMap = IdToEmailMap;
Object.freeze(IdToEmailMap);
Object.freeze(IdToEmailMap.prototype);
Object.freeze(exports);

},{}],16:[function(require,module,exports){
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
var util = require('./common');
var ringMod = require('./ring');
/**
 * @return an wrap around newly created key ring object.
 */
function makeKeyRing() {
    return (new ringMod.Ring()).wrap();
}
exports.makeKeyRing = makeKeyRing;
exports.KEY_USE = util.KEY_USE;
exports.KEY_ROLE = util.KEY_ROLE;
Object.freeze(exports);

},{"./common":13,"./ring":18}],17:[function(require,module,exports){
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
 * This file contains functionality, used inside keyring.
 */
var util = require('./common');
var KEY_ROLE = util.KEY_ROLE;
var INTRO_KEY_VALIDITY = 31 * 24 * 60 * 60;
/**
 * This is a container of key pairs that are used as introductory keys, either
 * published, or not.
 */
var IntroKeysContainer = (function () {
    /**
     * @param kring is a keyring object
     * @param data is an optional object, from which data should be loaded.
     */
    function IntroKeysContainer(kring, serialForm) {
        if (serialForm === void 0) { serialForm = null; }
        this.keyring = kring;
        if (serialForm) {
            var data = JSON.parse(serialForm);
            // TODO checks of deserialized json data
            this.keys = data;
        }
        else {
            this.keys = {
                publishedKey: null,
                publishedKeyCerts: null,
                retiredPublishedKey: null,
                otherIntroKeys: {}
            };
        }
    }
    Object.defineProperty(IntroKeysContainer.prototype, "publishedKeyCerts", {
        get: function () {
            return this.keys.publishedKeyCerts;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * @return json object for serialization.
     */
    IntroKeysContainer.prototype.serialForm = function () {
        return JSON.stringify(this.keys);
    };
    /**
     * This generates a new NaCl's box key pair, as a new introductory
     * published key.
     */
    IntroKeysContainer.prototype.updatePublishedKey = function (signer) {
        var pair = util.generateKeyPair();
        pair.createdAt = Date.now();
        if (this.keys.publishedKey) {
            this.keys.publishedKey.retiredAt = pair.createdAt;
            this.keys.retiredPublishedKey = this.keys.publishedKey;
        }
        this.keys.publishedKey = pair;
        this.keys.publishedKeyCerts = {
            pkeyCert: signer.certifyPublicKey(this.keys.publishedKey.pkey, INTRO_KEY_VALIDITY),
            userCert: signer.userCert,
            provCert: signer.providerCert
        };
    };
    /**
     * @param kid
     * @return if key is found, object with following fields is returned:
     *         (a) pair is JWK key pair;
     *         (b) role with a value from KEY_ROLE;
     *         (c) replacedAt field comes for KEY_ROLE.PREVIOUSLY_PUBLISHED_INTRO
     *             keys, telling, in milliseconds, when this key was superseded in
     *             use by a newer one;
     *         Undefined is returned, when a key is not found.
     */
    IntroKeysContainer.prototype.findKey = function (kid) {
        // check published key
        var key = this.keys.publishedKey;
        if (key && (key.skey.kid === kid)) {
            return {
                role: KEY_ROLE.PUBLISHED_INTRO,
                pair: key
            };
        }
        // check retired published key
        key = this.keys.retiredPublishedKey;
        if (key && (key.skey.kid === kid)) {
            return {
                role: KEY_ROLE.PREVIOUSLY_PUBLISHED_INTRO,
                pair: key,
                replacedAt: key.retiredAt
            };
        }
        // check other unpublished introductory keys
        key = this.keys.otherIntroKeys[kid];
        if (key) {
            return {
                role: KEY_ROLE.INTRODUCTORY,
                pair: key
            };
        }
        // if nothing found return undefined
        return;
    };
    return IntroKeysContainer;
})();
exports.IntroKeysContainer = IntroKeysContainer;
Object.freeze(IntroKeysContainer);
Object.freeze(IntroKeysContainer.prototype);
Object.freeze(exports);

},{"./common":13}],18:[function(require,module,exports){
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
 * This file defines a ring, which must be wrapped, when it is exposed
 * outside of keyring's reliance set.
 */
var introKeys = require('./intro-keys');
var corrKeysMod = require('./correspondent-keys');
var emailMap = require('./id-to-email-map');
var util = require('./common');
var nacl = require('ecma-nacl');
var random = require('../../random');
/**
 * This is a list of all serializable fields from Ring.
 */
var dataFields = ['corrKeys', 'introKeys'];
function makeSendingEncryptor(senderPair) {
    var skey = util.extractSKeyBytes(senderPair.senderKey.skey);
    var pkey = util.extractKeyBytes(senderPair.recipientPKey);
    var nextNonce = random.bytes(nacl.box.NONCE_LENGTH);
    return nacl.box.formatWN.makeEncryptor(pkey, skey, nextNonce);
}
function makeReceivingDecryptor(pkeyJW, skeyJW) {
    var skey = util.extractSKeyBytes(skeyJW);
    var pkey = util.extractKeyBytes(pkeyJW);
    return nacl.box.formatWN.makeDecryptor(pkey, skey);
}
function selectPid(pids) {
    if (pids.length < 1) {
        throw new Error("There are no pair ids in array.");
    }
    var i = Math.round((pids.length - 1) * random.uint8() / 255);
    return pids[i];
}
var Ring = (function () {
    function Ring() {
        this.introKeys = null;
        this.corrKeys = {};
        this.introKeyIdToEmailMap = new emailMap.IdToEmailMap(this);
        this.pairIdToEmailMap = new emailMap.IdToEmailMap(this);
        this.storage = null;
        Object.seal(this);
    }
    Ring.prototype.addCorrespondent = function (address, serialForm) {
        if (serialForm === void 0) { serialForm = null; }
        var ck = (serialForm ? new corrKeysMod.CorrespondentKeys(this, null, serialForm) : new corrKeysMod.CorrespondentKeys(this, address, null));
        if (this.corrKeys[ck.correspondent]) {
            throw new Error("Correspondent with address " + ck.correspondent + " is already present.");
        }
        this.corrKeys[ck.correspondent] = ck;
        if (serialForm) {
            ck.mapAllKeysIntoRing();
        }
        return ck;
    };
    Ring.prototype.init = function (storage) {
        var _this = this;
        if (this.storage) {
            throw new Error("Keyring has already been initialized.");
        }
        this.storage = storage;
        var promise = this.storage.load().then(function (serialForm) {
            if (serialForm) {
                var json = JSON.parse(serialForm);
                // TODO check json's fields
                // init data
                _this.introKeys = new introKeys.IntroKeysContainer(_this, json.introKeys);
                json.corrKeys.forEach(function (info) {
                    _this.addCorrespondent(null, info);
                });
            }
            else {
                _this.introKeys = new introKeys.IntroKeysContainer(_this);
                // save initial file, as there was none initially
                _this.saveChanges();
            }
        });
        return promise;
    };
    Ring.prototype.saveChanges = function () {
        // pack bytes that need to be encrypted and saved
        var dataToSave = {
            introKeys: this.introKeys.serialForm(),
            corrKeys: []
        };
        for (var email in this.corrKeys) {
            dataToSave.corrKeys.push(this.corrKeys[email].serialForm());
        }
        // trigger saving utility
        return this.storage.save(JSON.stringify(dataToSave));
    };
    Ring.prototype.updatePublishedKey = function (signer) {
        this.introKeys.updatePublishedKey(signer);
        this.saveChanges();
    };
    Ring.prototype.getPublishedKeyCerts = function () {
        if (this.introKeys.publishedKeyCerts) {
            return this.introKeys.publishedKeyCerts;
        }
        return; // undefined
    };
    Ring.prototype.isKnownCorrespondent = function (address) {
        return (!!this.corrKeys[address]);
    };
    Ring.prototype.setCorrepondentTrustedIntroKey = function (address, pkey, invite) {
        if (invite === void 0) { invite = null; }
        var ck = this.corrKeys[address];
        if (!ck) {
            ck = this.addCorrespondent(address);
        }
        ck.setIntroKey(pkey, invite);
        this.saveChanges();
    };
    Ring.prototype.absorbSuggestedNextKeyPair = function (correspondent, pair, timestamp) {
        var ck = this.corrKeys[correspondent];
        if (!ck) {
            ck = this.addCorrespondent(correspondent);
        }
        ck.setSendingPair(pair, timestamp);
        this.saveChanges();
    };
    Ring.prototype.getInviteForSendingTo = function (correspondent) {
        var ck = this.corrKeys[correspondent];
        return (ck ? ck.invite : null);
    };
    Ring.prototype.markPairAsInUse = function (correspondent, pid) {
        this.corrKeys[correspondent].markPairAsInUse(pid);
        this.saveChanges();
    };
    Ring.prototype.generateKeysForSendingTo = function (address, invitation, introPKeyFromServer) {
        if (invitation === void 0) { invitation = null; }
        if (introPKeyFromServer === void 0) { introPKeyFromServer = null; }
        var ck = this.corrKeys[address];
        var sendingPair;
        if (ck) {
            sendingPair = ck.getSendingPair();
        }
        else if (introPKeyFromServer) {
            ck = this.addCorrespondent(address);
            sendingPair = ck.getSendingPair(introPKeyFromServer);
        }
        else {
            throw new Error("There are no known keys for given address " + address + " and a key from a mail server is not given either.");
        }
        var encryptor = makeSendingEncryptor(sendingPair);
        var suggestPair = ck.suggestPair(invitation);
        var currentPair;
        if (sendingPair.isSelfGenerated) {
            currentPair = {
                senderPKey: sendingPair.senderKey.pkey,
                recipientKid: sendingPair.recipientPKey.kid
            };
        }
        else {
            currentPair = { pid: selectPid(sendingPair.pids) };
        }
        return {
            encryptor: encryptor,
            pairs: { current: currentPair, next: suggestPair }
        };
    };
    Ring.prototype.getDecryptorFor = function (pair) {
        var _this = this;
        var decryptors = [];
        if (pair.pid) {
            var emails = this.pairIdToEmailMap.getEmails(pair.pid);
            if (!emails) {
                return;
            }
            emails.forEach(function (email) {
                var ck = _this.corrKeys[email];
                var rp = ck.getReceivingPair(pair.pid);
                var decryptor = makeReceivingDecryptor(rp.pair.senderPKey, rp.pair.recipientKey.skey);
                decryptors.push({
                    correspondent: email,
                    decryptor: decryptor,
                    cryptoStatus: rp.role
                });
            });
        }
        else {
            var recipKey = this.introKeys.findKey(pair.recipientKid);
            if (!recipKey) {
                return;
            }
            var decryptor = makeReceivingDecryptor({
                kid: '',
                k: pair.senderPKey,
                alg: recipKey.pair.skey.alg,
                use: util.KEY_USE.PUBLIC
            }, recipKey.pair.skey);
            decryptors.push({
                decryptor: decryptor,
                cryptoStatus: recipKey.role
            });
        }
        return decryptors;
    };
    Ring.prototype.wrap = function () {
        var wrap = {
            saveChanges: this.saveChanges.bind(this),
            updatePublishedKey: this.updatePublishedKey.bind(this),
            getPublishedKeyCerts: this.getPublishedKeyCerts.bind(this),
            isKnownCorrespondent: this.isKnownCorrespondent.bind(this),
            setCorrepondentTrustedIntroKey: this.setCorrepondentTrustedIntroKey.bind(this),
            generateKeysForSendingTo: this.generateKeysForSendingTo.bind(this),
            getDecryptorFor: this.getDecryptorFor.bind(this),
            absorbSuggestedNextKeyPair: this.absorbSuggestedNextKeyPair.bind(this),
            getInviteForSendingTo: this.getInviteForSendingTo.bind(this),
            init: this.init.bind(this)
        };
        Object.freeze(wrap);
        return wrap;
    };
    return Ring;
})();
exports.Ring = Ring;
Object.freeze(exports);

},{"../../random":26,"./common":13,"./correspondent-keys":14,"./id-to-email-map":15,"./intro-keys":17,"ecma-nacl":"ecma-nacl"}],19:[function(require,module,exports){
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
var utf8 = require('../../lib-common/utf8');
var jwk = require('../../lib-common/jwkeys');
var nacl = require('ecma-nacl');
var random = require('../random');
var xspUtil = require('../../lib-client/xsp-utils');
var midSigs = require('../../lib-common/mid-sigs-NaCl-Ed');
var Q = require('q');
function countTotalLength(bytes) {
    var totalLen = bytes.head.length;
    for (var i = 0; i < bytes.segs.length; i += 1) {
        totalLen += bytes.segs[i].length;
    }
    return totalLen;
}
exports.HEADERS = {
    SUBJECT: 'Subject',
    DO_NOT_REPLY: 'Do Not Reply'
};
var MANAGED_FIELDS = {
    BODY: 'Body',
    NEXT_CRYPTO: 'Next Crypto',
    CRYPTO_CERTIF: 'Crypto Certification',
    ATTACHMENTS: 'Attachments'
};
var isManagedField = (function () {
    var fieldsInLowCase = [];
    for (var fName in MANAGED_FIELDS) {
        fieldsInLowCase.push(MANAGED_FIELDS[fName].toLowerCase());
    }
    return function (name) {
        return (fieldsInLowCase.indexOf(name.toLowerCase()) > -1);
    };
})();
var SEG_SIZE_IN_K_QUATS = 16;
function encryptByteArray(plainBytes, mkeyEnc) {
    var keyHolder = nacl.fileXSP.makeNewFileKeyHolder(mkeyEnc, random.bytes);
    var w = keyHolder.newSegWriter(SEG_SIZE_IN_K_QUATS, random.bytes);
    w.setContentLength(plainBytes.length);
    var head = w.packHeader(mkeyEnc);
    var segs = [];
    var offset = 0;
    var segInd = 0;
    var encRes;
    while (offset < plainBytes.length) {
        encRes = w.packSeg(plainBytes.subarray(offset), segInd);
        offset += encRes.dataLen;
        segInd += 1;
        segs.push(encRes.seg);
    }
    var encBytes = {
        head: head,
        segs: segs
    };
    Object.freeze(encBytes.segs);
    Object.freeze(encBytes);
    w.destroy();
    keyHolder.destroy();
    return encBytes;
}
function encryptJSON(json, mkeyEnc) {
    var plainBytes = utf8.pack(JSON.stringify(json));
    return encryptByteArray(plainBytes, mkeyEnc);
}
var MsgPacker = (function () {
    function MsgPacker() {
        this.meta = null;
        this.allObjs = {};
        this.main = this.addMsgPart({});
        Object.seal(this);
    }
    MsgPacker.prototype.addMsgPart = function (data) {
        var id;
        do {
            id = random.stringOfB64UrlSafeChars(4);
        } while (this.allObjs[id]);
        var p = {
            data: data,
            id: id,
            encrBytes: null
        };
        Object.seal(p);
        this.allObjs[id] = p;
        return p;
    };
    /**
     * This sets a plain text body.
     * @param text
     */
    MsgPacker.prototype.setPlainTextBody = function (text) {
        this.main.data[MANAGED_FIELDS.BODY] = {
            text: { plain: text }
        };
    };
    /**
     * This sets named header to a given value.
     * These headers go into main object, which is encrypted.
     * @param name
     * @param value can be string, number, or json.
     */
    MsgPacker.prototype.setHeader = function (name, value) {
        if (isManagedField(name)) {
            throw new Error("Cannot directly set message field '" + name + "'.");
        }
        this.main.data[name] = JSON.parse(JSON.stringify(value));
    };
    MsgPacker.prototype.setMetaForEstablishedKeyPair = function (pid) {
        if (this.meta) {
            throw new Error("Message metadata has already been set.");
        }
        this.meta = {
            pid: pid,
        };
        Object.freeze(this.meta);
    };
    MsgPacker.prototype.setMetaForNewKey = function (recipientKid, senderPKey, keyCert, senderCert, provCert) {
        if (this.meta) {
            throw new Error("Message metadata has already been set.");
        }
        this.meta = {
            recipientKid: recipientKid,
            senderPKey: senderPKey,
        };
        Object.freeze(this.meta);
        this.main.data[MANAGED_FIELDS.CRYPTO_CERTIF] = {
            keyCert: keyCert,
            senderCert: senderCert,
            provCert: provCert
        };
    };
    MsgPacker.prototype.setNextKeyPair = function (pair) {
        if (this.main.data[MANAGED_FIELDS.NEXT_CRYPTO]) {
            throw new Error("Next Crypto has already been set in the message.");
        }
        this.main.data[MANAGED_FIELDS.NEXT_CRYPTO] = pair;
    };
    MsgPacker.prototype.toSendForm = function () {
        if (!this.meta) {
            throw new Error("Metadata has not been set.");
        }
        var meta = JSON.parse(JSON.stringify(this.meta));
        meta.objIds = [this.main.id];
        var bytes = {};
        var totalLen = 0;
        var msgPart;
        for (var id in this.allObjs) {
            msgPart = this.allObjs[id];
            if (!msgPart.encrBytes) {
                throw new Error("Message object " + id + "is not encrypted.");
            }
            bytes[id] = msgPart.encrBytes;
            totalLen += countTotalLength(msgPart.encrBytes);
            if (id !== this.main.id) {
                meta.objIds.push(id);
            }
        }
        return {
            meta: meta,
            bytes: bytes,
            totalLen: totalLen
        };
    };
    MsgPacker.prototype.throwupOnMissingParts = function () {
        if (!this.meta) {
            throw new Error("Message meta is not set");
        }
        if (!this.main.data[exports.HEADERS.DO_NOT_REPLY] && !this.main.data[MANAGED_FIELDS.NEXT_CRYPTO]) {
            throw new Error("Next Crypto is not set.");
        }
        if (!this.main.data[MANAGED_FIELDS.BODY]) {
            throw new Error("Message Body is not set.");
        }
        if (this.meta.senderPKey && !this.main.data[MANAGED_FIELDS.CRYPTO_CERTIF]) {
            throw new Error("Sender's key certification is missing.");
        }
    };
    MsgPacker.prototype.encrypt = function (mkeyEnc) {
        this.throwupOnMissingParts();
        if (Object.keys(this.allObjs).length > 1) {
            throw new Error("This test implementation is not encrypting multi-part messages");
        }
        this.main.encrBytes = encryptJSON(this.main.data, mkeyEnc);
        return this.toSendForm();
    };
    return MsgPacker;
})();
exports.MsgPacker = MsgPacker;
Object.freeze(MsgPacker.prototype);
Object.freeze(MsgPacker);
/**
 * @param address
 * @return a domain portion from a given address.
 */
function getDomainFrom(address) {
    if (address.length === 0) {
        throw new Error("Empty string is given as address.");
    }
    var indOfAt = address.lastIndexOf('@');
    if (indOfAt < 0) {
        return address;
    }
    var domain = address.substring(indOfAt + 1);
    if (domain.length === 0) {
        throw new Error("Domain portion in given address is empty");
    }
    return domain;
}
var MsgOpener = (function () {
    function MsgOpener(msgId, meta) {
        var _this = this;
        this.senderAddress = null;
        this.senderKeyInfo = null;
        this.mainObjReader = null;
        this.msgId = msgId;
        this.meta = meta;
        this.totalSize = 0;
        if (this.meta.extMeta.objIds.length === 0) {
            throw new Error("There are no obj ids.");
        }
        this.meta.extMeta.objIds.forEach(function (objId) {
            var objSize = _this.meta.objSizes[objId];
            if (!objSize) {
                return;
            }
            _this.totalSize += objSize.header;
            _this.totalSize += objSize.segments;
        });
    }
    Object.defineProperty(MsgOpener.prototype, "sender", {
        get: function () {
            if (!this.senderKeyInfo) {
                throw new Error("Sender is not set.");
            }
            return {
                address: this.senderAddress,
                usedKeyInfo: this.senderKeyInfo
            };
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(MsgOpener.prototype, "main", {
        get: function () {
            return this.mainDatum;
        },
        enumerable: true,
        configurable: true
    });
    MsgOpener.prototype.setCrypto = function (decrInfo, mainHeader) {
        var kh = nacl.fileXSP.makeFileKeyHolder(decrInfo.decryptor, mainHeader);
        this.mainObjReader = kh.segReader(mainHeader);
        this.senderKeyInfo = decrInfo.cryptoStatus;
        if (decrInfo.correspondent) {
            this.senderAddress = decrInfo.correspondent;
        }
    };
    MsgOpener.prototype.isCryptoSet = function () {
        return !!this.mainObjReader;
    };
    MsgOpener.prototype.setMain = function (mainObjSegs, midRootCert) {
        var _this = this;
        if (this.mainDatum) {
            throw new Error("Main has already been set.");
        }
        if (!this.mainObjReader) {
            throw new Error("Crypto is not set");
        }
        var bytes = xspUtil.openAllSegs(this.mainObjReader, mainObjSegs);
        var main = JSON.parse(utf8.open(bytes));
        if (this.senderAddress) {
            this.mainDatum = main;
            return Q.when();
        }
        if ('function' !== typeof midRootCert) {
            throw new Error("Certificate verifier is not given, when it is needed for " + "verification of sender's introductory key, and sender's " + "identity.");
        }
        if (!this.meta.extMeta.senderPKey) {
            throw new Error("Sender key is missing in external meta, while message's " + "sender is not known, which is possible only when sender " + "key is given in external meta.");
        }
        var currentCryptoCert = main[MANAGED_FIELDS.CRYPTO_CERTIF];
        var senderPKeyCert = jwk.getKeyCert(currentCryptoCert.keyCert);
        if (senderPKeyCert.cert.publicKey.k !== this.meta.extMeta.senderPKey) {
            this.mainObjReader = null;
            return Q.reject(new Error("Sender's key used for encryption " + "is not the same as the one, provided with certificates " + "in the message."));
        }
        var senderAddress = senderPKeyCert.cert.principal.address;
        if (this.meta.authSender && (this.meta.authSender !== senderAddress)) {
            throw new Error("Sender address, used in authentication to " + "server, is not the same as the one used for athentication " + "of an introductory key");
        }
        var senderDomain = getDomainFrom(senderAddress);
        var promise = midRootCert(senderDomain).then(function (rootInfo) {
            var validAt = Math.round(_this.meta.deliveryCompletion / 1000);
            midSigs.relyingParty.verifyPubKey(currentCryptoCert.keyCert, senderAddress, { user: currentCryptoCert.senderCert, prov: currentCryptoCert.provCert, root: rootInfo.cert }, rootInfo.domain, validAt);
            _this.senderAddress = senderAddress;
            _this.mainDatum = main;
        });
        return promise;
    };
    MsgOpener.prototype.getMainBody = function () {
        if (!this.main) {
            throw new Error("Main message part is not set.");
        }
        var body = this.main[MANAGED_FIELDS.BODY];
        if (!body) {
            throw new Error("Body is missing in the main part.");
        }
        return body;
    };
    MsgOpener.prototype.getNextCrypto = function () {
        if (!this.main) {
            throw new Error("Main message part is not set.");
        }
        return this.main[MANAGED_FIELDS.NEXT_CRYPTO];
    };
    return MsgOpener;
})();
exports.MsgOpener = MsgOpener;
Object.freeze(MsgOpener.prototype);
Object.freeze(MsgOpener);
Object.freeze(exports);

},{"../../lib-client/xsp-utils":34,"../../lib-common/jwkeys":37,"../../lib-common/mid-sigs-NaCl-Ed":38,"../../lib-common/utf8":47,"../random":26,"ecma-nacl":"ecma-nacl","q":"q"}],20:[function(require,module,exports){
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
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
/**
 * This defines functions that implement ASMail reception protocol.
 */
var xhrUtils = require('../xhr-utils');
var Q = require('q');
var api = require('../../lib-common/service-api/asmail/retrieval');
var baseServiceUser = require('../user-with-mid-session');
var serviceLocator = require('../service-locator');
var MailRecipient = (function (_super) {
    __extends(MailRecipient, _super);
    function MailRecipient(user) {
        _super.call(this, user, {
            login: api.midLogin.MID_URL_PART,
            logout: api.closeSession.URL_END,
            canBeRedirected: true
        });
        Object.seal(this);
    }
    MailRecipient.prototype.setRetrievalUrl = function (serviceUrl) {
        var _this = this;
        var promise = serviceLocator.asmailInfoAt(serviceUrl).then(function (info) {
            _this.serviceURI = info.retrieval;
        });
        return promise;
    };
    MailRecipient.prototype.rejectOnNot200 = function (deferred, xhr) {
        if (xhr.status != 200) {
            if (xhr.status == api.ERR_SC.needAuth) {
                this.sessionId = null;
            }
            xhrUtils.reject(deferred, xhr);
            return true;
        }
        return false;
    };
    MailRecipient.prototype.listMsgs = function () {
        var _this = this;
        var url = this.serviceURI + api.listMsgs.URL_END;
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('GET', url, function () {
            if (_this.rejectOnNot200(deferred, xhr)) {
                return;
            }
            var reply = xhr.response;
            if (!Array.isArray(reply)) {
                xhrUtils.reject(deferred, 200, "Response is malformed, it is not an array.");
                return;
            }
            deferred.resolve(reply);
        }, deferred, this.sessionId);
        xhr.responseType = "json";
        xhr.send();
        return deferred.promise;
    };
    MailRecipient.prototype.getMsgMeta = function (msgId) {
        var _this = this;
        var url = this.serviceURI + api.msgMetadata.genUrlEnd(msgId);
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('GET', url, function () {
            if (_this.rejectOnNot200(deferred, xhr)) {
                return;
            }
            var reply = xhr.response;
            if (!reply || ('object' !== typeof reply)) {
                xhrUtils.reject(deferred, 200, "Response is malformed, it is not an object.");
                return;
            }
            deferred.resolve(xhr.response);
        }, deferred, this.sessionId);
        xhr.responseType = "json";
        xhr.send();
        return deferred.promise;
    };
    MailRecipient.prototype.getBytes = function (url) {
        var _this = this;
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('GET', url, function () {
            if (_this.rejectOnNot200(deferred, xhr)) {
                return;
            }
            var reply = xhr.response;
            if (!reply || ('object' !== typeof reply)) {
                xhrUtils.reject(deferred, 200, "Response is malformed, it is not an object.");
                return;
            }
            try {
                deferred.resolve(new Uint8Array(reply));
            }
            catch (e) {
                xhrUtils.reject(deferred, 200, "Response is malformed, it is not an arraybuffer.");
            }
        }, deferred, this.sessionId);
        xhr.responseType = "arraybuffer";
        xhr.send();
        return deferred.promise;
    };
    MailRecipient.prototype.getObjHead = function (msgId, objId, opts) {
        var url = this.serviceURI + api.msgObjHeader.genUrlEnd(msgId, objId, opts);
        return this.getBytes(url);
    };
    MailRecipient.prototype.getObjSegs = function (msgId, objId, opts) {
        var _this = this;
        var url = this.serviceURI + api.msgObjSegs.genUrlEnd(msgId, objId, opts);
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('GET', url, function () {
            if (_this.rejectOnNot200(deferred, xhr)) {
                return;
            }
            var reply = xhr.response;
            if (!reply || ('object' !== typeof reply)) {
                xhrUtils.reject(deferred, 200, "Response is malformed, it is not an object.");
                return;
            }
            deferred.resolve(new Uint8Array(reply));
        }, deferred, this.sessionId);
        xhr.responseType = "arraybuffer";
        xhr.send();
        return deferred.promise;
    };
    MailRecipient.prototype.removeMsg = function (msgId) {
        var _this = this;
        var url = this.serviceURI + api.rmMsg.genUrlEnd(msgId);
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('DELETE', url, function () {
            if (_this.rejectOnNot200(deferred, xhr)) {
                return;
            }
            deferred.resolve();
        }, deferred, this.sessionId);
        xhr.responseType = "arraybuffer";
        xhr.send();
        return deferred.promise;
    };
    return MailRecipient;
})(baseServiceUser.ServiceUser);
exports.MailRecipient = MailRecipient;
Object.freeze(MailRecipient);
Object.freeze(MailRecipient.prototype);
Object.freeze(exports);

},{"../../lib-common/service-api/asmail/retrieval":42,"../service-locator":27,"../user-with-mid-session":29,"../xhr-utils":33,"q":"q"}],21:[function(require,module,exports){
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
 * This defines functions that implement ASMail delivery protocol.
 */
var xhrUtils = require('../xhr-utils');
var Q = require('q');
var api = require('../../lib-common/service-api/asmail/delivery');
var Uri = require('jsuri');
var serviceLocator = require('../service-locator');
var LIMIT_ON_MAX_CHUNK = 1024 * 1024;
var MailSender = (function () {
    /**
     * @param sender is a string with sender's mail address, or null, for anonymous
     * sending (non-authenticated).
     * @param recipient is a required string with recipient's mail address.
     * @param invitation is an optional string token, used with either anonymous
     * (non-authenticated) delivery, or in a more strict delivery control in
     * authenticated setting.
     */
    function MailSender(sender, recipient, invitation) {
        if (invitation === void 0) { invitation = null; }
        this.sessionId = null;
        this.maxMsgLength = 0;
        this.redirectedFrom = null;
        this.recipientPubKeyCerts = null;
        this.msgId = null;
        this.maxChunkSize = LIMIT_ON_MAX_CHUNK;
        this.uri = null;
        this.sender = sender;
        this.recipient = recipient;
        this.invitation = invitation;
        Object.seal(this);
    }
    Object.defineProperty(MailSender.prototype, "deliveryURI", {
        get: function () {
            return this.uri;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(MailSender.prototype, "serviceDomain", {
        get: function () {
            return (new Uri(this.uri)).host();
        },
        enumerable: true,
        configurable: true
    });
    MailSender.prototype.setDeliveryUrl = function (serviceUrl) {
        var _this = this;
        var promise = serviceLocator.asmailInfoAt(serviceUrl).then(function (info) {
            _this.uri = info.delivery;
        });
        return promise;
    };
    MailSender.prototype.canRedirect = function (deferred, xhr) {
        var reply = xhr.response;
        if (("string" !== typeof reply.redirect) || (reply.redirect.length === 0) || ((new Uri(reply.redirect)).protocol() !== 'https')) {
            xhrUtils.reject(deferred, api.sessionStart.SC.redirect, "Received illegal redirect: " + reply.redirect);
            return false;
        }
        // refuse second redirect
        if (this.redirectedFrom !== null) {
            xhrUtils.reject(deferred, api.sessionStart.SC.redirect, "Mail delivery has been redirected too many times. " + "First redirect was from " + this.redirectedFrom + " to " + this.deliveryURI + " Second and forbidden redirect is to " + reply.redirect);
            return false;
        }
        // set params
        this.redirectedFrom = this.deliveryURI;
        this.uri = reply.redirect;
        return true;
    };
    /**
     * This performs a pre-flight, server will provide the same information,
     * as in session start, except that non session shall be opened a session.
     * @return a promise, resolvable to reply info object with maxMsgLength.
     * These values are also set in the fields of this sender.
     * Failed promise's propagated error object may have an error status field:
     *  403 is for not allowing to leave mail,
     *  474 indicates unknown recipient,
     *  480 tells that recipient's mailbox full.
     */
    MailSender.prototype.performPreFlight = function () {
        var _this = this;
        var url = this.deliveryURI + api.preFlight.URL_END;
        var deferred = Q.defer();
        var xhr = xhrUtils.makeJsonRequest('POST', url, function () {
            // set parameters from OK reply
            if (xhr.status == api.preFlight.SC.ok) {
                var reply = xhr.response;
                try {
                    if ('number' !== typeof reply.maxMsgLength) {
                        throw "missing number maxMsgLength";
                    }
                    if (reply.maxMsgLength < 500) {
                        throw "maxMsgLength is too short";
                    }
                    _this.maxMsgLength = reply.maxMsgLength;
                    deferred.resolve(reply);
                }
                catch (errMsg) {
                    xhrUtils.reject(deferred, api.preFlight.SC.ok, "Response is malformed: " + errMsg);
                }
            }
            else if (xhr.status == api.preFlight.SC.redirect) {
                // redirect call or reject inside of a checking function
                if (_this.canRedirect(deferred, xhr)) {
                    deferred.resolve(_this.performPreFlight());
                }
            }
            else {
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.responseType = "json";
        xhr.sendJSON({
            sender: this.sender,
            recipient: this.recipient,
            invitation: this.invitation
        });
        return deferred.promise;
    };
    /**
     * This performs the very first, mandatory request to server, telling server
     * who message is intended to, and whether this is an anonymous sender
     * delivery.
     * @return a promise, resolvable to reply info object with sessionId and
     * maxMsgLength.
     * These values are also set in the fields of this sender.
     * Failed promise's propagated error object may have an error status field:
     *  403 is for not allowing to leave mail,
     *  474 indicates unknown recipient,
     *  480 tells that recipient's mailbox full.
     */
    MailSender.prototype.startSession = function () {
        var _this = this;
        var url = this.deliveryURI + api.sessionStart.URL_END;
        var deferred = Q.defer();
        var xhr = xhrUtils.makeJsonRequest('POST', url, function () {
            // set parameters from OK reply
            if (xhr.status == api.sessionStart.SC.ok) {
                var reply = xhr.response;
                try {
                    if ('number' !== typeof reply.maxMsgLength) {
                        throw "missing number maxMsgLength";
                    }
                    if (reply.maxMsgLength < 500) {
                        throw "maxMsgLength is too short";
                    }
                    _this.maxMsgLength = reply.maxMsgLength;
                    if ('string' !== typeof reply.sessionId) {
                        throw "missing sessionId string";
                    }
                    _this.sessionId = reply.sessionId;
                    deferred.resolve(reply);
                }
                catch (errMsg) {
                    xhrUtils.reject(deferred, api.sessionStart.SC.ok, "Response is malformed: " + errMsg);
                }
            }
            else if (xhr.status == api.sessionStart.SC.redirect) {
                // start redirect call
                if (_this.canRedirect(deferred, xhr)) {
                    deferred.resolve(_this.startSession());
                }
            }
            else {
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.responseType = "json";
        xhr.sendJSON({
            sender: this.sender,
            recipient: this.recipient,
            invitation: this.invitation
        });
        return deferred.promise;
    };
    /**
     * This sends mailerId assertion for sender authorization.
     * @param assertionSigner is a MailerId assertion signer
     * @return a promise for request completion.
     * Rejected promise passes an error object, conditionally containing
     * status field.
     */
    MailSender.prototype.authorizeSender = function (assertionSigner) {
        var _this = this;
        var assertion = assertionSigner.generateAssertionFor(this.serviceDomain, this.sessionId);
        var url = this.deliveryURI.toString() + api.authSender.URL_END;
        var deferred = Q.defer();
        var xhr = xhrUtils.makeJsonRequest('POST', url, function () {
            if (xhr.status == api.authSender.SC.ok) {
                deferred.resolve();
            }
            else {
                _this.sessionId = null;
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.sendJSON({
            assertion: assertion,
            userCert: assertionSigner.userCert,
            provCert: assertionSigner.providerCert
        });
        return deferred.promise;
    };
    /**
     * This gets recipients initial public key to launch message exchange.
     * @return a promise resolvable to certificates, received from server.
     * Certificates are also set in the field of this sender.
     * Rejected promise passes an error object, conditionally containing
     * status field.
     */
    MailSender.prototype.getRecipientsInitPubKey = function () {
        var _this = this;
        var url = this.deliveryURI + api.initPubKey.URL_END;
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('GET', url, function () {
            if (xhr.status == api.initPubKey.SC.ok) {
                _this.recipientPubKeyCerts = xhr.response;
                deferred.resolve(_this.recipientPubKeyCerts);
            }
            else {
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.responseType = "json";
        xhr.send();
        return deferred.promise;
    };
    /**
     * This method sends message metadata.
     * @param md is a json-shaped message metadata, to be send to server
     * @return a promise, resolvable on 201-OK response to json with msgId,
     * and optional min and max limits on object chunks.
     * These values are also set in the fields of this sender.
     * Not-OK responses reject promises.
     */
    MailSender.prototype.sendMetadata = function (meta) {
        var _this = this;
        var url = this.deliveryURI + api.msgMeta.URL_END;
        var deferred = Q.defer();
        var xhr = xhrUtils.makeJsonRequest('PUT', url, function () {
            if (xhr.status == api.msgMeta.SC.ok) {
                var reply = xhr.response;
                try {
                    if (('string' !== typeof reply.msgId) || (reply.msgId.length === 0)) {
                        throw "msgId string is missing";
                    }
                    _this.msgId = reply.msgId;
                    if ('number' === typeof reply.maxChunkSize) {
                        if (reply.maxChunkSize < 1024) {
                            throw "maxChunkSize is too small";
                        }
                        else if (reply.maxChunkSize > LIMIT_ON_MAX_CHUNK) {
                            _this.maxChunkSize = LIMIT_ON_MAX_CHUNK;
                        }
                        else {
                            _this.maxChunkSize = reply.maxChunkSize;
                        }
                    }
                    deferred.resolve(reply);
                }
                catch (errMsg) {
                    xhrUtils.reject(deferred, api.msgMeta.SC.ok, "Response is malformed: " + errMsg);
                }
            }
            else {
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.responseType = "json";
        xhr.sendJSON(meta);
        return deferred.promise;
    };
    MailSender.prototype.sendBytes = function (url, bytes) {
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBinaryRequest('PUT', url, function () {
            if (xhr.status == 201) {
                deferred.resolve();
            }
            else {
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.send(bytes);
        return deferred.promise;
    };
    MailSender.prototype.sendObjHeadChunk = function (objId, offset, chunk, totalHeadLen) {
        var opts = {
            append: false,
            ofs: offset
        };
        if ('number' === typeof totalHeadLen) {
            opts.total = totalHeadLen;
        }
        var url = this.deliveryURI + api.msgObjHeader.genUrlEnd(objId, opts);
        return this.sendBytes(url, chunk);
    };
    MailSender.prototype.sendObjSegsChunk = function (objId, offset, chunk, totalSegsLen) {
        var opts = {
            append: false,
            ofs: offset
        };
        if ('number' === typeof totalSegsLen) {
            opts.total = totalSegsLen;
        }
        var url = this.deliveryURI + api.msgObjSegs.genUrlEnd(objId, opts);
        return this.sendBytes(url, chunk);
    };
    MailSender.prototype.appendObjHead = function (objId, chunk, isFirst) {
        var opts = {
            append: true
        };
        if (isFirst) {
            opts.total = -1;
        }
        var url = this.deliveryURI + api.msgObjHeader.genUrlEnd(objId, opts);
        return this.sendBytes(url, chunk);
    };
    MailSender.prototype.appendObjSegs = function (objId, chunk, isFirst) {
        var opts = {
            append: true
        };
        if (isFirst) {
            opts.total = -1;
        }
        var url = this.deliveryURI + api.msgObjSegs.genUrlEnd(objId, opts);
        return this.sendBytes(url, chunk);
    };
    /**
     * @return a promise, resolvable when message delivery closing.
     */
    MailSender.prototype.completeDelivery = function () {
        var _this = this;
        var url = this.deliveryURI.toString() + api.completion.URL_END;
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('POST', url, function () {
            if (xhr.status == 200) {
                _this.sessionId = null;
                deferred.resolve();
            }
            else {
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.send();
        return deferred.promise;
    };
    return MailSender;
})();
exports.MailSender = MailSender;
Object.freeze(MailSender);
Object.freeze(MailSender.prototype);
Object.freeze(exports);

},{"../../lib-common/service-api/asmail/delivery":41,"../service-locator":27,"../xhr-utils":33,"jsuri":"jsuri","q":"q"}],22:[function(require,module,exports){
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
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
/**
 * This defines functions that implement ASMail configuration protocol.
 */
var xhrUtils = require('../xhr-utils');
var api = require('../../lib-common/service-api/asmail/config');
var Q = require('q');
var baseServiceUser = require('../user-with-mid-session');
var serviceLocator = require('../service-locator');
var MailConfigurator = (function (_super) {
    __extends(MailConfigurator, _super);
    function MailConfigurator(userId) {
        _super.call(this, userId, {
            login: api.midLogin.MID_URL_PART,
            logout: api.closeSession.URL_END,
            canBeRedirected: true
        });
        this.paramsOnServer = {};
        Object.seal(this);
    }
    MailConfigurator.prototype.setConfigUrl = function (serviceUrl) {
        var _this = this;
        var promise = serviceLocator.asmailInfoAt(serviceUrl).then(function (info) {
            _this.serviceURI = info.config;
        });
        return promise;
    };
    MailConfigurator.prototype.getParam = function (url) {
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('GET', url, function () {
            if (xhr.status == 200) {
                deferred.resolve(xhr.response);
            }
            else {
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.responseType = "json";
        xhr.send();
        return deferred.promise;
    };
    MailConfigurator.prototype.setParam = function (url, param) {
        var deferred = Q.defer();
        var xhr = xhrUtils.makeJsonRequest('PUT', url, function () {
            if (xhr.status == 200) {
                deferred.resolve();
            }
            else {
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.sendJSON(param);
        return deferred.promise;
    };
    MailConfigurator.prototype.getInitPubKey = function () {
        return this.getParam(this.serviceURI + api.p.initPubKey.URL_END);
    };
    MailConfigurator.prototype.setInitPubKey = function (certs) {
        return this.setParam(this.serviceURI + api.p.initPubKey.URL_END, certs);
    };
    MailConfigurator.prototype.getAnonSenderInvites = function () {
        return this.getParam(this.serviceURI + api.p.anonSenderInvites.URL_END);
    };
    MailConfigurator.prototype.setAnonSenderInvites = function (list) {
        return this.setParam(this.serviceURI + api.p.anonSenderInvites.URL_END, list);
    };
    return MailConfigurator;
})(baseServiceUser.ServiceUser);
exports.MailConfigurator = MailConfigurator;
Object.freeze(MailConfigurator.prototype);
Object.freeze(MailConfigurator);
Object.freeze(exports);

},{"../../lib-common/service-api/asmail/config":40,"../service-locator":27,"../user-with-mid-session":29,"../xhr-utils":33,"q":"q"}],23:[function(require,module,exports){
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
var Q = require('q');
var nacl = require('ecma-nacl');
var BytesFIFOBuffer = (function () {
    function BytesFIFOBuffer() {
        this.queue = [];
        this.queueLen = 0;
        Object.seal(this);
    }
    Object.defineProperty(BytesFIFOBuffer.prototype, "length", {
        get: function () {
            return this.queueLen;
        },
        enumerable: true,
        configurable: true
    });
    BytesFIFOBuffer.prototype.push = function (bytes) {
        this.queue.push(bytes);
        this.queueLen += bytes.length;
    };
    BytesFIFOBuffer.prototype.extractAllBytesFrom = function () {
        if (this.queue.length === 1) {
            return this.queue.pop();
        }
        else if (this.queue.length === 0) {
            return null;
        }
        var extractLen = 0;
        for (var i = 0; i < this.queue.length; i += 1) {
            extractLen += this.queue[i].length;
        }
        var extract = new Uint8Array(extractLen);
        var offset = 0;
        var chunk;
        for (var i = 0; i < this.queue.length; i += 1) {
            chunk = this.queue[i];
            extract.set(chunk, offset);
            offset += chunk.length;
        }
        for (var i = 0; i < this.queue.length; i += 1) {
            this.queue.pop();
        }
        return extract;
    };
    BytesFIFOBuffer.prototype.extractSomeBytesFrom = function (extractLen) {
        if (this.queue.length === 0) {
            return null;
        }
        var extract = new Uint8Array(extractLen);
        var offset = 0;
        var chunk;
        while (offset < extractLen) {
            chunk = this.queue[0];
            if ((offset + chunk.length) <= extractLen) {
                extract.set(chunk, offset);
                offset += chunk.length;
                this.queue.shift();
            }
            else {
                extract.set(chunk.subarray(0, extractLen - offset), offset);
                this.queue[0] = chunk.subarray(extractLen - offset);
                break;
            }
        }
        return extract;
    };
    /**
     * @param min is a minimum required number of bytes
     * @param max is a maximum number of bytes, which must be a
     * positive number, greater or equal to min, or it can be null, when
     * there is no maximum limit.
     * @return an array of bytes, or null, if there are not enough bytes.
     */
    BytesFIFOBuffer.prototype.getBytes = function (min, max) {
        if (this.queue.length === 0) {
            return null;
        }
        if (this.queueLen < min) {
            return null;
        }
        var extract = ((max === null) || (this.queueLen <= max)) ? this.extractAllBytesFrom() : this.extractSomeBytesFrom(max);
        if (extract) {
            this.queueLen -= extract.length;
        }
        return extract;
    };
    return BytesFIFOBuffer;
})();
var SinkBackedByteSource = (function () {
    function SinkBackedByteSource() {
        var _this = this;
        this.totalSize = null;
        this.isTotalSizeSet = false;
        this.collectedBytes = 0;
        this.isComplete = false;
        this.buf = new BytesFIFOBuffer();
        this.deferredRead = null;
        this.src = {
            read: this.readBytes.bind(this),
            totalSize: function () {
                return _this.totalSize;
            }
        };
        Object.freeze(this.src);
        this.sink = {
            swallow: this.swallowBytes.bind(this),
            setTotalSize: this.setTotalSize.bind(this)
        };
        Object.freeze(this.sink);
        Object.seal(this);
    }
    SinkBackedByteSource.prototype.setTotalSize = function (size) {
        if (this.isTotalSizeSet) {
            throw new Error("Total size has already been set");
        }
        else if ((size !== null) && (size < this.collectedBytes)) {
            throw new Error("Given size is less than number of " + "already collected bytes.");
        }
        this.isTotalSizeSet = true;
        if ('number' === typeof size) {
            this.totalSize = size;
        }
    };
    SinkBackedByteSource.prototype.readBytes = function (min, max, toSrcEnd) {
        if (min === void 0) { min = 0; }
        if (max === void 0) { max = null; }
        if (toSrcEnd === void 0) { toSrcEnd = false; }
        if (min < 0) {
            min = 0;
        }
        if (toSrcEnd) {
            max = null;
        }
        if (('number' === typeof max) && ((max < 1) || (max < min))) {
            throw new Error("Given bad min-max parameters.");
        }
        if (('number' === typeof max) && (max < min)) {
            throw new Error("Bad min-max parameters are given.");
        }
        if (this.isComplete) {
            return Q.when(this.buf.getBytes(0, max));
        }
        if (this.deferredRead) {
            throw new Error("There is already pending read");
        }
        if (!toSrcEnd) {
            var bufferedBytes = this.buf.getBytes(min, max);
            if (bufferedBytes) {
                return Q.when(bufferedBytes);
            }
        }
        this.deferredRead = {
            deferred: Q.defer(),
            min: min,
            max: max,
            toSrcEnd: !!toSrcEnd
        };
        return this.deferredRead.deferred.promise;
    };
    SinkBackedByteSource.prototype.swallowBytes = function (bytes) {
        if (this.isComplete) {
            if (bytes === null) {
                return;
            }
            else {
                throw new Error("Complete sink cannot except any more bytes.");
            }
        }
        var boundsErr = null;
        if (bytes === null) {
            this.isComplete = true;
            if (this.totalSize === null) {
                this.totalSize = this.collectedBytes;
            }
            else if (this.totalSize < this.collectedBytes) {
                boundsErr = new Error("Stopping bytes at " + this.collectedBytes + ", which is sooner than declared total size " + this.totalSize + ".");
            }
        }
        else {
            if (bytes.length === 0) {
                return;
            }
            if (this.totalSize !== null) {
                var maxBytesExpectation = this.totalSize - this.collectedBytes;
                if (bytes.length >= maxBytesExpectation) {
                    this.isComplete = true;
                    if (bytes.length > maxBytesExpectation) {
                        boundsErr = new Error("More bytes given than sink was " + "set to accept; swallowing only part of bytes.");
                        if (maxBytesExpectation === 0) {
                            throw boundsErr;
                        }
                        bytes = bytes.subarray(0, maxBytesExpectation);
                    }
                }
            }
            this.buf.push(bytes);
            this.collectedBytes += bytes.length;
        }
        if (!this.deferredRead) {
            return;
        }
        if (this.isComplete) {
            this.deferredRead.deferred.resolve(this.buf.getBytes(0, this.deferredRead.max));
        }
        else {
            var bufferedBytes = this.buf.getBytes(this.deferredRead.min, this.deferredRead.max);
            if (bufferedBytes) {
                this.deferredRead.deferred.resolve(bufferedBytes);
            }
        }
        if (boundsErr) {
            throw boundsErr;
        }
    };
    return SinkBackedByteSource;
})();
exports.SinkBackedByteSource = SinkBackedByteSource;
var SinkBackedObjSource = (function () {
    function SinkBackedObjSource() {
        this.version = null;
        this.header = new SinkBackedByteSource();
        this.segs = new SinkBackedByteSource();
        this.sink = {
            header: this.header.sink,
            segments: this.segs.sink,
            setObjVersion: this.setObjVersion.bind(this)
        };
        Object.freeze(this.sink);
        this.src = {
            header: this.header.src,
            segments: this.segs.src,
            getObjVersion: this.getObjVersion.bind(this)
        };
    }
    SinkBackedObjSource.prototype.setObjVersion = function (v) {
        if (this.version === null) {
            this.version = v;
        }
        else if (v !== this.version) {
            throw new Error("Expect object version " + this.version + ", but getting version " + v + " instead");
        }
    };
    SinkBackedObjSource.prototype.getObjVersion = function () {
        return this.version;
    };
    return SinkBackedObjSource;
})();
exports.SinkBackedObjSource = SinkBackedObjSource;
function packAndSink(byteArrs, segWriter, segInd, sink, toObjEnd) {
    if (toObjEnd === void 0) { toObjEnd = false; }
    var dataLenPacked = 0;
    var numOfSegs = 0;
    var i = 0;
    var buf = null;
    var joint;
    var segDataLen;
    while ((buf !== null) || (i < byteArrs.length)) {
        if (buf === null) {
            buf = byteArrs[i];
            i += 1;
            if (buf.length === 0) {
                buf = null;
                continue;
            }
        }
        segDataLen = segWriter.segmentSize(segInd) - nacl.secret_box.POLY_LENGTH;
        if (buf.length >= segDataLen) {
            // Sink buf completely, or just part of it.
            sink.swallow(segWriter.packSeg(buf.subarray(0, segDataLen), segInd).seg);
            dataLenPacked += segDataLen;
            numOfSegs += 1;
            segInd += 1;
            buf = (buf.length > segDataLen) ? buf.subarray(segDataLen) : null;
        }
        else if (i < byteArrs.length) {
            if (byteArrs[i].length === 0) {
                i += 1;
            }
            else if ((buf.length + byteArrs[i].length) > segDataLen) {
                // buf and initial part of the next array are sinked.
                joint = new Uint8Array(segDataLen);
                joint.set(buf, 0);
                joint.set(byteArrs[i].subarray(0, segDataLen - buf.length), buf.length);
                joint = null;
                sink.swallow(segWriter.packSeg(joint, segInd).seg);
                dataLenPacked += segDataLen;
                numOfSegs += 1;
                segInd += 1;
                // buf is set to non-packed part of the next array.
                buf = byteArrs[i].subarray(segDataLen - buf.length);
                i += 1;
            }
            else {
                // Add next array to buf.
                joint = new Uint8Array(buf.length + byteArrs[i].length);
                joint.set(buf, 0);
                joint.set(byteArrs[i], buf.length);
                buf = joint;
                i += 1;
                joint = null;
            }
        }
        else if (toObjEnd) {
            // There are no arrays left at this point, and, since we must go
            // to the end, we sink buf, risking an exception, if there is
            // a mismatch between writer's expectations and a number of
            // given content bytes.
            sink.swallow(segWriter.packSeg(buf, segInd).seg);
            numOfSegs += 1;
            segInd += 1;
            dataLenPacked += buf.length;
            buf = null;
        }
        else {
            break;
        }
    }
    return {
        numOfSegs: numOfSegs,
        dataLenPacked: dataLenPacked,
        leftOver: buf
    };
}
/**
 * @param bytes is an array of byte arrays with content, and it can be
 * modified after this call, as all encryption is done within this call,
 * and given content array is not used by resultant source over its lifetime.
 * @param segWriter that is used used to encrypt bytes into segments.
 * If it were an existing writer, it should be reset for ingestion of a complete
 * new content. Segments writer can be destroyed after this call, as it is not
 * used by resultant source over its lifetime.
 * @param objVersion
 * @return an object byte source
 */
function makeObjByteSourceFromArrays(arrs, segWriter, objVersion) {
    if (objVersion === void 0) { objVersion = null; }
    var byteArrs = (Array.isArray(arrs) ? arrs : [arrs]);
    // pack segments
    var segsPipe = new SinkBackedByteSource();
    var packRes = packAndSink(byteArrs, segWriter, 0, segsPipe.sink, true);
    segsPipe.sink.swallow(null);
    // pack header
    var headerPipe = new SinkBackedByteSource();
    segWriter.setContentLength(packRes.dataLenPacked);
    headerPipe.sink.swallow(segWriter.packHeader());
    headerPipe.sink.swallow(null);
    // return respective byte sources
    return {
        header: headerPipe.src,
        segments: segsPipe.src,
        getObjVersion: function () {
            return objVersion;
        }
    };
}
exports.makeObjByteSourceFromArrays = makeObjByteSourceFromArrays;
var EncryptingByteSink = (function () {
    function EncryptingByteSink(objSink, segsWriter) {
        this.totalSize = null;
        this.isTotalSizeSet = false;
        this.collectedBytes = 0;
        this.isCompleted = false;
        this.segInd = 0;
        this.segBuf = null;
        this.segsWriter = segsWriter;
        this.objSink = objSink;
        this.setObjVersion = this.objSink.setObjVersion;
        Object.seal(this);
    }
    EncryptingByteSink.prototype.encrAndSink = function (bytes) {
        try {
            if (bytes === null) {
                if (this.segBuf) {
                    packAndSink([this.segBuf], this.segsWriter, this.segInd, this.objSink.segments);
                    this.segBuf = null;
                }
                this.objSink.segments.swallow(null);
            }
            else {
                var segContentLen = this.segsWriter.segmentSize(this.segInd) - nacl.secret_box.POLY_LENGTH;
                var packRes = packAndSink((this.segBuf ? [this.segBuf, bytes] : [bytes]), this.segsWriter, this.segInd, this.objSink.segments);
                this.segInd += packRes.numOfSegs;
                this.segBuf = packRes.leftOver;
            }
        }
        catch (err) {
            this.completeOnErr(err);
            throw err;
        }
    };
    EncryptingByteSink.prototype.setCompleted = function () {
        this.isCompleted = true;
        this.segsWriter.destroy();
        this.segsWriter = null;
    };
    EncryptingByteSink.prototype.completeOnErr = function (err) {
        this.objSink.segments.swallow(null, err);
        if (this.totalSize === null) {
            this.objSink.header.swallow(null, err);
        }
        this.setCompleted();
    };
    EncryptingByteSink.prototype.swallow = function (bytes, err) {
        if (this.isCompleted) {
            if (bytes === null) {
                return;
            }
            else {
                throw new Error("Complete sink cannot except any more bytes.");
            }
        }
        var boundsErr = null;
        if (bytes === null) {
            if (err) {
                this.completeOnErr(err);
                return;
            }
            if (this.totalSize === null) {
                this.setTotalSize(this.collectedBytes);
            }
            else if (this.totalSize < this.collectedBytes) {
                boundsErr = new Error("Stopping bytes at " + this.collectedBytes + ", which is sooner than declared total size " + this.totalSize + ".");
            }
            this.encrAndSink(null);
            this.setCompleted();
        }
        else {
            if (bytes.length === 0) {
                return;
            }
            if (this.totalSize !== null) {
                var maxBytesExpectation = this.totalSize - this.collectedBytes;
                if (bytes.length >= maxBytesExpectation) {
                    this.isCompleted = true;
                    if (bytes.length > maxBytesExpectation) {
                        boundsErr = new Error("More bytes given than sink was " + "set to accept; swallowing only part of bytes.");
                        if (maxBytesExpectation === 0) {
                            throw boundsErr;
                        }
                        bytes = bytes.subarray(0, maxBytesExpectation);
                    }
                }
            }
            this.encrAndSink(bytes);
        }
        if (boundsErr) {
            throw boundsErr;
        }
    };
    EncryptingByteSink.prototype.setTotalSize = function (size) {
        if (this.isTotalSizeSet) {
            throw new Error("Total size has already been set");
        }
        else if ((size !== null) && (size < this.collectedBytes)) {
            throw new Error("Given size is less than number of " + "already collected bytes.");
        }
        this.isTotalSizeSet = true;
        if ('number' === typeof size) {
            this.totalSize = size;
            this.segsWriter.setContentLength(size);
        }
        this.objSink.header.swallow(this.segsWriter.packHeader());
        this.objSink.header.swallow(null);
    };
    EncryptingByteSink.prototype.wrap = function () {
        var wrap = {
            swallow: this.swallow.bind(this),
            setTotalSize: this.setTotalSize.bind(this),
            setObjVersion: this.setObjVersion
        };
        Object.freeze(wrap);
        return wrap;
    };
    return EncryptingByteSink;
})();
function makeEncryptingByteSink(objSink, segsWriter) {
    return (new EncryptingByteSink(objSink, segsWriter)).wrap();
}
exports.makeEncryptingByteSink = makeEncryptingByteSink;
var DecryptingByteSource = (function () {
    function DecryptingByteSource(objSrc, segReaderGen) {
        var _this = this;
        this.segsReader = null;
        this.readInProgress = null;
        this.segInd = 0;
        this.segBuf = null;
        this.buf = new BytesFIFOBuffer();
        this.decryptedAll = false;
        this.segs = objSrc.segments;
        this.getObjVersion = objSrc.getObjVersion;
        this.initProgress = objSrc.header.read(0, null, true).then(function (header) {
            _this.segsReader = segReaderGen(header);
            _this.decryptedAll = (_this.segsReader.isEndlessFile() ? false : (_this.segsReader.numberOfSegments() === 0));
            _this.initProgress = null;
        });
        Object.seal(this);
    }
    DecryptingByteSource.prototype.setDecryptedAll = function () {
        this.decryptedAll = true;
        this.segsReader.destroy();
        this.segsReader = null;
    };
    DecryptingByteSource.prototype.readRecursively = function (min, max, toSrcEnd) {
        var _this = this;
        if (toSrcEnd) {
            max = null;
        }
        if (this.decryptedAll) {
            return Q.when(this.buf.getBytes(0, max));
        }
        var minReadFromSegs = this.segsReader.segmentSize(this.segInd);
        if (this.segBuf) {
            minReadFromSegs -= this.segBuf.length;
        }
        var promise = this.segs.read(minReadFromSegs).then(function (segBytes) {
            var openedSeg;
            if (!segBytes) {
                if (_this.decryptedAll) {
                    return _this.buf.getBytes(0, max);
                }
                else if (_this.segBuf && _this.segsReader.isEndlessFile()) {
                    openedSeg = _this.segsReader.openSeg(_this.segBuf, _this.segInd);
                    _this.buf.push(openedSeg.data);
                    _this.setDecryptedAll();
                    _this.segBuf = null;
                    return _this.buf.getBytes(0, max);
                }
                else {
                    throw new Error("Unexpected end of byte source.");
                }
            }
            var segSize = _this.segsReader.segmentSize(_this.segInd);
            var mergedBytes;
            var offset;
            if (_this.segBuf) {
                if (segSize <= (_this.segBuf.length + segBytes.length)) {
                    mergedBytes = new Uint8Array(segSize);
                    offset = 0;
                    mergedBytes.set(_this.segBuf, offset);
                    offset += _this.segBuf.length;
                    mergedBytes.set(segBytes.subarray(0, (segSize - offset)), offset);
                    segBytes = segBytes.subarray((segSize - offset));
                    _this.segBuf = null;
                    openedSeg = _this.segsReader.openSeg(mergedBytes, _this.segInd);
                    if (openedSeg.last) {
                        _this.setDecryptedAll();
                        _this.buf.push(openedSeg.data);
                        return _this.buf.getBytes(0, max);
                    }
                    _this.segInd += 1;
                    segSize = _this.segsReader.segmentSize(_this.segInd);
                }
                else {
                    mergedBytes = new Uint8Array(_this.segBuf.length + segBytes.length);
                    mergedBytes.set(_this.segBuf, 0);
                    mergedBytes.set(segBytes, _this.segBuf.length);
                    _this.segBuf = mergedBytes;
                    return _this.readRecursively(min, max, toSrcEnd);
                }
            }
            offset = 0;
            while ((segBytes.length - offset) >= segSize) {
                openedSeg = _this.segsReader.openSeg(segBytes.subarray(offset), _this.segInd);
                if (openedSeg.last) {
                    _this.setDecryptedAll();
                    _this.buf.push(openedSeg.data);
                    return _this.buf.getBytes(0, max);
                }
                _this.buf.push(openedSeg.data);
                offset += openedSeg.segLen;
                _this.segInd += 1;
                segSize = _this.segsReader.segmentSize(_this.segInd);
            }
            if ((segBytes.length - offset) > 0) {
                _this.segBuf = new Uint8Array(segBytes.length - offset);
                _this.segBuf.set(segBytes.subarray(offset));
            }
            if (toSrcEnd) {
                return _this.readRecursively(min, max, toSrcEnd);
            }
            var bytes = _this.buf.getBytes(0, max);
            if (bytes) {
                return bytes;
            }
            else {
                return _this.readRecursively(min, max, toSrcEnd);
            }
        });
        return promise;
    };
    DecryptingByteSource.prototype.read = function (min, max, toSrcEnd) {
        var _this = this;
        if (min === void 0) { min = 0; }
        if (max === void 0) { max = null; }
        if (toSrcEnd === void 0) { toSrcEnd = false; }
        if (this.readInProgress) {
            throw new Error("There is already pending read");
        }
        if (this.initProgress) {
            this.readInProgress = this.initProgress.then(function () {
                return _this.readRecursively(min, max, toSrcEnd);
            });
        }
        else {
            this.readInProgress = this.readRecursively(min, max, toSrcEnd);
        }
        return this.readInProgress.fin(function () {
            _this.readInProgress = null;
        });
    };
    DecryptingByteSource.prototype.totalSize = function () {
        return this.segsReader.contentLength();
    };
    DecryptingByteSource.prototype.wrap = function () {
        var wrap = {
            read: this.read.bind(this),
            totalSize: this.totalSize.bind(this),
            getObjVersion: this.getObjVersion
        };
        Object.freeze(wrap);
        return wrap;
    };
    return DecryptingByteSource;
})();
/**
 * @param src
 * @param fileKeyDecr is a decryptor to extract file key
 */
function makeDecryptedByteSource(src, segReaderGen) {
    return (new DecryptingByteSource(src, segReaderGen)).wrap();
}
exports.makeDecryptedByteSource = makeDecryptedByteSource;
Object.freeze(exports);

},{"ecma-nacl":"ecma-nacl","q":"q"}],24:[function(require,module,exports){
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
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Q = require('q');
var xhrUtils = require('../xhr-utils');
var serviceLocator = require('../service-locator');
var pkl = require('../user-with-pkl-session');
var jwk = require('../../lib-common/jwkeys');
var mid = require('../../lib-common/mid-sigs-NaCl-Ed');
var certProvApi = require('../../lib-common/service-api/mailer-id/provisioning');
var Uri = require('jsuri');
var DEFAULT_ASSERTION_VALIDITY = 20 * 60;
function getRandom(n) {
    var arr = new Uint8Array(n);
    window.crypto.getRandomValues(arr);
    return arr;
}
/**
 * Certificate provisioner is an object that can do all MailerId's provisioning
 * requests.
 * Provisioning is done for given user id, and is performed at service location,
 * identified by a given uri.
 */
var MailerIdProvisioner = (function (_super) {
    __extends(MailerIdProvisioner, _super);
    /**
     * @param userId
     * @param uri identifies place of MailerId service.
     */
    function MailerIdProvisioner(userId, serviceUri) {
        _super.call(this, userId, {
            login: '',
            logout: ''
        });
        this.userCert = null;
        this.provCert = null;
        this.midDomain = null;
        this.rootCert = null;
        this.serviceURI = serviceUri;
        this.entryURI = this.serviceURI;
        Object.seal(this);
    }
    MailerIdProvisioner.prototype.setUrlAndDomain = function () {
        var _this = this;
        var promise = serviceLocator.mailerIdInfoAt(this.entryURI).then(function (info) {
            _this.midDomain = (new Uri(_this.serviceURI)).host();
            _this.serviceURI = info.provisioning;
            _this.rootCert = info.currentCert;
        });
        return promise;
    };
    /**
     * @param pkey is a public key, that needs to be certified.
     * @param duration is a desired duration of certificate's validity.
     * Server may provide shorter duration, if asked duration is too long for its
     * security policy.
     * @return a promise, resolvable to a string with certificate, generated by
     * the MailerId server.
     */
    MailerIdProvisioner.prototype.getCertificates = function (pkey, duration) {
        var _this = this;
        var deferred = Q.defer();
        var url = this.serviceURI + certProvApi.certify.URL_END;
        var xhr = xhrUtils.makeBinaryRequest('POST', url, function () {
            if (xhr.status == 200) {
                try {
                    var certs = _this.encryptor.openJSON(new Uint8Array(xhr.response));
                    if (!certs.userCert || !certs.provCert) {
                        throw new Error("Certificates are missing.");
                    }
                    var pkeyAndId = mid.relyingParty.verifyChainAndGetUserKey({ user: certs.userCert, prov: certs.provCert, root: _this.rootCert }, _this.midDomain, jwk.getKeyCert(certs.userCert).issuedAt + 1);
                    if (pkeyAndId.address !== _this.userId) {
                        throw new Error("Certificate is for a wrong address.");
                    }
                    var keyInCert = jwk.keyToJson(pkeyAndId.pkey);
                    if ((keyInCert.use !== pkey.use) || (keyInCert.alg !== pkey.alg) || (keyInCert.kid !== pkey.kid) || (keyInCert.k !== pkey.k)) {
                        throw new Error("Certificate is for a wrong key.");
                    }
                    _this.userCert = certs.userCert;
                    _this.provCert = certs.provCert;
                    deferred.resolve();
                }
                catch (err) {
                    xhrUtils.reject(deferred, 200, "Malformed reply: " + err.message);
                }
            }
            else {
                xhrUtils.reject(deferred, xhr);
            }
            _this.encryptor.destroy();
        }, deferred, this.sessionId);
        xhr.responseType = "arraybuffer";
        // pack, encrypt and send them
        xhr.send(this.encryptor.packJSON({
            pkey: pkey,
            duration: duration
        }));
        var promise = deferred.promise.fin(function () {
            _this.sessionId = null;
            _this.encryptor.destroy();
            _this.encryptor = null;
        });
        return promise;
    };
    MailerIdProvisioner.prototype.provisionSigner = function (genOfDHKeyCalcPromise, certDuration, assertDuration) {
        var _this = this;
        if (!assertDuration || (assertDuration < 0)) {
            assertDuration = DEFAULT_ASSERTION_VALIDITY;
        }
        var pair = mid.user.generateSigningKeyPair(getRandom);
        var promise = this.setUrlAndDomain().then(function () {
            return _super.prototype.login.call(_this, genOfDHKeyCalcPromise);
        }).then(function () {
            return _this.getCertificates(pair.pkey, certDuration).then(function () {
                return mid.user.makeMailerIdSigner(pair.skey, _this.userCert, _this.provCert, assertDuration);
            });
        });
        return promise;
    };
    MailerIdProvisioner.prototype.login = function (genOfDHKeyCalcPromise) {
        throw Error("This function is not used in provisioner");
    };
    MailerIdProvisioner.prototype.logout = function () {
        throw Error("This function is not used in provisioner");
    };
    return MailerIdProvisioner;
})(pkl.ServiceUser);
exports.MailerIdProvisioner = MailerIdProvisioner;
Object.freeze(exports);

},{"../../lib-common/jwkeys":37,"../../lib-common/mid-sigs-NaCl-Ed":38,"../../lib-common/service-api/mailer-id/provisioning":44,"../service-locator":27,"../user-with-pkl-session":30,"../xhr-utils":33,"jsuri":"jsuri","q":"q"}],25:[function(require,module,exports){
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
function write(str) {
    var p = document.createElement('p');
    p.textContent = '> ' + str;
    var logs = document.getElementById("log");
    logs.appendChild(p);
    p.scrollIntoView();
    console.log('> ' + str);
}
exports.write = write;
function writeLink(str, href, newWindow) {
    var a = document.createElement('a');
    a.textContent = str;
    a.href = href;
    if (newWindow) {
        a.target = "_blank";
    }
    var logs = document.getElementById("log");
    logs.appendChild(a);
    logs.appendChild(document.createElement('br'));
    a.scrollIntoView();
}
exports.writeLink = writeLink;
function clear() {
    document.getElementById("log").innerHTML = '';
}
exports.clear = clear;
Object.freeze(exports);

},{}],26:[function(require,module,exports){
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
var base64 = require('../lib-common/base64');
function bytes(numOfBytes) {
    var arr = new Uint8Array(numOfBytes);
    crypto.getRandomValues(arr);
    return arr;
}
exports.bytes = bytes;
function uint8() {
    return bytes(1)[0];
}
exports.uint8 = uint8;
function stringOfB64UrlSafeChars(numOfChars) {
    var numOfbytes = 3 * (1 + Math.floor(numOfChars / 4));
    var byteArr = bytes(numOfbytes);
    return base64.urlSafe.pack(byteArr).substring(0, numOfChars);
}
exports.stringOfB64UrlSafeChars = stringOfB64UrlSafeChars;
function stringOfB64Chars(numOfChars) {
    var numOfbytes = 3 * (1 + Math.floor(numOfChars / 4));
    var byteArr = bytes(numOfbytes);
    return base64.pack(byteArr).substring(0, numOfChars);
}
exports.stringOfB64Chars = stringOfB64Chars;
Object.freeze(exports);

},{"../lib-common/base64":35}],27:[function(require,module,exports){
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
var Q = require('q');
var xhrUtils = require('./xhr-utils');
var jwk = require('../lib-common/jwkeys');
var Uri = require('jsuri');
function readJSONLocatedAt(url) {
    var uri = new Uri(url);
    if (uri.protocol() !== 'https') {
        throw new Error("Url protocol must be https.");
    }
    url = uri.toString();
    var deferred = Q.defer();
    var xhr = xhrUtils.makeBodylessRequest('GET', url, function () {
        if (xhr.status == 200) {
            if (xhr.response === null) {
                xhrUtils.reject(deferred, 200, "Response is malformed: it is not JSON.");
            }
            else {
                deferred.resolve({
                    uri: uri,
                    json: xhr.response
                });
            }
        }
        else {
            xhrUtils.reject(deferred, xhr);
        }
    }, deferred, this.sessionId);
    xhr.responseType = "json";
    xhr.send();
    return deferred.promise;
}
function transformRelToAbsUri(uri, path) {
    var u = new Uri(uri.toString());
    u.path(path);
    return u.toString();
}
/**
 * @param url
 * @return a promise, resolvable to ASMailRoutes object.
 */
function asmailInfoAt(url) {
    return readJSONLocatedAt(url).then(function (data) {
        var json = data.json;
        var uri = data.uri;
        var transform = {};
        if ('string' === typeof json.delivery) {
            transform.delivery = transformRelToAbsUri(uri, json.delivery);
        }
        if ('string' === typeof json.retrieval) {
            transform.retrieval = transformRelToAbsUri(uri, json.retrieval);
        }
        if ('string' === typeof json.config) {
            transform.config = transformRelToAbsUri(uri, json.config);
        }
        Object.freeze(transform);
        return transform;
    });
}
exports.asmailInfoAt = asmailInfoAt;
/**
 * @param url
 * @return a promise, resolvable to MailerIdRoutes object.
 */
function mailerIdInfoAt(url) {
    return readJSONLocatedAt(url).then(function (data) {
        var json = data.json;
        var uri = data.uri;
        var transform = {};
        if ('string' === typeof json.provisioning) {
            transform.provisioning = transformRelToAbsUri(uri, json.provisioning);
        }
        else {
            throw new Error("File " + uri.toString() + " is malformed.");
        }
        if (('object' === typeof json["current-cert"]) && jwk.isLikeSignedKeyCert(json["current-cert"])) {
            transform.currentCert = json["current-cert"];
        }
        else {
            throw new Error("File " + uri.toString() + " is malformed.");
        }
        Object.freeze(transform);
        return transform;
    });
}
exports.mailerIdInfoAt = mailerIdInfoAt;
/**
 * @param url
 * @return a promise, resolvable to StorageRoutes object.
 */
function storageInfoAt(url) {
    return readJSONLocatedAt(url).then(function (data) {
        var json = data.json;
        var uri = data.uri;
        var transform = {};
        if ('string' === typeof json.owner) {
            transform.owner = transformRelToAbsUri(uri, json.owner);
        }
        if ('string' === typeof json.shared) {
            transform.shared = transformRelToAbsUri(uri, json.shared);
        }
        if ('string' === typeof json.config) {
            transform.config = transformRelToAbsUri(uri, json.config);
        }
        return transform;
    });
}
exports.storageInfoAt = storageInfoAt;
Object.freeze(exports);

},{"../lib-common/jwkeys":37,"./xhr-utils":33,"jsuri":"jsuri","q":"q"}],28:[function(require,module,exports){
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
var log = require('./page-logging');
/**
 * This classes switches between views.
 * View name is an id of html element that is brought into view.
 */
var Router = (function () {
    function Router(w, defaultView) {
        this.openedView = null;
        this.views = {};
        this.getDefaultView = defaultView;
        this.w = w;
        this.w.onpopstate = this.openHashTag.bind(this);
        Object.seal(this);
    }
    Router.prototype.openHashTag = function () {
        var hTag = this.w.location.hash;
        if (hTag) {
            this.openView(hTag.substring(1), true);
        }
        else {
            this.openView(this.getDefaultView(), true);
        }
    };
    Router.prototype.addView = function (nameOrView, open, close, noLogCleanOnClose) {
        var v;
        if ('string' === typeof nameOrView) {
            if (!open) {
                throw new Error("open func is missing");
            }
            if (!close) {
                throw new Error("open func is missing");
            }
            v = {
                name: nameOrView,
                open: open,
                close: close,
                cleanLogOnExit: !noLogCleanOnClose
            };
            Object.freeze(v);
            this.views[v.name] = v;
        }
        else if (!nameOrView) {
            throw new Error("View object is not given");
        }
        else {
            v = nameOrView;
            this.views[v.name] = v;
        }
    };
    Router.prototype.openView = function (viewName, doNotRecordInHistory) {
        if (this.openedView && (viewName === this.openedView.name)) {
            return;
        }
        var v = this.views[viewName];
        if (!v) {
            throw new Error("Unknown view: " + viewName);
        }
        if (this.openedView) {
            this.openedView.close();
        }
        v.open();
        if (!doNotRecordInHistory) {
            this.w.history.pushState({ view: viewName }, this.w.document.title, "#" + viewName);
        }
        if (this.openedView && this.openedView.cleanLogOnExit) {
            log.clear();
        }
        this.openedView = v;
    };
    Router.prototype.showElem = function (elemId) {
        this.w.document.getElementById(elemId).style.display = "block";
    };
    Router.prototype.hideElem = function (elemId) {
        this.w.document.getElementById(elemId).style.display = "none";
    };
    return Router;
})();
exports.Router = Router;
Object.freeze(Router);
Object.freeze(Router.prototype);
Object.freeze(exports);

},{"./page-logging":25}],29:[function(require,module,exports){
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
 * This defines a base class for some service's client that logs in with
 * MailerId and uses respectively authenticated session.
 */
var xhrUtils = require('./xhr-utils');
var Q = require('q');
var Uri = require('jsuri');
var loginApi = require('../lib-common/service-api/mailer-id/login');
var ServiceUser = (function () {
    function ServiceUser(userId, opts) {
        this.sessionId = null;
        this.uri = null;
        this.redirectedFrom = null;
        this.userId = userId;
        this.loginUrlPart = opts.login;
        if ((this.loginUrlPart.length > 0) && (this.loginUrlPart[this.loginUrlPart.length - 1] !== '/')) {
            this.loginUrlPart += '/';
        }
        this.logoutUrlEnd = opts.logout;
        this.canBeRedirected = !!opts.canBeRedirected;
    }
    Object.defineProperty(ServiceUser.prototype, "serviceURI", {
        get: function () {
            return this.uri;
        },
        set: function (uriString) {
            var uriObj = new Uri(uriString);
            if (uriObj.protocol() !== 'https') {
                throw new Error("Url protocol must be https.");
            }
            if (!uriObj.host()) {
                throw new Error("Host name is missing.");
            }
            var p = uriObj.path();
            if (p[p.length - 1] !== '/') {
                uriObj.setPath(p + '/');
            }
            this.uri = uriObj.toString();
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ServiceUser.prototype, "serviceDomain", {
        get: function () {
            return (new Uri(this.uri)).host();
        },
        enumerable: true,
        configurable: true
    });
    ServiceUser.prototype.startSession = function () {
        var _this = this;
        var deferred = Q.defer();
        var url = this.serviceURI + this.loginUrlPart + loginApi.startSession.URL_END;
        var xhr = xhrUtils.makeJsonRequest('POST', url, function () {
            try {
                if (xhr.status == loginApi.startSession.SC.ok) {
                    var r = xhr.response;
                    if (!r || ('string' !== typeof r.sessionId)) {
                        throw "Resource " + url + " is malformed.";
                    }
                    _this.sessionId = r.sessionId;
                    deferred.resolve();
                }
                else if (_this.canBeRedirected && (xhr.status == loginApi.startSession.SC.redirect)) {
                    var rd = xhr.response;
                    if (!rd || ('string' !== typeof rd.redirect)) {
                        throw "Resource " + url + " is malformed.";
                    }
                    // refuse second redirect
                    if (_this.redirectedFrom !== null) {
                        throw "Redirected too many times. First redirect " + "was from " + _this.redirectedFrom + " to " + _this.serviceURI + ". Second and forbidden " + "redirect is to " + rd.redirect;
                    }
                    // set params
                    _this.redirectedFrom = _this.serviceURI;
                    _this.serviceURI = rd.redirect;
                    // start redirect call
                    deferred.resolve(_this.startSession());
                }
                else {
                    xhrUtils.reject(deferred, xhr);
                }
            }
            catch (errStr) {
                xhrUtils.reject(deferred, xhr.status, errStr);
            }
        }, deferred);
        xhr.responseType = "json";
        xhr.sendJSON({
            userId: this.userId
        });
        return deferred.promise;
    };
    ServiceUser.prototype.authenticateSession = function (midSigner) {
        var _this = this;
        var deferred = Q.defer();
        var url = this.serviceURI + this.loginUrlPart + loginApi.authSession.URL_END;
        var xhr = xhrUtils.makeJsonRequest('POST', url, function () {
            if (xhr.status == loginApi.authSession.SC.ok) {
                deferred.resolve();
            }
            else {
                if (xhr.status == loginApi.authSession.SC.authFailed) {
                    _this.sessionId = null;
                }
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.sendJSON({
            assertion: midSigner.generateAssertionFor(this.serviceDomain, this.sessionId),
            userCert: midSigner.userCert,
            provCert: midSigner.providerCert
        });
        return deferred.promise;
    };
    /**
     * This starts and authorizes a new session.
     * @param assertionSigner
     * @return a promise, resolvable, when mailerId login successfully
     * completes.
     */
    ServiceUser.prototype.login = function (midSigner) {
        var _this = this;
        if (this.sessionId) {
            throw new Error("Session is already opened.");
        }
        var promise = this.startSession().then(function () {
            return _this.authenticateSession(midSigner);
        });
        return promise;
    };
    /**
     * This method closes current session.
     * @return a promise for request completion.
     */
    ServiceUser.prototype.logout = function () {
        var _this = this;
        var url = this.serviceURI + this.logoutUrlEnd;
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('POST', url, function () {
            if (xhr.status == 200) {
                deferred.resolve();
            }
            else {
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.send();
        return deferred.promise.fin(function () {
            _this.sessionId = null;
        });
    };
    return ServiceUser;
})();
exports.ServiceUser = ServiceUser;
Object.freeze(exports);

},{"../lib-common/service-api/mailer-id/login":43,"./xhr-utils":33,"jsuri":"jsuri","q":"q"}],30:[function(require,module,exports){
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
 * This defines a base class for some service's client that logs in with
 * Public Key Login process and uses respectively authenticated session.
 */
var xhrUtils = require('./xhr-utils');
var Q = require('q');
var base64 = require('../lib-common/base64');
var nacl = require('ecma-nacl');
var Uri = require('jsuri');
var sessionEncr = require('../lib-common/session-encryptor');
var loginApi = require('../lib-common/service-api/pub-key-login');
var sbox = nacl.secret_box;
var PUB_KEY_LENGTH = nacl.box.KEY_LENGTH;
var ServiceUser = (function () {
    function ServiceUser(userId, opts) {
        this.sessionId = null;
        this.redirectedFrom = null;
        this.encryptor = null;
        this.encChallenge = null;
        this.serverPubKey = null;
        this.serverVerificationBytes = null;
        this.keyDerivationParams = null;
        this.userId = userId;
        this.loginUrlPart = opts.login;
        if ((this.loginUrlPart.length > 0) && (this.loginUrlPart[this.loginUrlPart.length - 1] !== '/')) {
            this.loginUrlPart += '/';
        }
        this.logoutUrlEnd = opts.logout;
        this.canBeRedirected = !!opts.canBeRedirected;
    }
    Object.defineProperty(ServiceUser.prototype, "serviceURI", {
        get: function () {
            return this.uri;
        },
        set: function (uriString) {
            var uriObj = new Uri(uriString);
            if (uriObj.protocol() !== 'https') {
                throw new Error("Url protocol must be https.");
            }
            if (!uriObj.host()) {
                throw new Error("Host name is missing.");
            }
            var p = uriObj.path();
            if (p[p.length - 1] !== '/') {
                uriObj.setPath(p + '/');
            }
            this.uri = uriObj.toString();
        },
        enumerable: true,
        configurable: true
    });
    ServiceUser.prototype.startSession = function () {
        var _this = this;
        var deferred = Q.defer();
        var url = this.serviceURI + this.loginUrlPart + loginApi.start.URL_END;
        var xhr = xhrUtils.makeJsonRequest('POST', url, function () {
            try {
                if (xhr.status == loginApi.start.SC.ok) {
                    var r = xhr.response;
                    // set sessionid
                    if (!r || ('string' !== typeof r.sessionId)) {
                        throw "Resource " + url + " is malformed.";
                    }
                    _this.sessionId = r.sessionId;
                    // set server public key
                    if ('string' !== typeof r.serverPubKey) {
                        throw "Response from server is malformed, " + "as serverPubKey string is missing.";
                    }
                    try {
                        _this.serverPubKey = base64.open(r.serverPubKey);
                        if (_this.serverPubKey.length !== PUB_KEY_LENGTH) {
                            throw "Server's key has a wrong size.";
                        }
                    }
                    catch (err) {
                        throw "Response from server is malformed: " + "bad serverPubKey string. Error: " + (('string' === typeof err) ? err : err.message);
                    }
                    // get encrypted session key from json body
                    if ('string' !== typeof r.sessionKey) {
                        throw "Response from server is malformed, " + "as sessionKey string is missing.";
                    }
                    try {
                        _this.encChallenge = base64.open(r.sessionKey);
                        if (_this.encChallenge.length !== (sbox.NONCE_LENGTH + sbox.KEY_LENGTH)) {
                            throw "Byte chunk with session key " + "has a wrong size.";
                        }
                    }
                    catch (err) {
                        throw "Response from server is malformed: " + "bad sessionKey string. Error: " + (('string' === typeof err) ? err : err.message);
                    }
                    // get key derivation parameters
                    if ('object' !== typeof r.keyDerivParams) {
                        throw "Response from server is malformed, " + "as keyDerivParams string is missing.";
                    }
                    _this.keyDerivationParams = r.keyDerivParams;
                    // done
                    deferred.resolve();
                }
                else if (_this.canBeRedirected && (xhr.status == loginApi.start.SC.redirect)) {
                    var rd = xhr.response;
                    if (!rd || ('string' !== typeof rd.redirect)) {
                        throw "Resource " + url + " is malformed.";
                    }
                    // refuse second redirect
                    if (_this.redirectedFrom !== null) {
                        throw "Redirected too many times. First redirect " + "was from " + _this.redirectedFrom + " to " + _this.serviceURI + ". Second and forbidden " + "redirect is to " + rd.redirect;
                    }
                    // set params
                    _this.redirectedFrom = _this.serviceURI;
                    _this.serviceURI = rd.redirect;
                    // start redirect call
                    deferred.resolve(_this.startSession());
                }
                else {
                    xhrUtils.reject(deferred, xhr);
                }
            }
            catch (errStr) {
                xhrUtils.reject(deferred, xhr.status, errStr);
            }
        }, deferred, this.sessionId);
        xhr.responseType = "json";
        xhr.sendJSON({
            userId: this.userId
        });
        return deferred.promise;
    };
    ServiceUser.prototype.openSessionKey = function (dhsharedKeyCalculator) {
        // encrypted challenge has session key packaged into WN format, with
        // poly part cut out. Therefore, usual open method will not do as it
        // does poly check. We should recall that cipher is a stream with data
        // xor-ed into it. Encrypting zeros gives us stream bytes, which can
        // be xor-ed into the data part of challenge bytes to produce a key.
        var dhsharedKey = dhsharedKeyCalculator(this.serverPubKey);
        var nonce = new Uint8Array(this.encChallenge.subarray(0, sbox.NONCE_LENGTH));
        var sessionKey = new Uint8Array(this.encChallenge.subarray(sbox.NONCE_LENGTH));
        var zeros = new Uint8Array(sbox.KEY_LENGTH);
        var streamBytes = sbox.pack(zeros, nonce, dhsharedKey);
        streamBytes = streamBytes.subarray(streamBytes.length - sbox.KEY_LENGTH);
        for (var i = 0; i < sbox.KEY_LENGTH; i += 1) {
            sessionKey[i] ^= streamBytes[i];
        }
        // since there was no poly, we are not sure, if we are talking to server
        // that knows our public key. Server shall give us these bytes, and we
        // should prepare ours for comparison.
        this.serverVerificationBytes = sbox.pack(sessionKey, nonce, dhsharedKey);
        this.serverVerificationBytes = this.serverVerificationBytes.subarray(0, sbox.POLY_LENGTH);
        nacl.nonce.advanceOddly(nonce);
        this.encryptor = sessionEncr.makeSessionEncryptor(sessionKey, nonce);
        // encrypt session key for completion of login exchange
        this.encChallenge = this.encryptor.pack(sessionKey);
        // cleanup arrays
        nacl.arrays.wipe(dhsharedKey, nonce, sessionKey);
    };
    ServiceUser.prototype.completeLoginExchange = function () {
        var _this = this;
        var deferred = Q.defer();
        var url = this.serviceURI + this.loginUrlPart + loginApi.complete.URL_END;
        var xhr = xhrUtils.makeBinaryRequest('POST', url, function () {
            if (xhr.status == loginApi.complete.SC.ok) {
                var bytesToVerify = new Uint8Array(xhr.response);
                // compare bytes to check, if server is can be trusted
                if (nacl.compareVectors(bytesToVerify, _this.serverVerificationBytes)) {
                    deferred.resolve();
                    _this.serverVerificationBytes = null;
                }
                else {
                    var err = (new Error("Server verification failed."));
                    err.serverNotTrusted = true;
                    deferred.reject(err);
                }
            }
            else {
                if (xhr.status == loginApi.complete.SC.authFailed) {
                    _this.sessionId = null;
                }
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.responseType = "arraybuffer";
        xhr.send(this.encChallenge);
        this.encChallenge = null;
        return deferred.promise;
    };
    /**
     * @param genOfDHKeyCalcPromise is a function that takes key derivation
     * parameters, and returns promise of DH key calculating function, which
     * in its order takes server's public key as a single parameter.
     * @return promise, resolvable when PKL process completes.
     */
    ServiceUser.prototype.login = function (genOfDHKeyCalcPromise) {
        var _this = this;
        var promise = this.startSession().then(function () {
            return genOfDHKeyCalcPromise(_this.keyDerivationParams);
        }).then(function (dhsharedKeyCalculator) {
            return _this.openSessionKey(dhsharedKeyCalculator);
        }).then(function () {
            return _this.completeLoginExchange();
        });
        return promise;
    };
    /**
     * This method closes current session.
     * @return a promise for request completion.
     */
    ServiceUser.prototype.logout = function () {
        var _this = this;
        var url = this.serviceURI + this.logoutUrlEnd;
        var deferred = Q.defer();
        var xhr = xhrUtils.makeBodylessRequest('POST', url, function () {
            if (xhr.status == 200) {
                deferred.resolve();
            }
            else {
                xhrUtils.reject(deferred, xhr);
            }
        }, deferred, this.sessionId);
        xhr.send();
        return deferred.promise.fin(function () {
            _this.sessionId = null;
            _this.encryptor.destroy();
            _this.encryptor = null;
        });
    };
    return ServiceUser;
})();
exports.ServiceUser = ServiceUser;
Object.freeze(exports);

},{"../lib-common/base64":35,"../lib-common/service-api/pub-key-login":45,"../lib-common/session-encryptor":46,"./xhr-utils":33,"ecma-nacl":"ecma-nacl","jsuri":"jsuri","q":"q"}],31:[function(require,module,exports){
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
 * This is for shared things between main and other-thread parts of a worker.
 */
var base64 = require('../../lib-common/base64');
var utf8 = require('../../lib-common/utf8');
function paramsFromJson(passStr, paramsInJson) {
    var salt;
    var pass;
    try {
        if (('number' !== typeof paramsInJson.logN) || (paramsInJson.logN < 10)) {
            throw "Bad parameter logN.";
        }
        if (('number' !== typeof paramsInJson.r) || (paramsInJson.r < 1)) {
            throw "Bad parameter r.";
        }
        if (('number' !== typeof paramsInJson.p) || (paramsInJson.p < 1)) {
            throw "Bad parameter p.";
        }
        salt = base64.open(paramsInJson.salt);
        pass = utf8.pack(passStr);
    }
    catch (e) {
        if ('string' === typeof e) {
            throw new Error(e);
        }
        else {
            throw new Error("Bad parameter:\n" + e.message);
        }
    }
    return {
        logN: paramsInJson.logN,
        r: paramsInJson.r,
        p: paramsInJson.p,
        pass: pass,
        salt: salt
    };
}
exports.paramsFromJson = paramsFromJson;
function paramsToWorkMsg(params) {
    return {
        json: {
            pass: params.pass.buffer,
            salt: params.salt.buffer,
            logN: params.logN,
            r: params.r,
            p: params.p
        },
        buffers: [params.pass.buffer, params.salt.buffer]
    };
}
exports.paramsToWorkMsg = paramsToWorkMsg;
function workMsgToParams(msgData) {
    return {
        logN: msgData.logN,
        r: msgData.r,
        p: msgData.p,
        pass: new Uint8Array(msgData.pass),
        salt: new Uint8Array(msgData.salt)
    };
}
exports.workMsgToParams = workMsgToParams;
Object.freeze(exports);

},{"../../lib-common/base64":35,"../../lib-common/utf8":47}],32:[function(require,module,exports){
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
var Q = require('q');
var log = require('../../lib-client/page-logging');
var keyGenUtil = require('./key-gen-common');
/**
 * @param pass is a passphrase, from which a key should be generated.
 * @param keyGenParams is an object with parameters needed for key generation
 * from passphrase.
 * @return a promise, resolvable to Uint8Array with generated key.
 */
function deriveKeyFromPass(pass, keyGenParams) {
    // derive secret key from the password 
    // this needs a web-worker, as scrypt is intense 
    var deferred = Q.defer();
    var worker = new Worker('./key-gen-worker.js');
    worker.addEventListener('message', function (e) {
        if (e.data.progress) {
            log.write("Derivation progress: " + e.data.progress + "%");
            return;
        }
        if (e.data.key) {
            deferred.resolve(new Uint8Array(e.data.key));
            log.write("Secret key has been derived from a password.");
        }
        else {
            log.write("Error occured in key-deriving web-worker: " + e.data.error);
            throw new Error("Cannot derive secret key. Error message: " + e.data.error);
        }
        worker.terminate();
        worker = null;
    });
    log.write("Starting derivation of secret key from given passphrase, using " + "Ecma-NaCl implementation of scrypt. Parameters are salt: " + keyGenParams.salt + ", " + "logN: " + keyGenParams.logN + ", r: " + keyGenParams.r + ", p: " + keyGenParams.p + ". Memory use is on the order of " + Math.floor(keyGenParams.r * Math.pow(2, 7 + keyGenParams.logN - 20)) + "MB.");
    var workMsg = keyGenUtil.paramsToWorkMsg(keyGenUtil.paramsFromJson(pass, keyGenParams));
    worker.postMessage(workMsg.json, workMsg.buffers);
    return deferred.promise;
}
exports.deriveKeyFromPass = deriveKeyFromPass;
Object.freeze(exports);

},{"../../lib-client/page-logging":25,"./key-gen-common":31,"q":"q"}],33:[function(require,module,exports){
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
exports.SESSION_ID_HEADER = "X-Session-Id";
function makeRequest(contentType, method, url, onLoad, onError, sessionId) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.onload = onLoad;
    if ('function' === typeof onError) {
        xhr.onerror = onError;
    }
    else {
        var deferred = onError;
        xhr.onerror = function () {
            deferred.reject(new Error("Cannot connect to " + url));
        };
    }
    if (contentType) {
        xhr.setRequestHeader('Content-Type', contentType);
    }
    if (sessionId) {
        xhr.setRequestHeader(exports.SESSION_ID_HEADER, sessionId);
    }
    return xhr;
}
/**
 * This assembles XMLHttpRequest with 'Content-Type: application/json'.
 * Session id header is added, if string id is given.
 * @param method
 * @param url
 * @param onLoad
 * @param onError it can either be an actual error handling function,
 * or a deferred object that gets rejected in a default way.
 * @param sessionId
 * @return JSONHttpRequest object, which is a XMLHttpRequest with attached
 * sendJSON() method.
 */
function makeJsonRequest(method, url, onLoad, onError, sessionId) {
    var jhr = makeRequest('application/json', method, url, onLoad, onError, sessionId);
    jhr.sendJSON = function (json) {
        jhr.send(JSON.stringify(json));
    };
    return jhr;
}
exports.makeJsonRequest = makeJsonRequest;
/**
 * This assembles XMLHttpRequest with 'Content-Type: application/octet-stream'.
 * Session id header is added, if string id is given.
 * @param method
 * @param url
 * @param onLoad
 * @param onError it can either be an actual error handling function,
 * or a deferred object that gets rejected in a default way.
 * @param sessionId
 * @returns XMLHttpRequest object, setup and ready for send(blob).
 */
function makeBinaryRequest(method, url, onLoad, onError, sessionId) {
    return makeRequest('application/octet-stream', method, url, onLoad, onError, sessionId);
}
exports.makeBinaryRequest = makeBinaryRequest;
/**
 * This assembles XMLHttpRequest with 'Content-Type: text/plain'.
 * Session id header is added, if string id is given.
 * @param method
 * @param url
 * @param onLoad
 * @param onError it can either be an actual error handling function,
 * or a deferred object that gets rejected in a default way.
 * @param sessionId
 * @returns XMLHttpRequest object, setup and ready for send(string).
 */
function makeTextRequest(method, url, onLoad, onError, sessionId) {
    return makeRequest('text/plain', method, url, onLoad, onError, sessionId);
}
exports.makeTextRequest = makeTextRequest;
/**
 * This assembles XMLHttpRequest without 'Content-Type'.
 * Session id header is added, if string id is given.
 * @param method
 * @param url
 * @param onLoad
 * @param onError it can either be an actual error handling function,
 * or a deferred object that gets rejected in a default way.
 * @param sessionId
 * @returns XMLHttpRequest object, setup and ready for send(string).
 */
function makeBodylessRequest(method, url, onLoad, onError, sessionId) {
    var xhr = makeRequest(null, method, url, onLoad, onError, sessionId);
    var initSend = xhr.send;
    xhr.send = function (data) {
        if ('undefined' !== typeof data) {
            throw new Error("There should be no data in a body-less request.");
        }
        initSend.call(xhr);
    };
    return xhr;
}
exports.makeBodylessRequest = makeBodylessRequest;
/**
 * This sets a reject in a given deferred to HttpError with a given message,
 * status field, and XMLHttpRequest, if it has been given.
 * @param deferred is deferred object that has its rejected state set by this
 * function.
 * @param xhr is XMLHttpRequest object of the original request, or numberic
 * status code. In the first case, status code is taken from it, as well as
 * error message. Error message is taken from json's error field, or, response
 * is taken, if return type is text.
 * Else, statusText is used as a message.
 *
 */
function reject(deferred, statusOrXhr, errMsg) {
    var msg;
    var status;
    var xhr;
    if ("number" === typeof statusOrXhr) {
        msg = errMsg;
        status = statusOrXhr;
    }
    else {
        xhr = statusOrXhr;
        status = xhr.status;
        if ((xhr.responseType === '') || (xhr.responseType === 'text')) {
            msg = ((xhr.response !== null) ? xhr.response : xhr.statusText);
        }
        else if (xhr.responseType === 'json') {
            msg = (((xhr.response !== null) && xhr.response.error) ? xhr.response.error : xhr.statusText);
        }
        else {
            msg = xhr.statusText;
        }
    }
    var err = (new Error(msg));
    err.status = status;
    err.xhr = xhr;
    deferred.reject(err);
}
exports.reject = reject;
Object.freeze(exports);

},{}],34:[function(require,module,exports){
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
function mergeArrays(arr) {
    var resLen = 0;
    for (var i = 0; i < arr.length; i += 1) {
        resLen += arr[i].length;
    }
    var res = new Uint8Array(resLen);
    var offset = 0;
    var chunk;
    for (var i = 0; i < arr.length; i += 1) {
        chunk = arr[i];
        res.set(chunk, offset);
        offset += chunk.length;
    }
    ;
    return res;
}
function openAllSegs(reader, allSegs) {
    var dataParts = [];
    var segInd = 0;
    var offset = 0;
    var decRes;
    while (offset < allSegs.length) {
        decRes = reader.openSeg(allSegs.subarray(offset), segInd);
        offset += decRes.segLen;
        segInd += 1;
        dataParts.push(decRes.data);
    }
    return mergeArrays(dataParts);
}
exports.openAllSegs = openAllSegs;
Object.freeze(exports);

},{}],35:[function(require,module,exports){
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
 * This module provides an object with functions that encode array of octets
 * (binary data) into base64 strings.
 * Bytes, array of octets, are assumed to be in Uint8Array form, and the same
 * is produced in decoding.
 *
 * Base64 implemented here uses alphabet, described in
 * https://tools.ietf.org/html/rfc4648 (RFC 4648),
 * i.e. last to chars are '+' and '/', with '=' used for padding, in a
 * strict correspondence of steps, described in RFC document.
 * Base64 encoder will not tolerate neither non-alphabet characters, nor
 * missing padding characters, if these are required, as per quoted RFC
 * document.
 *
 * There is an urlSafe object with url safe version of base64.
 */
/**
 * We shall use some numerical constants, which we display here for readable
 * reference.
 * Note that placing them in variables shall add lookup penalty, as this is
 * dynamic javascript.
 * 3   === parseInt('11',2)
 * 15  === parseInt('1111',2)
 * 63  === parseInt('111111',2)
*/
function encodeBytesToBase64Universal(bytes, intToLetDict, pad) {
    var paddedSectionLength = (bytes.length % 3);
    var fullTriplesLength = (bytes.length - paddedSectionLength);
    var chars = new Array(4 * (fullTriplesLength / 3 + (paddedSectionLength === 0 ? 0 : 1)));
    var charIndex = 0;
    var n;
    var b1;
    var b2;
    var b3;
    for (var i = 0; i < fullTriplesLength; i += 3) {
        b1 = bytes[i];
        b2 = bytes[i + 1];
        b3 = bytes[i + 2];
        // 1st six bits
        n = (b1 >>> 2);
        chars[charIndex] = intToLetDict[n];
        charIndex += 1;
        // 2nd six bits
        n = ((b1 & 3) << 4) | (b2 >>> 4);
        chars[charIndex] = intToLetDict[n];
        charIndex += 1;
        // 3rd six bits
        n = ((b2 & 15) << 2) | (b3 >>> 6);
        chars[charIndex] = intToLetDict[n];
        charIndex += 1;
        // 4th six bits
        n = (b3 & 63);
        chars[charIndex] = intToLetDict[n];
        charIndex += 1;
    }
    if (paddedSectionLength === 1) {
        b1 = bytes[fullTriplesLength];
        // 1st six bits
        n = (b1 >>> 2);
        chars[charIndex] = intToLetDict[n];
        charIndex += 1;
        // last 2 bits, padded with zeros
        n = ((b1 & 3) << 4);
        chars[charIndex] = intToLetDict[n];
        chars[charIndex + 1] = pad;
        chars[charIndex + 2] = pad;
    }
    else if (paddedSectionLength === 2) {
        b1 = bytes[fullTriplesLength];
        b2 = bytes[fullTriplesLength + 1];
        // 1st six bits
        n = (b1 >>> 2);
        chars[charIndex] = intToLetDict[n];
        charIndex += 1;
        // 2nd six bits
        n = ((b1 & 3) << 4) | (b2 >>> 4);
        chars[charIndex] = intToLetDict[n];
        charIndex += 1;
        // last 4 bits, padded with zeros
        n = ((b2 & 15) << 2);
        chars[charIndex] = intToLetDict[n];
        chars[charIndex + 1] = pad;
    }
    return chars.join('');
}
function getNumberFrom(letToIntDict, ch) {
    var n = letToIntDict[ch];
    if ('undefined' === typeof n) {
        throw new Error("String contains character '" + ch + "', which is not present in base64 representation alphabet.");
    }
    return n;
}
function decodeUniversalBase64String(str, letToIntDict, pad) {
    if ((str.length % 4) > 0) {
        throw new Error("Given string's length is not multiple of four, while " + "base64 representation with mandatory padding expects such length.");
    }
    if (str.length === 0) {
        return new Uint8Array(0);
    }
    var numOfBytesInPaddedSection = 0;
    if (str[str.length - 2] === pad) {
        numOfBytesInPaddedSection = 1;
    }
    else if (str[str.length - 1] === pad) {
        numOfBytesInPaddedSection = 2;
    }
    var bytes = new Uint8Array((str.length / 4 - 1) * 3 + (numOfBytesInPaddedSection === 0 ? 3 : numOfBytesInPaddedSection));
    var strLenOfCompleteGroups = (str.length - (numOfBytesInPaddedSection === 0 ? 0 : 4));
    var byteIndex = 0;
    var b;
    var n;
    for (var i = 0; i < strLenOfCompleteGroups; i += 4) {
        // 1st octet
        n = getNumberFrom(letToIntDict, str[i]);
        b = n << 2;
        n = getNumberFrom(letToIntDict, str[i + 1]);
        b |= (n >>> 4);
        bytes[byteIndex] = b;
        byteIndex += 1;
        // 2nd octet
        b = (n & 15) << 4;
        n = getNumberFrom(letToIntDict, str[i + 2]);
        b |= (n >>> 2);
        bytes[byteIndex] = b;
        byteIndex += 1;
        // 3rd octet
        b = (n & 3) << 6;
        n = getNumberFrom(letToIntDict, str[i + 3]);
        b |= n;
        bytes[byteIndex] = b;
        byteIndex += 1;
    }
    if (numOfBytesInPaddedSection === 1) {
        // 1st octet only
        n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups]);
        b = n << 2;
        n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups + 1]);
        b |= (n >>> 4);
        bytes[byteIndex] = b;
    }
    else if (numOfBytesInPaddedSection === 2) {
        // 1st octet
        n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups]);
        b = n << 2;
        n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups + 1]);
        b |= (n >>> 4);
        bytes[byteIndex] = b;
        // 2nd octet
        b = (n & 15) << 4;
        n = getNumberFrom(letToIntDict, str[strLenOfCompleteGroups + 2]);
        b |= (n >>> 2);
        bytes[byteIndex + 1] = b;
    }
    return bytes;
}
function makeLetToIntDict(intToLetDict) {
    var dict = {}, l;
    for (var i = 0; i < intToLetDict.length; i += 1) {
        l = intToLetDict[i];
        dict[l] = i;
    }
    return dict;
}
// This is a standard base64 alphabet, and corresponding functions
var BASE64_INT_TO_LETTER_DICTIONARY = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var BASE64_LETTER_TO_INT_DICTIONARY = makeLetToIntDict(BASE64_INT_TO_LETTER_DICTIONARY);
var BASE64_PAD = '=';
function pack(bytes) {
    return encodeBytesToBase64Universal(bytes, BASE64_INT_TO_LETTER_DICTIONARY, BASE64_PAD);
}
exports.pack = pack;
function open(str) {
    return decodeUniversalBase64String(str, BASE64_LETTER_TO_INT_DICTIONARY, BASE64_PAD);
}
exports.open = open;
//This is a URL/filesystem safe base64 alphabet, and corresponding functions
var URL_SAFE_BASE64_INT_TO_LETTER_DICTIONARY = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
var URL_SAFE_BASE64_LETTER_TO_INT_DICTIONARY = makeLetToIntDict(URL_SAFE_BASE64_INT_TO_LETTER_DICTIONARY);
var urlSafe;
(function (urlSafe) {
    function open(str) {
        return decodeUniversalBase64String(str, URL_SAFE_BASE64_LETTER_TO_INT_DICTIONARY, BASE64_PAD);
    }
    urlSafe.open = open;
    function pack(bytes) {
        return encodeBytesToBase64Universal(bytes, URL_SAFE_BASE64_INT_TO_LETTER_DICTIONARY, BASE64_PAD);
    }
    urlSafe.pack = pack;
})(urlSafe = exports.urlSafe || (exports.urlSafe = {}));
Object.freeze(urlSafe);
Object.freeze(exports);

},{}],36:[function(require,module,exports){
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
exports.Code = {
    noFile: 'ENOENT',
    fileExists: 'EEXIST',
    notDirectory: 'ENOTDIR',
    isDirectory: 'EISDIR'
};
function makeErr(code, msg) {
    var err = new Error(msg);
    err.code = code;
    return err;
}
exports.makeErr = makeErr;

},{}],37:[function(require,module,exports){
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
 * This module defines json form of keys and signed objects.
 */
var base64 = require('./base64');
var utf8 = require('./utf8');
function isLikeJsonKey(jkey) {
    return (('object' === typeof jkey) && !!jkey && ('string' === typeof jkey.alg) && !!jkey.alg && ('string' === typeof jkey.kid) && !!jkey.kid && ('string' === typeof jkey.k) && !!jkey.k && ('string' === typeof jkey.kid && !!jkey.kid));
}
exports.isLikeJsonKey = isLikeJsonKey;
function isLikeSignedLoad(load) {
    return (('object' === typeof load) && !!load && ('string' === typeof load.alg) && !!load.alg && ('string' === typeof load.kid) && !!load.kid && ('string' === typeof load.sig) && !!load.sig && ('string' === typeof load.load && !!load.load));
}
exports.isLikeSignedLoad = isLikeSignedLoad;
function isLikeKeyCert(cert) {
    return (('object' === typeof cert) && !!cert && ('number' === typeof cert.expiresAt) && ('number' === typeof cert.issuedAt) && (cert.expiresAt > cert.issuedAt) && ('string' === typeof cert.issuer) && !!cert.issuer && ('object' === typeof cert.cert) && !!cert.cert && ('object' === typeof cert.cert.principal) && !!cert.cert.principal && ('string' === typeof cert.cert.principal.address) && !!cert.cert.principal.address && isLikeJsonKey(cert.cert.publicKey));
}
exports.isLikeKeyCert = isLikeKeyCert;
function isLikeSignedKeyCert(load) {
    if (!isLikeSignedLoad(load)) {
        return false;
    }
    try {
        return isLikeKeyCert(JSON.parse(utf8.open(base64.open(load.load))));
    }
    catch (e) {
        return false;
    }
}
exports.isLikeSignedKeyCert = isLikeSignedKeyCert;
function keyFromJson(key, use, alg, klen) {
    if (key.use === use) {
        if (key.alg === alg) {
            var bytes = base64.open(key.k);
            if (bytes.length !== klen) {
                throw new Error("Key " + key.kid + " has a wrong number of bytes");
            }
            return {
                use: key.use,
                alg: key.alg,
                kid: key.kid,
                k: bytes
            };
        }
        else {
            throw new Error("Key " + key.kid + ", should be used with unsupported algorithm '" + key.alg + "'");
        }
    }
    else {
        throw new Error("Key " + key.kid + " has incorrect use '" + key.use + "', instead of '" + use + "'");
    }
}
exports.keyFromJson = keyFromJson;
function keyToJson(key) {
    return {
        use: key.use,
        alg: key.alg,
        kid: key.kid,
        k: base64.pack(key.k)
    };
}
exports.keyToJson = keyToJson;
function getKeyCert(signedCert) {
    return JSON.parse(utf8.open(base64.open(signedCert.load)));
}
exports.getKeyCert = getKeyCert;
function getPubKey(signedCert) {
    return getKeyCert(signedCert).cert.publicKey;
}
exports.getPubKey = getPubKey;
function getPrincipalAddress(signedCert) {
    return getKeyCert(signedCert).cert.principal.address;
}
exports.getPrincipalAddress = getPrincipalAddress;
Object.freeze(exports);

},{"./base64":35,"./utf8":47}],38:[function(require,module,exports){
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

},{"./base64":35,"./jwkeys":37,"./utf8":47,"ecma-nacl":"ecma-nacl"}],39:[function(require,module,exports){
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
 * This defines interfaces for mail retrieval requests.
 */
var midApi = require('../mailer-id/login');
var Uri = require('jsuri');
exports.ERR_SC = {
    malformed: 400,
    needAuth: 401,
    server: 500,
    contentTooLong: 413,
    contentLenMissing: 411,
    wrongContentType: 415,
    noSpace: 480
};
Object.freeze(exports.ERR_SC);
exports.HTTP_HEADER = {
    contentType: 'Content-Type',
    contentLength: 'Content-Length',
    objVersion: 'X-Version'
};
Object.freeze(exports.HTTP_HEADER);
exports.BIN_TYPE = 'application/octet-stream';
var midLogin;
(function (midLogin) {
    midLogin.MID_URL_PART = 'login/mailerid/';
    midLogin.START_URL_END = midLogin.MID_URL_PART + midApi.startSession.URL_END;
    midLogin.AUTH_URL_END = midLogin.MID_URL_PART + midApi.authSession.URL_END;
})(midLogin = exports.midLogin || (exports.midLogin = {}));
Object.freeze(midLogin);
var closeSession;
(function (closeSession) {
    closeSession.URL_END = 'session/close';
})(closeSession = exports.closeSession || (exports.closeSession = {}));
Object.freeze(closeSession);
var sessionParams;
(function (sessionParams) {
    sessionParams.URL_END = 'session/params';
})(sessionParams = exports.sessionParams || (exports.sessionParams = {}));
Object.freeze(sessionParams);
function getOptsToString(opts) {
    if (!opts) {
        return '';
    }
    var url = new Uri();
    if ('number' === typeof opts.ofs) {
        url.addQueryParam('ofs', '' + opts.ofs);
    }
    if ('number' === typeof opts.len) {
        url.addQueryParam('len', '' + opts.len);
    }
    if ('number' === typeof opts.ver) {
        url.addQueryParam('ver', '' + opts.ver);
    }
    return url.toString();
}
function putOptsToString(opts) {
    var url = new Uri();
    url.addQueryParam('trans', '' + opts.trans);
    if (opts.append) {
        url.addQueryParam('append', 'true');
        return url.toString();
    }
    else {
        if ('number' === typeof opts.ofs) {
            url.addQueryParam('ofs', opts.ofs);
            return url.toString();
        }
        else {
            throw new Error('Incorrect options are given.');
        }
    }
}
var rootHeader;
(function (rootHeader) {
    rootHeader.EXPRESS_URL_END = 'root/header';
    function getReqUrlEnd(opts) {
        return rootHeader.EXPRESS_URL_END + getOptsToString(opts);
    }
    rootHeader.getReqUrlEnd = getReqUrlEnd;
    function putReqUrlEnd(opts) {
        return rootHeader.EXPRESS_URL_END + putOptsToString(opts);
    }
    rootHeader.putReqUrlEnd = putReqUrlEnd;
    rootHeader.SC = {
        okGet: 200,
        okPut: 201,
        missing: 474
    };
    Object.freeze(rootHeader.SC);
})(rootHeader = exports.rootHeader || (exports.rootHeader = {}));
Object.freeze(rootHeader);
var rootSegs;
(function (rootSegs) {
    rootSegs.EXPRESS_URL_END = 'root/segments';
    function getReqUrlEnd(opts) {
        return rootSegs.EXPRESS_URL_END + getOptsToString(opts);
    }
    rootSegs.getReqUrlEnd = getReqUrlEnd;
    function putReqUrlEnd(opts) {
        return rootSegs.EXPRESS_URL_END + putOptsToString(opts);
    }
    rootSegs.putReqUrlEnd = putReqUrlEnd;
    rootSegs.SC = rootHeader.SC;
})(rootSegs = exports.rootSegs || (exports.rootSegs = {}));
Object.freeze(rootHeader);
var objHeader;
(function (objHeader) {
    objHeader.EXPRESS_URL_END = 'obj/:objId/header';
    function getReqUrlEnd(objId, opts) {
        return 'obj/' + objId + '/header' + getOptsToString(opts);
    }
    objHeader.getReqUrlEnd = getReqUrlEnd;
    function putReqUrlEnd(objId, opts) {
        return 'obj/' + objId + '/header' + putOptsToString(opts);
    }
    objHeader.putReqUrlEnd = putReqUrlEnd;
    objHeader.SC = {
        okGet: 200,
        okPut: 201,
        unknownObj: 474
    };
    Object.freeze(objHeader.SC);
})(objHeader = exports.objHeader || (exports.objHeader = {}));
Object.freeze(objHeader);
var objSegs;
(function (objSegs) {
    objSegs.EXPRESS_URL_END = 'obj/:objId/segments';
    function getReqUrlEnd(objId, opts) {
        return 'obj/' + objId + '/segments' + getOptsToString(opts);
    }
    objSegs.getReqUrlEnd = getReqUrlEnd;
    function putReqUrlEnd(objId, opts) {
        return 'obj/' + objId + '/segments' + putOptsToString(opts);
    }
    objSegs.putReqUrlEnd = putReqUrlEnd;
    objSegs.SC = objHeader.SC;
})(objSegs = exports.objSegs || (exports.objSegs = {}));
Object.freeze(objSegs);
var startTransaction;
(function (startTransaction) {
    startTransaction.EXPRESS_URL_END = 'obj/:objId/transaction/start';
    function getReqUrlEnd(objId) {
        return 'obj/' + objId + '/transaction/start';
    }
    startTransaction.getReqUrlEnd = getReqUrlEnd;
    startTransaction.SC = {
        ok: 200,
        unknownObj: 474,
        objAlreadyExists: 473,
        concurrentTransaction: 483,
        incompatibleObjState: 484
    };
    Object.freeze(startTransaction.SC);
})(startTransaction = exports.startTransaction || (exports.startTransaction = {}));
Object.freeze(startTransaction);
var startRootTransaction;
(function (startRootTransaction) {
    startRootTransaction.URL_END = 'root/transaction/start';
})(startRootTransaction = exports.startRootTransaction || (exports.startRootTransaction = {}));
Object.freeze(startRootTransaction);
var finalizeTransaction;
(function (finalizeTransaction) {
    finalizeTransaction.EXPRESS_URL_END = 'obj/:objId/transaction/finalize/:transactionId';
    function getReqUrlEnd(objId, transactionId) {
        return 'obj/' + objId + '/transaction/finalize/' + transactionId;
    }
    finalizeTransaction.getReqUrlEnd = getReqUrlEnd;
    finalizeTransaction.SC = {
        ok: 200,
        unknownObj: 474,
        unknownTransaction: 484
    };
    Object.freeze(finalizeTransaction.SC);
})(finalizeTransaction = exports.finalizeTransaction || (exports.finalizeTransaction = {}));
Object.freeze(finalizeTransaction);
var cancelTransaction;
(function (cancelTransaction) {
    cancelTransaction.EXPRESS_URL_END = 'obj/:objId/transaction/cancel/:transactionId';
    function getReqUrlEnd(objId, transactionId) {
        return 'obj/' + objId + '/transaction/cancel/' + transactionId;
    }
    cancelTransaction.getReqUrlEnd = getReqUrlEnd;
    cancelTransaction.SC = finalizeTransaction.SC;
})(cancelTransaction = exports.cancelTransaction || (exports.cancelTransaction = {}));
Object.freeze(cancelTransaction);
var finalizeRootTransaction;
(function (finalizeRootTransaction) {
    finalizeRootTransaction.EXPRESS_URL_END = 'root/transaction/finalize/:transactionId';
    function getReqUrlEnd(transactionId) {
        return 'root/transaction/finalize/' + transactionId;
    }
    finalizeRootTransaction.getReqUrlEnd = getReqUrlEnd;
    finalizeRootTransaction.SC = finalizeTransaction.SC;
})(finalizeRootTransaction = exports.finalizeRootTransaction || (exports.finalizeRootTransaction = {}));
Object.freeze(finalizeRootTransaction);
var cancelRootTransaction;
(function (cancelRootTransaction) {
    cancelRootTransaction.EXPRESS_URL_END = 'root/transaction/cancel/:transactionId';
    function getReqUrlEnd(transactionId) {
        return 'root/transaction/cancel/' + transactionId;
    }
    cancelRootTransaction.getReqUrlEnd = getReqUrlEnd;
    cancelRootTransaction.SC = finalizeTransaction.SC;
})(cancelRootTransaction = exports.cancelRootTransaction || (exports.cancelRootTransaction = {}));
Object.freeze(cancelRootTransaction);
Object.freeze(exports);

},{"../mailer-id/login":43,"jsuri":"jsuri"}],40:[function(require,module,exports){
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

},{"../mailer-id/login":43}],41:[function(require,module,exports){
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
var Uri = require('jsuri');
exports.ERR_SC = {
    duplicateReq: 475,
    earlyReq: 476,
    malformed: 400,
    server: 500,
    contentTooLong: 413,
    contentLenMissing: 411,
    wrongContentType: 415
};
Object.freeze(exports.ERR_SC);
var preFlight;
(function (preFlight) {
    preFlight.URL_END = 'pre-flight';
    preFlight.SC = {
        ok: 200,
        unknownRecipient: 474,
        senderNotAllowed: 403,
        inboxFull: 480,
        redirect: 373
    };
    Object.freeze(preFlight.SC);
})(preFlight = exports.preFlight || (exports.preFlight = {}));
Object.freeze(preFlight);
var sessionStart;
(function (sessionStart) {
    sessionStart.URL_END = 'start-session';
    sessionStart.SC = preFlight.SC;
})(sessionStart = exports.sessionStart || (exports.sessionStart = {}));
Object.freeze(sessionStart);
var authSender;
(function (authSender) {
    authSender.URL_END = 'authorize-sender';
    authSender.SC = {
        ok: 200,
        authFailed: 403
    };
    Object.freeze(authSender.SC);
})(authSender = exports.authSender || (exports.authSender = {}));
Object.freeze(authSender);
var initPubKey;
(function (initPubKey) {
    initPubKey.URL_END = 'init-pub-key';
    initPubKey.SC = {
        ok: 200,
        unknownKey: 474
    };
    Object.freeze(initPubKey.SC);
})(initPubKey = exports.initPubKey || (exports.initPubKey = {}));
Object.freeze(initPubKey);
var msgMeta;
(function (msgMeta) {
    msgMeta.URL_END = 'msg/meta';
    msgMeta.SC = {
        ok: 201
    };
})(msgMeta = exports.msgMeta || (exports.msgMeta = {}));
Object.freeze(msgMeta);
function optsToString(opts) {
    var url = new Uri();
    if ('number' === typeof opts.total) {
        url.addQueryParam('total', '' + opts.total);
    }
    if (opts.append) {
        url.addQueryParam('append', 'true');
        return url.toString();
    }
    else {
        if ('number' === typeof opts.ofs) {
            url.addQueryParam('ofs', opts.ofs);
            return url.toString();
        }
        else {
            throw new Error('Incorrect options are given.');
        }
    }
}
var msgObjHeader;
(function (msgObjHeader) {
    msgObjHeader.EXPRESS_URL_END = 'msg/obj/:objId/header';
    function genUrlEnd(objId, opts) {
        return 'msg/obj/' + objId + '/header' + optsToString(opts);
    }
    msgObjHeader.genUrlEnd = genUrlEnd;
    msgObjHeader.SC = {
        ok: 201,
        objAlreadyExists: 473,
        unknownObj: 474
    };
    Object.freeze(msgObjHeader.SC);
})(msgObjHeader = exports.msgObjHeader || (exports.msgObjHeader = {}));
Object.freeze(msgObjHeader);
var msgObjSegs;
(function (msgObjSegs) {
    msgObjSegs.EXPRESS_URL_END = 'msg/obj/:objId/segments';
    function genUrlEnd(objId, opts) {
        return 'msg/obj/' + objId + '/segments' + optsToString(opts);
    }
    msgObjSegs.genUrlEnd = genUrlEnd;
    msgObjSegs.SC = msgObjHeader.SC;
})(msgObjSegs = exports.msgObjSegs || (exports.msgObjSegs = {}));
Object.freeze(msgObjSegs);
var completion;
(function (completion) {
    completion.URL_END = 'msg-complete';
})(completion = exports.completion || (exports.completion = {}));
Object.freeze(completion);
Object.freeze(exports);

},{"jsuri":"jsuri"}],42:[function(require,module,exports){
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
 * This defines interfaces for mail retrieval requests.
 */
var midApi = require('../mailer-id/login');
var Uri = require('jsuri');
exports.ERR_SC = {
    malformed: 400,
    needAuth: 401,
    server: 500
};
Object.freeze(exports.ERR_SC);
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
var listMsgs;
(function (listMsgs) {
    listMsgs.URL_END = 'msg/ids';
})(listMsgs = exports.listMsgs || (exports.listMsgs = {}));
Object.freeze(listMsgs);
var rmMsg;
(function (rmMsg) {
    rmMsg.EXPRESS_URL_END = 'msg/:msgId';
    function genUrlEnd(msgId) {
        return 'msg/' + msgId;
    }
    rmMsg.genUrlEnd = genUrlEnd;
    rmMsg.SC = {
        ok: 200,
        unknownMsg: 474
    };
    Object.freeze(rmMsg.SC);
})(rmMsg = exports.rmMsg || (exports.rmMsg = {}));
Object.freeze(rmMsg);
var msgMetadata;
(function (msgMetadata) {
    msgMetadata.EXPRESS_URL_END = 'msg/:msgId/meta';
    function genUrlEnd(msgId) {
        return 'msg/' + msgId + '/meta';
    }
    msgMetadata.genUrlEnd = genUrlEnd;
    msgMetadata.SC = {
        ok: 200,
        unknownMsg: 474
    };
    Object.freeze(msgMetadata.SC);
})(msgMetadata = exports.msgMetadata || (exports.msgMetadata = {}));
Object.freeze(msgMetadata);
function optsToString(opts) {
    if (!opts) {
        return '';
    }
    var url = new Uri();
    if ('number' === typeof opts.ofs) {
        url.addQueryParam('ofs', '' + opts.ofs);
    }
    if ('number' === typeof opts.len) {
        url.addQueryParam('len', '' + opts.len);
    }
    return url.toString();
}
var msgObjHeader;
(function (msgObjHeader) {
    msgObjHeader.EXPRESS_URL_END = 'msg/:msgId/obj/:objId/header';
    function genUrlEnd(msgId, objId, opts) {
        return 'msg/' + msgId + '/obj/' + objId + '/header' + optsToString(opts);
    }
    msgObjHeader.genUrlEnd = genUrlEnd;
    msgObjHeader.SC = {
        ok: 200,
        unknownMsgOrObj: 474
    };
    Object.freeze(msgObjHeader.SC);
})(msgObjHeader = exports.msgObjHeader || (exports.msgObjHeader = {}));
Object.freeze(msgObjHeader);
var msgObjSegs;
(function (msgObjSegs) {
    msgObjSegs.EXPRESS_URL_END = 'msg/:msgId/obj/:objId/segments';
    function genUrlEnd(msgId, objId, opts) {
        return 'msg/' + msgId + '/obj/' + objId + '/segments' + optsToString(opts);
    }
    msgObjSegs.genUrlEnd = genUrlEnd;
    msgObjSegs.SC = msgObjHeader.SC;
})(msgObjSegs = exports.msgObjSegs || (exports.msgObjSegs = {}));
Object.freeze(msgObjSegs);
Object.freeze(exports);

},{"../mailer-id/login":43,"jsuri":"jsuri"}],43:[function(require,module,exports){
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
exports.ERR_SC = {
    duplicate: 475,
    malformed: 400
};
Object.freeze(exports.ERR_SC);
var startSession;
(function (startSession) {
    startSession.URL_END = 'start-session';
    startSession.SC = {
        unknownUser: 474,
        redirect: 373,
        ok: 200
    };
    Object.freeze(startSession.SC);
})(startSession = exports.startSession || (exports.startSession = {}));
Object.freeze(startSession);
var authSession;
(function (authSession) {
    authSession.URL_END = 'authorize-session';
    authSession.SC = {
        authFailed: 403,
        ok: 200
    };
    Object.freeze(authSession.SC);
})(authSession = exports.authSession || (exports.authSession = {}));
Object.freeze(authSession);
Object.freeze(exports);

},{}],44:[function(require,module,exports){
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

},{"../pub-key-login":45}],45:[function(require,module,exports){
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

},{}],46:[function(require,module,exports){
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
 * This creates encryptor, which uses session key, established with PKL.
 */
var nacl = require('ecma-nacl');
var utf8 = require('./utf8');
function makeSessionEncryptor(key, nextNonce) {
    var encr = nacl.secret_box.formatWN.makeEncryptor(key, nextNonce, 2);
    var decr = nacl.secret_box.formatWN.makeDecryptor(key);
    return {
        open: decr.open,
        openJSON: function (bytesWN) {
            return JSON.parse(utf8.open(decr.open(bytesWN)));
        },
        pack: encr.pack,
        packJSON: function (json) {
            return encr.pack(utf8.pack(JSON.stringify(json)));
        },
        getDelta: encr.getDelta,
        destroy: function () {
            if (!encr) {
                return;
            }
            encr.destroy();
            encr = null;
            decr.destroy();
            decr = null;
        }
    };
}
exports.makeSessionEncryptor = makeSessionEncryptor;

},{"./utf8":47,"ecma-nacl":"ecma-nacl"}],47:[function(require,module,exports){
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
 * This module provides an object with functions that encode strings to bytes, and decode strings from bytes.
 * Bytes, array of octets, are generated in Uint8Array form, and assume the same form for decoding.
 * Only utf8 is implemented, so far.
 * If someone needs to implement another unicode encoding, they may do so.
 * If someone needs non-unicode, they should be stopped from this historic madness, by re-evaluating their
 * app's requirements, and re-thinking overall system design.
 */
/**
 * Following utf8 encoding table, found in https://en.wikipedia.org/wiki/UTF-8 with RFC3629 restricting
 * code point values to no more than 0x10FFFF.
 *
 * Below we shall use some numerical constants, which we display here for readable reference.
 * Note that placing them in variables shall add lookup penalty, as this is dynamic javascript.
 * 7   === parseInt('111',2)
 * 15  === parseInt('1111',2)
 * 31  === parseInt('11111',2)
 * 63  === parseInt('111111',2)
 * 128 === parseInt('10000000',2)
 * 192 === parseInt('11000000',2)
 * 224 === parseInt('11100000',2)
 * 240 === parseInt('11110000',2)
 * 248 === parseInt('11111000',2)
 */
function unicodePointToUtf8Bytes(ucp) {
    var bytes;
    if (ucp <= 0x7F) {
        // 1 byte of the form 0xxxxxxx
        bytes = new Uint8Array(1);
        bytes[0] = ucp;
    }
    else if (ucp <= 0x7FF) {
        // 2 bytes, the first one is 110xxxxx, and the last one is 10xxxxxx
        bytes = new Uint8Array(2);
        bytes[1] = 128 | (ucp & 63);
        ucp >>>= 6;
        bytes[0] = 192 | ucp;
    }
    else if (ucp <= 0xFFFF) {
        // 3 bytes, the first one is 1110xxxx, and last 2 are 10xxxxxx
        bytes = new Uint8Array(3);
        for (var i = 2; i > 0; i -= 1) {
            bytes[i] = 128 | (ucp & 63);
            ucp >>>= 6;
        }
        bytes[0] = 224 | ucp;
    }
    else if (ucp <= 0x10FFFF) {
        // 4 bytes, the first one is 11110xxx, and last 3 are 10xxxxxx
        bytes = new Uint8Array(4);
        for (var i = 3; i > 0; i -= 1) {
            bytes[i] = 128 | (ucp & 63);
            ucp >>>= 6;
        }
        bytes[0] = 240 | ucp;
    }
    else {
        throw new Error("Unicode char point is greater than 0x7FFFFFFF, which cannot be encoded into utf8.");
    }
    return bytes;
}
function pack(str) {
    var byteCounter = 0, charVocabulary = {}, ch, charBytes;
    for (var i = 0; i < str.length; i += 1) {
        ch = str[i];
        charBytes = charVocabulary[ch];
        if ('undefined' === typeof charBytes) {
            charBytes = unicodePointToUtf8Bytes(ch.charCodeAt(0));
            charVocabulary[ch] = charBytes;
        }
        byteCounter += charBytes.length;
    }
    var allBytes = new Uint8Array(byteCounter);
    byteCounter = 0;
    for (var i = 0; i < str.length; i += 1) {
        ch = str[i];
        charBytes = charVocabulary[ch];
        allBytes.set(charBytes, byteCounter);
        byteCounter += charBytes.length;
    }
    return allBytes;
}
exports.pack = pack;
function addSecondaryBytesIntoCodePoint(codePoint, utf8Bytes, pos, numOfSecBytes) {
    "use strict";
    var b;
    for (var i = 0; i < numOfSecBytes; i += 1) {
        b = utf8Bytes[pos + i];
        if ('undefined' === typeof b) {
            throw new Error("Encountered end of byte array in the middle of multi-byte " + "code point, at position " + (pos + 1));
        }
        if ((b & 192) !== 128) {
            throw new Error("Encountered at position " + (pos + i) + " byte " + b.toString(2) + ", which should be a secondary utf8 byte like 10xxxxxx, but isn't.");
        }
        codePoint <<= 6;
        codePoint += (b & 63);
    }
    return codePoint;
}
function open(utf8Bytes) {
    var byteCounter = 0, charCount = 0, charArr = new Array(utf8Bytes.length), b, ch, codePoint;
    while (byteCounter < utf8Bytes.length) {
        b = utf8Bytes[byteCounter];
        if ((b & 128) === 0) {
            // 1 byte of the form 0xxxxxxx
            codePoint = b;
            byteCounter += 1;
        }
        else if ((b & 224) === 192) {
            // 2 bytes, the first one is 110xxxxx, and the last one is 10xxxxxx
            codePoint = (b & 31);
            codePoint = addSecondaryBytesIntoCodePoint(codePoint, utf8Bytes, byteCounter + 1, 1);
            byteCounter += 2;
        }
        else if ((b & 240) === 224) {
            // 3 bytes, the first one is 1110xxxx, and last 2 are 10xxxxxx
            codePoint = (b & 15);
            codePoint = addSecondaryBytesIntoCodePoint(codePoint, utf8Bytes, byteCounter + 1, 2);
            byteCounter += 3;
        }
        else if ((b & 248) === 240) {
            // 4 bytes, the first one is 11110xxx, and last 3 are 10xxxxxx
            codePoint = (b & 7);
            codePoint = addSecondaryBytesIntoCodePoint(codePoint, utf8Bytes, byteCounter + 1, 3);
            byteCounter += 4;
        }
        else {
            throw new Error("Encountered at position " + byteCounter + " byte " + b.toString(2) + ", which should not be present in a utf8 encoded block.");
        }
        ch = String.fromCharCode(codePoint);
        charArr[charCount] = ch;
        charCount += 1;
    }
    return charArr.join('');
}
exports.open = open;
Object.freeze(exports);

},{}]},{},[1]);
