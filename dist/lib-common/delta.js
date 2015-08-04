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
var utf8 = require('./utf8');
var assert = require('assert');
/**
 * @param x is Uint8Array, to which a given uint32 number should be stored.
 * @param i is position, at which storing of 4 bytes should start.
 * @param u is a number within uint32 limits, which should be stored in
 * a given byte array.
 */
function storeUint32(x, i, u) {
    x[i + 3] = u;
    u >>>= 8;
    x[i + 2] = u;
    u >>>= 8;
    x[i + 1] = u;
    u >>>= 8;
    x[i] = u;
}
/**
 * @param x is Uint8Array, where number is stored.
 * @param i is position, at which number's bytes start.
 * @returns number within uint32 limits, loaded from a given array.
 */
function loadUint32(x, i) {
    return (x[i] << 24) | (x[i + 1] << 16) | (x[i + 2] << 8) | x[i + 3];
}
var Delta = (function () {
    function Delta(id, objId, ifTS, ifSize, rfTS, rfSize) {
        this.id = id;
        this.objId = objId;
        this.ifTS = ifTS;
        this.ifSize = ifSize;
        this.rfTS = rfTS;
        this.rfSize = rfSize;
        this.changes = [];
        this.byteCount = { del: 0, ins: 0, ifP: 0, rfP: 0, done: false };
        Object.freeze(this);
    }
    /**
     * This method completes the delta, if number of bytes left for the last skip
     * is the same in both initial and resultant files.
     * @returns true, if delta is set as complete, and false, if it cannot be set
     * complete, due to mismatching byte counts.
     */
    Delta.prototype.complete = function () {
        if (this.changes.length === 0) {
            throw new Error("This delta is empty");
        }
        if (this.byteCount.done) {
            return true;
        }
        var ifLastSkip = this.ifSize - this.byteCount.ifP;
        var rfLastSkip = this.rfSize - this.byteCount.rfP;
        if (ifLastSkip !== rfLastSkip) {
            return false;
        }
        this.byteCount.done = true;
        Object.freeze(this.byteCount);
        Object.freeze(this.changes);
        return true;
    };
    /**
     * This method skips given number of bytes.
     * @param len
     */
    Delta.prototype.skipBytes = function (len) {
        if (this.byteCount.done) {
            throw new Error("This delta is complete, and may no longer be modified.");
        }
        if (((this.byteCount.ifP + len) > this.ifSize) || ((this.byteCount.rfP + len) > this.rfSize)) {
            throw new Error("Too many bytes to skip");
        }
        this.byteCount.ifP += len;
        this.byteCount.rfP += len;
    };
    /**
     * This method adds an insert change for a given number of bytes.
     * @param len
     * @return a change object, with the following fields:
     *  a) op is a string === Delta.INSERT,
     *  b) ifP is a position in the initial file,
     *  c) rfP is a position in the resultant file,
     *  d) len is a number of inserted bytes.
     */
    Delta.prototype.insertBytes = function (len) {
        if (this.byteCount.done) {
            throw new Error("This delta is complete, and may no longer be modified.");
        }
        if ((this.byteCount.rfP + len) > this.rfSize) {
            throw new Error("Too many bytes to insert");
        }
        var prevCh = ((this.changes.length > 0) ? this.changes[this.changes.length - 1] : null);
        var ch;
        if (prevCh && (prevCh.op === Delta.INSERT) && (prevCh.ifP === this.byteCount.ifP)) {
            // extend previous insert to more bytes
            prevCh.len += len;
            ch = prevCh;
        }
        else {
            // add new insert change
            ch = {
                op: Delta.INSERT,
                ifP: this.byteCount.ifP,
                rfP: this.byteCount.rfP,
                len: len
            };
            this.changes.push(ch);
        }
        this.byteCount.rfP += len;
        this.byteCount.ins += len;
        return ch;
    };
    /**
     * This method adds a deletion change for a given number of bytes.
     * @param len
     * @return a change object, with the following fields:
     *  a) op is a string === Delta.DELETE,
     *  b) ifP is a position in the initial file,
     *  c) rfP is a position in the resultant file,
     *  d) len is a number of deleted bytes.
     */
    Delta.prototype.deleteBytes = function (len) {
        if (this.byteCount.done) {
            throw new Error("This delta is complete, and may no longer be modified.");
        }
        if ((this.byteCount.ifP + len) > this.ifSize) {
            throw new Error("Too many bytes to delete");
        }
        var prevCh = ((this.changes.length > 0) ? this.changes[this.changes.length - 1] : null);
        var ch;
        if (prevCh && (prevCh.op === Delta.DELETE) && (prevCh.rfP === this.byteCount.rfP)) {
            // extend previous delete to more bytes
            prevCh.len += len;
            ch = prevCh;
        }
        else {
            // add new delete change
            ch = {
                op: Delta.DELETE,
                ifP: this.byteCount.ifP,
                rfP: this.byteCount.rfP,
                len: len
            };
            this.changes.push(ch);
        }
        this.byteCount.ifP += len;
        this.byteCount.ins += len;
        return ch;
    };
    /**
     * @return true, if this delta is complete, and false, otherwise.
     */
    Delta.prototype.isComplete = function () {
        return this.byteCount.done;
    };
    /**
     * @returns JSON form of this delta object.
     */
    Delta.prototype.toJSON = function () {
        if (!this.byteCount.done) {
            throw new Error("This delta is not complete.");
        }
        var json = {
            id: this.id,
            obj: this.objId,
            ifTS: this.ifTS,
            ifSize: this.ifSize,
            rfTS: this.rfTS,
            rfSize: this.rfSize,
            changes: new Array(this.changes.length)
        };
        this.changes.forEach(function (ch, i) {
            var chInJSON = {
                op: ch.op,
                ifP: ch.ifP,
                rfP: ch.rfP,
                len: ch.len
            };
            if (ch.op === Delta.INSERT) {
                if ('number' !== typeof ch.bP) {
                    throw new Error("Insert object at " + i + " is missing pointer to bytes.");
                }
                chInJSON.bP = ch.bP;
            }
            json.changes[i] = chInJSON;
        });
        return json;
    };
    /**
     * @return Uint8Array with delta's file header.
     * Header has the following layout:
     * a) first 4 bytes contain total header's length,
     * b) everything else is a json form of this delta.
     */
    Delta.prototype.packDeltaFileHeader = function () {
        var json = this.toJSON();
        var jsonBytes = utf8.pack(JSON.stringify(json));
        var header = new Uint8Array(jsonBytes.length);
        storeUint32(header, 0, jsonBytes.length + 4);
        header.set(jsonBytes, 4);
        return header;
    };
    /**
     * @param deltaFileHeader
     * @return a file header size, extracted from the first 4 bytes.
     */
    Delta.prototype.readHeaderLength = function (deltaFileHeader) {
        if (deltaFileHeader.length < 4) {
            throw new Error("Given array is too short");
        }
        return loadUint32(deltaFileHeader, 0);
    };
    /**
     * @param json
     * @return delta object, recreated from its json form.
     */
    Delta.makeFromJSON = function (json) {
        // delta's constructor will validate overall parameters
        var d = new Delta(json.id, json.obj, json.ifTS, json.ifSize, json.rfTS, json.rfSize);
        // add changes one-by-one, allowing for validation of inner parameters
        var prevCh = null;
        json.changes.forEach(function (ch, i) {
            var skipBytes;
            if (prevCh) {
                if (prevCh.op === Delta.INSERT) {
                    skipBytes = ch.ifP - prevCh.ifP;
                }
                else {
                    skipBytes = ch.rfP - prevCh.rfP;
                }
            }
            else {
                skipBytes = ch.ifP;
            }
            if (skipBytes !== 0) {
                d.skipBytes(skipBytes);
            }
            if ((d.byteCount.ifP !== ch.ifP) || (d.byteCount.rfP !== ch.rfP)) {
                throw new Error("File positions in change " + i + " are misaligned");
            }
            if (ch.op === Delta.INSERT) {
                var insCh = d.insertBytes(ch.len);
                if (ch.bP !== 0) {
                    if ((ch.bP % 1) !== 0) {
                        throw new TypeError("Byte chunk pointer is not an integer.");
                    }
                    if (ch.bP <= 0) {
                        throw new TypeError("Byte chunk pointer is not greater than zero.");
                    }
                }
                insCh.bP = ch.bP;
            }
            else if (ch.op === Delta.DELETE) {
                d.deleteBytes(ch.len);
            }
            else {
                throw new Error("Unknown operation: " + ch.op);
            }
            prevCh = ch;
        });
        d.complete();
        return d;
    };
    /**
     * @param id
     * @return a reversed, or flipped delta.
     * Information about locations of inserted byte chunks in the flipped delta
     * (those chunks that are deleted in the original delta) should be added
     * separately.
     */
    Delta.prototype.makeFlippedDelta = function (id) {
        if (!this.byteCount.done) {
            throw new Error("This delta is not complete.");
        }
        var flippedDelta = new Delta(id, this.objId, this.rfTS, this.rfSize, this.ifTS, this.ifSize);
        this.changes.forEach(function (ch) {
            if (ch.op === Delta.INSERT) {
                flippedDelta.deleteBytes(ch.len);
            }
            else {
                flippedDelta.insertBytes(ch.len);
            }
        });
        flippedDelta.complete();
        return flippedDelta;
    };
    /**
     * CAUTION: This function is complex, and needs adequate testing.
     * It has some assert statements in it, which should be removed, when proper
     * regression testing is done.
     * @param id for a new delta
     * @param d12
     * @param d23
     * @return new delta, which is a result of merger of two given deltas.
     * This process merges change steps, but it does not move insertion bytes
     * from given deltas.
     * Therefore, instead of usual byte offset (bP), all changes have array
     * chunks, with reference object, identifying chunks of bytes from given
     * deltas, while array implicitly dictates order for these byte chunks.
     *
     */
    Delta.mergeDeltas = function (id, d12, d23) {
        if (!d12.byteCount.done) {
            throw new Error("First delta is not complete.");
        }
        if (!d23.byteCount.done) {
            throw new Error("Second delta is not complete.");
        }
        if (d12.objId !== d23.objId) {
            throw new Error("Given deltas do not apply to the same object.");
        }
        if (d12.rfTS !== d23.ifTS) {
            throw new Error("Seconds delta's initial state is not the same as " + "a resultant state in the first delta.");
        }
        if (d12.rfSize !== d23.ifSize) {
            throw new Error("Mismatching sizes of the same common state.");
        }
        // place all changes in the order of a file position in the second state
        var orderedChanges = orderChangesAlongP2(d12, d23);
        // create and populate d13 in a loop, which uses two function that close
        // over and use/update d13, orderedChanges, p2 and i.
        var d13 = new Delta(id, d12.objId, d12.ifTS, d12.ifSize, d23.rfTS, d23.rfSize);
        var p2 = 0;
        var i = 0;
        var x;
        var len;
        var ch13;
        /**
         * This function merges given insert-12, with whatever comes next in
         * orderedChanges array.
         * Proper changes are added in d13.
         * Closed over p2 and i also change their values.
         * @param ins12
         * @param byteOffset is a number of first bytes, whose overlap has already
         * been processed.
         */
        function merge12Insert(ins12, byteOffset) {
            var insByteOffset = (('number' === typeof byteOffset) ? byteOffset : 0);
            var ins12end = ins12.rfP + ins12.len;
            var x, ch13, overlap;
            assert.ok(((p2 - insByteOffset) === ins12.rfP), "Internal counter " + "point 2, and inserted bytes offset, are misaligned.");
            /**
             * This inner function adds proper change in d13, setting link to
             * inserted bytes.
             * Closed over insByteOffset and p2 are updated in the call.
             * @param overlap
             */
            function ins12AndSkipOverlap(overlap) {
                ch13 = d13.insertBytes(overlap);
                if (!ch13.chunks) {
                    ch13.chunks = [];
                }
                ch13.chunks.push({ delta: ins12.id, bP: (ins12.bP + insByteOffset), len: overlap });
                insByteOffset += overlap;
                p2 += overlap;
            }
            while (p2 < ins12end) {
                x = orderedChanges[i + 1];
                // complete insert and return, if there is no more changes overlap
                if (!x || x.first || (ins12end <= x.ch.ifP)) {
                    overlap = ins12end - p2;
                    ins12AndSkipOverlap(overlap);
                    return;
                }
                // advance index, so that the change is not processed second time
                i += 1;
                // there may be some bytes skipped before a change point
                overlap = x.ch.ifP - p2;
                if (overlap > 0) {
                    ins12AndSkipOverlap(overlap);
                }
                // merge changes
                if (x.ch.op === Delta.DELETE) {
                    // overlap insert-12 and delete-23, skips inserted bytes 
                    if ((x.ch.ifP + x.ch.len) <= ins12end) {
                        overlap = x.ch.ifP + x.ch.len - p2;
                        insByteOffset += overlap;
                        p2 += overlap;
                    }
                    else {
                        overlap = ins12end - p2;
                        p2 += overlap;
                        return merge23Delete(x.ch, overlap);
                    }
                }
                else {
                    // insert-23 is a point operation for side 12 and at p2
                    ch13 = d13.insertBytes(x.ch.len);
                    if (!ch13.chunks) {
                        ch13.chunks = [];
                    }
                    ch13.chunks.push({ delta: x.ch.id, bP: x.ch.bP, len: x.ch.len });
                }
            }
        }
        /**
         * This function merges given delete-23, with whatever comes next in
         * orderedChanges array.
         * Proper changes are added in d13.
         * Closed over p2 and i also change their values.
         * @param del23
         * @param byteOffset is a number of first bytes, whose overlap has already
         * been processed.
         */
        function merge23Delete(del23, byteOffset) {
            var delByteOffset = (('number' === typeof byteOffset) ? byteOffset : 0);
            var del23end = del23.ifP + del23.len;
            var x, overlap;
            assert.ok(((p2 - delByteOffset) === del23.ifP), "Internal counter " + "point 2, and inserted bytes offset, are misaligned.");
            /**
             * This inner function adds proper change in d13.
             * Closed over delByteOffset and p2 are updated in the call.
             * @param overlap
             */
            function del23AndSkipOverlap(overlap) {
                d13.deleteBytes(overlap);
                delByteOffset += overlap;
                p2 += overlap;
            }
            while (p2 < del23end) {
                x = orderedChanges[i + 1];
                // complete delete and return, if there is no more changes overlap
                if (!x || !x.first || (del23end <= x.ch.rfP)) {
                    overlap = del23end - p2;
                    del23AndSkipOverlap(overlap);
                    return;
                }
                // advance index, so that the change is not processed second time
                i += 1;
                // there may be some bytes skipped before a change point
                overlap = x.ch.rfP - p2;
                if (overlap > 0) {
                    del23AndSkipOverlap(overlap);
                }
                // merge changes
                if (x.ch.op === Delta.INSERT) {
                    // overlap insert-12 and delete-23, skips inserted bytes 
                    if ((x.ch.rfP + x.ch.len) <= del23end) {
                        overlap = x.ch.rfP + x.ch.len - p2;
                        delByteOffset += overlap;
                        p2 += overlap;
                    }
                    else {
                        overlap = del23end - p2;
                        p2 += overlap;
                        return merge12Insert(x.ch, overlap);
                    }
                }
                else {
                    // delete-12 is a point operation for side 23 and at p2
                    d13.deleteBytes(x.ch.len);
                }
            }
        }
        for (var i = 0; i < orderedChanges.length; i += 1) {
            x = orderedChanges[i];
            // skip bytes, if needed
            len = (x.first ? x.ch.rfP : x.ch.ifP) - p2;
            if (len > 0) {
                d13.skipBytes(len);
                p2 += len;
            }
            // do changes
            if (x.first) {
                assert.ok((p2 === x.ch.rfP), "Internal counter along point 2 is misaligned");
                if (x.ch.op === Delta.INSERT) {
                    merge12Insert(x.ch);
                }
                else {
                    // delete-12 is a point operation for 23 side and at p2
                    d13.deleteBytes(x.ch.len);
                }
            }
            else {
                assert.ok((p2 === x.ch.ifP), "Internal counter along point 2 is misaligned");
                if (x.ch.op === Delta.DELETE) {
                    merge23Delete(x.ch);
                }
                else {
                    // insert-23 is a point operation for 12 side and at p2,
                    // and we need a proper reference to inserted bytes
                    ch13 = d13.insertBytes(x.ch.len);
                    if (!ch13.chunks) {
                        ch13.chunks = [];
                    }
                    ch13.chunks.push({ delta: x.ch.id, bP: x.ch.bP, len: x.ch.len });
                }
            }
        }
        d13.complete();
        return d13;
    };
    Delta.INSERT = "ins";
    Delta.DELETE = "del";
    return Delta;
})();
/**
 * @param d12
 * @param d23
 * @return an array with changes from given deltas, ordered by starting
 * position in the common state (state 2).
 */
