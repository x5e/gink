async function displayContainer(muidString) {
    const containerContents = document.getElementById('container-contents');
    const thisContainerDiv = containerContents.appendChild(document.createElement('div'));
    thisContainerDiv.setAttribute('class', 'container-box');
    const container = await gink.construct(window.instance, gink.strToMuid(muidString));
    for (const [key, val] of container.toMap().entries()) {
        const p = thisContainerDiv.appendChild(document.createElement("p"));
        p.innerText = key + " - " + val;
    }
}
