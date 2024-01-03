/**
 * Combines keyValContainerAsMap and valContainerAsArray to
 * standardize getting entries from any container.
 * @param {gink.Container} container
 * @returns an Array of either [key, value] or values
 */
async function containerAsArray(container) {
    // This is a little confusing as containers like a Role
    // actually use "keys", but for the purpose of this function
    // they will just be called values.
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
    let msg;
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
            msg = `Expecting array of 2 string muids. Ex: [FFFFFFFFFFFFFF-6734543837984-00004,FFFFFFFFFFFFFF-6734543837984-00004]`;
            try {
                await container.include([gink.strToMuid(key[0]), gink.strToMuid(key[1])]);
            } catch {
                console.error(msg);
            }
            break;
        case 6: // PairMap
            msg = `Key is expecting array of 2 string muids. Ex: [FFFFFFFFFFFFFF-6734543837984-00004,FFFFFFFFFFFFFF-6734543837984-00004]`;
            try {
                await container.set([gink.strToMuid(key[0]), gink.strToMuid(key[1])], val);
            } catch {
                console.error(msg);
            }

        case 10: // Role
            try {
                await container.include(gink.strToMuid(key));
            } catch {
                console.error('Expecting muid as string. Ex:FFFFFFFFFFFFFF-6734543837984-00004');
            }
            break;
        default:
            throw new Error(`not sure how to add entry to ${container.constructor.name}`);
    }
}

/**
 * Standarizes deletion between containers.
 * @param {*} key key to be deleted
 * @param {number} position the position in the sequence to pop.
 * @param {*} container the Gink Container to perform the deletion.
 */
async function deleteContainerEntry(key, position, container) {
    gink.ensure(!(key && position), "Cannot provide both key and position");
    switch (container.behavior) {
        case 1: // Box
            await container.clear();
            break;
        case 2: // Sequence
            gink.ensure(typeof position == "number", "invalid position arg");
            await container.pop(position);
            break;
        case 3: // KeySet
            await container.delete(key);
            break;
        case 4: // Directory
            await container.delete(key);
            break;
        case 5: // PairSet
            msg = `Expecting array of 2 string muids. Ex: [FFFFFFFFFFFFFF-6734543837984-00004,FFFFFFFFFFFFFF-6734543837984-00004]`;
            try {
                await container.exclude([gink.strToMuid(key[0]), gink.strToMuid(key[1])]);
            } catch {
                console.error(msg);
            }
            break;
        case 6: // PairMap
            msg = `Key is expecting array of 2 string muids. Ex: [FFFFFFFFFFFFFF-6734543837984-00004,FFFFFFFFFFFFFF-6734543837984-00004]`;
            try {
                await container.delete([gink.strToMuid(key[0]), gink.strToMuid(key[1])], val);
            } catch {
                console.error(msg);
            }
        case 10: // Role
            try {
                await container.exclude(gink.strToMuid(key));
            } catch {
                console.error('Expecting muid as string. Ex:FFFFFFFFFFFFFF-6734543837984-00004');
            }
            break;
        default:
            throw new Error(`not sure how to delete entry from ${container.constructor.name}`);
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
