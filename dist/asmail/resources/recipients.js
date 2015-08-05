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
var inboxFactoryMod = require('./inbox-factory');
var inboxMod = require('./inbox');
/**
 * @param lst is a map from addresses to numeric values
 * @param address
 * @return numeric value found in the list, or undefined,
 * if neither address, nor its domain can be matched in the list.
 */
function findMatchIn(lst, address) {
    // check address as a whole
    var v = lst[address];
    if ('undefined' !== typeof v) {
        return v;
    }
    // check address' own domain
    var ind = address.indexOf('@');
    if (ind < 0) {
        return;
    }
    address = address.substring(ind + 1);
    if (address.length === 0) {
        return;
    }
    v = lst['@' + address];
    if ('undefined' !== typeof v) {
        return v;
    }
    // check parent domains
    while (true) {
        var ind = address.indexOf('.');
        if (ind < 0) {
            return;
        }
        address = address.substring(ind + 1);
        if (address.length === 0) {
            return;
        }
        v = lst['@*.' + address];
        if ('undefined' !== typeof v) {
            return v;
        }
    }
}
/**
 * @param inbox
 * @param msgSize is a number of message bytes
 * @returns a promise, resolvable to
 * (1) least number between given number of bytes, and free space of
 *     a given inbox;
 * (2) -1 (less than zero), if there is no free space in the inbox.
 */
function adaptToFreeSpaceLeft(inbox, msgSize) {
    if (msgSize <= 0) {
        return Q.when(msgSize);
    }
    return inbox.freeSpace()
        .then(function (bytesFree) {
        if (bytesFree > 0) {
            return Math.min(bytesFree, msgSize);
        }
        else {
            return -1;
        }
    });
}
/**
 * @param inbox
 * @param invitation is a string invitation token, or null.
 * @returns a promise, resolvable to
 * (1) zero (0), if leaving mail is forbidden,
 * (2) greater than zero maximum message length, and
 * (3) -1 (less than zero), if mail cannot be accepted due to full
 *     mail box.
 */
function allowedMsgSizeForAnonSender(inbox, invitation) {
    return inbox.getAnonSenderPolicy()
        .then(function (policy) {
        if (!policy.accept) {
            return 0;
        }
        if (!invitation) {
            return (policy.acceptWithInvitesOnly ?
                0 : policy.defaultMsgSize);
        }
        return inbox.getAnonSenderInvites()
            .then(function (invites) {
            var msgSize = invites[invitation];
            return (msgSize ? msgSize : 0);
        });
    })
        .then(function (msgSize) {
        return adaptToFreeSpaceLeft(inbox, msgSize);
    });
}
/**
 * @param inbox
 * @param sender is sender string address
 * @param invitation is a string invitation token, or null.
 * @returns a promise, resolvable to
 * (1) zero (0), if leaving mail is forbidden,
 * (2) greater than zero maximum message length, and
 * (3) -1 (less than zero), if mail cannot be accepted due to full mail
 *     box.
 */
