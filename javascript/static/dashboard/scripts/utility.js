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

/**
 * For the entry page - interprets the value and converts it into fitting html
 * For example, takes a gink.Container and makes it a link to its container page.
 * @param {*} value a string, container, or array of 2 containers (pair)
 * @returns a string of HTML
 */
async function entryValueAsHtml(value) {
    let asHtml;
    if (Array.isArray(value) && value.length == 2 && value[0].timestamp) {
        let container1 = await gink.construct(window.instance, value[0]);
        let container2 = await gink.construct(window.instance, value[1]);
        asHtml = `
        <strong><a href="#${gink.muidToString(container1.address)}">${container1.constructor.name}</a></strong>, <strong><a href="#${gink.muidToString(container2.address)}">${container2.constructor.name}</a></strong>
        `;
    }
    else if (value instanceof gink.Container) {
        asHtml = `<strong><a href="#${gink.muidToString(value.address)}">${value.constructor.name}(${gink.muidToString(value.address)})</a></strong>`;
    } else {
        value = unwrapToString(value);
        asHtml = `<p>${value}</p>`;
    }
    return asHtml;
}

/**
 * Takes a value of a number, string, or gink.Container,
 * and decides how the value should be displayed in the cell.
 * @param {*} value
 */
async function getCellValue(value) {
    let cellValue;
    if (Array.isArray(value) && value.length == 2 && value[0].timestamp) {
        let container1 = await gink.construct(window.instance, value[0]);
        let container2 = await gink.construct(window.instance, value[1]);
        cellValue = `${container1.constructor.name}-${container2.constructor.name}`;
    }
    else if (value instanceof gink.Container) {
        cellValue = `${value.constructor.name}(${gink.muidToString(value.address)})`;
    } else {
        value = unwrapToString(value);
        if (value.length > 20) {
            cellValue = shortenedString(value);
        }
        else {
            cellValue = value;
        }
    }
    return cellValue;
}
