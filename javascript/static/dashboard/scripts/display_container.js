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
    const thisContainerTable = containerContents.appendChild(document.createElement('table'));
    thisContainerTable.setAttribute('id', 'container-table');
    if ([4, 6].includes(container.behavior)) { // Container has key entries (Directory or PairMap)
        const asMap = await keyValContainerAsMap(container);
        if (asMap.size == 0) {
            const p = containerContents.appendChild(document.createElement('p'));
            p.innerText = "No entries.";
            return;
        }
        thisContainerTable.innerHTML = `
            <tr>
                <th>Key</th>
                <th>Value</th>
            </tr>`;
        for (const [key, val] of asMap.entries()) {
            createRow(key, val);
        }
    } else {
        const asArray = await valContainerAsArray(container);
        if (asArray.length == 0) {
            const p = containerContents.appendChild(document.createElement('p'));
            p.innerText = "No entries.";
            return;
        }
        thisContainerTable.innerHTML = `
            <tr>
                <th>Value</th>
            </tr>`;
        for (const val of asArray) {
            createRow(undefined, val);
        }
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
    const table = document.getElementById('container-table');
    const row = table.appendChild(document.createElement('tr'));
    if (key) {
        const keyCell = row.appendChild(document.createElement('td'));
        keyCell.dataset['state'] = 'long';
        if (key instanceof gink.Container) {
            keyCell.style.cursor = "pointer";
            keyCell.onclick = () => {
                window.location.hash = '#' + gink.muidToString(key.address);
                window.location.reload();
            };
        } else {
            key = unwrapToString(key);
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
        }
        keyCell.innerText = key;
    }

    const valCell = row.appendChild(document.createElement('td'));
    valCell.dataset['state'] = 'long';
    if (val instanceof gink.Container) {
        valCell.style.cursor = "pointer";
        valCell.onclick = () => {
            window.location.hash = '#' + gink.muidToString(val.address);
            window.location.reload();
        };
    } else {
        val = unwrapToString(val);
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
    }
    valCell.innerText = val;
}
