var
	fs	 = require('fs'),
	path = require('path'),
	fest = require('./fest'),
	po   = require('./po'),
	cmd  = require('./cmd');

var existsSync = fs.existsSync || path.existsSync;

function help() {
	console.log([
		'Usage:',
		'  fest-watch --dir=... [--out=...] [--wrapper=...] [--exclude=...]',
		'',
		'Options:',
		'  --dir       directory where .xml files are',
		'  --wrapper   type of postcompile wrappers, fest|loader|source|variable (default is fest)',
		'  --exclude   regexp, which files ignore',
		'  --out       output directory for compiled files if omited --out = --dir',
		'  --po        output PO file',
		'  --translate input PO file',
		'',
		'  --version   current version',
		'  --help      display these usage instructions',
		''
	].join('\n'));
	process.exit(0);
}

function version() {
	console.log(JSON.parse(fs.readFileSync(__dirname + '/../package.json')).version);
	process.exit(0);
}

if (cmd.help) {
	help();
} else if (cmd.version) {
	version();
}
var prefix = '';
var recursive = cmd.recursive !== 'no';
var dir = cmd.dir;

if (!dir){
	console.log('You need to print directory "fest-watch dir=..."\n');
	help();
	process.exit(1);
}
if (dir[0] !== '/'){
	dir = process.env.PWD + '/' + dir;
}
dir = dir.replace(/\/$/, '') + '/';
if (!existsSync(dir)){
	console.log('directory "' + dir + '" does not exists');
	process.exit(1);
}
var out_dir = cmd.out || dir;
out_dir = out_dir.replace(/\/$/, '') + '/';
if (out_dir[0] !== '/'){
	out_dir = process.env.PWD + '/' + out_dir;
}

cmd.compile = cmd.compile || {};

if (cmd.po) {
	var po_file = cmd.po;
	if (po_file[0] !== '/') {
		po_file = process.env.PWD + '/' + po_file;
	}
	var found_messages = {};
	cmd.compile.events = {
		'message': function (id, context, reference) {
			reference = reference.slice(dir.length)
			var key = id + (context ? context : '');
			if (key in found_messages) {
				found_messages[key].reference.push(reference);
			} else {
				found_messages[key] = {
					id: id,
					context: context,
					reference: [reference]
				};
			}
		}
	}
}
var messages;
if (cmd.translate) {
	var pof = po.load(cmd.translate);
	cmd.compile.plural = pof.plural;
	// cmd.compile.nplurals = pof.nplurals;
	var language = pof.headers['Language'];
	messages = pof.toJSON();
}
cmd.compile.messages = messages;

function regExpQuote(str) {
    return str.replace(new RegExp('[.\\\\+*?\\[\\^\\]$(){}=!<>|:\\-]', 'g'), '\\$&');
}
var wrapper = cmd.wrapper || 'fest';
var watched_files = {};
var excludeRegexp = cmd.exclude ? new RegExp("^" + regExpQuote(dir) + "(" + cmd.exclude.split('|').map(function (v) {
	return v.split('*').map(regExpQuote).join('.*?')
}).join('|') + ")$") : null;

function do_compile(file, dir, out_dir, prefix){
	console.log('compile: ' + dir + file);
	var source = fest.compile(dir + file, cmd.compile || '', '');
	var file_name = (out_dir + file).replace(/\.xml/, language ? '.' + language + '.js' : '.js');
	if (!existsSync(out_dir)){
		fs.mkdirSync(out_dir);
	}
	fs.writeFileSync(file_name, fest.compile_tmpl(prefix + file.replace(/\.xml$/, language ? '.' + language : ''), source, wrapper), 'utf8');
}

function findfiles(dir, out_dir, prefix){
	if(excludeRegexp && excludeRegexp.test(dir)) {
		console.log('exclude dir: ' + dir);
		return;
	}

	files = fs.readdirSync(dir);
	files.filter(function(file){
		return file.indexOf('.xml') > 0;
	}).forEach(function(file){
		if(excludeRegexp && excludeRegexp.test(dir + '/' + file)) {
			console.log('exclude file: ' + file);
			return;
		}
		console.log('watch: ' + file);
		do_compile(file, dir, out_dir, prefix);
	});

	if (recursive){
		files.filter(function(file){
			return fs.statSync(dir + file).isDirectory()

		}).forEach(function(file){
			console.log('watch directory: ' + dir + file);
			findfiles(dir + file + '/', out_dir + file + '/', prefix + file + '/');
		});
	}
}

findfiles(dir, out_dir, prefix);

function escape(s) {
	return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

if (po_file) {
	var po_contents = '#\nmsgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=UTF-8\\n"\n\n', key, msg;
	for (key in found_messages) {
		var msg = found_messages[key];
		for (var i = 0, c = msg.reference.length; i < c; i++) {
			po_contents += '#: ' + msg.reference[i] + '\n';
		}
		if (msg.context) {
			po_contents += 'msgctxt "' + escape(msg.context) + '"\n';
		}
		po_contents += 'msgid "' + escape(msg.id) + '"\nmsgstr ""\n\n'
	}
	fs.writeFileSync(po_file, po_contents, 'utf8');
}