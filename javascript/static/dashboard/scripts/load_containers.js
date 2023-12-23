/**
 * Load and display all containers for a GinkInstance.
 */
async function loadAllContainers() {
    window.previousContainer = undefined;
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
    containerBox.innerText = container.constructor.name;
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
                        window.previousContainer = container;
                        await displayContents(key);
                    };
                } else {
                    keyCell.innerText = key;
                }
                if (val instanceof Object) {
                    const containerBox = valCell.appendChild(document.createElement('container-box'));
                    containerBox.innerText = val.constructor.name;
                    containerBox.onclick = async () => {
                        window.previousContainer = container;
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
 * Go back one level. Returns to parent container for
 * a container entry within a container.
 */
async function displayPrevious() {
    if (window.previousContainer) {
        await displayContents(window.previousContainer);
    } else {
        await loadAllContainers();
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