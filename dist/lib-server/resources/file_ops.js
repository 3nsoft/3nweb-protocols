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
var Q = require('q');
var child_process = require('child_process');
var fs = require('fs');
var exec = child_process.exec;
var SINGLE_BYTE_BUF = new Buffer(1);
SINGLE_BYTE_BUF[0] = 0;
/**
 * This will create a new file of a given size, and will fail, if a file
 * with a given path already exists.
 * @param filePath
 * @param fileSize
 * @param keepFileOpen
 * @returns a promise, resolvable, when a new empty file has been created.
 * When keep open flag was passed, live numeric file descriptor is returned,
 * else return value is undefined and should be ignored.
 */
function createEmptyFile(filePath, fileSize, keepFileOpen) {
    var fileDescr = null;
    var promise = Q.nfcall(fs.open, filePath, 'wx')
        .then(function (fd) {
        fileDescr = fd;
        if (fileSize > 0) {
            return Q.nfcall(fs.write, fd, SINGLE_BYTE_BUF, 0, 1, fileSize - 1);
        }
    })
        .fail(function (err) {
        if (fileDescr) {
            var fd = fileDescr;
            fileDescr = null;
            return Q.nfcall(fs.close, fd)
                .fin(function () { throw err; });
        }
        throw err;
    })
        .then(function () {
        if (keepFileOpen) {
            return fileDescr;
        }
        else {
            if (fileDescr !== null) {
                return Q.nfcall(fs.close, fileDescr);
            }
        }
    });
    return promise;
}
exports.createEmptyFile = createEmptyFile;
/**
 * @param path
 * @return true, if given path represents directory, or false, if it does not.
 */
function existsFolderSync(path) {
    if (!fs.existsSync(path)) {
        return false;
    }
    var stats = fs.statSync(path);
    return stats.isDirectory();
}
exports.existsFolderSync = existsFolderSync;
/**
 * @param filePath
 * @return a promise, resolvable to file's size.
 */
function getFileSize(filePath) {
    return Q.nfcall(fs.stat, filePath)
        .then(function (st) {
        return st.size;
    });
}
exports.getFileSize = getFileSize;
/**
 * @param fd is an open file descriptor
 * @param pos is a position in the file, from which writing should start
 * @param buf is a buffer, from which all bytes should be written into the file.
 * @returns a promise, resolvable to file descriptor, when all bytes were written
 * to it.
 */
function write(fd, pos, buf) {
    var bytesWritten = 0;
    function writeContinuation(bNum) {
        bytesWritten += bNum;
        pos += bNum;
        if (bytesWritten < buf.length) {
            return Q.nfcall(fs.write, fd, buf, bytesWritten, buf.length - bytesWritten, pos)
                .then(writeContinuation);
        }
    }
    var promise = Q.nfcall(fs.write, fd, buf, 0, buf.length, pos)
        .then(writeContinuation);
    return promise;
}
exports.write = write;
/**
 * @param filePath is a path to an existing file
 * @param pos is a position in the file, from which writing should start
 * @param buf is a buffer, from which all bytes should be written into the file.
 * @returns a promise, resolvable to file descriptor, when all bytes were written
 * to it.
 */
function writeToExistingFile(filePath, pos, buf) {
    var promise = Q.nfcall(fs.open, filePath, 'r+')
        .then(function (fd) {
        return write(fd, pos, buf)
            .fin(function () {
            return Q.nfcall(fs.close, fd);
        });
    });
    return promise;
}
exports.writeToExistingFile = writeToExistingFile;
function streamToExistingFile(filePath, pos, chunkLen, inStr, bufSize) {
    var deferred = Q.defer();
    var bytesWritten = 0;
    var done = false;
    var writeInProcess = null;
    function setDone(err) {
        if (done) {
            return;
        }
        done = true;
        if (err) {
            deferred.reject(err);
        }
        else {
            deferred.resolve();
        }
        if (writeInProcess) {
            writeInProcess.done();
        }
    }
    function writeToFile(b1, b2) {
        var bytes = new Buffer(b1.length + (b2 ? b2.length : 0));
        b1.copy(bytes, 0);
        if (b2) {
            b2.copy(bytes, b1.length);
        }
        var filePos = pos;
        pos += bytes.length;
        var doWrite = function () {
            return writeToExistingFile(filePath, filePos, bytes)
                .then(function () {
                bytesWritten += bytes.length;
                if (chunkLen === bytesWritten) {
                    setDone();
                }
            })
                .fail(function (err) { setDone(err); });
        };
        if (writeInProcess) {
            writeInProcess = writeInProcess.then(doWrite);
        }
        else {
            writeInProcess = doWrite();
        }
    }
    var bytesRead = 0;
    var buf = new Buffer(bufSize);
    var bufInd = 0;
    inStr.on('data', function (data) {
        if (done) {
            return;
        }
        try {
            if ((bytesRead + data.length) > chunkLen) {
                setDone("More bytes in a stream than chunkLen");
            }
            else if (((bufInd + data.length) < bufSize) &&
                ((bufInd + data.length) < chunkLen)) {
                data.copy(buf, bufInd);
                bufInd += data.length;
                bytesRead += data.length;
            }
            else {
                writeToFile(buf.slice(0, bufInd), data);
                bufInd = 0;
                bytesRead += data.length;
            }
        }
        catch (err) {
            setDone(err);
        }
    });
    inStr.on('end', function () {
        if (done) {
            return;
        }
        if (bytesRead < chunkLen) {
            setDone("Absorbed less bytes than chunkLen");
        }
    });
    inStr.on('error', function (err) {
        if (done) {
            return;
        }
        setDone(err);
    });
    return deferred.promise;
}
exports.streamToExistingFile = streamToExistingFile;
/**
 * @param fd is an open file descriptor
 * @param pos is a position in the file, from which reading should start
 * @param buf is a buffer, into which bytes should be read from start to
 * the end, i.e. number of bytes that must be read is equal to the buffer's
 * length.
 * @returns a promise, resolvable when buffer is completely filled with bytes
 * from the file.
 * The promise fails, if an end of file is encountered before entire buffer is
 * filled up with bytes.
 */
