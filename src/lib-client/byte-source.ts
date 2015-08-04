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

import Q = require('q');
import nacl = require('ecma-nacl');
import random = require('./random');

export interface BytesSource {
	/**
	 * @param min is a minimal number of bytes, which should be returned by
	 * the promise. If source's end comes earlier, number of returned bytes
	 * can be less than required minimum.
	 * It is an optional parameter, defaulting to zero.
	 * @param max is a maximum that limits number of returned bytes, even if
	 * there are more bytes readily available.
	 * Null value means that any number of bytes is allowed to be returned.
	 * It is an optional parameter, defaulting to null.
	 * @param toSrcEnd is a flag, indicating that all bytes to source's end
	 * should be returned.
	 * It is an optional parameter, defaulting to false.
	 * @return a promise of byte array, resolvable every time there is
	 * something available from internal buffers, within given limits.
	 * When there no more buffered bytes and an end of source is reached,
	 * promise resolves to null.
	 */
	read(min?: number, max?: number, toSrcEnd?: boolean): Q.Promise<Uint8Array>;
	/**
	 * @return total number of bytes that come from this byte source.
	 * Rerturned value can be null, if a byte source does not know its overall
	 * size, yet.
	 */
	totalSize(): number;
}

export interface ObjBytesSource {
	header: BytesSource;
	segments: BytesSource;
	getObjVersion(): number;
}

export interface VersionedBytesSource extends BytesSource {
	getObjVersion(): number;
}

class BytesFIFOBuffer {
	
	private queue: Uint8Array[] = [];
	private queueLen = 0;
	get length(): number {
		return this.queueLen;
	}
	
	constructor() {
		Object.seal(this);
	}
	
	push(bytes: Uint8Array): void {
		this.queue.push(bytes);
		this.queueLen += bytes.length;
	}
	
	private extractAllBytesFrom(): Uint8Array {
		if (this.queue.length === 1) {
			return this.queue.pop();
		} else if (this.queue.length === 0) {
			return null;
		}
		var extractLen = 0;
		for (var i=0; i<this.queue.length; i+=1) {
			extractLen += this.queue[i].length;
		}
		var extract = new Uint8Array(extractLen);
		var offset = 0;
		var chunk: Uint8Array;
		for (var i=0; i<this.queue.length; i+=1) {
			chunk = this.queue[i];
			extract.set(chunk, offset);
			offset += chunk.length;
		}
		for (var i=0; i<this.queue.length; i+=1) {
			this.queue.pop();
		}
		return extract;
	}
	
	private extractSomeBytesFrom(extractLen: number): Uint8Array {
		if (this.queue.length === 0) { return null; }
		var extract = new Uint8Array(extractLen);
		var offset = 0;
		var chunk: Uint8Array;
		while (offset < extractLen) {
			chunk = this.queue[0];
			if ((offset + chunk.length) <= extractLen) {
				extract.set(chunk, offset);
				offset += chunk.length;
				this.queue.shift();
			} else {
				extract.set(chunk.subarray(0, extractLen-offset), offset);
				this.queue[0] = chunk.subarray(extractLen-offset);
				break;
			}
		}
		return extract;
	}
		
	/**
	 * @param min is a minimum required number of bytes
	 * @param max is a maximum number of bytes, which must be a
	 * positive number, greater or equal to min, or it can be null, when
	 * there is no maximum limit.
	 * @return an array of bytes, or null, if there are not enough bytes.
	 */
	getBytes(min: number, max: number): Uint8Array {
		if (this.queue.length === 0) { return null; }
		if (this.queueLen < min) { return null; }
		var extract = ((max === null) || (this.queueLen <= max)) ?
			this.extractAllBytesFrom() : this.extractSomeBytesFrom(max);
		if (extract) {
			this.queueLen -= extract.length;
		}
		return extract;
	}
	
}

export interface ByteSink {
	
