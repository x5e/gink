/**
 * Edits the HTML to display the contents of a container.
 * Can take either the Muid object itself, or the canonical
 * string muid.
 * @param {String | Muid} muid
 */
async function displayContainer(muid) {
    const containerContents = document.getElementById('container-contents');
    let container;
    if (typeof muid == "string") {
        muid = gink.strToMuid(muid);
    }
    try {
        container = await gink.construct(window.instance, muid);
    } catch (e) {
        const p = containerContents.appendChild(document.createElement('p'));
        p.innerText = "Container not found.";
        return;
    }
    writeTitle(container);
    const asMap = await container.toMap();
    if (asMap.size == 0) {
        const p = containerContents.appendChild(document.createElement('p'));
        p.innerText = "No entries.";
        return;
    }
    const thisContainerTable = containerContents.appendChild(document.createElement('table'));
    thisContainerTable.setAttribute('id', 'container-table');
    thisContainerTable.innerHTML = `
            <tr>
                <th>Key</th>
                <th>Value</th>
            </tr>`;
    for (const [key, val] of asMap.entries()) {
        createRow(key, val);
    }
}

/**
 * Changes the title of the container page
 * @param {Container} container
 */
function writeTitle(container) {
    const containerContents = document.getElementById('container-contents');
    const titleBar = containerContents.appendChild(document.createElement('div'));
    titleBar.setAttribute('id', 'title-bar');
    const muid = container.address;
    titleBar.innerHTML = `<h2>${container.constructor.name} (${muid.timestamp},${muid.medallion},${muid.offset})</h2>`;
}

/**
 * Creates a row in the container contents table.
 * @param {*} key
 * @param {*} val
 */
function createRow(key, val) {
    key = unwrapToString(key);
    val = unwrapToString(val);
    const table = document.getElementById('container-table');
    const row = table.appendChild(document.createElement('tr'));
    const keyCell = row.appendChild(document.createElement('td'));
    const valCell = row.appendChild(document.createElement('td'));
    keyCell.dataset['state'] = 'long';
    valCell.dataset['state'] = 'long';

    if (key.length > 20) {
        keyCell.style.cursor = "pointer";
        let longKey = key;
        key = shortenedString(key);
        keyCell.dataset['state'] = 'short';
        keyCell.onclick = () => {
            if (keyCell.dataset["state"] == 'short') {
                keyCell.innerText = longKey;
                keyCell.dataset['state'] = 'long';
            }
            else if (keyCell.dataset["state"] == 'long') {
                keyCell.innerText = key;
                keyCell.dataset['state'] = 'short';
            }
        };
    }

    if (val.length > 20) {
        valCell.style.cursor = "pointer";
        let longVal = val;
        val = shortenedString(val);
        valCell.dataset['state'] = 'short';
        valCell.onclick = () => {
            if (valCell.dataset["state"] == 'short') {
                valCell.innerText = longVal;
                valCell.dataset['state'] = 'long';
            }
            else if (valCell.dataset["state"] == 'long') {
                valCell.innerText = val;
                valCell.dataset['state'] = 'short';
            }
        };
    }

    keyCell.innerText = key;
    valCell.innerText = val;
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
