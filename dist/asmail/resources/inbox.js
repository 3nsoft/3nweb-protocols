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
 * Inbox files are laid out on disk in the following way:
 * (a) store is just a folder with stuff inside;
 * (b) main store folder contains following folders:
 * (b.1) messages - is a folder for message folders,
 * (b.2) delivery - is a folder for messages, that are in a process of
 *                  being delivered; complete messages are moved to
 *                  'messages' folder.
 * (b.3) info - is a place for information files about this storage;
 * (c) message folder's name is message's id
 * (d) message folder contains file 'meta' with plain-text JSON-form metadata
 *     for this particular message.
 * (e) message folder contains folder 'objects' with all object files, that
 *     are part of this particular message.
 */
var Q = require('q');
var fs = require('fs');
var ChildProcMod = require('child_process');
var exec = ChildProcMod.exec;
var base64 = require('../../lib-common/base64');
var fErrMod = require('../../lib-common/file-err');
var jwk = require('../../lib-common/jwkeys');
var random = require('../../lib-server/random');
var fops = require('../../lib-server/resources/file_ops');
var confUtil = require('../../lib-server/conf-util');
var os = require('os');
exports.SC = {
    OBJ_EXIST: 'obj-already-exist',
    USER_UNKNOWN: 'user-unknown',
    MSG_UNKNOWN: 'msg-unknown',
    OBJ_UNKNOWN: 'obj-unknown',
    WRITE_OVERFLOW: 'write-overflow'
};
Object.freeze(exports.SC);
var DEFAULT_FILE_WRITE_BUFFER_SIZE = 4 * 1024;
var DEFAULT_FILE_READ_BUFFER_SIZE = 64 * 1024;
var XSP_HEADER_FILE_NAME_END = '.hxsp';
var XSP_SEGS_FILE_NAME_END = '.sxsp';
var Inbox = (function () {
    function Inbox(userId, inboxPath, writeBufferSize, readBufferSize) {
        this.userId = userId;
        this.path = inboxPath;
        this.fileWritingBufferSize = (writeBufferSize ?
            confUtil.stringToNumOfBytes(writeBufferSize) :
            DEFAULT_FILE_WRITE_BUFFER_SIZE);
        this.fileReadingBufferSize = (readBufferSize ?
            confUtil.stringToNumOfBytes(readBufferSize) :
            DEFAULT_FILE_READ_BUFFER_SIZE);
        Object.freeze(this);
    }
    /**
     * Creates on a disk a directory and file structure for a given inbox object.
     * It returns a promise, resolvable, when inbox store's disk structure has
     * been constructed.
     */
    Inbox.initInbox = function (inbox) {
        var promise = Q.all([Q.nfcall(fs.mkdir, inbox.path + '/messages'),
            Q.nfcall(fs.mkdir, inbox.path + '/delivery'),
            Q.nfcall(fs.mkdir, inbox.path + '/info')])
            .then(function () {
            return Q.nfcall(fs.writeFile, inbox.path + '/info/userid', inbox.userId, { encoding: 'utf8', flag: 'wx' });
        })
            .then(function () {
            return setDefaultParameters(inbox);
        });
        return promise;
    };
    /**
     * @return a promise, resolvable to number bytes used by this inbox.
     */
    Inbox.prototype.usedSpace = function () {
        // XXX hack due to missing du in windows
        if (os.type().match('Windows')) {
            console.warn("\nOn Windows meaningful check of space, " +
                "occupied by user is skipped, for now");
            return Q.when(0);
        }
        var promise = Q.nfcall(exec, "du -k -s " + this.path)
            .then(function (stdOut) {
            var kUsed = parseInt(stdOut);
            if (isNaN(kUsed)) {
                throw new Error("Shell utility du outputs a string, " +
                    "which cannot be parsed as integer.");
            }
            return kUsed * 1024;
        });
        return promise;
    };
    /**
     * @return a promise, resolvable to free space in bytes.
     */
    Inbox.prototype.freeSpace = function () {
        var _this = this;
        var usedSpace = 0;
        var promise = this.usedSpace()
            .then(function (bUsed) {
            usedSpace = bUsed;
            return _this.getSpaceQuota();
        })
            .then(function (quota) {
            return Math.max(0, quota - usedSpace);
        });
        return promise;
    };
    /**
     * @param msgMeta is json object with message's meta info directly from sender.
     * @param authSender is an address of sender, if such was authenticated.
     * @return a promise, resolvable to message id, when a folder for new
     * message has been created.
     */
    Inbox.prototype.recordMsgMeta = function (msgMeta, authSender) {
        var delivPath = this.path + '/delivery';
        var promise = genMsgIdAndMakeFolder(delivPath)
            .then(function (msgId) {
            var meta = {
                extMeta: msgMeta,
                deliveryStart: Date.now(),
                authSender: authSender
            };
            return Q.nfcall(fs.writeFile, delivPath + '/' + msgId + '/meta.json', JSON.stringify(meta), { encoding: 'utf8', flag: 'wx' })
                .then(function () { return msgId; });
        });
        return promise;
    };
    /**
     * @param msgId
     * @param incompleteMsg flag, true for incomplete (in-delivery) messages,
     * and false (or undefined) for complete messages.
     * @return a promise, resolvable to message metadata from disk, when it has
     * been found on the disk.
     * Rejected promise may pass a string error code from SC.
     */
    Inbox.prototype.getMsgMeta = function (msgId, incompleteMsg) {
        var msgFolder = this.path + (incompleteMsg ? '/delivery' : '/messages');
        return Q.nfcall(fs.readFile, msgFolder + '/' + msgId + '/meta.json', { encoding: 'utf8', flag: 'r' })
            .then(function (str) {
            return JSON.parse(str);
        }, function (err) {
            if (err.code === fErrMod.Code.noFile) {
                throw exports.SC.MSG_UNKNOWN;
            }
            else {
                throw err;
            }
        });
    };
    /**
     * @param msgId
     * @param objId
     * @return a promise, resolvable to undefined, when given pair of message
     * and object ids is correct, otherwise, rejected with a string error status,
     * found in SC of this object.
     */
    Inbox.prototype.checkIds = function (msgId, objId) {
        return this.getMsgMeta(msgId, true)
            .then(function (msgMeta) {
            if (msgMeta.extMeta.objIds.indexOf(objId) < 0) {
                throw exports.SC.OBJ_UNKNOWN;
            }
        }, function (err) {
            if ('string' === typeof err) {
                throw err;
            }
            else if (err.code === fErrMod.Code.noFile) {
                throw exports.SC.MSG_UNKNOWN;
            }
            else {
                throw err;
            }
        });
    };
    /**
     * @param msgId
     * @param objId
     * @param fileHeader
     * @param allocateFile
     * @param totalSize
     * @param offset
     * @param chunkLen
     * @param chunk
     * @return a promise, resolvable when all bytes are written to the file.
     * Rejected promise may pass a string error code from SC.
     */
    Inbox.prototype.saveObjChunk = function (msgId, objId, fileHeader, allocateFile, totalSize, offset, chunkLen, chunk) {
        var _this = this;
        var filePath = this.path + '/delivery/' + msgId + '/' + objId +
            (fileHeader ? XSP_HEADER_FILE_NAME_END : XSP_SEGS_FILE_NAME_END);
        var promise = this.checkIds(msgId, objId)
            .then(function () {
            if (allocateFile) {
                if ((offset + chunkLen) > totalSize) {
                    throw exports.SC.WRITE_OVERFLOW;
                }
                return fops.createEmptyFile(filePath, totalSize);
            }
            else {
                return fops.getFileSize(filePath)
                    .then(function (fileSize) {
                    if ((offset + chunkLen) > fileSize) {
                        throw exports.SC.WRITE_OVERFLOW;
                    }
                });
            }
        })
            .then(function () {
            return fops.streamToExistingFile(filePath, offset, chunkLen, chunk, _this.fileWritingBufferSize)
                .fail(function (err) {
                if (!allocateFile) {
                    throw err;
                }
                return Q.nfcall(fs.unlink, filePath)
                    .then(function () { throw err; }, function () { throw err; });
            });
        });
        return promise;
    };
    /**
     * @param msgId
     * @param objId
     * @param fileHeader
     * @param allocateFile
     * @param bytes
     * @param bytesLen
     * @return a promise, resolvable when all bytes are written to the file.
     * Rejected promise may pass a string error code from SC.
     */
    Inbox.prototype.appendObj = function (msgId, objId, fileHeader, allocateFile, bytes, bytesLen) {
        var _this = this;
        var filePath = this.path + '/delivery/' + msgId + '/' + objId +
            (fileHeader ? XSP_HEADER_FILE_NAME_END : XSP_SEGS_FILE_NAME_END);
        var promise = this.checkIds(msgId, objId)
            .then(function () {
            if (allocateFile) {
                return fops.createEmptyFile(filePath, 0)
                    .then(function () { return 0; });
            }
            else {
                return fops.getFileSize(filePath);
            }
        })
            .then(function (initFileSize) {
            return fops.streamToExistingFile(filePath, initFileSize, bytesLen, bytes, _this.fileWritingBufferSize)
                .fail(function (err) {
                return (allocateFile ?
                    Q.nfcall(fs.unlink, filePath) :
                    Q.nfcall(fs.truncate, filePath, initFileSize))
                    .then(function () { throw err; }, function () { throw err; });
            });
        });
        return promise;
    };
    /**
     * @param msgId
     * @param objIds
     * @return a promise for sizes of all objects that are present on the disk,
     * out of given ones.
     */
    Inbox.prototype.getMsgObjSizes = function (msgId, objIds) {
        var _this = this;
        var sizes = {};
        if (objIds.length === 0) {
            return Q.when(sizes);
        }
        var getSize = function (i, head) {
            var objId = objIds[i];
            var fName = _this.path + '/delivery/' + msgId + '/' + objId +
                (head ? XSP_HEADER_FILE_NAME_END : XSP_SEGS_FILE_NAME_END);
            return fops.getFileSize(fName)
                .then(function (size) {
                if (head) {
                    sizes[objId] = {
                        header: size,
                        segments: 0
                    };
                    return getSize(i, false);
                }
                else {
                    sizes[objId].segments = size;
                    if ((i + 1) < objIds.length) {
                        return getSize(i + 1, true);
                    }
                }
            }, function (err) {
                if ((i + 1) < objIds.length) {
                    return getSize(i + 1, true);
                }
            });
        };
        return getSize(0, true)
            .then(function () { return sizes; });
    };
    /**
     * @param msgId
     * @param attempt is a resursion counter, that gets appended to the message
     * folder name, in the event of a name collision.
     * @return a promise, resolvable when a message has been moved from delivery
     * to messages storing folder.
     */
    Inbox.prototype.moveMsgFromDeliveryToMessagesFolder = function (msgId, attempt) {
        var _this = this;
        var srcFolder = this.path + '/delivery/' + msgId + '/';
        var dstFolder = this.path + '/messages/' + msgId +
            (!attempt ? '' : '' + attempt) + '/';
        return Q.nfcall(fs.stat, dstFolder)
            .then(function () {
            if (attempt) {
                attempt += 1;
            }
            else {
                attempt = 1;
            }
            return _this.moveMsgFromDeliveryToMessagesFolder(msgId, attempt);
        }, function (err) {
            if (err.code !== fErrMod.Code.noFile) {
                throw err;
            }
            return Q.nfcall(fs.rename, srcFolder, dstFolder);
        });
    };
    /**
     * @param msgId
     * @return a promise, resolvable, when a message has been moved from
     * delivery to messages storing folder.
     * Rejected promise may pass string error code from SC.
     */
    Inbox.prototype.completeMsgDelivery = function (msgId) {
        var _this = this;
        var promise = this.getMsgMeta(msgId, true)
            .then(function (msgMeta) {
            msgMeta.deliveryCompletion = Date.now();
            return _this.getMsgObjSizes(msgId, msgMeta.extMeta.objIds)
                .then(function (objSizes) {
                msgMeta.objSizes = objSizes;
            })
                .then(function () {
                return Q.nfcall(fs.writeFile, _this.path + '/delivery/' + msgId + '/meta.json', JSON.stringify(msgMeta), { encoding: 'utf8', flag: 'r+' });
            });
        })
            .then(function () {
            return _this.moveMsgFromDeliveryToMessagesFolder(msgId);
        });
        return promise;
    };
    /**
     * @return a promise, resolvable to a list of available message ids.
     */
    Inbox.prototype.getMsgIds = function () {
        return Q.nfcall(fs.readdir, this.path + '/messages');
    };
    /**
     * This method removes message folder from the disk.
     * @param msgId is an id of a message, that needs to be removed.
     * @return promise, resolvable when a message folder is removed from
     * the disk.
     * Rejected promise may pass string error code from SC.
     */
    Inbox.prototype.rmMsg = function (msgId) {
        var msgPath = this.path + '/messages/' + msgId;
        var rmPath = msgPath + '~remove';
        return Q.nfcall(fs.rename, msgPath, rmPath)
            .then(function () {
            return fops.rmdir(rmPath);
        }, function (err) {
            if (err.code === fErrMod.Code.noFile) {
                throw exports.SC.MSG_UNKNOWN;
            }
            else {
                throw err;
            }
        });
    };
    /**
     * @param msgId
     * @param objId
     * @param fileHeader
     * @param offset
     * @param maxLen
     * @param sink
     * @param signalSize
     * @return a promise, resolvable when all bytes a pumped into a given
     * sink.
     */
    Inbox.prototype.getObj = function (msgId, objId, fileHeader, offset, maxLen) {
        var _this = this;
        var filePath = this.path + '/messages/' + msgId + '/' + objId +
            (fileHeader ? XSP_HEADER_FILE_NAME_END : XSP_SEGS_FILE_NAME_END);
        var promise = fops.getFileSize(filePath)
            .then(function (objSize) {
            if (objSize <= offset) {
                return;
            }
            if ('number' !== typeof maxLen) {
                maxLen = objSize;
            }
            else if ((offset + maxLen) >= objSize) {
                maxLen = objSize - offset;
            }
            if (maxLen <= 0) {
                return;
            }
            var reader = {
                len: maxLen,
                pipeTo: function (sink) {
                    return fops.streamFromFile(filePath, offset, maxLen, sink, _this.fileReadingBufferSize);
                }
            };
            Object.freeze(reader);
            return reader;
        }, (function (err) {
            if (err.code === fErrMod.Code.noFile) {
                throw exports.SC.OBJ_UNKNOWN;
            }
            else {
                throw err;
            }
        }));
        return promise;
    };
    /**
     * @param inbox
     * @param initKeyCerts
     * @param setDefault when it is true, sets default values -- null --
     * in place of an object with certs.
     * @return a promise, resolvable to true, when certs are set, or
     * resolvable to false, when given certs do not pass sanitization.
     */
    Inbox.setPubKey = function (inbox, initKeyCerts, setDefault) {
        if (setDefault) {
            initKeyCerts = null;
        }
        else {
            var isOK = ('object' === typeof initKeyCerts) && !!initKeyCerts &&
                jwk.isLikeSignedKeyCert(initKeyCerts.pkeyCert) &&
                jwk.isLikeSignedKeyCert(initKeyCerts.userCert) &&
                jwk.isLikeSignedKeyCert(initKeyCerts.provCert);
            if (!isOK) {
                return Q.when(false);
            }
        }
        return writeJSONFile(initKeyCerts, inbox.path + '/info/pubkey');
    };
    /**
     * @return a promise, either resolvable to object with certificates,
     * or resolvable to null (default), if key certs were not set by the user.
     */
    Inbox.getPubKey = function (inbox) {
        return readJSONFile(inbox.path + '/info/pubkey');
    };
    Inbox.getSpaceQuota = function (inbox) {
        return readJSONFile(inbox.path + '/info/quota');
    };
    Inbox.setSpaceQuota = function (inbox, numOfBytes, setDefault) {
        if (setDefault) {
            numOfBytes = 10 * 1024 * 1024 * 1024;
        }
        else {
            var isOK = ('number' === typeof numOfBytes) && (numOfBytes >= 50 * 1024 * 1024);
            if (!isOK) {
                return Q.when(false);
            }
            numOfBytes = Math.floor(numOfBytes);
        }
        return writeJSONFile(numOfBytes, inbox.path + '/info/quota');
    };
    Inbox.prototype.getSpaceQuota = function () {
        return Inbox.getSpaceQuota(this);
    };
    Inbox.getAnonSenderPolicy = function (inbox) {
        return readJSONFile(inbox.path + '/info/anonymous/policy');
    };
    Inbox.setAnonSenderPolicy = function (inbox, policy, setDefault) {
        if (setDefault) {
            policy = {
                accept: true,
                acceptWithInvitesOnly: true,
                defaultMsgSize: 1024 * 1024
            };
        }
        else {
            var isOK = ('object' === typeof policy) && !!policy &&
                ('boolean' === typeof policy.accept) &&
                ('boolean' === typeof policy.acceptWithInvitesOnly) &&
                ('number' === typeof policy.defaultMsgSize) &&
                (policy.defaultMsgSize > 500);
            if (!isOK) {
                return Q.when(false);
            }
        }
        return writeJSONFile(policy, inbox.path + '/info/anonymous/policy');
    };
    Inbox.prototype.getAnonSenderPolicy = function () {
        return Inbox.getAnonSenderPolicy(this);
    };
    Inbox.getAnonSenderInvites = function (inbox) {
        return readJSONFile(inbox.path + '/info/anonymous/invites');
    };
    Inbox.setAnonSenderInvites = function (inbox, invites, setDefault) {
        if (setDefault) {
            invites = {};
        }
        else {
            var isOK = ('object' === typeof invites) && !!invites;
            if (!isOK) {
                return Q.when(false);
            }
            var msgMaxSize;
            for (var invite in invites) {
                msgMaxSize = invites[invite];
                isOK = ('number' === typeof msgMaxSize) && (msgMaxSize > 500);
                if (!isOK) {
                    return Q.when(false);
                }
            }
        }
        return writeJSONFile(invites, inbox.path + '/info/anonymous/invites');
    };
    Inbox.prototype.getAnonSenderInvites = function () {
        return Inbox.getAnonSenderInvites(this);
    };
    Inbox.getAuthSenderPolicy = function (inbox) {
        return readJSONFile(inbox.path + '/info/authenticated/policy');
    };
    Inbox.setAuthSenderPolicy = function (inbox, policy, setDefault) {
        if (setDefault) {
            policy = {
                acceptWithInvitesOnly: false,
                acceptFromWhiteListOnly: false,
                applyBlackList: true,
                defaultMsgSize: 100 * 1024 * 1024,
            };
        }
        else {
            var isOK = ('object' === typeof policy) && !!policy &&
                ('boolean' === typeof policy.applyBlackList) &&
                ('boolean' === typeof policy.acceptFromWhiteListOnly) &&
                ('boolean' === typeof policy.acceptWithInvitesOnly) &&
                ('number' === typeof policy.defaultMsgSize) &&
                (policy.defaultMsgSize > 500);
            if (!isOK) {
                return Q.when(false);
            }
        }
        return writeJSONFile(policy, inbox.path + '/info/authenticated/policy');
    };
    Inbox.prototype.getAuthSenderPolicy = function () {
        return Inbox.getAuthSenderPolicy(this);
    };
    Inbox.getAuthSenderBlacklist = function (inbox) {
        return readJSONFile(inbox.path + '/info/authenticated/blacklist');
    };
    Inbox.setAuthSenderBlacklist = function (inbox, list, setDefault) {
        if (setDefault) {
            list = {};
        }
        else {
            var isOK = ('object' === typeof list) && !!list;
            if (!isOK) {
                return Q.when(false);
            }
        }
        return writeJSONFile(list, inbox.path + '/info/authenticated/blacklist');
    };
    Inbox.prototype.getAuthSenderBlacklist = function () {
        return Inbox.getAuthSenderBlacklist(this);
    };
    Inbox.getAuthSenderWhitelist = function (inbox) {
        return readJSONFile(inbox.path + '/info/authenticated/whitelist');
    };
    Inbox.setAuthSenderWhitelist = function (inbox, list, setDefault) {
        if (setDefault) {
            list = {};
        }
        else {
            var isOK = ('object' === typeof list) && !!list;
            if (!isOK) {
                return Q.when(false);
            }
            var msgMaxSize;
            for (var addr in list) {
                msgMaxSize = list[addr];
                isOK = ('number' === typeof msgMaxSize) && (msgMaxSize > 500);
                if (!isOK) {
                    return Q.when(false);
                }
            }
        }
        return writeJSONFile(list, inbox.path + '/info/authenticated/whitelist');
    };
    Inbox.prototype.getAuthSenderWhitelist = function () {
        return Inbox.getAuthSenderWhitelist(this);
    };
    Inbox.getAuthSenderInvites = function (inbox) {
        return readJSONFile(inbox.path + '/info/authenticated/invites');
    };
    Inbox.setAuthSenderInvites = function (inbox, invites, setDefault) {
        if (setDefault) {
            invites = {};
        }
        else {
            var isOK = ('object' === typeof invites) && !!invites;
            if (!isOK) {
                return Q.when(false);
            }
            var msgMaxSize;
            for (var invite in invites) {
                msgMaxSize = invites[invite];
                isOK = ('number' === typeof msgMaxSize) && (msgMaxSize > 500);
                if (!isOK) {
                    return Q.when(false);
                }
            }
        }
        return writeJSONFile(invites, inbox.path + '/info/authenticated/invites');
    };
    Inbox.prototype.getAuthSenderInvites = function () {
        return Inbox.getAuthSenderInvites(this);
    };
    return Inbox;
})();
exports.Inbox = Inbox;
Object.freeze(Inbox.prototype);
Object.freeze(Inbox);
/**
 * @param json
 * @param path
 * @return a promise, resolvable, when given json object has been written to
 * named file.
 */