	/**
	 * @param bytes to be dumped into this sink.
	 * When total size has not been set, or was set as unknown, null must be
	 * given to indicate an end of byte stream.
	 * When size is set, it is an error to give more bytes, or to give null,
	 * before giving all bytes.
	 */
	swallow(bytes: Uint8Array, err?: any): void;
	
	/**
	 * This function can be called only once. Other calls will throw exceptions.
	 * @param size is a total number of bytes, that will dumped into this sink.
	 * If size is null, we explicitly state that size will not be known till
	 * end of stream.
	 */
	setTotalSize(size: number): void;
	
}

export interface ObjBytesSink {
	header: ByteSink;
	segments: ByteSink;
	setObjVersion(v: number): void;
}

export interface VersionedByteSink extends ByteSink {
	setObjVersion(v: number): void;
}

export class SinkBackedByteSource {
	
	private totalSize: number = null;
	private isTotalSizeSet = false;
	private collectedBytes = 0;
	private isComplete = false;
	private buf = new BytesFIFOBuffer();
	private deferredRead: {
		deferred: Q.Deferred<Uint8Array>;
		min: number;
		max: number;
		toSrcEnd: boolean;
	} = null;
	src: BytesSource;
	sink: ByteSink;
	
	constructor() {
		this.src = {
			read: this.readBytes.bind(this),
			totalSize: (): number => { return this.totalSize; }
		};
		Object.freeze(this.src);
		this.sink = {
			swallow: this.swallowBytes.bind(this),
			setTotalSize: this.setTotalSize.bind(this)
		};
		Object.freeze(this.sink);
		Object.seal(this);
	}
	
	private setTotalSize(size: number): void {
		if (this.isTotalSizeSet) {
			throw new Error("Total size has already been set");
		} else if ((size !== null) && (size < this.collectedBytes)) {
			throw new Error("Given size is less than number of "+
				"already collected bytes.");
		}
		this.isTotalSizeSet = true;
		if ('number' === typeof size) {
			this.totalSize = size;
		}
	}
	
	private readBytes(min = 0, max: number = null, toSrcEnd = false):
			Q.Promise<Uint8Array> {
		if (min < 0) { min = 0; }
		if (toSrcEnd) { max = null; }
		if (('number' === typeof max) && ((max < 1) || (max < min))) {
			throw new Error("Given bad min-max parameters.");
		}
		if (('number' === typeof max) && (max < min)) { throw new Error(
				"Bad min-max parameters are given."); }
		if (this.isComplete) {
			return Q.when<Uint8Array>(
				this.buf.getBytes(0, max));
		}
		if (this.deferredRead) {
			throw new Error("There is already pending read");
		}
		if (!toSrcEnd) {
			var bufferedBytes = this.buf.getBytes(min, max);
			if (bufferedBytes) {
				return Q.when(bufferedBytes);
			}
		}
		this.deferredRead = {
			deferred: Q.defer<Uint8Array>(),
			min: min,
			max: max,
			toSrcEnd: !!toSrcEnd
		};
		return this.deferredRead.deferred.promise;
	}
	
	private swallowBytes(bytes: Uint8Array): void {
		if (this.isComplete) {
			if (bytes === null) {
				return;
			} else {
				throw new Error("Complete sink cannot except any more bytes.");
			}
		}
		var boundsErr: Error = null;
		if (bytes === null) {
			this.isComplete = true;
			if (this.totalSize === null) {
				this.totalSize = this.collectedBytes;
			} else if (this.totalSize < this.collectedBytes) {
				boundsErr = new Error("Stopping bytes at "+this.collectedBytes+
					", which is sooner than declared total size "+
					this.totalSize+".");
			}
		} else {
			if (bytes.length === 0) { return; }
			if (this.totalSize !== null) {
				var maxBytesExpectation = this.totalSize - this.collectedBytes;
				if (bytes.length >= maxBytesExpectation) {
					this.isComplete = true;
					if (bytes.length > maxBytesExpectation) {
						boundsErr = new Error("More bytes given than sink was "+
							"set to accept; swallowing only part of bytes.");
						if (maxBytesExpectation === 0) { throw boundsErr; }
						bytes = bytes.subarray(0, maxBytesExpectation);
					}
				}
			}
			this.buf.push(bytes);
			this.collectedBytes += bytes.length;
		}
		if (!this.deferredRead) { return; }
		if (this.isComplete) {
			this.deferredRead.deferred.resolve(
				this.buf.getBytes(0, this.deferredRead.max));
		} else {
			var bufferedBytes = this.buf.getBytes(
				this.deferredRead.min, this.deferredRead.max);
			if (bufferedBytes) {
				this.deferredRead.deferred.resolve(bufferedBytes);
			}
		}
		if (boundsErr) { throw boundsErr; }
	}
	
}

