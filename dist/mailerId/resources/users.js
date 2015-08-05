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
 * This module is a function that constructs test-grade users factories.
 * Notice that production code would use db, and functions would have to return promises,
 * instead of direct values, as we do it here now.
 */
var fs = require('fs');
var base64 = require('../../lib-common/base64');
var nacl = require('ecma-nacl');
var AT_DOMAIN = '@localhost';
function stripDomainPart(username) {
    var domainInd = username.lastIndexOf(AT_DOMAIN);
    return ((domainInd === -1) ? username : username.substring(0, domainInd));
}
function getPublicKeyBytesAccordingToAlg(info) {
    if (info.pkey.alg === nacl.box.JWK_ALG_NAME) {
        var k = base64.open(info.pkey.k);
        if (k.length !== nacl.box.KEY_LENGTH) {
            throw new Error("User's (" + info.id + ") key has incorrect length.");
        }
        return k;
    }
    else {
        throw new Error("User's (" + info.id + ") key for unsupported algorithm.");
    }
}
function readUserFromFolder(dataPath) {
    var users = {};
    var files = fs.readdirSync(dataPath);
    var file;
    var user;
    var str;
    for (var i = 0; i < files.length; i += 1) {
        file = files[i];
        str = fs.readFileSync(dataPath + '/' + file, { encoding: 'utf8', flag: 'r' });
        try {
            user = JSON.parse(str);
        }
        catch (e) {
            console.error("File " + file +
                " cannot by intertpreted as json:\n" + str);
            continue;
        }
        if (users[user.id]) {
            console.error("File " + file + " contains info for user " + user.id);
            continue;
        }
        users[stripDomainPart(user.id)] = user;
    }
    return users;
}
function recordUserInfoToDisk(dataPath, info) {
    var file = dataPath + '/' + Date.now() + '.json';
    var str = JSON.stringify(info);
    fs.writeFileSync(file, str, { encoding: 'utf8', flag: 'wx' });
}
function makeFactory(dataPath) {
    var users = readUserFromFolder(dataPath);
    var factory = {
        getInfo: function (id) {
            id = stripDomainPart(id);
            var userInfo = users[id];
            if (!userInfo) {
                return;
            }
            return userInfo;
        },
        getUserParamsAndKey: function (id) {
            id = stripDomainPart(id);
            var userInfo = users[id];
            if (!userInfo) {
                return;
            }
            return {
                key: getPublicKeyBytesAccordingToAlg(userInfo),
                params: userInfo.params
            };
        },
        add: function (user) {
            var id = stripDomainPart(stripDomainPart(user.id));
            if ('undefined' !== typeof users[id]) {
                return false;
            }
            users[id] = user;
            recordUserInfoToDisk(dataPath, user);
            return true;
        }
    };
    Object.freeze(factory);
    return factory;
}
exports.makeFactory = makeFactory;
Object.freeze(exports);