function allowedMsgSizeForAuthSender(inbox, sender, invitation) {
    var promise = Q.all([inbox.getAuthSenderPolicy(),
        inbox.getAuthSenderWhitelist()])
        .then(function (results) {
        var policy = results[0];
        var sizeFromWL = findMatchIn(results[1], sender);
        // check whitelist for specific size
        if ('number' === typeof sizeFromWL) {
            return sizeFromWL;
        }
        else if ('undefined' !== typeof sizeFromWL) {
            return policy.defaultMsgSize;
        }
        // exit if only whitelist contacts are allowed
        if (policy.acceptFromWhiteListOnly) {
            return 0;
        }
        // if needed, apply blacklist
        if (policy.applyBlackList) {
            return inbox.getAuthSenderBlacklist()
                .then(function (bList) {
                if ('undefined' === typeof findMatchIn(bList, sender)) {
                    return policy.defaultMsgSize;
                }
                else {
                    return 0;
                }
            });
        }
        return policy.defaultMsgSize;
    })
        .then(function (msgSize) {
        return adaptToFreeSpaceLeft(inbox, msgSize);
    });
    return promise;
}
exports.SC = inboxMod.SC;
function makeFactory(rootFolder) {
    var ibf = inboxFactoryMod.makeFactory(rootFolder);
    function makeParamGetter(staticGetter) {
        return function (userId) {
            return ibf.getInbox(userId)
                .then(function (inbox) {
                if (!inbox) {
                    throw exports.SC.USER_UNKNOWN;
                }
                return staticGetter(inbox);
            });
        };
    }
    function makeParamSetter(staticSetter) {
        return function (userId, param, setDefault) {
            return ibf.getInbox(userId)
                .then(function (inbox) {
                if (!inbox) {
                    throw exports.SC.USER_UNKNOWN;
                }
                return staticSetter(inbox, param, setDefault);
            });
        };
    }
    function makeBlobSaver(fileHeader) {
        return function (recipient, bytes, opts) {
            return ibf.getInbox(recipient)
                .then(function (inbox) {
                if (!inbox) {
                    throw exports.SC.USER_UNKNOWN;
                }
                if (opts.appendMode) {
                    return inbox.appendObj(opts.msgId, opts.objId, fileHeader, opts.isFirstReq, bytes, opts.chunkLen);
                }
                else {
                    return inbox.saveObjChunk(opts.msgId, opts.objId, fileHeader, opts.isFirstReq, opts.totalSize, opts.offset, opts.chunkLen, bytes);
                }
            });
        };
    }
    function makeBlobGetter(fileHeader) {
        return function (userId, opts) {
            return ibf.getInbox(userId)
                .then(function (inbox) {
                if (!inbox) {
                    throw exports.SC.USER_UNKNOWN;
                }
                return inbox.getObj(opts.msgId, opts.objId, fileHeader, opts.offset, opts.maxLen);
            });
        };
    }
    var recipients = {
        add: function (userId) {
            return ibf.makeNewInboxFor(userId)
                .then(function (inbox) {
                return !!inbox;
            });
        },
        exists: function (userId) {
            return ibf.getInbox(userId)
                .then(function (inbox) {
                return !!inbox;
            });
        },
        getInfo: function (userId) {
            return ibf.getInbox(userId)
                .then(function (inbox) {
                if (!inbox) {
                    return;
                }
                var info = {
                    email: inbox.userId,
                    pubKey: null,
                    anonSenders: null,
                    authSenders: null
                };
                return inboxMod.Inbox.getPubKey(inbox)
                    .then(function (pkey) {
                    info.pubKey = pkey;
                    return inbox.getAnonSenderPolicy();
                })
                    .then(function (policy) {
                    info.anonSenders = policy;
                    return inbox.getAnonSenderInvites();
                })
                    .then(function (invites) {
                    info.anonSenders.inviteTokens = invites;
                    return inbox.getAuthSenderPolicy();
                })
                    .then(function (policy) {
                    info.authSenders = policy;
                    return inbox.getAuthSenderBlacklist();
                })
                    .then(function (blacklist) {
                    info.authSenders.blackList = blacklist;
                    return inbox.getAuthSenderWhitelist();
                })
                    .then(function (whitelist) {
                    info.authSenders.whiteList = whitelist;
                    return inbox.getAuthSenderInvites();
                })
                    .then(function (invites) {
                    info.authSenders.inviteTokens = invites;
                    return info;
                });
            });
        },
        getPubKey: makeParamGetter(inboxMod.Inbox.getPubKey),
        setPubKey: makeParamSetter(inboxMod.Inbox.setPubKey),
        getSpaceQuota: makeParamGetter(inboxMod.Inbox.getSpaceQuota),
        getAnonSenderInvites: makeParamGetter(inboxMod.Inbox.getAnonSenderInvites),
        setAnonSenderInvites: makeParamSetter(inboxMod.Inbox.setAnonSenderInvites),
        allowedMaxMsgSize: function (recipient, sender, invitation) {
            return ibf.getInbox(recipient)
                .then(function (inbox) {
                if (!inbox) {
                    return;
                } // undefined for unknown recipient
                return (sender ?
                    allowedMsgSizeForAuthSender(inbox, sender, invitation) :
                    allowedMsgSizeForAnonSender(inbox, invitation));
            });
        },
        setMsgStorage: function (recipient, msgMeta, authSender) {
            return ibf.getInbox(recipient)
                .then(function (inbox) {
                if (!inbox) {
                    throw exports.SC.USER_UNKNOWN;
                }
                return inbox.recordMsgMeta(msgMeta, authSender);
            });
        },
        saveObjSegments: makeBlobSaver(false),
        saveObjHeader: makeBlobSaver(true),
        finalizeDelivery: function (recipient, msgId) {
            return ibf.getInbox(recipient)
                .then(function (inbox) {
                if (!inbox) {
                    throw exports.SC.USER_UNKNOWN;
                }
                return inbox.completeMsgDelivery(msgId);
            });
        },
        getMsgIds: function (userId) {
            return ibf.getInbox(userId)
                .then(function (inbox) {
                if (!inbox) {
                    throw exports.SC.USER_UNKNOWN;
                }
                return inbox.getMsgIds();
            });
        },
        getMsgMeta: function (userId, msgId) {
            return ibf.getInbox(userId)
                .then(function (inbox) {
                if (!inbox) {
                    throw exports.SC.USER_UNKNOWN;
                }
                return inbox.getMsgMeta(msgId);
            });
        },
        deleteMsg: function (userId, msgId) {
            return ibf.getInbox(userId)
                .then(function (inbox) {
                if (!inbox) {
                    throw exports.SC.USER_UNKNOWN;
                }
                return inbox.rmMsg(msgId);
            });
        },
        getObjSegments: makeBlobGetter(false),
        getObjHeader: makeBlobGetter(true)
    };
    Object.freeze(recipients);
    return recipients;
}
exports.makeFactory = makeFactory;
Object.freeze(exports);
