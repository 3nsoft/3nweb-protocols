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

var mapAmountEndings = {
		kb: 1 << 10,
		mb: 1 << 20,
		gb: 1 << 30
};

export function stringToNumOfBytes(size: string|number): number {
	if ('number' === typeof size) { return <number> size; }
	if ('string' !== typeof size) { throw new Error(
			"Given argument 'size' must be either string, or number"); }
	var parts = (<string> size).match(/^(\d+(?:\.\d+)?) *(kb|mb|gb)$/);
	var n = parseFloat(parts[1]);
	var type = parts[2];
	return mapAmountEndings[type] * n;
}

Object.freeze(exports);