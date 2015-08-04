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
function makeHandler(makeAccountFunc) {
    if ('function' !== typeof makeAccountFunc) {
        throw new TypeError("Given argument 'makeAccountFunc' must be function, but is not.");
    }
    return function (req, res, next) {
        var userId = req.session.params.userId;
        var keyDerivParams = req.body;
        makeAccountFunc(userId, keyDerivParams).then(function (created) {
            if (created) {
                res.status(201).end();
            }
            else {
                res.status(473).send("Account for " + userId + " already exists.");
            }
        }).fail(function (err) {
            next(err);
        }).done();
    };
}
exports.makeHandler = makeHandler;
;
