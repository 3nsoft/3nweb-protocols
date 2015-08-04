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

/**
 * This module produces session factory constructor.
 * Current implementation is test-grade, and one must improve this for production.
 * Keep in mind, that delivery protocol is not allowed to have long-lived sessions.
 */

import express = require('express');
import Q = require('q');

// Constant custom header
export var SESSION_ID_HEADER = "X-Session-Id";

export interface Request<TSessionParam> extends express.Request {
	session: Session<TSessionParam>;
}

export interface IdGenerator {
	(): Q.Promise<string>;
}

export interface IGenerateSession<TSessionParam> {
	(): Q.Promise<Session<TSessionParam>>;
}

export interface SessionsContainer {
	add(s: Session<any>): Q.Promise<void>;
	remove(s: Session<any>): Q.Promise<void>;
	get(sId: string): Q.Promise<Session<any>>;
}

export interface Factory {
	generate: IGenerateSession<any>;
	ensureAuthorizedSession(): express.RequestHandler;
	ensureOpenedSession(): express.RequestHandler;
	checkSession(): express.RequestHandler;
}

export function makeSessionFactory(idGenerator: IdGenerator,
		container: SessionsContainer): Factory {
	var fact = new SessionFactory(idGenerator, container);
	var wrap: Factory = {
		generate: fact.generate.bind(fact),
		ensureAuthorizedSession: fact.ensureAuthorizedSession.bind(fact),
		ensureOpenedSession: fact.ensureOpenedSession.bind(fact),
		checkSession: fact.checkSession.bind(fact)
	}
	Object.freeze(wrap);
	return wrap;
}

class SessionFactory implements Factory {
	
	private idGenerator: IdGenerator;
	
	sessions: SessionsContainer;
	
	constructor(idGenerator: IdGenerator, container: SessionsContainer) {
		this.sessions = container;
		this.idGenerator = idGenerator;
		Object.freeze(this);
	}
	
	generate() {
		return this.idGenerator()
		.then((newId) => {
			var s = makeSession(newId, this);
			var promise = this.sessions.add(s)
			.then(() => {
				return s;
			});
			return promise;
		});
	}

	/**
	 * @param factory to which resulting middleware is bound.
	 * @param send401WhenMissingSession is a flag, which, when true, makes
	 * middleware function to send 401 reply, when valid session object cannot
	 * be found.
	 * @param sessionMustBeAuthorized is a flag, which, when true,, makes
	 * middleware function to send 401 reply, when session needs to go through
	 * sender authorization step.
	 * @returns Function middleware, which adds to request object a 'session'
	 * field with existing valid session object, or, if no session found, and
	 * it is configured so, responds with 401.
	 */
	private makeSessionMiddleware(send401WhenMissingSession: boolean,
			sessionMustBeAuthorized: boolean): express.RequestHandler {
		return (req: Request<any>, res: express.Response, next: Function) => {
			var sessionId = req.get(SESSION_ID_HEADER);
			
			// case of missing session id
			if ('string' !== typeof sessionId) {
				if (send401WhenMissingSession) {
					res.status(401).send("Required to start new session.");
				} else {
					next();
				}
				return;
			}
	
			// get promise with session, and attach action to its resolution
			this.sessions.get(sessionId)
			.then((session) => {
				if (('object' === typeof session) && (null !== session)) {
					req.session = session;
					session.lastAccessedAt = Date.now();
				}
				if (send401WhenMissingSession) {
					if (!req.session) {
						res.status(401).send("Required to start new session.");
					} else if (sessionMustBeAuthorized &&
							!req.session.isAuthorized) {
						res.status(401).send(
								"Required to complete authorization step.");
					} else {
						next();
					}
				} else {
					next();
				}
			})
			.done();
		};
	}
	
	ensureAuthorizedSession(): express.RequestHandler {
		return this.makeSessionMiddleware(true, true);
	}
	
	ensureOpenedSession(): express.RequestHandler {
		return this.makeSessionMiddleware(true, false);
	}
	
	checkSession(): express.RequestHandler {
		return this.makeSessionMiddleware(false, false);
	}
	
}

export interface Session<T> {
	params: T;
	isAuthorized: boolean;
	id: string;
	lastAccessedAt: number;
	addCleanUp(func: { (): void; }): void;
	putIdIntoResponse(res: express.Response): void;
	close(): void;
}

function makeSession(id: string, factory: SessionFactory): Session<any> {
	var cleanUpFuncs: { (): void; }[] = [];
	var session: Session<any> = {
		params: <any> {},
		isAuthorized: false,
		id: id,
		lastAccessedAt: Date.now(),
		addCleanUp: (func: { (): void; }): void => {
			if ('function' !== typeof func) { throw new Error(
					"Given argument func must be function."); } 
			cleanUpFuncs.push(func);
		},
		close: (): void => {
			factory.sessions.remove(session);
			var func;
			for (var i=0; i<cleanUpFuncs.length; i++) {
				func = cleanUpFuncs[i];
				cleanUpFuncs[i] = null;
				try {
					if ('function' === typeof func) { func(); }
				} catch (err) {
					// where to log error(s)?
				}
			}
		},
		putIdIntoResponse: (res: express.Response): void => {
			var header = {};
			header[SESSION_ID_HEADER] = session.id;
			res.set(header);
		}
	};
	Object.seal(session);
	return session;
}

Object.freeze(exports);