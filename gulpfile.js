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

var gulp = require('gulp');
var typescript = require('gulp-typescript');
var merge = require('merge2');
var browserify = require('browserify');
var source = require('vinyl-source-stream');
var nodeunit = require("gulp-nodeunit-runner");
var typedoc = require("gulp-typedoc");

var SRC = 'src';
var DIST = 'dist';

gulp.task('servers', function() {
	var exclude = [ '!'+SRC+'/lib-client/**/*',
	               '!'+SRC+'/test*/**/*',
	               '!'+SRC+'/**/public-content/**/*'];
	var ts = gulp.src([ SRC+'/**/*.ts', SRC+'/typings/**/*.ts' ].concat(exclude))
	.pipe(typescript({
		target: 'ES5',
		module: 'commonjs'
	}))
	.js;
	var js = gulp.src([ SRC+'/**/*.js' ].concat(exclude));
	return merge(js, ts)
	.pipe(gulp.dest(DIST));
});

function browserifyTS(pathInSrc, externals) {
	var b = browserify()
	.add(__dirname+'/'+SRC+'/'+pathInSrc);
	if (externals) {
		for (var i=0; i<externals.length; i+=1) {
			b = b.external(externals[i]);
		}
	}
	return b.plugin('tsify', {
		target: 'ES5',
		module: 'commonjs'
	})
	.bundle()
	.on('error', function (err) { console.error(err.toString()); })
	.pipe(source(pathInSrc.substring(0, pathInSrc.length-2)+'js'));
}

function browserifyExternal(nodeModules) {
	var tasks = [];
	var t;
	for (var i=0; i<nodeModules.length; i+=1) {
		t = browserify()
		.require(nodeModules[i], { expose: nodeModules[i] })
		.bundle()
		.pipe(source('browser-scripts/'+nodeModules[i]+'.js'));
		tasks.push(t);
	}
	return tasks;
}

gulp.task('clients', function() {
	var nodeModules = [ 'q', 'ecma-nacl', 'jsuri' ];
	var bts = browserifyExternal(nodeModules);
	// mailerId user setting page
	bts.push(browserifyTS('mailerId/user-settings/public-content/index.ts',
					nodeModules),
			browserifyTS(
					'mailerId/user-settings/public-content/key-gen-worker.ts',
					nodeModules));
	// asmail user setting page
	bts.push(browserifyTS('asmail/user-settings/public-content/index.ts',
					nodeModules),
			browserifyTS('asmail/user-settings/public-content/key-gen-worker.ts',
					nodeModules));
	// 3nstorage user setting page
	bts.push(browserifyTS('3nstorage/user-settings/public-content/index.ts',
					nodeModules),
			browserifyTS(
					'3nstorage/user-settings/public-content/key-gen-worker.ts',
					nodeModules));
	// asmail app
	bts.push(browserifyTS('client-apps/public-content/asmail/app.ts',
					nodeModules),
			browserifyTS('client-apps/public-content/asmail/key-gen-worker.ts',
					nodeModules));
	// copy all non-ts files in pages
	bts.push(gulp.src(SRC+'/**/public-content/**/*.html'),
			gulp.src(SRC+'/**/public-content/**/*.css'),
			gulp.src(SRC+'/**/public-content/**/*.js'));
	bts = merge(bts)
	.pipe(gulp.dest(DIST));
	// copy shared things
	var otherScripts = gulp.src(SRC+'/browser-scripts/**/*')
	.pipe(gulp.dest(DIST+'/browser-scripts'));
	return merge(bts, otherScripts);
});

gulp.task('test-libs', ['servers'], function() {
	var ts = gulp.src([ SRC+'/test-libs/**/*.ts', SRC+'/typings/**/*.ts' ])
	.pipe(typescript({
		target: 'ES5',
		module: 'commonjs'
	}))
	.js
	.pipe(gulp.dest(DIST+'/test-libs'));
});

gulp.task('run-unittest', [ 'test-libs' ], function() {
	var tests = [ DIST+'/test-libs/*.js' ];
	return gulp.src(tests)
	.pipe(nodeunit());
});

gulp.task('run', [ 'servers', 'clients' ], function() {
	require('./dist/app');
});

gulp.task('default', [ 'run' ]);

gulp.task('code-docs', function() {
	return gulp.src([ SRC+'/**/*.ts', SRC+'/typings/**/*' ])
	.pipe(typedoc({
		module: 'commonjs',
		out: DIST+'/code-docs',
		name: '3NProtocols demo',
		target: 'es5',
		ignoreCompilerErrors: true
	}));
});

gulp.task('help', function() {
	var h = '\nThe following gulp tasks are defined:\n'+
		'\t1) "run" (current default) task compiles both server and'+
		' client components, and starts main app (dist/app);\n'+
		'\t2) "servers" task compiles all services, but is not touching'+
		' client components, located in public-content folders;\n'+
		'\t3) "clients" task compiles all client apps, located in'+
		' public-content folders;\n'+
		'\t4) "test-libs" compiles all unit tests of libs;\n'+
		'\t5) "run-unittest" task runs unit tests.\n'+
		'\t6) "code-docs" task uses TypeDoc to generate dist/code-docs pages,'+
		'picking up all of source documentation.\n';
	console.log(h+'\n');
});
