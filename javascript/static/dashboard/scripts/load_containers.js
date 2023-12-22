/**
 * Load and display all containers for a GinkInstance.
 */
async function loadAllContainers() {
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
        displayContents(container);
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
        // For now, only working for directories
        if (!Array.isArray(entries) || entries instanceof Set) {
            for (const [key, val] of entries) {
                const keyValPair = allContainersDiv.appendChild(document.createElement('div'));
                keyValPair.setAttribute('class', 'key-val-container');
                if (key instanceof Object) {
                    const containerBox = keyValPair.appendChild(document.createElement('container-box'));
                    containerBox.innerText = container.constructor.name;
                    containerBox.onclick = async () => {
                        displayContents(key);
                    };
                } else {
                    const entryBox = keyValPair.appendChild(document.createElement('entry-box'));
                    entryBox.innerText = key;
                }
                const arrow = keyValPair.appendChild(document.createElement('p'));
                arrow.innerText = "->";
                if (val instanceof Object) {
                    const containerBox = keyValPair.appendChild(document.createElement('container-box'));
                    containerBox.innerText = val.constructor.name;
                    containerBox.onclick = async () => {
                        displayContents(val);
                    };
                } else {
                    const entryBox = keyValPair.appendChild(document.createElement('entry-box'));
                    entryBox.innerText = val;
                }
            }
        } else {
            for (const element of entries) {
                const entryBox = allContainersDiv.appendChild(document.createElement('entry-box'));
                entryBox.innerText = element;
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