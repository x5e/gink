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
