/**
 * Load and display all containers for a GinkInstance.
 */
async function loadAllContainers() {
    const pathContainer = document.getElementById('path-container');
    const pathItem = pathContainer.appendChild(document.createElement('path-item'));
    pathItem.innerText = "^";
    pathItem.onclick = async () => {
        while (pathContainer.lastChild) {
            pathContainer.removeChild(pathContainer.lastChild);
        }
        await loadAllContainers();
    };

    const allContainersDiv = document.getElementById('all-containers');
    clearChildren(allContainersDiv);
    const allContainers = [];
    allContainers.push(window.instance.getGlobalDirectory());

    const containerTuples = await window.store.getAllContainers();
    for (const tuple of containerTuples) {
        allContainers.push(await gink.construct(window.instance, gink.muidTupleToMuid(tuple)));
    }

    for (const container of allContainers) {
        createContainerBox(container);
    }
}

/**
 * Creates a ContainerBox custom element for a given container.
 * Adds an onclick callback to this element that displays its contents.
 * @param {Container} container a Gink Container
 */
function createContainerBox(container) {
    const allContainersDiv = document.getElementById('all-containers');
    const containerBox = allContainersDiv.appendChild(document.createElement('container-box'));
    const tsAsString = String(container.address.timestamp);
    containerBox.innerText = `${container.constructor.name.substring(0, 3)}-${tsAsString.substring(tsAsString.length - 4)}`;
    containerBox.onclick = async () => {
        await displayContents(container);
    };
}

/**
 * For a given container, display its contents.
 * Creates a clickable ContainerBox element if the entry is a 
 * container, or displays the data otherwise. 
 */
async function displayContents(container) {
    const pathContainer = document.getElementById('path-container');
    pathContainer.appendChild(document.createElement('div')).innerText = "/";
    const pathItem = pathContainer.appendChild(document.createElement('path-item'));
    const tsAsString = String(container.address.timestamp);
    // Setting this attribute to keep track of where we are, and
    // to not duplicate divs in the file path.
    pathItem.setAttribute('muid', gink.muidToString(container.address));
    pathItem.innerText = `${container.constructor.name.substring(0, 3)}-${tsAsString.substring(tsAsString.length - 4)}`;
    pathItem.onclick = async () => {
        while (pathContainer.lastChild.getAttribute('muid') != gink.muidToString(container.address)) {
            pathContainer.removeChild(pathContainer.lastChild);
        }
        // These children will be the container node itself, and the slash before it. 
        // Easiest to just remove it and add back with displayContents().
        // there is probably a better way to do this.
        pathContainer.removeChild(pathContainer.lastChild);
        pathContainer.removeChild(pathContainer.lastChild);
        await displayContents(container);
    };

    const allContainersDiv = document.getElementById('all-containers');
    const entries = await getEntries(container);

    clearChildren(allContainersDiv);

    if (entries.size == 0) {
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
                    const containerBox = keyCell.appendChild(document.createElement('container-box'));
                    containerBox.innerText = key.constructor.name;
                    containerBox.onclick = async () => {
                        await displayContents(key);
                    };
                } else {
                    keyCell.innerText = key;
                }
                if (val instanceof Object) {
                    const containerBox = valCell.appendChild(document.createElement('container-box'));
                    const tsAsString = String(val.address.timestamp);
                    containerBox.innerText = `${val.constructor.name.substring(0, 3)}-${tsAsString.substring(tsAsString.length - 4)}`;
                    containerBox.onclick = async () => {
                        await displayContents(val);
                    };
                } else {
                    valCell.innerText = key;
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
                    const containerBox = valCell.appendChild(document.createElement('container-box'));
                    containerBox.innerText = element.constructor.name;
                    containerBox.onclick = async () => {
                        window.previousContainer = container;
                        await displayContents(val);
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
 * @returns EITHER an Set/Array OR Map, depending on whether the
 * container's method.
 */
async function getEntries(container) {
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
            entries = await container.items();
            break;
        default:
            throw new Error(`not sure how to get entries for ${container.constructor.name}`);
    }

    return entries;
}

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