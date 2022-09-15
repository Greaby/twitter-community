require("dotenv").config();
const config = require("./config");

const seedrandom = require("seedrandom");
seedrandom(config.seed, { global: true });

let graph_data = null;
try {
    graph_data = require("./dist/data/main.json");
} catch (ex) {}

let dates = [];
try {
    dates = require("./dist/data/dates.json");
} catch (ex) {}

const { TwitterApi } = require("twitter-api-v2");
const { Graph } = require("graphology");
const pagerank = require("graphology-metrics/centrality/pagerank");
const forceAtlas2 = require("graphology-layout-forceatlas2");
const random = require("graphology-layout/random");
const louvain = require("graphology-communities-louvain");

const { range } = require("./src/twitter-graph/interpolation");
const { key_generator } = require("./src/twitter-graph/key_generator");

const fs = require("fs");

const twitter_graph = new Graph();
if (graph_data) {
    twitter_graph.import(graph_data);
}

const date = new Date().toISOString().split("T")[0];
if (!dates.includes(date)) {
    dates.push(date);
}
fs.writeFile(`dist/data/dates.json`, JSON.stringify(dates), function (err) {
    if (err) return console.log(err);
});

const consumer_client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET_KEY,
});

const generate = async () => {
    const twitter_client = await consumer_client.appLogin();

    await fetch_accounts(twitter_client);

    if (has_fetch_loop_ended()) {
        cleanup_edges();
        remove_isolated_nodes(0);
        reset_fetch_loop();
    }

    export_graph(twitter_graph, "main.json");

    remove_isolated_nodes();

    calculate_metrics();

    const graph_minify = minify_graph(twitter_graph);
    export_graph(graph_minify, `${date}.json`);

    // try {

    //     const twitter_client = await consumer_client.appLogin();

    //     await get_main_account(twitter_client);

    //     for (let index = 0; index < 15; index++) {
    //         const nodes = twitter_graph.nodes();
    //         for (let i = 0; i < nodes.length; i++) {
    //             const node = nodes[i];
    //             const attributes = twitter_graph.getNodeAttributes(node);

    //             if (node != config.twitter_id) {
    //                 await get_account_infos(twitter_client, attributes.label, node);
    //             }
    //         }
    //     }
    // } catch (error) {
    //     console.log(error);
    //     console.log(error.data);
    // }

    // if (has_fetch_loop_ended()) {
    //     cleanup_edges();
    //     reset_fetch_loop();
    // }

    // export_graph(twitter_graph, "main.json");

    // remove_isolated_nodes();
    // calculate_metrics();

    // const graph_minify = minify_graph(twitter_graph);
    // export_graph(graph_minify, `${date}.json`);
};

const remove_isolated_nodes = (treshold = 1) => {
    twitter_graph.forEachNode((node, attributes) => {
        if (twitter_graph.degree(node) <= treshold) {
            console.log(`remove isolated account ${attributes.label}`);
            twitter_graph.dropNode(node);
        }
    });
};

const calculate_metrics = () => {
    try {
        pagerank.assign(twitter_graph, { alpha: 0.2 });
        random.assign(twitter_graph);
        louvain.assign(twitter_graph, { nodeCommunityAttribute: "c" });

        calculate_nodes_size();

        forceAtlas2.assign(twitter_graph, {
            iterations: 2000,
            settings: {
                gravity: 0.8,
            },
        });
    } catch (error) {}
};

const calculate_nodes_size = () => {
    const ranks = twitter_graph
        .mapNodes((node, attributes) => {
            return node == config.twitter_id ? null : attributes.pagerank;
        })
        .filter((x) => x);

    const min_rank = Math.min(...ranks);
    const max_rank = Math.max(...ranks);

    // set node size
    twitter_graph.forEachNode((node, attributes) => {
        twitter_graph.setNodeAttribute(
            node,
            "size",
            Math.round(
                range(
                    min_rank,
                    max_rank,
                    config.graph.node_min_size,
                    config.graph.node_max_size,
                    attributes.pagerank
                )
            )
        );
    });

    twitter_graph.setNodeAttribute(
        config.twitter_id,
        "size",
        Math.round(config.graph.node_max_size)
    );
};

const add_relation = (from_id, to_id) => {
    if (twitter_graph.hasNode(from_id) && twitter_graph.hasNode(to_id)) {
        const from_label = twitter_graph.getNodeAttribute(from_id, "label");
        const to_label = twitter_graph.getNodeAttribute(to_id, "label");

        if (!twitter_graph.hasEdge(from_id, to_id)) {
            console.log(`Add relation: ${from_label} -> ${to_label}`);

            twitter_graph.addEdge(from_id, to_id);
        }
        twitter_graph.setEdgeAttribute(from_id, to_id, "up", true);
    }
};

const has_fetch_loop_ended = () => {
    return twitter_graph.reduceNodes((accumulator, _node, attributes) => {
        return accumulator && attributes.following_pagination_token === 0;
    }, true);
};