export class SinkBackedObjSource {
	
	private version: number = null;
	private header = new SinkBackedByteSource();
	private segs = new SinkBackedByteSource();
	sink: ObjBytesSink;
	src: ObjBytesSource;
	
	constructor() {
		this.sink = {
			header: this.header.sink,
			segments: this.segs.sink,
			setObjVersion: this.setObjVersion.bind(this)
		}
		Object.freeze(this.sink);
		this.src = {
			header: this.header.src,
			segments: this.segs.src,
			getObjVersion: this.getObjVersion.bind(this)
		}
	}
	
	setObjVersion(v: number): void {
		if (this.version === null) {
			this.version = v;
		} else if (v !== this.version) {
			throw new Error("Expect object version "+this.version+
				", but getting version "+v+" instead");
		}
	}
	
	getObjVersion(): number {
		return this.version;
	}
	
}

function packAndSink(byteArrs: Uint8Array[],
		segWriter: nacl.fileXSP.SegmentsWriter, segInd: number,
		sink: ByteSink, toObjEnd = false):
		{ numOfSegs: number; dataLenPacked: number; leftOver: Uint8Array; } {
	var dataLenPacked = 0;
	var numOfSegs = 0;
	var i = 0;
	var buf: Uint8Array = null;
	var joint: Uint8Array;
	var segDataLen: number;
	while ((buf !== null) || (i < byteArrs.length)) {
		if (buf === null) {
			buf = byteArrs[i];
			i += 1;
			if (buf.length === 0) {
				buf = null;
				continue;
			}
		}
		segDataLen = segWriter.segmentSize(segInd) - nacl.secret_box.POLY_LENGTH;
		if (buf.length >= segDataLen) {
			// Sink buf completely, or just part of it.
			sink.swallow(segWriter.packSeg(
				buf.subarray(0, segDataLen), segInd).seg);
			dataLenPacked += segDataLen;
			numOfSegs += 1;
			segInd += 1;
			buf = (buf.length > segDataLen) ? buf.subarray(segDataLen) : null;
		} else if (i < byteArrs.length) {
			if (byteArrs[i].length === 0) {
				i += 1;
			}else if ((buf.length + byteArrs[i].length) > segDataLen) {
				// buf and initial part of the next array are sinked.
				joint = new Uint8Array(segDataLen);
				joint.set(buf, 0);
				joint.set(byteArrs[i].subarray(
					0, segDataLen - buf.length), buf.length);
				joint = null;
				sink.swallow(segWriter.packSeg(joint, segInd).seg);
				dataLenPacked += segDataLen;
				numOfSegs += 1;
				segInd += 1;
				// buf is set to non-packed part of the next array.
				buf = byteArrs[i].subarray(segDataLen - buf.length);
				i += 1;
			} else {
				// Add next array to buf.
				joint = new Uint8Array(buf.length + byteArrs[i].length);
				joint.set(buf, 0);
				joint.set(byteArrs[i], buf.length);
				buf = joint;
				i += 1;
				joint = null;
			}
		} else if (toObjEnd) {
			// There are no arrays left at this point, and, since we must go
			// to the end, we sink buf, risking an exception, if there is
			// a mismatch between writer's expectations and a number of
			// given content bytes.
			sink.swallow(segWriter.packSeg(buf, segInd).seg);
			numOfSegs += 1;
			segInd += 1;
			dataLenPacked += buf.length;
			buf = null;
		} else {
			break;
		}
	}
	return {
		numOfSegs: numOfSegs,
		dataLenPacked: dataLenPacked,
		leftOver: buf
	}
}

