import Graph from "graphology";
import Sigma from "sigma";
import config from "../../config";

const loadSigma = async (json_file) => {
    const container = document.querySelector("#graph-container");
    const search_input = document.querySelector("input[type=search]");
    const search_suggestions = document.querySelector("#suggestions");

    const data = await fetch(json_file).then((response) => response.json());

    const graph = new Graph();
    graph.import(data);

    const settings = {
        labelRenderedSizeThreshold: 16,
        defaultEdgeColor: "#e2e8f0",
        defaultEdgeType: "arrow",
    };

    const renderer = new Sigma(graph, container, settings);

    let hovered_node = undefined;
    let hovered_neighbors = undefined;
    let selected_node = undefined;
    let suggestions = undefined;

    renderer.on("enterNode", ({ node }) => {
        hovered_node = node;
        hovered_neighbors = graph.neighbors(node);
        renderer.refresh();
    });
    renderer.on("leaveNode", () => {
        hovered_node = undefined;
        hovered_neighbors = undefined;
        renderer.refresh();
    });

    const set_search_query = (query) => {
        if (search_input.value !== query) {
            search_input.value = query;
        }

        if (query) {
            const lc_query = query.toLowerCase();
            const nodes = graph
                .nodes()
                .map((n) => ({
                    id: n,
                    label: graph.getNodeAttribute(n, "label"),
                }))
                .filter(({ label }) => label.toLowerCase().includes(lc_query));

            // If we have a single perfect match, them we remove the suggestions, and
            // we consider the user has selected a node through the datalist
            // autocomplete:
            if (nodes.length === 1 && nodes[0].label === query) {
                selected_node = nodes[0].id;
                suggestions = undefined;

                const node_position =
                    renderer.getNodeDisplayData(selected_node);
                renderer.getCamera().animate(node_position, {
                    duration: 500,
                });
            }
            // Else, we display the suggestions list:
            else {
                selected_node = undefined;
                suggestions = new Set(nodes.map(({ id }) => id));
            }
        } else {
            selected_node = undefined;
            suggestions = undefined;
        }

        // Refresh rendering:
        renderer.refresh();
    };

    search_input.addEventListener("input", (event) => {
        set_search_query(event.currentTarget.value || "");
    });
    search_input.addEventListener("blur", () => {
        set_search_query("");
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
        }
    );

    search_suggestions.innerHTML = graph
        .nodes()
        .sort(
            (a, b) =>
                graph.getNodeAttribute(a, "label") >
                graph.getNodeAttribute(b, "label")
        )
        .map(
            (node) =>
                `<option value="${graph.getNodeAttribute(
                    node,
                    "label"
                )}"></option>`
        )
        .join("");

    renderer.setSetting("nodeReducer", (node, attributes) => {
        if (
            hovered_neighbors &&
            !hovered_neighbors.includes(node) &&
            hovered_node !== node
        ) {
            attributes.label = "";
            attributes.color = "#f6f6f6";
        }

        if (selected_node === node) {
            attributes.highlighted = true;
        } else if (suggestions && !suggestions.has(node)) {
            attributes.label = "";
            attributes.color = "#f6f6f6";
        }

        return attributes;
    });

    renderer.setSetting("edgeReducer", (edge, attributes) => {
        if (hovered_node) {
            if (!graph.hasExtremity(edge, hovered_node)) {
                attributes.hidden = true;
            } else {
                attributes.size = 3;
            }
        }

        if (
            suggestions &&
            (!suggestions.has(graph.source(edge)) ||
                !suggestions.has(graph.target(edge)))
        ) {
            attributes.hidden = true;
        }

        return attributes;
    });
};

window.addEventListener("DOMContentLoaded", function () {
    loadSigma("./index.min.json");
});
