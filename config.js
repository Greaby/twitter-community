module.exports = {
    seed: "twitter-graph",

    accounts: [
        {
            username: "greaby_",
            id:151869891
        }
    ],

    twitter_account: "greaby_",
    twitter_id: 151869891,

    folders: {
        dist: "dist",
    },

    graph: {
        node_min_size: 3,
        node_max_size: 15,
    },

    expire: 2592000000, // in milliseconds

    colors: [
        "#0887A3",
        "#F29F05",
        "#A61F38",
        "#94A66D",
        "#8F8EBF",
        "#002333",
        "#8C4A0F",
        "#A563A6",
    ],
    edge_colors: [
        "#bfe8f2",
        "#f7ebd4",
        "#f7dee3",
        "#e2e8d5",
        "#d3d3e8",
        "#1d6e93",
        "#e59854",
        "#d7a6d8",
    ],
};
