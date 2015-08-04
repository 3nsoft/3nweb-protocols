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

import log = require('./page-logging');

export interface View {
	name: string;
	open(): void;
	close(): void;
	cleanLogOnExit: boolean;
}

/**
 * This classes switches between views.
 * View name is an id of html element that is brought into view.
 */
export class Router {

	private getDefaultView: () => string;
	private openedView: View = null;
	private views: {
		[viewName: string]: View;
	} = {};
	private w: Window;
	
	constructor(w: Window, defaultView: () => string) {
		this.getDefaultView = defaultView;
		this.w = w;
		this.w.onpopstate = this.openHashTag.bind(this);
		Object.seal(this);
	}
	
	openHashTag(): void {
		var hTag = this.w.location.hash;
		if (hTag) {
			this.openView(hTag.substring(1), true);
		} else {
			this.openView(this.getDefaultView(), true);
		}
	}
	
	addView(v: View): void;
	addView(name: string, open: () => void, close: () => void,
			noLogCleanOnClose?: boolean): void;
	addView(nameOrView: string|View, open?: () => void, close?: () => void,
			noLogCleanOnClose?: boolean): void {
		var v: View;
		if ('string' === typeof nameOrView) {
			if (!open) { throw new Error("open func is missing"); }
			if (!close) { throw new Error("open func is missing"); }
			v = {
				name: <string> nameOrView,
				open: open,
				close: close,
				cleanLogOnExit: !noLogCleanOnClose
			};
			Object.freeze(v);
			this.views[v.name] = v;
		} else if (!nameOrView) {
			throw new Error("View object is not given");
		} else {
			v = <View> nameOrView;
			this.views[v.name] = v;
		}
	}
	
	openView(viewName: string, doNotRecordInHistory?: boolean): void {
		if (this.openedView && (viewName === this.openedView.name)) { return; }
		var v = this.views[viewName];
		if (!v) { throw new Error("Unknown view: "+viewName); }
		if (this.openedView) {
			this.openedView.close();
		}
		v.open();
		if (!doNotRecordInHistory) {
			this.w.history.pushState(
				{ view: viewName },
				this.w.document.title, "#"+viewName);
		}
		if (this.openedView && this.openedView.cleanLogOnExit) {
			log.clear();
		}
		this.openedView = v;
	}
	
	showElem(elemId: string): void {
		this.w.document.getElementById(elemId).style.display = "block";
	}
	
	hideElem(elemId: string): void {
		this.w.document.getElementById(elemId).style.display = "none";
	}
	
}
Object.freeze(Router);
Object.freeze(Router.prototype);

Object.freeze(exports);