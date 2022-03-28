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
const pagerank = require("graphology-pagerank");
const forceAtlas2 = require("graphology-layout-forceatlas2");
const random = require("graphology-layout/random");

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
        await get_account_infos(
            "followers",
            config.twitter_account,
            config.twitter_id,
            true
        );

        const nodes = twitter_graph.nodes();

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const attributes = twitter_graph.getNodeAttributes(node);
            await get_account_infos("friends", attributes.label, node);
        }
    } catch (error) {
        console.log(error);
    }

    pagerank.assign(twitter_graph);
    random.assign(twitter_graph);

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
        twitter_graph.updateNodeAttribute(node, "x", (x) => Math.round(x));
        twitter_graph.updateNodeAttribute(node, "y", (y) => Math.round(y));
    });

    const data = JSON.stringify(twitter_graph.export());

    fs.writeFile(`dist/index.json`, data, function (err) {
        if (err) return console.log(err);
    });
};

const calculate_nodes_size = () => {
    const ranks = twitter_graph
        .mapNodes((_node, attributes) => {
            return attributes.pagerank;
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
};

const add_relation = (from_id, to_id) => {
    if (twitter_graph.hasNode(from_id) && twitter_graph.hasNode(to_id)) {
        const from_label = twitter_graph.getNodeAttribute(from_id, "label");
        const to_label = twitter_graph.getNodeAttribute(to_id, "label");

        if (!twitter_graph.hasEdge(from_id, to_id)) {
            console.log(`Add relation: ${from_label} -> ${to_label}`);

            twitter_graph.addEdge(from_id, to_id);
        }
    }
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

        const updated_date = new Date(
            twitter_graph.getNodeAttribute(twitter_id, "updated_at")
        );

        // ignore recently parsed account
        if (next_cursor === 0 && now - updated_date < config.expire) {
            return;
        }

        if (next_cursor === 0) {
            next_cursor = -1;
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
            twitter_graph.updateNodeAttribute(
                twitter_id,
                `${type}_next_cursor`,
                (_value) => result.next_cursor
            );
            twitter_graph.updateNodeAttribute(
                twitter_id,
                "updated_at",
                (_value) => now
            );

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
                throw error;
            } else {
                console.log(error);
            }
        });
};

generate();
