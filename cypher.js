function Cypher() {
 this.format = function(model) {
    function props(element) {
        var props = {};
        element.properties().list().forEach(function (property) {
            props[property.key] = property.value;
        });
        return props;
    }

    function isIdentifier(name) {
        return /^[_a-zA-Z]\w*$/.test(name);
    }

    function quote(name) {
	    if (name == undefined || name == null || name.trim() == "") return null;
        return isIdentifier(name) ? name : "`" + name + "`";
    }

    function render(props) {
        var res = "";
        for (var key in props) {
            if (res.length > 0) res += ",";
            if (props.hasOwnProperty(key)) {
                res += quote(key) + ":";
                var value = props[key];
                res += typeof value == "string" && value[0] != "'" && value[0] != '"' ? "'" + value + "'" : value;
            }
        }
        return res.length == 0 ? "" : "{" + res + "}";
    }

    var statements = [];
    model.nodeList().forEach(function (node) {
	    var labels = node.caption().split(/[:\s]+/).map(quote).filter(function(l) { return l !== undefined }).map(function(l) { return ":" + l;}).join("");
        statements.push("(" + quote(""+node.id) + labels + " " + render(props(node)) + ") ");
    });
    model.relationshipList().forEach(function (rel) {
        statements.push("(" + quote(rel.start.id) +
            ")-[:" + quote(rel.relationshipType()||"RELATED_TO") +
            " " + render(props(rel)) +
            "]->("+ quote(rel.end.id) +")"
        );
    });
    if (statements.length==0) return "";
    return "CREATE \n  " + statements.join(",\n  ");
}
this.parse =  function(cypher, opts) {
	    if (typeof(cypher) != "string") {
			console.log("Cannot parse",cypher)
			return {nodes:[],links:[]}
		}
		var time = Date.now();
		var keep_names = opts && opts.keep_names;
		var nodes = {}
		var rels = []
		var PARENS = /(\s*\),?\s*|\s*\(\s*)/;
		function toArray(map) {
			var res = [];
			for (var k in map) {
				if (map.hasOwnProperty(k)) {
					res.push(map[k]);
				}
			}
			return res;
		}
		function splitClean(str, pattern, clean) {
            if (clean) { str = str.replace(clean,""); }
			var r = str.split(pattern)
			.map(function(s) { return s.trim(); })
			.filter(function(s) { return s.trim().length > 0 && !s.match(pattern); });
			return r;
		}
		function keyIndex(key,map) {
			var count=0;
			for (k in map) {
				if (key == k) return count;
				count+=1;
			}
			return -1;
		}
		cypher = cypher.replace(/CREATE/ig,"");
		var parts = splitClean(cypher,PARENS);
		var id=0;
		var lastNode, lastRel;
		var NODE_PATTERN=/^\s*(`[^`]+`|\w+)\s*((?::\w+|:`[^`]+`)*)\s*(\{.+\})?\s*$/;
		var REL_PATTERN=/^(<)?\s*-\s*(?:\[(`[^`]+`|\w+)?\s*(:(?:`[^`]+`|[\w]+))?\s*(\{.+\})?\])?\s*-\s*(>)?$/;
		var PROP_PATTERN=/^\s*`?(\w+)`?\s*:\s*(".+?"|'.+?'|\[.+?\]|.+?)\s*(,\s*|$)/;
		var ARRAY_VALUES_PATTERN=/^\s*(".+?"|'.+?'|.+?)\s*(,\s*|$)/;
		parts.forEach(function(p,i) {
			function parseProps(node,props) {
				function escapeQuotes(value) {
					value = value.trim().replace(/(^|\W)'([^']*?)'(\W|$)/g,'$1"$2"$3');
					if (value[0]=='"') value = '"'+value.substring(1,value.length-1).replace(/"/g,'\\"') + '"';
					return value;
				}
				function parseArray(value) {
					value = value.substring(1,value.length-1); // eliminate []
					var res="";
					while (_val = value.match(ARRAY_VALUES_PATTERN)) {
						value = value.substring(_val[0].length); // next part
						var element = escapeQuotes(_val[1]);
						if (res!="") res += ",";
						res += element;
					}
					return "[" + res + "]";
				}
				function isArray(value) { return value[0] == "["; }
				var prop = null;
				props = props.substring(1,props.length-1); // eliminate {}
				while (prop = props.match(PROP_PATTERN)) {
					props = props.substring(prop[0].length); // next part
					var pname = prop[1];
					var value = prop[2]; 
					value = isArray(value) ? parseArray(value) : escapeQuotes(value);
					node[pname]=JSON.parse(value);
				}
				return node;
			}
			function parseInner(m) {
				var name=m[1] ? m[1].replace(/`/g,"") : m[1];
				var labels=[];

				var props=""; // TODO ugly
				if (m.length > 1) {
					if (m[2] && m[2][0]==":") labels = splitClean(m[2],/:/,/`/g); /*//*/
					else props=m[2] || "";
					if (m.length>2 && m[3] && m[3][0]=="{") props=m[3];
				}

				return parseProps( {_id:id,_name:name,_labels:labels}, props);
			}
			var m = null; 
			if (m = p.match(NODE_PATTERN)) {
				var node = parseInner(m);
				var name=node["_name"];
				if (!keep_names) delete(node["_name"]);
				if (!nodes[name]) {
					nodes[name]=node;
					id += 1;
				}
				lastNode=name;
				if (lastRel) {
					if (lastRel.source===null) lastRel.source=keyIndex(name,nodes);
					if (lastRel.target===null) lastRel.target=keyIndex(name,nodes);
				}
			} else {
				if (m = p.match(REL_PATTERN)){
					var incoming = m[1]=="<" && m[5]!=">";
					m.splice(5,1); m.splice(1,1);
					var rel=parseInner(m);
					rel["_type"]=rel["_labels"][0];
					if (!keep_names) delete(rel["_name"]);
					delete(rel["_id"]);delete(rel["_labels"]);
					rel["source"]= incoming ? null : keyIndex(lastNode,nodes);
					rel["target"]= incoming ? keyIndex(lastNode,nodes) : null;
					lastRel=rel;
					rels.push(rel);
				}
			}
		})
		if (opts && opts.measure) console.log("time",Date.now()-time);
		return {nodes: toArray(nodes), links: rels};
	}
}

if (typeof exports != "undefined") {
	exports.cypher=Cypher
}

gd.formatCypher=function(model) {return new Cypher().format(model || this.model());}
gd.parseCypher=function(model) {return new Cypher().parse(model || this.model());}
