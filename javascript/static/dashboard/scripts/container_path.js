/**
 * Creates an item in the navbar filepath for this container.
 * @param {Container} container 
 */
function createPathItem(container) {
    const pathContainer = document.getElementById('path-container');
    if (container) pathContainer.appendChild(document.createElement('div')).innerText = "/";
    const pathItem = pathContainer.appendChild(document.createElement('path-item'));
    if (container) {
        // Setting this attribute to keep track of where we are, and
        // to not duplicate divs in the file path.
        pathContainer.dataset["currentPosition"] += 1;
        pathItem.dataset["position"] = pathContainer.dataset["currentPosition"];

        pathItem.innerText = createContainerText(container);
        pathItem.onclick = async () => {
            while (pathContainer.lastChild.dataset["position"] != pathItem.dataset["position"]) {
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
        pathContainer.dataset["currentPosition"] = 0;
        pathItem.onclick = async () => {
            while (pathContainer.lastChild) {
                pathContainer.removeChild(pathContainer.lastChild);
            }
            await loadAllContainers();
        };
    }
}