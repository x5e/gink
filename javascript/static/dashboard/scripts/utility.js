/**
 * Determines the muid of the container to display based
 * on the hash provided.
 * #self returns the muid of the medallion directory
 * undefined returns the muid of the root directory
 * #(String-Muid) returns the Muid object of that container.
 * @param {string} hash
 * @returns a gink.Muid
 */
function hashToMuid(hash) {
    let muid;
    if (!hash) {
        muid = window.instance.getGlobalDirectory().address;
    } else if (window.location.hash == '#self') {
        muid = window.instance.getMedallionDirectory().address;
    }
    else {
        muid = gink.strToMuid(hash.substring(1));
    }
    return muid;
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
