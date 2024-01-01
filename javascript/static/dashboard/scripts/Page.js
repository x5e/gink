class Page {
    constructor(muid, currentPage = 0, itemsPerPage = 10) {
        this.currentPage = currentPage;
        this.itemsPerPage = itemsPerPage;
        this.ready = this.init(muid);
    }

    async init(muid) {
        this.container = await gink.construct(window.instance, muid);
        if ([4, 6].includes(this.container.behavior)) {
            // Container has key entries (Directory or PairMap)
            const asMap = await keyValContainerAsMap(this.container);
            this.entries = Array.from(asMap.entries());
            this.hasKeys = true;
        } else {
            this.entries = await valContainerAsArray(this.container);
            this.hasKeys = false;
        }
    }

    getPageOfEntries() {
        return this.entries.slice(this.currentPage * this.itemsPerPage, this.currentPage * this.itemsPerPage + this.itemsPerPage);
    }

    /**
     * Changes the title of the container page.
     */
    async writeTitle() {
        const containerContents = document.getElementById('container-contents');
        const titleBar = containerContents.appendChild(document.createElement('div'));
        titleBar.setAttribute('id', 'title-bar');
        const muid = this.container.address;
        titleBar.innerHTML = `<h2>${this.container.constructor.name} (${muid.timestamp},${muid.medallion},${muid.offset})</h2>`;
        const numEntries = containerContents.appendChild(document.createElement('p'));
        numEntries.innerText = `Total entries: ${await this.container.size()}`;

        const showing = containerContents.appendChild(document.createElement('p'));
        showing.innerText = `Showing entries ${this.currentPage * this.itemsPerPage}-${this.currentPage * this.itemsPerPage + this.itemsPerPage}`;
    }

    /**
     * Edits the HTML to display the contents of a container.
     * Can take either the Muid object itself, or the canonical
     * string muid.
     */
    async displayPage() {
        await this.ready;
        clearChildren(document.getElementById('container-contents'));
        const containerContents = document.getElementById('container-contents');

        await this.writeTitle(this.container);
        const thisContainerTable = containerContents.appendChild(document.createElement('table'));
        thisContainerTable.setAttribute('id', 'container-table');
        thisContainerTable.innerHTML = `
        <tr>
            ${this.hasKeys ? '<th>Key</th>' : ''}
            <th>Value</th>
        </tr>`;

        if (this.entries.length == 0) {
            const p = containerContents.appendChild(document.createElement('p'));
            p.innerText = "No entries.";
            return;
        }
        for (const [key, val] of this.getPageOfEntries()) {
            this.createRow(key, val);
        }
        this.writePageButtons();
    }

    async displayNextPage() {
        this.currentPage += 1;
        await this.displayPage();
    };

    async displayPrevPage() {
        this.currentPage -= 1;
        await this.displayPage();
    };

    async setItemsPerPage(itemsPerPage) {
        this.itemsPerPage = itemsPerPage;
        await this.displayPage();
    }

    /**
     * Creates a row in the container contents table.
     * @param {*} key
     * @param {*} val
     */
    createRow(key, val) {
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

    writePageButtons() {
        const containerContents = document.getElementById('container-contents');
        const pageButtonsDiv = containerContents.appendChild(document.createElement('div'));
        pageButtonsDiv.setAttribute('id', 'page-buttons-container');
        const prevPage = pageButtonsDiv.appendChild(document.createElement('a'));
        prevPage.setAttribute('class', 'page-btn');
        if (!this.isFirstPage()) {
            prevPage.innerText = '<';
            prevPage.onclick = async () => {
                await this.displayPrevPage();
            };
        }
        const thisPage = pageButtonsDiv.appendChild(document.createElement('p'));
        thisPage.innerText = this.currentPage + 1;
        const nextPage = pageButtonsDiv.appendChild(document.createElement('a'));
        nextPage.setAttribute('class', 'page-btn');
        if (!this.isLastPage()) {
            nextPage.innerText = '>';
            nextPage.onclick = async () => {
                await this.displayNextPage();
            };
        }
    }

    isFirstPage() {
        return this.currentPage * this.itemsPerPage == 0;
    }

    isLastPage() {
        return this.currentPage * this.itemsPerPage + this.itemsPerPage == this.entries.length;
    }
}
