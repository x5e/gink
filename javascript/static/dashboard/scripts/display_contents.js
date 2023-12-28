/**
 * For a given container, display its contents.
 * Creates a clickable ContainerBox element if the entry is a 
 * container, or displays the data otherwise. 
 */
async function displayContents(container) {
    const allContainersDiv = document.getElementById('all-containers');
    const entries = await getEntries(container);

    createPathItem(container);
    clearChildren(allContainersDiv);

    if (entries.size == 0 || !entries) {
        const p = allContainersDiv.appendChild(document.createElement('p'));
        p.innerText = "No entries.";
    } else {
        const table = allContainersDiv.appendChild(document.createElement('table'));
        if (entries instanceof Map) {
            table.innerHTML = `
            <tr>
                <th>Key</th>
                <th>Value</th>
                <th>Blame</th>
            </tr>`;
            for (const [key, val] of entries) {
                const row = table.appendChild(document.createElement('tr'));
                const keyCell = row.appendChild(document.createElement('td'));
                const valCell = row.appendChild(document.createElement('td'));
                const blameCell = row.appendChild(document.createElement('td'));
                blameCell.innerText = "null";
                if (key instanceof Object) {
                    const containerBox = ContainerBox.createAndAppend(keyCell, key);
                    containerBox.onclick = async () => {
                        await displayContents(key);
                    };
                } else {
                    keyCell.innerText = key;
                }
                if (val instanceof Object) {
                    const containerBox = ContainerBox.createAndAppend(valCell, val);
                    containerBox.onclick = async () => {
                        await displayContents(val);
                    };
                } else {
                    valCell.innerText = val;
                }
            }
        } else {
            // entries is an Array or Set
            table.innerHTML = `
            <table>
                <th>Value</th>
                <th>Blame</th>
            </table>
            `;
            for (const element of entries) {
                const row = table.appendChild(document.createElement('tr'));
                const valCell = row.appendChild(document.createElement('td'));
                const blameCell = row.appendChild(document.createElement('td'));
                blameCell.innerText = 'null';
                if (element instanceof Object) {
                    const containerBox = ContainerBox.createAndAppend(valCell, element);
                    containerBox.onclick = async () => {
                        window.previousContainer = container;
                        await displayContents(element);
                    };
                } else {
                    valCell.innerText = element;
                }
            }
        }
    }
}

/**
 * Gets entries from the container via the primary entries method,
 * for example, asMap(), entries(), etc.
 * @param {Container} container 
 * @returns a Map, or some sort of iterable of container values. If there
 * isn't a method to get entries on a container, such as a Vertex, return undefined.
 */
async function getEntries(container) {
    // This function is a little confusing and will probably have to change
    if (Array.isArray(container)) {
        return container;
    }
    else if (!("behavior" in container) && container instanceof Object) {
        return Object.entries(container);
    }

    let entries;
    switch (container.behavior) {
        case 1: // Box
            entries = [await container.get()];
            break;
        case 2: // Sequence
            entries = await container.toArray();
            break;
        case 3: // KeySet
            entries = await container.toSet();
            break;
        case 4: // Directory
            entries = await container.toMap();
            break;
        case 5: // KeySet
            entries = await container.get_pairs();
            break;
        case 6: // PairMap
            entries = new Map();
            let items = await container.items();
            for (const [key, val] of items) {
                // Need Muids to be converted to containers to display their contents.
                entries.set([await gink.construct(window.instance, key[0]), await gink.construct(window.instance, key[1])], val);
            }
            break;
        case 7: // Vertex
            entries = undefined;
            break;
        case 8: // Verb
            entries = undefined;
            break;
        case 9: // Property
            entries = undefined;
            break;
        case 10: // Role
            entries = await container.includedAsArray();
            break;
        default:
            throw new Error(`not sure how to get entries for ${container.constructor.name}`);
    }
    return entries;
}

/**
 * Creates a "title" for container box, which is the shortened Container type,
 * and the last 4 digits of the timestamp. If the "container" is just a JS object,
 * just use its constructor's name.
 * @param {Container} container 
 * @returns a String in the form of Dir-0000, or just the name of the object.
 */
function createContainerText(container) {
    let returning;
    if ("behavior" in container) {
        const tsAsString = String(container.address.timestamp);
        let nameString = containerAbbrev(container);
        returning = `${nameString}-${tsAsString.substring(tsAsString.length - 4)}`;
    }
    else if (Array.isArray(container) && container.length == 2 && "behavior" in container[0]) {
        // This is a Pair in a PairMap or PairSet
        returning = containerAbbrev(container[0]) + "-" + containerAbbrev(container[1]);
    }
    else if (typeof container == "object") {
        returning = container.constructor.name;
    }
    else {
        throw new Error(`${container.constructor.name} is not a container.`);
    }
    return returning;
}

/**
 * Creates a shortened name for a Gink container for displaying in
 * a ContainerBox
 * @param {Container} container 
 * @returns a string with an abbreviation for the Gink container
 */
function containerAbbrev(container) {
    switch (container.behavior) {
        // Some special cases where 3 letters won't work.
        case 3:
            nameString = 'KS';
            break;
        case 5:
            nameString = 'PS';
            break;
        case 6:
            nameString = 'PM';
            break;
        case 7:
            nameString = 'Vert';
            break;
        case 8:
            nameString = 'Verb';
            break;
        default:
            nameString = container.constructor.name.substring(0, 3);
            break;
    }
    return nameString;
}