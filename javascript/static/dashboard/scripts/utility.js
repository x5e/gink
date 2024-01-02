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
 * Combines keyValContainerAsMap and valContainerAsArray to
 * standardize getting entries from any container.
 * @param {gink.Container} container
 * @returns an Array of either [key, value] or values
 */
async function containerAsArray(container) {
    let entries;
    if ([4, 6].includes(container.behavior)) {
        // Container has key and value (Directory or PairMap)
        const asMap = await keyValContainerAsMap(container);
        entries = Array.from(asMap.entries());
    }
    else {
        // Container uses value entries only
        entries = await valContainerAsArray(container);
    }
    return entries;
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


/**
 * Standardizes adding entries to gink containers.
 * @param {*} key optional key if adding to a key, value container.
 * @param {*} val optional value to add to database.
 */
async function addContainerEntry(key, val, container) {
    gink.ensure(key || val, 'Need to specify key or value');
    gink.ensure(container, 'Need to specify container.');
    if (key) gink.ensure(hasKeysOrValues(container)[0] == true, 'container doesnt use keys');
    if (val) gink.ensure(hasKeysOrValues(container)[1] == true, 'container doesnt use values');
    switch (container.behavior) {
        case 1: // Box
            await container.set(val);
            break;
        case 2: // Sequence
            await container.push(val);
            break;
        case 3: // KeySet
            await container.add(key);
            break;
        case 4: // Directory
            await container.set(key, val);
            break;
        case 5: // PairSet
            gink.ensure(Array.isArray(key) && key.length == 2);
            gink.ensure(key[0] instanceof gink.Container || "timestamp" in key[0]);
            gink.ensure(key[1] instanceof gink.Container || "timestamp" in key[1]);
            await container.include(key);
            break;
        case 6: // PairMap
            gink.ensure(Array.isArray(key) && key.length == 2);
            gink.ensure(key[0] instanceof gink.Container || "timestamp" in key[0]);
            gink.ensure(key[1] instanceof gink.Container || "timestamp" in key[1]);
            await container.set(key, val);
        case 10: // Role
            gink.ensure(key instanceof gink.Container || "timestamp" in key);
            await container.include(key);
            break;
        default:
            throw new Error(`not sure how to add entry to ${container.constructor.name}`);
    }
}

/**
 * Determines whether a container uses keys, values, or both.
 * @param {gink.Container} container
 */
function hasKeysOrValues(container) {
    let hasKeys = false;
    let hasValues = false;
    switch (container.behavior) {
        case 1: // Box
            hasValues = true;
            break;
        case 2: // Sequence
            hasValues = true;
            break;
        case 3: // KeySet
            hasKeys = true;
            break;
        case 4: // Directory
            hasKeys = true;
            hasValues = true;
            break;
        case 5: // PairSet
            hasKeys = true;
            break;
        case 6: // PairMap
            hasKeys = true;
            hasValues = true;
            break;
        case 10: // Role
            hasKeys = true;
            break;
        default:
            throw new Error(`Either invalid behavior or container is verb, or vertex, which don't have entries.`);
    }
    return [hasKeys, hasValues];
}