function orderChangesAlongP2(d12, d23) {
    var orderedChanges = [];
    var i12 = 0;
    var i23 = 0;
    var ch12, ch23;
    while (true) {
        ch12 = d12.changes[i12];
        ch23 = d23.changes[i23];
        // check if both changes are present
        if (!ch12) {
            i12 = -1; // stop single change loop from running below
            break;
        }
        if (!ch23) {
            i23 = -1; // stop single change loop from running below
            break;
        }
        if (ch12.rfP > ch23.ifP) {
            orderedChanges.push({ first: false, ch: ch23 });
            i23 += 1;
        }
        else {
            orderedChanges.push({ first: true, ch: ch12 });
            i12 += 1;
        }
    }
    // loops for mutually excluding situations, when one delta has no more
    // changes, while the other one does. 
    if (i12 > 0) {
        for (var i = i12; i < d12.changes.length; i += 1) {
            orderedChanges.push({ first: true, ch: d12.changes[i] });
        }
    }
    if (i23 > 0) {
        for (var i = i23; i < d23.changes.length; i += 1) {
            orderedChanges.push({ first: false, ch: d23.changes[i] });
        }
    }
    return orderedChanges;
}
Object.freeze(Delta);
Object.freeze(Delta.prototype);
module.exports = Delta;