const cleanup_edges = () => {
    twitter_graph.forEachEdge(
        (
            edge,
            attributes,
            _source,
            _target,
            sourceAttributes,
            targetAttributes
        ) => {
            if (!attributes.up) {
                console.log(
                    `Remove relation: ${sourceAttributes.label} -> ${targetAttributes.label}`
                );
                twitter_graph.dropEdge(edge);
            } else {
                twitter_graph.setEdgeAttribute(edge, "up", false);
            }
        }
    );
};

const reset_fetch_loop = () => {
    console.log("Reset loop");
    twitter_graph.forEachNode((node) => {
        if (
            twitter_graph.hasNodeAttribute(node, "following_pagination_token")
        ) {
            twitter_graph.setNodeAttribute(
                node,
                "following_pagination_token",
                -1
            );
        }

        if (
            twitter_graph.hasNodeAttribute(node, "followers_pagination_token")
        ) {
            twitter_graph.setNodeAttribute(
                node,
                "followers_pagination_token",
                -1
            );
        }
    });
};

const minify_graph = (graph) => {
    console.log("Minify graph");
    let graph_minify = new Graph();

    const attributes = graph.getAttributes();

    graph.forEachNode((node, attributes) => {
        graph_minify.addNode(key_generator(node), {
            label: attributes.label,
            size: Math.round(attributes.size),
            x: Math.round(attributes.x),
            y: Math.round(attributes.y),
            c: attributes.c,
        });
    });

    graph.forEachEdge(
        (
            edge,
            _attributes,
            source,
            target,
            _sourceAttributes,
            _targetAttributes
        ) => {
            graph_minify.addEdgeWithKey(
                key_generator(edge),
                key_generator(source),
                key_generator(target)
            );
        }
    );

    return graph_minify;
};

const export_graph = (graph, filename) => {
    console.log(`Export graph ${filename}`);
    const json_data = JSON.stringify(graph.export());
    fs.writeFile(`dist/data/${filename}`, json_data, function (err) {
        if (err) return console.log(err);
    });
};

const fetch_accounts = async (twitter_client) => {
    try {
        for await (const account of config.accounts) {
            await fetch_account(
                twitter_client,
                "followers",
                account.username,
                account.id,
                true
            );
            await fetch_account(
                twitter_client,
                "following",
                account.username,
                account.id,
                true
            );
        }

        for await (const { node, attributes } of twitter_graph.nodeEntries()) {
            await fetch_account(
                twitter_client,
                "following",
                attributes.label,
                node
            );
        }

        return twitter_graph;
    } catch (error) {
        console.log(error);
    }
};

const fetch_account = async (
    twitter_client,
    type,
    username,
    twitter_id,
    add_followers = false
) => {
    try {
        const fetch_functions = {
            followers: (twitter_client, twitter_id, params) =>
                twitter_client.v2.followers(twitter_id, params),
            following: (twitter_client, twitter_id, params) =>
                twitter_client.v2.following(twitter_id, params),
        };

        if (!twitter_graph.hasNode(twitter_id)) {
            console.log(`add account: ${username}`);
            twitter_graph.addNode(twitter_id, {
                label: username,
            });
        }

        let pagination_token = -1;
        if (
            twitter_graph.hasNodeAttribute(
                twitter_id,
                `${type}_pagination_token`
            )
        ) {
            pagination_token = twitter_graph.getNodeAttribute(
                twitter_id,
                `${type}_pagination_token`
            );

            // ignore recently parsed account
            if (pagination_token === 0) {
                return;
            }
        }

        console.log(`Fetch account: ${username}`);

        let params = {
            max_results: 1000,
        };

        if (pagination_token > 0) {
            params.pagination_token = pagination_token;
        }

        return fetch_functions[type](twitter_client, twitter_id, params).then(
            (result) => {
                if (result.errors) {
                    twitter_graph.setNodeAttribute(
                        twitter_id,
                        `${type}_pagination_token`,
                        0
                    );
                    return;
                }

                twitter_graph.setNodeAttribute(
                    twitter_id,
                    `${type}_pagination_token`,
                    result.meta.pagination_token
                        ? result.meta.pagination_token
                        : 0
                );
                twitter_graph.setNodeAttribute(twitter_id, "up", true);

                result.data.map((user) => {
                    if (add_followers && !twitter_graph.hasNode(user.id)) {
                        console.log(`add account: ${user.username}`);
                        twitter_graph.addNode(user.id, {
                            label: user.username,
                        });
                    }

                    if (type === "followers") {
                        add_relation(user.id, twitter_id);
                    } else {
                        add_relation(twitter_id, user.id);
                    }
                });
            }
        );
    } catch (error) {
        if (error && error.code === 429) {
            // rate limit
            throw error;
        } else {
            // other errors
            twitter_graph.setNodeAttribute(
                twitter_id,
                `${type}_pagination_token`,
                0
            );
            console.log(error);
        }
    }
};

generate();
