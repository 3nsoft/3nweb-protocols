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
 * Testing all server modules together on the same node instance.
 */
var https = require("https");
var fs = require('fs');
var Q = require('q');
var express = require('express');
var fErrMod = require('./lib-common/file-err');
var client = require('./client-apps/static-content-server');
var mid = require('./mailerId/test-service');
var mail = require('./asmail/test-service');
var store = require('./3nstorage/test-service');
// Make data folders
var TEST_DATA_FOLDER = __dirname + '/test_data';
var MAILERID_DATA_FOLDER = TEST_DATA_FOLDER + '/mailerId';
var ASMAIL_DATA_FOLDER = TEST_DATA_FOLDER + '/asmail';
var STORAGE_DATA_FOLDER = TEST_DATA_FOLDER + '/3nstorage';
function createFolder(path, doLog) {
    try {
        fs.mkdirSync(path);
        if (doLog) {
            console.log('Created ' + fs.realpathSync(path));
        }
    }
    catch (err) {
        if (err.code !== fErrMod.Code.fileExists) {
            throw err;
        }
        path = fs.realpathSync(path);
        var stats = fs.statSync(path);
        if (stats.isDirectory()) {
            if (doLog) {
                console.log('Using existing data folder ' + path);
            }
        }
        else {
            throw new Error(path + " exists, but is not a folder");
        }
    }
}
createFolder(TEST_DATA_FOLDER, true);
createFolder(ASMAIL_DATA_FOLDER);
ASMAIL_DATA_FOLDER = fs.realpathSync(ASMAIL_DATA_FOLDER);
createFolder(STORAGE_DATA_FOLDER);
STORAGE_DATA_FOLDER = fs.realpathSync(STORAGE_DATA_FOLDER);
createFolder(MAILERID_DATA_FOLDER);
MAILERID_DATA_FOLDER = fs.realpathSync(MAILERID_DATA_FOLDER);
var sslOpts = {
    key: fs.readFileSync(__dirname + '/../server.key'),
    cert: fs.readFileSync(__dirname + '/../server.crt')
};
var app = express();
app.use(mid.makeApp(MAILERID_DATA_FOLDER));
app.use(mail.makeApp(ASMAIL_DATA_FOLDER));
app.use(store.makeApp(STORAGE_DATA_FOLDER));
app.use(client.makeApp());
Q.ninvoke(https.createServer(sslOpts, app), 'listen', 8080)
    .then(function () {
    console.log('\nOpen https://localhost:8080/ ' +
        '(use Firefox 39+, or Chromium 43+).' +
        '\nCertificate is self-signed.' +
        '\nAll services (MailerId, ASMail, 3NStorage) are served on' +
        '\nthe same port, but on different paths.');
})
    .done();
