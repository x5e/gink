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
