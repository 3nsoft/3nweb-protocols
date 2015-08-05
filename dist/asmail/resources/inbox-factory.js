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
var fs = require('fs');
var inboxMod = require('./inbox');
var random = require('../../lib-server/random');
var fErrMod = require('../../lib-common/file-err');
var fops = require('../../lib-server/resources/file_ops');
/**
 * @param rootFolder
 * @return promise, resolvable to path of a newly created folder.
 */
function createInboxFolder(rootFolder) {
    var inboxFolderPath = rootFolder + "/" + random.stringOfB64UrlSafeChars(20);
    var promise = Q.nfcall(fs.mkdir, inboxFolderPath)
        .then(function () {
        return inboxFolderPath;
    })
        .fail(function (err) {
        if (err.code === fErrMod.Code.fileExists) {
            return createInboxFolder(rootFolder);
        }
        else {
            throw err;
        }
    });
    return promise;
}
/**
 * @param rootFolder
 * @return an object-map from user ids to inbox folder paths.
 */
function pickupExistingInboxes(rootFolder) {
    var fNames = fs.readdirSync(rootFolder);
    var userInboxPaths = {};
    fNames.forEach(function (fName) {
        var userId, path = rootFolder + '/' + fName;
        try {
            userId = fs.readFileSync(path + '/info/userid', { encoding: 'utf8' });
        }
        catch (err) {
            console.error("Folder " + fName + " cannot be seen as an inbox " +
                "in the root folder " + rootFolder +
                "\ndue to the following\n" + err.stack);
            return;
        }
        userInboxPaths[userId] = path;
    });
    return userInboxPaths;
}
function makeFactory(rootFolder, writeBufferSize, readBufferSize) {
    if (!fops.existsFolderSync(rootFolder)) {
        throw new Error("Given path " + rootFolder + " does not identify existing directory.");
    }
    var userInboxPaths = pickupExistingInboxes(rootFolder);
    var factory = {
        makeNewInboxFor: function (userId) {
            if ('undefined' !== typeof userInboxPaths[userId]) {
                return Q.when();
            }
            return createInboxFolder(rootFolder)
                .then(function (path) {
                var inbox = new inboxMod.Inbox(userId, path, writeBufferSize, readBufferSize);
                userInboxPaths[inbox.userId] = inbox.path;
                return inboxMod.Inbox.initInbox(inbox)
                    .then(function () {
                    return inbox;
                });
            });
        },
        getInbox: function (userId) {
            var path = userInboxPaths[userId];
            if (path) {
                return Q.when(new inboxMod.Inbox(userId, path, writeBufferSize, readBufferSize));
            }
            else {
                return Q.when();
            }
        }
    };
    Object.freeze(factory);
    return factory;
}
exports.makeFactory = makeFactory;
Object.freeze(exports);
