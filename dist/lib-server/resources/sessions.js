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
// Constant custom header
exports.SESSION_ID_HEADER = "X-Session-Id";
function makeSessionFactory(idGenerator, container) {
    var fact = new SessionFactory(idGenerator, container);
    var wrap = {
        generate: fact.generate.bind(fact),
        ensureAuthorizedSession: fact.ensureAuthorizedSession.bind(fact),
        ensureOpenedSession: fact.ensureOpenedSession.bind(fact),
        checkSession: fact.checkSession.bind(fact)
    };
    Object.freeze(wrap);
    return wrap;
}
exports.makeSessionFactory = makeSessionFactory;
var SessionFactory = (function () {
    function SessionFactory(idGenerator, container) {
        this.sessions = container;
        this.idGenerator = idGenerator;
        Object.freeze(this);
    }
    SessionFactory.prototype.generate = function () {
        var _this = this;
        return this.idGenerator()
            .then(function (newId) {
            var s = makeSession(newId, _this);
            var promise = _this.sessions.add(s)
                .then(function () {
                return s;
            });
            return promise;
        });
    };
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
    SessionFactory.prototype.makeSessionMiddleware = function (send401WhenMissingSession, sessionMustBeAuthorized) {
        var _this = this;
        return function (req, res, next) {
            var sessionId = req.get(exports.SESSION_ID_HEADER);
            // case of missing session id
            if ('string' !== typeof sessionId) {
                if (send401WhenMissingSession) {
                    res.status(401).send("Required to start new session.");
                }
                else {
                    next();
                }
                return;
            }
            // get promise with session, and attach action to its resolution
            _this.sessions.get(sessionId)
                .then(function (session) {
                if (('object' === typeof session) && (null !== session)) {
                    req.session = session;
                    session.lastAccessedAt = Date.now();
                }
                if (send401WhenMissingSession) {
                    if (!req.session) {
                        res.status(401).send("Required to start new session.");
                    }
                    else if (sessionMustBeAuthorized &&
                        !req.session.isAuthorized) {
                        res.status(401).send("Required to complete authorization step.");
                    }
                    else {
                        next();
                    }
                }
                else {
                    next();
                }
            })
                .done();
        };
    };
    SessionFactory.prototype.ensureAuthorizedSession = function () {
        return this.makeSessionMiddleware(true, true);
    };
    SessionFactory.prototype.ensureOpenedSession = function () {
        return this.makeSessionMiddleware(true, false);
    };
    SessionFactory.prototype.checkSession = function () {
        return this.makeSessionMiddleware(false, false);
    };
    return SessionFactory;
})();
function makeSession(id, factory) {
    var cleanUpFuncs = [];
    var session = {
        params: {},
        isAuthorized: false,
        id: id,
        lastAccessedAt: Date.now(),
        addCleanUp: function (func) {
            if ('function' !== typeof func) {
                throw new Error("Given argument func must be function.");
            }
            cleanUpFuncs.push(func);
        },
        close: function () {
            factory.sessions.remove(session);
            var func;
            for (var i = 0; i < cleanUpFuncs.length; i++) {
                func = cleanUpFuncs[i];
                cleanUpFuncs[i] = null;
                try {
                    if ('function' === typeof func) {
                        func();
                    }
                }
                catch (err) {
                }
            }
        },
        putIdIntoResponse: function (res) {
            var header = {};
            header[exports.SESSION_ID_HEADER] = session.id;
            res.set(header);
        }
    };
    Object.seal(session);
    return session;
}
Object.freeze(exports);
