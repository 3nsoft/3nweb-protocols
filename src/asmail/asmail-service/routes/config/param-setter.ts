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
import recipMod = require('../../../resources/recipients');
import api = require('../../../../lib-common/service-api/asmail/config');
import userFromMid = require('../../../../lib-server/routes/sessions/start');

export function makeHandler<T>(
		paramSetter: (userId: string, param: T) => Q.Promise<boolean>):
		express.RequestHandler {
	
	if ('function' !== typeof paramSetter) { throw new TypeError(
			"Given argument 'paramSetter' must be function, but is not."); }
	
	return (req: userFromMid.Request,
			res: express.Response, next: Function) => {
		
		var session = req.session;
		var userId = session.params.userId;
		var pValue: T = req.body;
		
		paramSetter(userId, pValue)
		.then((valChanged) => {
			if (valChanged) {
				res.status(api.PARAM_SC.ok).end();
			} else {
				res.status(api.PARAM_SC.malformed).send(
					'Malformed parameter value.');
			}
		})
		.fail((err) => {
			if ("string" !== typeof err) {
				next(err);
			} else if (err === recipMod.SC.USER_UNKNOWN) {
				res.status(api.ERR_SC.server).send(
					"Recipient disappeared from the system.");
				session.close();
			}
		})
		.done();
		
	};
	
};