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
 * This file setsvup ASMail app as one piece, and initializes in window object
 * all artifacts that are needed by different parts of this app.
 */

/// <reference path="../../../typings/tsd.d.ts" />

import routers = require('../../../lib-client/simple-router');
import idManage = require('../identity-management');
import log = require('../../../lib-client/page-logging');
import fileStorageMod = require('../file-storage');
import mailConf = require('./mail-conf');
import sending = require('./mail-sending');
import getting = require('./mail-getting');
import jwk = require('../../../lib-common/jwkeys');
import msgMod = require('../../../lib-client/asmail/msg');
import keyringMod = require('../../../lib-client/asmail/keyring/index');

var router = new routers.Router(window, () => {
	return 'deliver-mail';
});
(<any> window).pageRouter = router;

var mailerIdentity = idManage.makeManager();
(<any> window).mailerIdentity = mailerIdentity;

var keyring = keyringMod.makeKeyRing();
(<any> window).keyring = keyring;

var xspStorage = fileStorageMod.makeStorage();
(<any> window).xspStorage = xspStorage;

window.onload = () => {
	try {
		mailerIdentity.init()
		.then(() => {
			return xspStorage.init(mailerIdentity.getSigner);
		})
		.then(() => {
			return keyring.init(xspStorage.keyringStorage());
		})
		.then(() => {
			return mailConf.init();
		})
		.then(() => {
			router.openHashTag();
		})
		.fail((err) => {
			log.write("ERROR: "+err.message);
			console.error('Error in file '+err.fileName+' at '+
					err.lineNumber+': '+err.message);
		})
		.done();
	} catch (err) {
		console.error(err);
	}
};

function makeSimpleViewObj(divId: string): routers.View {
	return {
		name: divId,
		open: function() {
			$('.nav li.active').removeClass("active");
			var navTab = $(".nav li[name='"+divId+"']");
			if (navTab.length > 0) {
				navTab.addClass("active");
			}
			router.showElem(divId);
		},
		close: function() {
			router.hideElem(divId);
		},
		cleanLogOnExit: true
	};
}

router.addView(makeSimpleViewObj('deliver-mail'));
router.addView(makeSimpleViewObj('retrieve-mail'));
router.addView((() => {
	var v = makeSimpleViewObj('config');
	var initOpenFunc = v.open;
	v.open = () => {
		initOpenFunc();
		// show public key set in the keyring
		var certs = keyring.getPublishedKeyCerts();
		$('.published-key-id').text(
			certs ? jwk.getPubKey(certs.pkeyCert).kid : "not set");
		// compare it to the one set on the server
		mailConf.displayPKeyOnServer();
	};
	return v;
})());

(<any> window).mailCtrl = {
	sendMsg: sending.sendMsg,
	sendPreFlight: sending.sendPreFlight,
	listMsgs: getting.listMsgs,
	rmMsg: getting.rmMsg,
	openMsg: getting.openMsg,
	closeMsgView: getting.closeMsgView
};
(<any> window).inbox = {
	msgs: new Array<msgMod.MsgOpener>(),
	lastMsgTS: 0
};
(<any> window).confCtrl = {
//	updatePublishedKey: mailConf.updatePublishedIntroKey,
	pushPublishedKeyToServer: mailConf.pushPublishedKeyToServer
};
