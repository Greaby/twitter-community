import Graph from "graphology";
import Sigma from "sigma";
//import Fuse from "fuse.js";
import config from "../../config";

let colors = {};
const get_color = (category) => {
    if (colors[category]) {
        return colors[category];
    }

    let hash = 0;
    for (let i = 0; i < category.length; i++) {
        hash = category.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = "#";
    for (let i = 0; i < 3; i++) {
        let value = (hash >> (i * 8)) & 0xff;
        color += ("00" + value.toString(16)).substr(-2);
    }

    colors[category] = color;
    return color;
};

const loadSigma = async (json_file) => {
    const container = document.querySelector("#graph-container");
    const current_node = container.dataset.node;

    const data = await fetch(json_file).then((response) => response.json());

    const graph = new Graph();
    graph.import(data);

    // graph.forEachNode((node, attributes) => {
    //     if (node === current_node) {
    //         graph.setNodeAttribute(node, "color", config.current_node.color);
    //         graph.setNodeAttribute(node, "size", config.graph.node_max_size);
    //         return;
    //     }

    //     if (attributes.cat === "ressource") {
    //         graph.setNodeAttribute(node, "color", config.ressource.color);
    //         return;
    //     }

    //     let metadata_config = config.metadata[attributes.cat];
    //     if (metadata_config && metadata_config.color) {
    //         graph.setNodeAttribute(node, "color", metadata_config.color);
    //         return;
    //     }

    //     graph.setNodeAttribute(node, "color", get_color(attributes.cat));
    // });

    const settings = {
        labelRenderedSizeThreshold: 16,
        defaultEdgeColor: "#e2e8f0",
    };

    const renderer = new Sigma(graph, container, settings);

    let hoveredNode = undefined;
    let hoveredNeighbors = undefined;
    const setHoveredNode = (node) => {
        if (node) {
            hoveredNode = node;
            hoveredNeighbors = graph.neighbors(node);
        } else {
            hoveredNode = undefined;
            hoveredNeighbors = undefined;
        }

        // Refresh rendering:
        renderer.refresh();
    };

    renderer.on("enterNode", ({ node }) => {
        setHoveredNode(node);
    });
    renderer.on("leaveNode", () => {
        setHoveredNode(undefined);
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

    // Render edges accordingly to the internal state:
    // 1. If a node is hovered, the edge is hidden if it is not connected to the
    //    node
    // 2. If there is a query, the edge is only visible if it connects two
    //    suggestions
    renderer.setSetting("edgeReducer", (edge, attributes) => {
        if (hoveredNode && !graph.hasExtremity(edge, hoveredNode)) {
            attributes.hidden = true;
        }

        return attributes;
    });
};

// const loadSearch = async () => {
//     const data = await fetch("./search.json").then((response) =>
//         response.json()
//     );

//     const fuse = new Fuse(data, {
//         keys: ["title"],
//         threshold: 0.3,
//         minMatchCharLength: 2,
//     });

//     const input_search = document.querySelector("input[type=search]");
//     const search_results = document.querySelector(".search-results");

//     if (input_search) {
//         let search_delay = null;
//         input_search.addEventListener("keyup", (event) => {
//             if (search_delay) {
//                 clearTimeout(search_delay);
//             }
//             const query = event.currentTarget.value;

//             if (query.length > 2) {
//                 search_delay = setTimeout(() => {
//                     search_results.classList.add("active");

//                     const results = fuse.search(query).slice(0, 8);

//                     search_results.innerHTML = null;

//                     for (let index = 0; index < results.length; index++) {
//                         const result = results[index];

//                         var node = document.createElement("li");
//                         var link = document.createElement("a");
//                         link.innerHTML = result.item.title;
//                         link.setAttribute("href", result.item.url);
//                         node.appendChild(link);

//                         search_results.appendChild(node);
//                     }
//                 }, 300);
//             } else {
//                 search_results.classList.remove("active");
//             }
//         });

//         document.body.addEventListener("click", (_event) => {
//             search_results.classList.remove("active");
//         });

//         search_results.addEventListener("click", (event) => {
//             event.stopPropagation();
//         });
//     }
// };

window.addEventListener("DOMContentLoaded", function () {
    loadSigma("./index.min.json");
    //loadSearch();
});