function read(fd, pos, buf) {
    var bytesRead = 0;
    function readContinuation(bNum) {
        if (bNum === 0) {
            throw new Error("Unexpected end of file.");
        }
        bytesRead += bNum;
        pos += bNum;
        if (bytesRead < buf.length) {
            return Q.nfcall(fs.read, fd, buf, bytesRead, buf.length - bytesRead, pos)
                .then(readContinuation);
        }
        else {
            return;
        }
    }
    var promise = Q.nfcall(fs.read, fd, buf, 0, buf.length, pos)
        .then(readContinuation);
    return promise;
}
exports.read = read;
/**
 * @param filePath is a file's path, from which to read
 * @param pos is a position in the file, from which reading should start
 * @param buf is a buffer, into which bytes should be read from start to
 * the end, i.e. number of bytes that must be read is equal to the buffer's
 * length.
 * @returns a promise, resolvable when buffer is completely filled with bytes
 * from the file.
 * The promise fails, if an end of file is encountered before entire buffer is
 * filled up with bytes.
 */
function readFromFile(filePath, pos, buf) {
    var promise = Q.nfcall(fs.open, filePath, 'r')
        .then(function (fd) {
        return read(fd, pos, buf)
            .fin(function () {
            return Q.nfcall(fs.close, fd);
        });
    });
    return promise;
}
exports.readFromFile = readFromFile;
/**
 * @param folder is a path to a folder, which should be recursively removed,
 * together with all files.
 * @returns a promise, resolvable, when a folder has been recursively removed.
 */
function rmdir(folder) {
    var promise = Q.nfcall(fs.readdir, folder)
        .then(function (files) {
        if (files.length === 0) {
            return Q.nfcall(fs.rmdir, folder);
        }
        var rmTasks = [];
        files.forEach(function (name) {
            var innerPath = folder + '/' + name;
            var task = Q.nfcall(fs.stat, innerPath)
                .then(function (st) {
                return (st.isDirectory() ?
                    rmdir(innerPath) :
                    Q.nfcall(fs.unlink, innerPath));
            });
            rmTasks.push(task);
        });
        return Q.all(rmTasks)
            .then(function () {
            return Q.nfcall(fs.rmdir, folder);
        });
    });
    return promise;
}
exports.rmdir = rmdir;
function streamFromFile(filePath, pos, len, outStr, bufSize) {
    if (len < 1) {
        throw new Error("Illegal length is given.");
    }
    var deferred = Q.defer();
    var done = false;
    function setDone(err) {
        if (done) {
            return;
        }
        done = true;
        if (err) {
            deferred.reject(err);
        }
        else {
            deferred.resolve();
        }
    }
    var buf = new Buffer(Math.min(bufSize, len));
    var bytesRead = 0;
    var bytesWritten = 0;
    var canStreamOut = true;
    var canReadBuf = false;
    var readInProcess = null;
    function readAndStream() {
        if (done) {
            return;
        }
        if (canStreamOut && canReadBuf) {
            canStreamOut = outStr.write(buf);
            bytesWritten += buf.length;
            if (bytesWritten >= len) {
                setDone();
                return;
            }
            canReadBuf = false;
        }
        if (readInProcess) {
            return;
        }
        var leftToRead = len - bytesRead;
        if (!canReadBuf && (leftToRead > 0)) {
            if (leftToRead < buf.length) {
                buf = buf.slice(0, leftToRead);
            }
            readInProcess = readFromFile(filePath, pos + bytesRead, buf)
                .then(function () {
                canReadBuf = true;
                readInProcess = null;
                readAndStream();
            })
                .fail(function (err) { setDone(err); });
            readInProcess.done();
        }
    }
    outStr.on('drain', function () {
        canStreamOut = true;
        try {
            readAndStream();
        }
        catch (err) {
            setDone(err);
        }
    });
    outStr.on('error', function (err) {
        if (done) {
            return;
        }
        setDone(err);
    });
    readAndStream();
    return deferred.promise;
}
exports.streamFromFile = streamFromFile;
Object.freeze(exports);
