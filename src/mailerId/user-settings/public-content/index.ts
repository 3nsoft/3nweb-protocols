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

/*
 * This file brings all modules into one piece.
 */

/// <reference path="../../../typings/tsd.d.ts" />

import routing = require('../../../lib-client/simple-router');
import user = require('./user-creation');
import login = require('./user-login');

var router = new routing.Router(window, () => { return 'start-view'; });

window.onload = () => {
	// Chrome needs a timeout, to do switch on the "nextTick"
	setTimeout(router.openHashTag.bind(router));
};

router.addView('start-view',
	() => {
		router.showElem('start-view');
	}, () => {
		router.hideElem('start-view');
	});

router.addView('new-account-view',
	() => {
		router.showElem('new-account-view');
	}, () => {
		(<any> document.getElementById('new-account-form')).reset();
		router.hideElem('new-account-view');
	});

router.addView('login-view',
	() => {
		router.showElem('login-view');
	}, () => {
		(<any> document.getElementById('login-form')).reset();
		router.hideElem('login-view');
	});

(<any> window).openView = router.openView.bind(router);
(<any> window).processNewUserInfoAndSend = user.processNewUserInfoAndSend;
(<any> window).loginUser = login.loginUser;