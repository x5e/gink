/**
 * Determines whether a container stores keys as any value, a muid, a muid pair,
 * or not at all. Same thing for values.
 *
 * Valid keyType options:
 * "none", "any", "pair", "muid"
 *
 * Valid valueType options:
 *  "none", "any"
 *
 * @param {gink.Container} container
 * @returns an Array of [keyType, valueType] strings
 */
function determineContainerStorage(container) {
    let keyType = 'none';
    let valueType = 'none';
    switch (container.behavior) {
        case 1: // Box
            valueType = "any";
            break;
        case 2: // Sequence
            valueType = "any";
            break;
        case 3: // KeySet
            keyType = "any";
            break;
        case 4: // Directory
            keyType = "any";
            valueType = "any";
            break;
        case 5: // PairSet
            keyType = "pair";
            break;
        case 6: // PairMap
            keyType = "pair";
            valueType = "any";
            break;
        case 9: // Property
            keyType = "muid";
            valueType = "any";
            break;
        case 10: // Role
            keyType = "muid";
            break;
        default:
            throw new Error(`Either invalid behavior or container is verb, or vertex, which don't have entries.`);
    }
    return [keyType, valueType];
}

/**
 * Interpret a key - determines whether the key needs to be converted
 * to a muid, a muid array, or remain as a string/number/object.
 * @param {*} key key to interpret
 * @param {Container} container gink Container as context
 */
function interpretKey(key, container) {
    const [keyType, valueType] = determineContainerStorage(container);
    let returning;
    if (keyType == "muid") {
        if (typeof key == "string") {
            // Ensure string key is a valid muid format
            gink.ensure(key.length == 34, "Key is not a valid muid.");
            returning = gink.strToMuid(key);
        }
        else if ("timestamp" in key) returning = key;
        else throw new Error("Muid key type got unexpected key");
    }
    else if (keyType == "pair") {
        gink.ensure(Array.isArray(key) && key.length == 2);
        if (typeof key[0] == "string" && typeof key[1] == "string") {
            // Ensure string keys are valid muid format
            gink.ensure(key[0].length == 34 && key[1].length == 34);
            returning = [gink.strToMuid(key[0]), gink.strToMuid(key[1])];
        }
        else if ("timestamp" in key[0] && "timestamp" in key[1]) returning = key;
        else throw new Error("Pair key type got unexpected key");

    }
    else if (keyType == "any") {
        returning = key;
    }
    else {
        throw new Error("This container doesn't use keys.");
    }
    return returning;
}

/**
 * "Unwraps" a key or value. This is used to convert
 * JavaScript objects to strings.
 * @param {*} element
 */
function unwrapToString(element) {
    let returning;
    if (typeof element == "string" || typeof element == "number") {
        returning = String(element);
    }
    else if (typeof element == "object" && !Array.isArray(element)) {
        const entries = element instanceof Map ? element.entries() : Object.entries(element);
        returning = '{';
        for (const [k, v] of entries) {
            returning += `"${k}": "${v}",\n`;
        }
        returning += '}';
    }
    else if (Array.isArray(element)) {
        returning = JSON.stringify(element);
    }
    else {
        throw new Error(`not sure how to unwrap ${element}`);
    }
    return returning;
}

/**
 * Shortens a string to its first 20 characters, followed by '...'
 * @param {String} string
 * @returns
 */
function shortenedString(string) {
    if (string.length <= 20) {
        return string;
    }
    else {
        return string.substring(0, 21) + "...";
    }
}