/**
 * @param bytes is an array of byte arrays with content, and it can be
 * modified after this call, as all encryption is done within this call,
 * and given content array is not used by resultant source over its lifetime.
 * @param segWriter that is used used to encrypt bytes into segments.
 * If it were an existing writer, it should be reset for ingestion of a complete
 * new content. Segments writer can be destroyed after this call, as it is not
 * used by resultant source over its lifetime.
 * @param objVersion
 * @return an object byte source
 */
export function makeObjByteSourceFromArrays(arrs: Uint8Array|Uint8Array[],
		segWriter: nacl.fileXSP.SegmentsWriter, objVersion: number = null):
		ObjBytesSource {
	var byteArrs = (Array.isArray(arrs) ?
		<Uint8Array[]> arrs : [ <Uint8Array> arrs ]);
	
	// pack segments
	var segsPipe = new SinkBackedByteSource();
	var packRes = packAndSink(byteArrs, segWriter, 0, segsPipe.sink, true);
	segsPipe.sink.swallow(null);
	
	// pack header
	var headerPipe = new SinkBackedByteSource();
	segWriter.setContentLength(packRes.dataLenPacked);
	headerPipe.sink.swallow(segWriter.packHeader());
	headerPipe.sink.swallow(null);
	
	// return respective byte sources
	return {
		header: headerPipe.src,
		segments: segsPipe.src,
		getObjVersion: () => { return objVersion; } 
	};
}

class EncryptingByteSink implements VersionedByteSink {
	
	private objSink: ObjBytesSink;
	private segsWriter: nacl.fileXSP.SegmentsWriter;
	private totalSize: number = null;
	private isTotalSizeSet = false;
	private collectedBytes = 0;
	private isCompleted = false;
	setObjVersion: (v: number) => void;
	private segInd = 0;
	private segBuf: Uint8Array = null;
	
	constructor(objSink: ObjBytesSink,
			segsWriter: nacl.fileXSP.SegmentsWriter) {
		this.segsWriter = segsWriter;
		this.objSink = objSink;
		this.setObjVersion = this.objSink.setObjVersion;
		Object.seal(this);
	}
	
	private encrAndSink(bytes: Uint8Array): void {
		try {
			if (bytes === null) {
				if (this.segBuf) {
					packAndSink([ this.segBuf ], this.segsWriter,
						this.segInd, this.objSink.segments);
					this.segBuf = null;
				}
				this.objSink.segments.swallow(null);
			} else {
				var segContentLen = this.segsWriter.segmentSize(this.segInd) -
					nacl.secret_box.POLY_LENGTH;
				var packRes = packAndSink(
					(this.segBuf ? [ this.segBuf, bytes ] : [ bytes ]),
					this.segsWriter, this.segInd, this.objSink.segments);
				this.segInd += packRes.numOfSegs;
				this.segBuf = packRes.leftOver;
			}
		} catch (err) {
			this.completeOnErr(err);
			throw err;
		}
	}
	
	private setCompleted(): void {
		this.isCompleted = true;
		this.segsWriter.destroy();
		this.segsWriter = null;
	}
	
	private completeOnErr(err: any): void {
		this.objSink.segments.swallow(null, err);
		if (this.totalSize === null) {
			this.objSink.header.swallow(null, err);
		}
		this.setCompleted();
	}
	
