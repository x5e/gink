/**
 * Determines whether a container stores keys as any value, a muid, a muid pair,
 * or not at all. Same thing for values.
 *
 * Valid keyType options:
 * "none", "any", "pair", "muid"
 *
 * Valid valueType options:
 *  "none", "any"
 *
 * @param {gink.Container} container
 * @returns an Array of [keyType, valueType] strings
 */
function determineContainerStorage(container) {
    let keyType = 'none';
    let valueType = 'none';
    switch (container.behavior) {
        case 1: // Box
            valueType = "any";
            break;
        case 2: // Sequence
            valueType = "any";
            break;
        case 3: // KeySet
            keyType = "any";
            break;
        case 4: // Directory
            keyType = "any";
            valueType = "any";
            break;
        case 5: // PairSet
            keyType = "pair";
            break;
        case 6: // PairMap
            keyType = "pair";
            valueType = "any";
            break;
        case 9: // Property
            keyType = "muid";
            valueType = "any";
            break;
        case 10: // Role
            keyType = "muid";
            break;
        default:
            throw new Error(`Either invalid behavior or container is verb, or vertex, which don't have entries.`);
    }
    return [keyType, valueType];
}

/**
 * Unwraps an expected hash into:
 * string muid, page, items per page
 * Expecting : FFFFFFFFFFFFFF-FFFFFFFFFFFFF-00004+3+10
 * 3 = page, 10 = items per page
 * If only a muid is present, assume page 1, 10 items.
 * @param {string} hash
 * @returns an Array of [stringMuid, pageNumber, itemsPerPage]
 */
function unwrapHash(hash) {
    let stringMuid = "FFFFFFFFFFFFFF-FFFFFFFFFFFFF-00004";
    let pageNumber = 1;
    let itemsPerPage = 10;
    if (window.location.hash == '#self') {
        stringMuid = gink.muidToString(this.instance.getMedallionDirectory().address);
    }
    else if (hash) {
        hash = hash.substring(1);
        let splitHash = hash.split("+");
        stringMuid = splitHash[0];
        if (!(splitHash.length == 1)) {
            pageNumber = splitHash[1];
            itemsPerPage = splitHash[2];
        }
    }
    return [stringMuid, Number(pageNumber), Number(itemsPerPage)];
}



/**
 * Fills a datalist element with options of all containers that exist
 * in the store.
 * @param {HTMLDataListElement} htmlDatalistElement
 */
async function enableContainersAutofill(htmlDatalistElement) {
    // gink.ensure(htmlDatalistElement instanceof HTMLDataListElement, "Can only fill datalist");
    // const containers = await getAllContainers();
    // for (const [strMuid, container] of containers) {
    //     const option = document.createElement("option");
    //     option.value = strMuid;
    //     htmlDatalistElement.appendChild(option);
    // }
    throw new Error("not yet implemented");
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
