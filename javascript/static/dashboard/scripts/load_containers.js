/**
 * Load and display all containers for a GinkInstance.
 * This is the home page.
 */
async function loadAllContainers() {
    createPathItem();

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
 * @param {Container} container
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
 * Creates an item in the navbar filepath for this container.
 * @param {Container} container 
 */
function createPathItem(container) {
    const pathContainer = document.getElementById('path-container');
    if (container) pathContainer.appendChild(document.createElement('div')).innerText = "/";
    const pathItem = pathContainer.appendChild(document.createElement('path-item'));
    if (container) {
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
    } else {
        pathItem.innerText = "Home";
        pathItem.onclick = async () => {
            while (pathContainer.lastChild) {
                pathContainer.removeChild(pathContainer.lastChild);
            }
            await loadAllContainers();
        };
    }
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