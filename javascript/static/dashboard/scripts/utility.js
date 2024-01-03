/**
 * Utility function to clear the children of
 * an HTMLElement.
 * @param {HTMLElement} node
 */
function clearChildren(node) {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
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

/**
 * Converts a key, value container to a JavaScript Map.
 * Throws an error if the Gink container does not hold keys,
 * like a Sequence, for example.
 * @param {Container} container
 * @returns the container's key, value pairs as a Map.
 */
async function keyValContainerAsMap(container) {
    let map;
    if (container.behavior == 4) { // Directory
        map = await container.toMap();
    }
    else if (container.behavior == 6) { // PairMap
        map = await container.items();
    }
    else if ([1, 2, 3, 5, 10].includes(container.behavior)) {
        throw new Error(`${container.constructor.name} does not use keys. Use valContainerAsArray() instead.`);
    }
    else {
        throw new Error(`not sure how to get entries for ${container.constructor.name}`);
    }
    return map;
}

/**
 * Converts a value only container to a JavaScript Array.
 * Throws an error if the Gink container hold keys,
 * like a Directory, for example.
 * @param {Container} container
 * @returns the container's values as an Array.
 */
async function valContainerAsArray(container) {
    let arr;
    switch (container.behavior) {
        case 1: // Box
            arr = [await container.get()];
            break;
        case 2: // Sequence
            arr = await container.toArray();
            break;
        case 3: // KeySet
            arr = Array.from(await container.toSet());
            break;
        case 5: // PairSet
            arr = Array.from(await container.getPairs());
            break;
        case 10: // Role
            arr = await container.includedAsArray();
            break;
        case 4: // Directory
        case 6: // PairMap
            throw new Error(`${container.constructor.name} uses keys. Use keyValContainerAsMap() instead.`);
        default:
            throw new Error(`not sure how to get entries for ${container.constructor.name}`);
    }
    return arr;
}
