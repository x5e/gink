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
        writeTitle(container);
        const thisContainerDiv = containerContents.appendChild(document.createElement('div'));
        thisContainerDiv.setAttribute('class', 'container-box');
        const asMap = await container.toMap();
        for (const [key, val] of asMap.entries()) {
            const p = thisContainerDiv.appendChild(document.createElement("p"));
            p.innerText = key + " -> " + val;
        }
    } catch (e) {
        const p = containerContents.appendChild(document.createElement('p'));
        p.innerText = "Container not found.";
    }
}

function writeTitle(container) {
    const containerContents = document.getElementById('container-contents');
    const titleBar = containerContents.appendChild(document.createElement('div'));
    titleBar.setAttribute('id', 'title-bar');
    const muid = container.address;
    titleBar.innerText = `${container.constructor.name} (${muid.timestamp},${muid.medallion},${muid.offset})`;
}
