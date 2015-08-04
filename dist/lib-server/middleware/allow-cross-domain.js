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
 * This function generates a middleware for CORS XMLHttpRequest
 * and OPTIONS preflight to let routes through
 */
function allowCrossDomain(allowHeaders, allowMethods) {
    var headersToAllow;
    if (allowHeaders) {
        if (!Array.isArray(allowHeaders)) {
            throw new Error("Given argument headersToAllow must be either " + "array of strings, or null/undefined");
        }
        headersToAllow = allowHeaders.join(', ');
    }
    else {
        headersToAllow = null;
    }
    var methodsToAllow;
    if (allowMethods) {
        if (!Array.isArray(allowMethods)) {
            throw new Error("Given argument methodsToAllow must be either " + "array of strings, or null/undefined");
        }
        methodsToAllow = allowMethods.join(', ');
    }
    else {
        methodsToAllow = null;
    }
    return function (req, res, next) {
        res.set({ "Access-Control-Allow-Origin": '*' });
        if (headersToAllow != null) {
            res.set({ "Access-Control-Expose-Headers": headersToAllow });
        }
        if ('OPTIONS' == req.method) {
            if (methodsToAllow != null) {
                res.set({ "Access-Control-Allow-Methods": methodsToAllow });
            }
            if (headersToAllow != null) {
                res.set({ "Access-Control-Allow-Headers": headersToAllow });
            }
        }
        next();
    };
}
exports.allowCrossDomain = allowCrossDomain;
Object.freeze(exports);
