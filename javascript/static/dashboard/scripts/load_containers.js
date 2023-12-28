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
 * @returns a Node pointing to the containerBox custom HTML element
 */
function createContainerBox(container) {
    const allContainersDiv = document.getElementById('all-containers');
    const containerBox = allContainersDiv.appendChild(document.createElement('container-box'));
    containerBox.innerText = createContainerText(container);

    // If container is a Property, Verb, or Vertex, they won't have contents to display.
    if (!([7, 8, 9].includes(container.behavior))) {
        containerBox.onclick = async () => {
            await displayContents(container);
        };
    }
    return containerBox;
}