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

import express = require('express');
import users = require('../../resources/recipients');
import userFromMid = require('../../../lib-server/routes/sessions/start');

export function makeHandler(makeAccountFunc: users.IAdd):
		express.RequestHandler {
	if ('function' !== typeof makeAccountFunc) { throw new TypeError(
			"Given argument 'makeAccountFunc' must be function, but is not."); }
	
	return (req: userFromMid.Request,
			res: express.Response, next: Function) => {
		
		var userId = req.session.params.userId;
		
		makeAccountFunc(userId)
		.then((created) => {
			if (created) {
				res.status(201).end();
			} else {
				res.status(473).send("Account for "+userId+" already exists.");
			}
		})
		.fail((err) => {
			next(err);
		})
		.done();
		
	};
}
Object.freeze(exports);