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
 * This creates a get-account-info route handler.
 * @param existsFunc is a function returning true, if given user exists, and false, otherwise.
 */
function makeHandler(existsFunc) {
    if ('function' !== typeof existsFunc) {
        throw new TypeError("Given argument 'existsFunc' must be function, but is not.");
    }
    return function (req, res, next) {
        var userId = req.session.params.userId;
        existsFunc(userId)
            .then(function (exists) {
            if (exists) {
                res.status(200).end();
            }
            else {
                res.status(474).end();
            }
        })
            .fail(function (err) {
            next(err);
        })
            .done();
    };
}
exports.makeHandler = makeHandler;
Object.freeze(exports);
