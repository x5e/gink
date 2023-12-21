async function loadContainers() {
    const allContainersDiv = document.getElementById('all-containers');
    clearChildren(allContainersDiv);
    const globalDir = window.instance.getGlobalDirectory();
    const containerBox = allContainersDiv.appendChild(document.createElement('container-box'));
    containerBox.innerText = 'Global Directory';
    containerBox.onclick = async () => {
        clearChildren(allContainersDiv);
        const p = allContainersDiv.appendChild(document.createElement('p'));
        p.innerText = await globalDir.toJson();
    };
}

function clearChildren(node) {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
}