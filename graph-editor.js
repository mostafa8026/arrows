window.onload = function()
{
    var graphModel;
    if ( !localStorage.getItem( "graph-diagram-markup" ) )
    {
        graphModel = gd.model();
        graphModel.createNode().x( 0 ).y( 0 );
        save( formatMarkup() );
    }
    if ( localStorage.getItem( "graph-diagram-style" ) )
    {
        d3.select( "link.graph-style" )
            .attr( "href", localStorage.getItem( "graph-diagram-style" ) );
    }
    graphModel = parseMarkup( localStorage.getItem( "graph-diagram-markup" ) );

    var svg = d3.select("#canvas")
        .append("svg:svg")
        .attr("class", "graphdiagram");

    var diagram = gd.diagram()
        .scaling(gd.scaling.centerOrScaleDiagramToFitSvg)
        .overlay(function(layoutModel, view) {
            var nodeOverlays = view.selectAll("circle.node.overlay")
                .data(layoutModel.nodes);

            nodeOverlays.exit().remove();

            nodeOverlays.enter().append("circle")
                .attr("class", "node overlay")
                .call( d3.behavior.drag().on( "drag", drag ).on( "dragend", dragEnd ) )
                .on( "dblclick", editNode );

            nodeOverlays
                .attr("r", function(node) {
                    return node.radius.outside();
                })
                .attr("stroke", "none")
                .attr("fill", "rgba(255, 255, 255, 0)")
                .attr("cx", function(node) {
                    return node.x;
                })
                .attr("cy", function(node) {
                    return node.y;
                });

            var nodeRings = view.selectAll("circle.node.ring")
                .data(layoutModel.nodes);

            nodeRings.exit().remove();

            nodeRings.enter().append("circle")
                .attr("class", "node ring")
                .call( d3.behavior.drag().on( "drag", dragRing ).on( "dragend", dragEnd ) );

            nodeRings
                .attr("r", function(node) {
                    return node.radius.outside() + 5;
                })
                .attr("fill", "none")
                .attr("stroke", "rgba(255, 255, 255, 0)")
                .attr("stroke-width", "10px")
                .attr("cx", function(node) {
                    return node.x;
                })
                .attr("cy", function(node) {
                    return node.y;
                });

            var relationshipsOverlays = view.selectAll("path.relationship.overlay")
                .data(layoutModel.relationships);

            relationshipsOverlays.exit().remove();

            relationshipsOverlays.enter().append("path")
                .attr("class", "relationship overlay")
                .attr("fill", "rgba(255, 255, 255, 0)")
                .attr("stroke", "rgba(255, 255, 255, 0)")
                .attr("stroke-width", "10px")
                .on( "dblclick", editRelationship );

            relationshipsOverlays
                .attr("transform", function(r) {
                    var angle = r.start.model.angleTo(r.end.model);
                    return "translate(" + r.start.model.ex() + "," + r.start.model.ey() + ") rotate(" + angle + ")";
                } )
                .attr("d", function(d) { return d.arrow.outline; } );
        });

    function draw()
    {
        svg
            .data([graphModel])
            .call(diagram);
    }

    function save( markup )
    {
        localStorage.setItem( "graph-diagram-markup", markup );
        localStorage.setItem( "graph-diagram-style", d3.select( "link.graph-style" ).attr( "href" ) );
    }

    var newNode = null;
    var newRelationship = null;

    function findClosestOverlappingNode( node )
    {
        var closestNode = null;
        var closestDistance = Number.MAX_VALUE;

        var allNodes = graphModel.nodeList();

        for ( var i = 0; i < allNodes.length; i++ )
        {
            var candidateNode = allNodes[i];
            if ( candidateNode !== node )
            {
                var candidateDistance = node.distanceTo( candidateNode ) * graphModel.internalScale();
                if ( candidateDistance < 50 && candidateDistance < closestDistance )
                {
                    closestNode = candidateNode;
                    closestDistance = candidateDistance;
                }
            }
        }
        return closestNode;
    }

    function drag()
    {
        var node = this.__data__.model;
        node.drag(d3.event.dx, d3.event.dy);
        diagram.scaling(gd.scaling.growButDoNotShrink);
        draw();
    }

    function dragRing()
    {
        var node = this.__data__.model;
        if ( !newNode )
        {
            newNode = graphModel.createNode().x( d3.event.x ).y( d3.event.y );
            newRelationship = graphModel.createRelationship( node, newNode );
        }
        var connectionNode = findClosestOverlappingNode( newNode );
        if ( connectionNode )
        {
            newRelationship.end = connectionNode
        } else
        {
            newRelationship.end = newNode;
        }
        node = newNode;
        node.drag(d3.event.dx, d3.event.dy);
        diagram.scaling(gd.scaling.growButDoNotShrink);
        draw();
    }

    function dragEnd()
    {
        if ( newNode )
        {
            newNode.dragEnd();
            if ( newRelationship && newRelationship.end !== newNode )
            {
                graphModel.deleteNode( newNode );
            }
        }
        newNode = null;
        save( formatMarkup() );
        diagram.scaling(gd.scaling.centerOrScaleDiagramToFitSvgSmooth);
        draw();
    }

    d3.select( "#add_node_button" ).on( "click", function ()
    {
        graphModel.createNode().x( 0 ).y( 0 );
        save( formatMarkup() );
        draw();
    } );

    function onControlEnter(saveChange)
    {
        return function()
        {
            if ( d3.event.ctrlKey && d3.event.keyCode === 13 )
            {
                saveChange();
            }
        }
    }

    function editNode()
    {
        var editor = d3.select(".pop-up-editor.node");
        appendModalBackdrop();
        editor.classed( "hide", false );

        var node = this.__data__.model;

        var captionField = editor.select("#node_caption");
        captionField.node().value = node.caption() || "";
        captionField.node().select();

        var propertiesField = editor.select("#node_properties");
        propertiesField.node().value = node.properties().list().reduce(function(previous, property) {
            return previous + property.key + ": " + property.value + "\n";
        }, "");

        function saveChange()
        {
            node.caption( captionField.node().value );
            node.properties().clearAll();
            propertiesField.node().value.split("\n").forEach(function(line) {
                var tokens = line.split(/: */);
                if (tokens.length === 2) {
                    var key = tokens[0].trim();
                    var value = tokens[1].trim();
                    if (key.length > 0 && value.length > 0) {
                        node.properties().set(key, value);
                    }
                }
            });
            save( formatMarkup() );
            draw();
            cancelModal();
        }

        function deleteNode()
        {
            graphModel.deleteNode(node);
            save( formatMarkup() );
            draw();
            cancelModal();
        }

        captionField.on("keypress", onControlEnter(saveChange) );
        propertiesField.on("keypress", onControlEnter(saveChange) );

        editor.select("#edit_node_save").on("click", saveChange);
        editor.select("#edit_node_delete").on("click", deleteNode);
    }

    function editRelationship()
    {
        var editor = d3.select(".pop-up-editor.relationship");
        appendModalBackdrop();
        editor.classed( "hide", false );

        var relationship = this.__data__.model;

        var relationshipTypeField = editor.select("#relationship_type");
        relationshipTypeField.node().value = relationship.relationshipType() || "";
        relationshipTypeField.node().select();

        var propertiesField = editor.select("#relationship_properties");
        propertiesField.node().value = relationship.properties().list().reduce(function(previous, property) {
            return previous + property.key + ": " + property.value + "\n";
        }, "");

        function saveChange()
        {
            relationship.relationshipType( relationshipTypeField.node().value );
            relationship.properties().clearAll();
            propertiesField.node().value.split("\n").forEach(function(line) {
                var tokens = line.split(/: */);
                if (tokens.length === 2) {
                    var key = tokens[0].trim();
                    var value = tokens[1].trim();
                    if (key.length > 0 && value.length > 0) {
                        relationship.properties().set(key, value);
                    }
                }
            });
            save( formatMarkup() );
            draw();
            cancelModal();
        }

        function reverseRelationship()
        {
            relationship.reverse();
            save( formatMarkup() );
            draw();
            cancelModal();
        }

        function deleteRelationship()
        {
            graphModel.deleteRelationship(relationship);
            save( formatMarkup() );
            draw();
            cancelModal();
        }

        relationshipTypeField.on("keypress", onControlEnter(saveChange) );
        propertiesField.on("keypress", onControlEnter(saveChange) );

        editor.select("#edit_relationship_save").on("click", saveChange);
        editor.select("#edit_relationship_reverse").on("click", reverseRelationship);
        editor.select("#edit_relationship_delete").on("click", deleteRelationship);
    }

    function formatMarkup()
    {
        var container = d3.select( "body" ).append( "div" );
        gd.markup.format( graphModel, container );
        var markup = container.node().innerHTML;
        markup = markup
            .replace( /<li/g, "\n  <li" )
            .replace( /<span/g, "\n    <span" )
            .replace( /<\/span><\/li/g, "</span>\n  </li" )
            .replace( /<\/ul/, "\n</ul" );
        container.remove();
        return markup;
    }

    function cancelModal()
    {
        d3.selectAll( ".modal" ).classed( "hide", true );
        d3.selectAll( ".modal-backdrop" ).remove();
    }

    d3.selectAll( ".btn.cancel" ).on( "click", cancelModal );
    d3.selectAll( ".modal" ).on( "keyup", 
		function() { if ( d3.event.keyCode === 27 ) cancelModal(); }
	);

    function appendModalBackdrop()
    {
        d3.select( "body" ).append( "div" )
            .attr( "class", "modal-backdrop" )
            .on( "click", cancelModal );
    }

    var exportMarkup = function ()
    {
        appendModalBackdrop();
        d3.select( ".modal.export-markup" ).classed( "hide", false );

        var markup = formatMarkup();
        d3.select( "textarea.code" )
            .attr( "rows", Math.max(10,markup.split( "\n" ).length * 2) )
            .node().value = markup;
    };

    function parseMarkup( markup )
    {
        var container = d3.select( "body" ).append( "div" );
        container.node().innerHTML = markup;
        var model = gd.markup.parse( container.select("ul.graph-diagram-markup") );
        container.remove();
        return model;
    }

    var useMarkupFromMarkupEditor = function ()
    {
        var markup = d3.select( "textarea.code" ).node().value;
        graphModel = parseMarkup( markup );
        save( markup );
        draw();
        cancelModal();
    };

    var exportSvg = function ()
    {
        var rawSvg = new XMLSerializer().serializeToString(d3.select("#canvas svg" ).node());
        window.open( "data:image/svg+xml;base64," + btoa( rawSvg ) );
    };

    var openConsoleWithCypher = function (evt)
    {
        var cypher = d3.select(".export-cypher .modal-body textarea.code").node().value;
        cypher = cypher.replace(/\n  /g," ");
        var url="http://console.neo4j.org"+
            "?init=" + encodeURIComponent(cypher)+
            "&query=" + encodeURIComponent("start n=node(*) return n");
        d3.select( "#open_console" )
                    .attr( "href", url );
        return true;
    };

    var useCypherFromEditor = function ()
    {
        var cypher = d3.select( ".export-cypher .modal-body textarea.code" ).node().value;
        d3Model = gd.parseCypher( cypher );
        graphModel = modelFromD3( d3Model );
        save(formatMarkup());
        draw();
        cancelModal();
    };

	var modelFromD3 = function( data ) {
		function convert(value) {
            if (typeof(value) == "string" && value.length > 20) return value.substring(0,20)+" ...";
            return value;
		}
		var width = 500;
		var height = 500;
        var progress = 0;
        var selection = d3.select("#tmp ul.graph-diagram-markup");
        var model = gd.markup.parse(selection); // only to copy style attributes
		data.nodes.forEach(function(nodeData) {
			    var id = parseInt(nodeData["_id"]);
                var node = model.createNode(id);
                node.class("node");
                var angle = 0.6 * Math.PI * progress;
                node.x(nodeData["x"] || Math.cos(angle) * width * 0.3 * Math.round(1 + progress / 3) + width);
                node.y(nodeData["y"] || Math.sin(angle) * height * 0.3 * Math.round(1 + progress / 3) + height);
                progress += 1;
				node.caption(nodeData["_labels"].join(" "))
				Object.keys(nodeData).forEach(function(prop) {
					if (!["_id","class","x","y","_labels"].includes(prop)) {
                        var value = ;
                        if (typeof(value) == "string" && value.length > 20) value = value.substring(0,20)+" ...";
						node.properties().set(prop,convert(nodeData[prop]));
					}
				})
		})
		data.links.forEach(function(relData) {
                var rel = model.createRelationship(model.lookupNode(relData["source"]),model.lookupNode(relData["target"]));
                rel.class("relationship");
				rel.relationshipType(relData["_type"])
				Object.keys(relData).forEach(function(prop) {
					if (!["_id","class","x","y","_type","source","target"].includes(prop)) {
						rel.properties().set(prop,convert(relData[prop]));
					}
				})
		})
		return model;
	}

    d3.select( "#open_console" ).on( "click", openConsoleWithCypher );

    var exportCypher = function ()
    {
        appendModalBackdrop();
        d3.select( ".modal.export-cypher" ).classed( "hide", false );

        var statement = gd.formatCypher(graphModel);
        d3.select( ".export-cypher .modal-body textarea.code" )
            .attr( "rows", Math.max(10,statement.split( "\n" ).length) )
            .node().value = statement;
    };


    var chooseStyle = function()
    {
        appendModalBackdrop();
        d3.select( ".modal.choose-style" ).classed( "hide", false );
    };

    d3.select("#saveStyle" ).on("click", function() {
        var selectedStyle = d3.selectAll("input[name=styleChoice]" )[0]
            .filter(function(input) { return input.checked; })[0].value;
        d3.select("link.graph-style")
            .attr("href", "style/" + selectedStyle);

        graphModel = parseMarkup( localStorage.getItem( "graph-diagram-markup" ) );
        save(formatMarkup());
        draw();
        cancelModal();
    });

    function changeInternalScale() {
        graphModel.internalScale(d3.select("#internalScale").node().value);
        draw();
    }
    d3.select("#internalScale").node().value = graphModel.internalScale();

    d3.select(window).on("resize", draw);
    d3.select("#internalScale" ).on("change", changeInternalScale);
    d3.select( "#exportMarkupButton" ).on( "click", exportMarkup );
    d3.select( "#exportSvgButton" ).on( "click", exportSvg );
	d3.select( "#exportCypherButton" ).on( "click", exportCypher );
    d3.select( "#chooseStyleButton" ).on( "click", chooseStyle );
    d3.selectAll( ".modal-dialog" ).on( "click", function ()
    {
        d3.event.stopPropagation();
    } );

    d3.select( "#save_markup" ).on( "click", useMarkupFromMarkupEditor );
    d3.select( "#save_cypher" ).on( "click", useCypherFromEditor );

    draw();
};