function writeJSONFile(json, path) {
    return Q.nfcall(fs.writeFile, path, JSON.stringify(json), { encoding: 'utf8', flag: 'w' })
        .then(function () {
        return true;
    });
}
/**
 * @param path
 * @return a promise, resolvable to json object, read from the named file.
 */
function readJSONFile(path) {
    var promise = Q.nfcall(fs.readFile, path)
        .then(function (buf) {
        return JSON.parse(buf.toString('utf8'));
    });
    return promise;
}
function setDefaultParameters(inbox) {
    var promise = Q.all([Q.nfcall(fs.mkdir, inbox.path + '/info/anonymous'),
        Q.nfcall(fs.mkdir, inbox.path + '/info/authenticated')]);
    var filePromises = [];
    // public key
    filePromises.push(Inbox.setPubKey(inbox, null, true));
    // space quota
    filePromises.push(Inbox.setSpaceQuota(inbox, null, true));
    // policy for anonymous senders
    filePromises.push(Inbox.setAnonSenderPolicy(inbox, null, true));
    // anonymous senders invitation tokens
    filePromises.push(Inbox.setAnonSenderInvites(inbox, null, true));
    // policy for authenticated senders
    filePromises.push(Inbox.setAuthSenderPolicy(inbox, null, true));
    // authenticated senders white-list
    filePromises.push(Inbox.setAuthSenderWhitelist(inbox, null, true));
    // authenticated senders black-list
    filePromises.push(Inbox.setAuthSenderBlacklist(inbox, null, true));
    // authenticated senders invitation tokens
    filePromises.push(Inbox.setAuthSenderInvites(inbox, null, true));
    promise.then(function () {
        return Q.all(filePromises);
    });
    return promise;
}
/**
 * @param inboxPath
 * @param msgId
 * @return a promise, resolvable to generated msg id, when folder for a message
 * is created in the delivery folder.
 */
function genMsgIdAndMakeFolder(delivPath) {
    var msgId = base64.urlSafe.pack(random.bytes(32));
    var promise = Q.nfcall(fs.mkdir, delivPath + '/' + msgId)
        .then(function () {
        return msgId;
    }, function (err) {
        if (err.code === fErrMod.Code.fileExists) {
            return genMsgIdAndMakeFolder(delivPath);
        }
        else {
            throw err;
        }
    });
    return promise;
}
Object.freeze(exports);
