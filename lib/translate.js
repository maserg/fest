function translate(data) {
	"use strict";

	var template = data.template,
		dictionary = data.options.messages,
		sax = data.sax,
		fest_ns = data.fest_ns,
		escapeHTML = data.escapeHTML,
		stack = [],
		options = data.options;

	var parser = sax.parser(true, {trim:false, xmlns:true}),
		opennode = false,
		message = 0,
		result = '',
		messages = [],
		attributes = { // translare these attributes
			title: 1,
			alt: 1,
			content: 1,
			placeholder: 1
		},
		exclude = { // ignore text & cdata nodes inside these elements
			value: 1,
			get: 1,
			commnet: 1,
			doctype: 1,
			script: 1
		};

	function append_xml(s) {
		if (message) {
			messages[messages.length - 1].id += s;
		} else {
			result += s;
		}
	}

	function Message(id, context) {
		this.id = id;
		this.context = context;
		this.reference = data.file + ':' + (parser.line + 1);
	}

	function yield_message(msg, fn) {
		fn = fn || function (s) { return s };
		var text = msg.id;
		if (/\S+/.test(msg.id)) {
			var id = text.trim();
			if (!/^\d+$/.test(id)) {
				if ('message' in options.events) {
					options.events.message(id, msg.context, msg.reference);
				}
				var key = msg.context ? id + msg.context : id;
				if (dictionary && dictionary[key]) {
					text = text.match(/^\s*/)[0] + dictionary[key] + text.match(/\s*$/)[0];
				}
			}
		}
		result += fn(text);
	}

	function cdata(text) {
		return '<![CDATA[' + text + ']]>';
	}

	function ontext(text, fn) {
		if (!message) {
			var node = stack[stack.length - 1];
			if (node && node.ns[node.prefix] === fest_ns && !exclude[node.local]) {
				return yield_message(new Message(text), fn);
			}
		}
		append_xml(fn(text));
	}

	function closetag(){
		if (opennode){
			opennode = false;
			append_xml('>');
		}
	}

	parser.onprocessinginstruction = function(instruction){
		result += '<?' + instruction.name + ' ' + instruction.body + '?>';
	};

	parser.oncomment = function(comment){
        result += '<!--' + comment + '-->';
	};

	function parse_attribute(value) {
		if (value && !message && !/^\d+$/.test(value)) {
			value = value.replace(/\{\{/g, "__DOUBLE_LEFT_CURLY_BRACES__").replace(/\}\}/g, "__DOUBLE_RIGHT_CURLY_BRACES__");
			if (/^\s*\{[^}]*\}\s*$/.test(value)) {
				// signle attribute expression
			} else {
				var id = value.trim();
				if ('message' in options.events) {
					options.events.message(id, undefined, data.file + ':' + (parser.line + 1));
				}
				if (dictionary && dictionary[id]) {
					value = dictionary[id];
				}
			}
			value = value.replace(/__DOUBLE_LEFT_CURLY_BRACES__/g, "{").replace(/__DOUBLE_RIGHT_CURLY_BRACES__/g, "}");
		}
		return value;
	}

	parser.onopentag = function(node){
		var i, l, xml;
		closetag();
		stack.push(node);
		if (node.ns[node.prefix] === fest_ns && (node.local === 'message' || node.local === 'msg')){
			messages.push(new Message('', node.attributes.context && node.attributes.context.value));
			message++;
		} else {
			if (node.ns[node.prefix] === fest_ns) {
				xml = '<' + node.name;
				for (i in node.attributes){
					xml += ' ' + i + '="' + escapeHTML(node.attributes[i].value) + '"';
				}
			} else {
				xml = '<' + node.name;
				for (i in node.attributes){
					xml += ' ' + i + '="' + escapeHTML(attributes[i] ? parse_attribute(node.attributes[i].value) : node.attributes[i].value) + '"';
				}
			}
			append_xml(xml);
			opennode = true;
		}
	};

	parser.ontext = function(text){
		var xml;
		closetag();
		ontext(text, escapeHTML);
	};

	parser.oncdata = function(text){
		var xml;
		closetag();
		ontext(text, cdata);
	};

	parser.onclosetag = function(node){
		var xml;
		node = this.tag;
		stack.pop();
		closetag();
		if (node.ns[node.prefix] === fest_ns && (node.local === 'message' || node.local === 'msg')){
			message--;
			if (message !== 0){
				messages[messages.length - 2].id += messages.pop(); // missing context here
			} else {
				yield_message(messages.pop());
			}
		} else {
			append_xml('</' + node.name + '>');
		}
	};

	parser.write(template);

	closetag();

	parser.close();

	return result;
}
