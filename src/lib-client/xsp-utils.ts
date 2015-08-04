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

import nacl = require('ecma-nacl');

function mergeArrays(arr: Uint8Array[]): Uint8Array {
	var resLen = 0;
	for (var i=0; i<arr.length; i+=1) {
		resLen += arr[i].length;
	}
	var res = new Uint8Array(resLen);
	var offset = 0;
	var chunk: Uint8Array;
	for (var i=0; i<arr.length; i+=1) {
		chunk = arr[i];
		res.set(chunk, offset);
		offset += chunk.length;
	};
	return res;
}

export function openAllSegs(reader: nacl.fileXSP.SegmentsReader,
		allSegs: Uint8Array): Uint8Array {
	var dataParts: Uint8Array[] = [];
	var segInd = 0;
	var offset = 0;
	var decRes: { data: Uint8Array; segLen: number; };
	while (offset < allSegs.length) {
		decRes = reader.openSeg(allSegs.subarray(offset), segInd);
		offset += decRes.segLen;
		segInd += 1;
		dataParts.push(decRes.data);
	}
	return mergeArrays(dataParts);
}

Object.freeze(exports);