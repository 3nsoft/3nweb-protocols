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
exports.Code = {
    noFile: 'ENOENT',
    fileExists: 'EEXIST',
    notDirectory: 'ENOTDIR',
    isDirectory: 'EISDIR'
};
function makeErr(code, msg) {
    var err = new Error(msg);
    err.code = code;
    return err;
}
exports.makeErr = makeErr;
