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

import utf8 = require('../lib-common/utf8');

export function write(str: string): void {
	var p = document.createElement('p');
	p.textContent = '> '+str;
	var logs = document.getElementById("log");
	logs.appendChild(p);
	p.scrollIntoView();
	console.log('> '+str);
}

export function writeLink(str: string, href: string,
		newWindow?: boolean): void {
	var a = document.createElement('a');
	a.textContent = str;
	a.href = href;
	if (newWindow) { a.target = "_blank"; }
	var logs = document.getElementById("log");
	logs.appendChild(a);
	logs.appendChild(document.createElement('br'));
	a.scrollIntoView();
}

export function clear(): void {
	document.getElementById("log").innerHTML = '';
}

Object.freeze(exports);