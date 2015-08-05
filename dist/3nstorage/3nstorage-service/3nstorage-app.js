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
 * This module gives a function that creates a mountable, or app.use()-able,
 * express 3NStorage application.
 */
var express = require('express');
var cors = require('../../lib-server/middleware/allow-cross-domain');
// 3NStorage inner parts
var owners = require('./owner');
var sharing = require('./shared');
var PATHS = {
    owner: '/owner/',
    shared: '/shared/'
};
function setupStaticEntryRoute(app) {
    app.route('/')
        .all(cors.allowCrossDomain(["Content-Type"], ['GET']))
        .get(function (req, res) {
        var path = req.originalUrl;
        if (path[path.length - 1] !== '/') {
            path = path + '/';
        }
        var json = {
            "owner": path + PATHS.owner.substring(1),
            "shared": path + PATHS.shared.substring(1)
        };
        // the following implicitly sets content type application/json
        res.status(200).json(json);
    });
}
function makeApp(ownersSessions, sharingSessions, users, mailerIdAuthorizer) {
    var app = express();
    setupStaticEntryRoute(app);
    app.use(PATHS.owner, owners.makeApp(ownersSessions, users, mailerIdAuthorizer));
    app.use(PATHS.shared, sharing.makeApp(sharingSessions, users));
    return app;
}
exports.makeApp = makeApp;
Object.freeze(exports);
