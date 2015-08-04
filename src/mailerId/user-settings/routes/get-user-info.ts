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
import users  = require('../../resources/users');
import utf8 = require('../../../lib-common/utf8');
import pklSess = require(
	'../../../lib-server/routes/pub-key-login/start-exchange');

export function makeHandler(userInfoProducingFunc: users.IGetInfo):
		express.RequestHandler {
	if ('function' !== typeof userInfoProducingFunc) { throw new TypeError(
			"Given argument 'userInfoProducingFunc' must be function, but is not."); }
	
	return (req: pklSess.Request, res: express.Response) => {
		var session = req.session;
		var userId = session.params.userId;
		var encryptor = session.params.encryptor;
		var info = userInfoProducingFunc(userId);
		var infoBytes = utf8.pack(JSON.stringify(info, null, '  '));
		var encInfo = encryptor.pack(infoBytes);
		res.status(200).send(new Buffer(encInfo));
	};
}

Object.freeze(exports);