	swallow(bytes: Uint8Array, err?: any): void {
		if (this.isCompleted) {
			if (bytes === null) {
				return;
			} else {
				throw new Error("Complete sink cannot except any more bytes.");
			}
		}
		var boundsErr: Error = null;
		if (bytes === null) {
			if (err) {
				this.completeOnErr(err);
				return;
			}
			if (this.totalSize === null) {
				this.setTotalSize(this.collectedBytes);
			} else if (this.totalSize < this.collectedBytes) {
				boundsErr = new Error("Stopping bytes at "+this.collectedBytes+
					", which is sooner than declared total size "+
					this.totalSize+".");
			}
			this.encrAndSink(null);
			this.setCompleted();
		} else {
			if (bytes.length === 0) { return; }
			if (this.totalSize !== null) {
				var maxBytesExpectation = this.totalSize - this.collectedBytes;
				if (bytes.length >= maxBytesExpectation) {
					this.isCompleted = true;
					if (bytes.length > maxBytesExpectation) {
						boundsErr = new Error("More bytes given than sink was "+
							"set to accept; swallowing only part of bytes.");
						if (maxBytesExpectation === 0) { throw boundsErr; }
						bytes = bytes.subarray(0, maxBytesExpectation);
					}
				}
			}
			this.encrAndSink(bytes);
		}
		if (boundsErr) { throw boundsErr; }
	}
	
	setTotalSize(size: number): void {
		if (this.isTotalSizeSet) {
			throw new Error("Total size has already been set");
		} else if ((size !== null) && (size < this.collectedBytes)) {
			throw new Error("Given size is less than number of "+
				"already collected bytes.");
		}
		this.isTotalSizeSet = true;
		if ('number' === typeof size) {
			this.totalSize = size;
			this.segsWriter.setContentLength(size);
		}
		this.objSink.header.swallow(this.segsWriter.packHeader());
		this.objSink.header.swallow(null);
	}
	
	wrap(): VersionedByteSink {
		var wrap: VersionedByteSink = {
			swallow: this.swallow.bind(this),
			setTotalSize: this.setTotalSize.bind(this),
			setObjVersion: this.setObjVersion
		}
		Object.freeze(wrap);
		return wrap;
	}
	
}

export function makeEncryptingByteSink(objSink: ObjBytesSink,
		segsWriter: nacl.fileXSP.SegmentsWriter): VersionedByteSink {
	return (new EncryptingByteSink(objSink, segsWriter)).wrap();
}

class DecryptingByteSource implements VersionedBytesSource {
	
	private segs: BytesSource;
	private initProgress: Q.Promise<void>;
	private segsReader: nacl.fileXSP.SegmentsReader = null;
	private readInProgress: Q.Promise<Uint8Array> = null;
	private segInd = 0;
	private segBuf: Uint8Array = null;
	private buf = new BytesFIFOBuffer();
	private decryptedAll: boolean = false;
	getObjVersion: () => number;
	
	constructor(objSrc: ObjBytesSource,
			segReaderGen: (header: Uint8Array) => nacl.fileXSP.SegmentsReader) {
		this.segs = objSrc.segments;
		this.getObjVersion = objSrc.getObjVersion;
		this.initProgress = objSrc.header.read(0, null, true)
		.then((header) => {
			this.segsReader = segReaderGen(header);
			this.decryptedAll = (this.segsReader.isEndlessFile() ?
				false : (this.segsReader.numberOfSegments() === 0));
			this.initProgress = null;
		});
		Object.seal(this);
	}
	
	private setDecryptedAll(): void {
		this.decryptedAll = true;
		this.segsReader.destroy();
		this.segsReader = null;
	}
	
