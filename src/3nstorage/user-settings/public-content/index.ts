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

import routers = require('../../../lib-client/simple-router');
import account = require('./account');

var userData: { account: account.Account; } = {
	account: null,
};
(<any> window).userData = userData;

var router = new routers.Router(window, () => {
	return (userData.account ? 'login-success' : 'signin');
});
(<any> window).pageRouter = router;

window.onload = () => {
	// Chrome needs a timeout, to do switch on the "nextTick"
	setTimeout(router.openHashTag.bind(router));
};

router.addView('signin',
	() => {
		if (userData.account) {
			router.openView('login-success');
		} else {
			router.showElem("mid-login");
		}
	}, () => {
		router.hideElem("mid-login");
	}, true);

router.addView('login-success',
	() => {
		if (userData.account) {
			router.showElem("login-success");
			var elems = document.getElementsByClassName("login-address");
			for (var i=0; i<elems.length; i+=1) {
				elems[i].textContent = userData.account.userId;
			}
			if (userData.account.accountExist) {
				router.hideElem("make-new-account");
				router.showElem("account-exists");
			} else {
				router.showElem("make-new-account");
				router.hideElem("account-exists");
			}
		} else {
			router.openView('signin');
		}
	}, () => {
		router.hideElem("login-success");
	});

(<any> window).signinWithMailerIdAndCheckIfAccExist =
	account.signinWithMailerIdAndCheckIfAccExist;
(<any> window).createAccount = account.createAccount;
(<any> window).logout = account.logout;

