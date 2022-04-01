import Graph from "graphology";
import Sigma from "sigma";
import config from "../../config";

const loadSigma = async (json_file) => {
    const container = document.querySelector("#graph-container");

    const data = await fetch(json_file).then((response) => response.json());

    const graph = new Graph();
    graph.import(data);

    const settings = {
        labelRenderedSizeThreshold: 16,
        defaultEdgeColor: "#e2e8f0",
    };

    const renderer = new Sigma(graph, container, settings);

    let hoveredNode = undefined;
    let hoveredNeighbors = undefined;
    renderer.on("enterNode", ({ node }) => {
        hoveredNode = node;
        hoveredNeighbors = graph.neighbors(node);
        renderer.refresh();
    });
    renderer.on("leaveNode", () => {
        hoveredNode = undefined;
        hoveredNeighbors = undefined;
        renderer.refresh();
    });

    graph.forEachNode((node, attributes) => {
        graph.setNodeAttribute(
            node,
            "color",
            config.colors[attributes.c % config.colors.length]
        );
    });

    graph.forEachEdge(
        (
            edge,
            _attributes,
            _source,
            _target,
            sourceAttributes,
            _targetAttributes
        ) => {
            graph.setEdgeAttribute(
                edge,
                "color",
                config.edge_colors[
                    sourceAttributes.c % config.edge_colors.length
                ]
            );

            graph.setEdgeAttribute(edge, "type", "arrow");
        }
    );

    renderer.setSetting("nodeReducer", (node, attributes) => {
        if (
            hoveredNeighbors &&
            !hoveredNeighbors.includes(node) &&
            hoveredNode !== node
        ) {
            attributes.label = "";
            attributes.color = "#f6f6f6";
        }

        return attributes;
    });

    renderer.setSetting("edgeReducer", (edge, attributes) => {
        if (hoveredNode) {
            if (!graph.hasExtremity(edge, hoveredNode)) {
                attributes.hidden = true;
            } else {
                attributes.size = 3;
            }
        }

        return attributes;
    });
};

window.addEventListener("DOMContentLoaded", function () {
    loadSigma("./index.min.json");
});