	private readRecursively(min: number, max: number, toSrcEnd: boolean):
			Q.Promise<Uint8Array> {
		if (toSrcEnd) { max = null; }
		if (this.decryptedAll) {
			return Q.when(this.buf.getBytes(0, max));
		}
		var minReadFromSegs = this.segsReader.segmentSize(this.segInd);
		if (this.segBuf) {
			minReadFromSegs -= this.segBuf.length;
		}
		var promise = this.segs.read(minReadFromSegs)
		.then((segBytes) => {
			var openedSeg: { data: Uint8Array; segLen: number; last?: boolean; };
			if (!segBytes) {
				if (this.decryptedAll) {
					return this.buf.getBytes(0, max);
				} else if (this.segBuf && this.segsReader.isEndlessFile()) {
					openedSeg = this.segsReader.openSeg(this.segBuf, this.segInd);
					this.buf.push(openedSeg.data);
					this.setDecryptedAll();
					this.segBuf = null;
					return this.buf.getBytes(0, max);
				} else {
					throw new Error("Unexpected end of byte source.");
				}
			}
			var segSize = this.segsReader.segmentSize(this.segInd);
			var mergedBytes: Uint8Array;
			var offset: number;
			if (this.segBuf) {
				if (segSize <= (this.segBuf.length + segBytes.length)) {
					mergedBytes = new Uint8Array(segSize);
					offset = 0;
					mergedBytes.set(this.segBuf, offset);
					offset += this.segBuf.length;
					mergedBytes.set(
						segBytes.subarray(0, (segSize - offset)), offset);
					segBytes = segBytes.subarray((segSize - offset));
					this.segBuf = null;
					openedSeg = this.segsReader.openSeg(mergedBytes, this.segInd);
					if (openedSeg.last) {
						this.setDecryptedAll();
						this.buf.push(openedSeg.data);
						return this.buf.getBytes(0, max);
					}
					this.segInd += 1;
					segSize = this.segsReader.segmentSize(this.segInd);
				} else {
					mergedBytes = new Uint8Array(
						this.segBuf.length + segBytes.length);
					mergedBytes.set(this.segBuf, 0);
					mergedBytes.set(segBytes, this.segBuf.length);
					this.segBuf = mergedBytes;
					return this.readRecursively(min, max, toSrcEnd);
				}
			}
			offset = 0;
			while ((segBytes.length - offset) >= segSize) {
				openedSeg = this.segsReader.openSeg(
					segBytes.subarray(offset), this.segInd);
				if (openedSeg.last) {
					this.setDecryptedAll();
					this.buf.push(openedSeg.data);
					return this.buf.getBytes(0, max);
				}
				this.buf.push(openedSeg.data);
				offset += openedSeg.segLen;
				this.segInd += 1;
				segSize = this.segsReader.segmentSize(this.segInd);
			}
			if ((segBytes.length - offset) > 0) {
				this.segBuf = new Uint8Array(segBytes.length - offset);
				this.segBuf.set(segBytes.subarray(offset));
			}
			if (toSrcEnd) {
				return this.readRecursively(min, max, toSrcEnd);
			}
			var bytes = this.buf.getBytes(0, max);
			if (bytes) {
				return bytes;
			} else {
				return this.readRecursively(min, max, toSrcEnd);
			}
		});
		return <Q.Promise<Uint8Array>> promise;
	}
	
	read(min = 0, max: number = null, toSrcEnd = false): Q.Promise<Uint8Array> {
		if (this.readInProgress) {
			throw new Error("There is already pending read");
		}
		if (this.initProgress) {
			this.readInProgress = this.initProgress
			.then(() => {
				return this.readRecursively(min, max, toSrcEnd);
			});
		} else {
			this.readInProgress = this.readRecursively(min, max, toSrcEnd);
		}
		return this.readInProgress
		.fin(() => {
			this.readInProgress = null;
		});
	}
	
	totalSize(): number {
		return this.segsReader.contentLength();
	}
	
	wrap(): VersionedBytesSource {
		var wrap: VersionedBytesSource = {
			read: this.read.bind(this),
			totalSize: this.totalSize.bind(this),
			getObjVersion: this.getObjVersion
		}
		Object.freeze(wrap);
		return wrap;
	}
	
}

/**
 * @param src
 * @param fileKeyDecr is a decryptor to extract file key
 */
export function makeDecryptedByteSource(src: ObjBytesSource,
		segReaderGen: (header: Uint8Array) => nacl.fileXSP.SegmentsReader):
		VersionedBytesSource {
	return (new DecryptingByteSource(src, segReaderGen)).wrap();
}

Object.freeze(exports);