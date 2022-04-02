require("dotenv").config();
const config = require("./config");

const seedrandom = require("seedrandom");
seedrandom(config.seed, { global: true });

let graph_data = null;
try {
    graph_data = require("./dist/index.json");
} catch (ex) {}

const Twitter = require("twitter");
const { Graph } = require("graphology");
const pagerank = require("graphology-metrics/centrality/pagerank");
const forceAtlas2 = require("graphology-layout-forceatlas2");
const random = require("graphology-layout/random");
const louvain = require("graphology-communities-louvain");

const { range } = require("./src/twitter-graph/interpolation");

const fs = require("fs");

const twitter_graph = new Graph();
if (graph_data) {
    twitter_graph.import(graph_data);
}

const now = Date.now();

const twitter_client = new Twitter({
    consumer_key: process.env.TWITTER_API_KEY,
    consumer_secret: process.env.TWITTER_API_SECRET_KEY,
    access_token_key: process.env.TWITTER_ACCESS_TOKEN,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

const generate = async () => {
    try {
        await get_main_account();

        const nodes = twitter_graph.nodes();

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const attributes = twitter_graph.getNodeAttributes(node);

            if (node != config.twitter_id) {
                await get_account_infos("friends", attributes.label, node);
            }
        }
    } catch (error) {
        console.log(error);
    }

    const graph_data = JSON.stringify(twitter_graph.export());

    fs.writeFile(`dist/index.json`, graph_data, function (err) {
        if (err) return console.log(err);
    });

    twitter_graph.forEachNode((node, _attributes) => {
        if (twitter_graph.degree(node) <= 1) {
            twitter_graph.dropNode(node);
        }
    });

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

    // Optimization of the JSON file size
    twitter_graph.forEachNode((node, _attributes) => {
        twitter_graph.removeNodeAttribute(node, "pagerank");
        twitter_graph.removeNodeAttribute(node, "up");
        twitter_graph.removeNodeAttribute(node, "followers_next_cursor");
        twitter_graph.removeNodeAttribute(node, "friends_next_cursor");

        twitter_graph.updateNodeAttribute(node, "x", (x) => Math.round(x));
        twitter_graph.updateNodeAttribute(node, "y", (y) => Math.round(y));
    });

    twitter_graph.forEachEdge(
        (
            edge,
            _attributes,
            _source,
            _target,
            sourceAttributes,
            _targetAttributes
        ) => {
            twitter_graph.removeEdgeAttribute(edge, "up");
        }
    );

    const incremental_id = () => {
        let key_map = {};

        let i = 0;

        return (key) => {
            if (key_map[key] === undefined) {
                key_map[key] = i++;
            }
            return key_map[key];
        };
    };

    const key_generator = incremental_id();

    let graph_minify = new Graph();

    twitter_graph.forEachNode((node, attributes) => {
        graph_minify.addNode(key_generator(node), attributes);
    });

    twitter_graph.forEachEdge(
        (
            edge,
            attributes,
            source,
            target,
            _sourceAttributes,
            _targetAttributes
        ) => {
            graph_minify.addEdgeWithKey(
                key_generator(edge),
                key_generator(source),
                key_generator(target),
                attributes
            );
        }
    );

    const graph_min_data = JSON.stringify(graph_minify.export());

    fs.writeFile(`dist/index.min.json`, graph_min_data, function (err) {
        if (err) return console.log(err);
    });
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

const get_main_account = async () => {
    // created account node
    if (!twitter_graph.hasNode(config.twitter_id)) {
        console.log(`add account: ${config.twitter_account}`);
        twitter_graph.addNode(config.twitter_id, {
            label: config.twitter_account,
        });
    }

    twitter_graph.setNodeAttribute(config.twitter_id, "up", true);

    let followers_next_cursor = -1;
    let friends_next_cursor = -1;
    if (
        twitter_graph.hasNodeAttribute(
            config.twitter_id,
            `followers_next_cursor`
        )
    ) {
        followers_next_cursor = twitter_graph.getNodeAttribute(
            config.twitter_id,
            `followers_next_cursor`
        );
    }

    if (
        twitter_graph.hasNodeAttribute(config.twitter_id, `friends_next_cursor`)
    ) {
        friends_next_cursor = twitter_graph.getNodeAttribute(
            config.twitter_id,
            `friends_next_cursor`
        );
    }

    if (followers_next_cursor === 0 && friends_next_cursor === 0) {
        followers_next_cursor = -1;
        friends_next_cursor = -1;

        twitter_graph.setNodeAttribute(
            config.twitter_id,
            `friends_next_cursor`,
            -1
        );

        twitter_graph.setNodeAttribute(
            config.twitter_id,
            `followers_next_cursor`,
            -1
        );

        // Cleanup people who no longer in the network
        twitter_graph.forEachNode((node, attributes) => {
            if (!attributes.up) {
                twitter_graph.dropNode(node);
            } else {
                twitter_graph.setNodeAttribute(node, "up", false);
            }
        });
    }

    console.log(`Fetch account: ${config.twitter_account}`);
    await twitter_client
        .get(`friends/list`, {
            screen_name: config.twitter_account,
            count: 200,
            cursor: friends_next_cursor,
        })
        .then((result) => {
            twitter_graph.setNodeAttribute(
                config.twitter_id,
                `friends_next_cursor`,
                result.next_cursor
            );

            result.users.map((user) => {
                if (!twitter_graph.hasNode(user.id)) {
                    console.log(`add account: ${user.screen_name}`);
                    twitter_graph.addNode(user.id, {
                        label: user.screen_name,
                    });
                }
                add_relation(config.twitter_id, user.id);
                twitter_graph.setNodeAttribute(user.id, "up", true);
            });
        });

    return twitter_client
        .get(`followers/list`, {
            screen_name: config.twitter_account,
            count: 200,
            cursor: followers_next_cursor,
        })
        .then((result) => {
            twitter_graph.setNodeAttribute(
                config.twitter_id,
                `followers_next_cursor`,
                result.next_cursor
            );

            result.users.map((user) => {
                if (!twitter_graph.hasNode(user.id)) {
                    console.log(`add account: ${user.screen_name}`);
                    twitter_graph.addNode(user.id, {
                        label: user.screen_name,
                    });
                }

                add_relation(user.id, config.twitter_id);
                twitter_graph.setNodeAttribute(user.id, "up", true);
            });
        });
};

const get_account_infos = async (
    type = "followers",
    screen_name,
    twitter_id,
    add_followers = false
) => {
    if (!twitter_graph.hasNode(twitter_id)) {
        console.log(`add account: ${screen_name}`);
        twitter_graph.addNode(twitter_id, {
            label: screen_name,
        });
    }

    let next_cursor = -1;
    if (twitter_graph.hasNodeAttribute(twitter_id, `${type}_next_cursor`)) {
        next_cursor = twitter_graph.getNodeAttribute(
            twitter_id,
            `${type}_next_cursor`
        );

        // ignore recently parsed account
        if (next_cursor === 0) {
            return;
        }
    }

    console.log(`Fetch account: ${screen_name}`);
    return twitter_client
        .get(`${type}/list`, {
            screen_name: screen_name,
            count: 200,
            cursor: next_cursor,
        })
        .then((result) => {
            twitter_graph.setNodeAttribute(
                twitter_id,
                `${type}_next_cursor`,
                result.next_cursor
            );
            twitter_graph.setNodeAttribute(twitter_id, "up", true);

            result.users.map((user) => {
                if (add_followers && !twitter_graph.hasNode(user.id)) {
                    console.log(`add account: ${user.screen_name}`);
                    twitter_graph.addNode(user.id, {
                        label: user.screen_name,
                    });
                }

                if (type == "followers") {
                    add_relation(user.id, twitter_id);
                } else {
                    add_relation(twitter_id, user.id);
                }
            });

            return result;
        })
        .catch((error) => {
            if (Array.isArray(error) && error[0].code === 88) {
                // rate limit
                throw error;
            } else {
                // other errors
                twitter_graph.setNodeAttribute(
                    twitter_id,
                    `${type}_next_cursor`,
                    0
                );
                console.log(error);
            }
        });
};

generate();
