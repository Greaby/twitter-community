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
exports.key_generator = key_generator;
