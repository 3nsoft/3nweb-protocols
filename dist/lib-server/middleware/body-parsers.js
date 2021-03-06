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
var http = require('http');
var confUtil = require('../conf-util');
var HTTP_HEADER = {
    contentType: 'Content-Type',
    contentLength: 'Content-Length'
};
var TYPES = {
    plain: 'text/plain',
    json: 'application/json',
    bin: 'application/octet-stream'
};
/**
 * @param code is http status code to be attached to produced error object.
 * @param msg goes into error message, and, if absent, will be substituted with
 * a standard on.
 * @return an error object that should be given to next(), instead of throwing
 * it.
 */
function makeErr(code, msg) {
    var err = new Error(msg || http.STATUS_CODES[code]);
    err.status = code;
    return err;
}
function byteCollector(maxSize, contentType, parser) {
    var maxSizeNum = confUtil.stringToNumOfBytes(maxSize);
    if ('string' !== typeof contentType) {
        throw new Error("Given 'contentType' argument must be a string.");
    }
    return function (req, res, next) {
        // check Content-Type
        if (!req.is(contentType)) {
            return next(makeErr(415, "Content-Type must be " +
                contentType + " for this call."));
        }
        // get and check Content-Length
        var contentLength = parseInt(req.get(HTTP_HEADER.contentLength), 10);
        if (isNaN(contentLength)) {
            return next(makeErr(411, "Content-Length header is required with proper number."));
        }
        else if (contentLength === 0) {
            return next();
        }
        else if (contentLength > maxSizeNum) {
            return next(makeErr(413, "Request body is too long."));
        }
        // set body to be buffer for all expected incoming bytes
        req.body = new Buffer(contentLength);
        // collect incoming bytes into body array
        var bytesRead = 0;
        req.on('data', function (chunk) {
            if ((bytesRead + chunk.length) <= contentLength) {
                chunk.copy(req.body, bytesRead);
                bytesRead += chunk.length;
            }
            else {
                req.body = null;
                return next(makeErr(413, "Request body is too long."));
            }
        });
        req.on('end', function () {
            if (parser) {
                parser(req, res, next);
            }
            else {
                next();
            }
        });
    };
}
/**
 * @param maxSize is a maximum allowed body length, given as number of bytes,
 * or string parameter for kb/mb's.
 * @return middleware function, that places all request bytes into Buffer,
 * placed into usual body field of request object.
 */
function binary(maxSize) {
    return byteCollector(maxSize, TYPES.bin);
}
exports.binary = binary;
/**
 * @param maxSize is a maximum allowed body length, given as number of bytes,
 * or string parameter for kb/mb's.
 * @param allowNonObject is a boolean flag, which, when true, turns of a check
 * that forces body to be an object.
 * @return middleware function, that parses all request bytes as JSON, placing
 * result into usual body field of request object.
 */
function json(maxSize, allowNonObject) {
    return byteCollector(maxSize, TYPES.json, function (req, res, next) {
        try {
            req.body = JSON.parse(req.body.toString('utf8'));
        }
        catch (err) {
            return next(makeErr(400, "Request body cannot be interpreted as JSON."));
        }
        if (!allowNonObject &&
            (!req.body || ('object' !== typeof req.body))) {
            return next(makeErr(400, "Request body is not a JSON object."));
        }
        next();
    });
}
exports.json = json;
/**
 * @param maxSize is a maximum allowed body length, given as number of bytes, or
 * string parameter for kb/mb's.
 * @return middleware function, that parses all request bytes as utf8 text,
 * placing result into usual body field of request object.
 */
function textPlain(maxSize) {
    return byteCollector(maxSize, TYPES.plain, function (req, res, next) {
        try {
            req.body = req.body.toString('utf8');
        }
        catch (err) {
            return next(makeErr(400, "Request body cannot be interpreted as plain utf8 text."));
        }
        next();
    });
}
exports.textPlain = textPlain;
Object.freeze(exports);
