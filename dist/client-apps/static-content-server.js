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
 * This module defines function that creates mountable app, which serves
 * static files of a browser-based test client.
 */
// External dependencies
var express = require('express');
//Internal libs
var cors = require('../lib-server/middleware/allow-cross-domain');
//Headers and methods for CORS access settings
var CORS_ALLOWED_HEADERS = ["Content-Type"];
var CORS_ALLOWED_METHODS = ['GET'];
function makeApp() {
    var app = express();
    app.use(function (req, res, next) {
        if (('OPTIONS' == req.method) || ('GET' == req.method)) {
            next();
        }
        else {
            res.status(405).send("Method '" + req.method + "' is not allowed anywhere on this server.");
        }
    });
    app.use(cors.allowCrossDomain(CORS_ALLOWED_HEADERS, CORS_ALLOWED_METHODS));
    app.use(express.static(__dirname + '/public-content'));
    app.use('/scripts', express.static(__dirname + '/../browser-scripts'));
    return app;
}
exports.makeApp = makeApp;
;
