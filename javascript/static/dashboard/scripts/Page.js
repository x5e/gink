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
            // Container uses value entries only
            this.entries = await valContainerAsArray(this.container);
            this.hasKeys = false;
        }
    }

    /**
     * Gets a subset of the entries array based on the current page and the items per page.
     * @returns a sub Array containing the entries for the current page.
     */
    getPageOfEntries() {
        return this.entries.slice(this.currentPage * this.itemsPerPage, this.currentPage * this.itemsPerPage + this.itemsPerPage);
    }

    /**
     * Changes the title and header elements of the container page.
     */
    async writeTitle() {
        const containerContents = document.getElementById('container-contents');
        const titleBar = containerContents.appendChild(document.createElement('div'));
        titleBar.setAttribute('id', 'title-bar');
        const muid = this.container.address;
        let containerName;
        if (muid.timestamp == -1 && muid.medallion == -1) {
            containerName = "Root Directory";
        } else {
            containerName = `${this.container.constructor.name} (${muid.timestamp},${muid.medallion},${muid.offset})`;
        }
        titleBar.innerHTML = `<h2>${containerName}</h2>`;
        const numEntries = containerContents.appendChild(document.createElement('p'));
        numEntries.innerText = `Total entries: ${this.entries.length}`;

        if (this.entries.length > 10) {
            const itemsPerPageSelect = containerContents.appendChild(document.createElement('select'));
            const options = ['10', '25', '50', '100', '250', '500', '1000'];
            for (const option of options) {
                if (Number(option) > this.entries.length) break;
                const currentOption = itemsPerPageSelect.appendChild(document.createElement('option'));
                currentOption.innerText = option;
                currentOption.value = option;
            }
            itemsPerPageSelect.value = `${this.itemsPerPage}`;
            itemsPerPageSelect.onchange = async () => {
                this.setItemsPerPage(Number(itemsPerPageSelect.value));
                await this.displayPage();
            };
        }

        const showing = containerContents.appendChild(document.createElement('p'));
        const upperBound = this.currentPage * this.itemsPerPage + this.itemsPerPage;
        const maxEntries = upperBound >= this.entries.length ? this.entries.length : upperBound;
        showing.innerText = `Showing entries ${this.currentPage * this.itemsPerPage}-${maxEntries}`;
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
        if (this.hasKeys) {
            for (const [key, val] of this.getPageOfEntries()) {
                this.createRow(key, val);
            }
        } else {
            for (const val of this.getPageOfEntries()) {
                this.createRow(undefined, val);
            }
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
    }

    /**
     * Creates a row in the container contents table.
     * @param {*} key
     * @param {*} val
     */
    createRow(key, val) {
        const table = document.getElementById('container-table');
        const row = table.appendChild(document.createElement('tr'));
        if (key) this.createCell(row, key);
        if (val) this.createCell(row, val);
    }

    /**
     * Creates a cell in a row within a table.
     * @param {HTMLRowElement} row an HTML row node.
     * @param {*} content a key or value to place into the row.
     */
    createCell(row, content) {
        let showing; // the initial preview shown
        const cell = row.appendChild(document.createElement('td'));
        cell.dataset['state'] = 'long';
        if (content instanceof gink.Container) {
            cell.style.fontWeight = "bold";
            cell.style.cursor = "pointer";
            cell.onclick = () => {
                console.log(content);
                window.location.hash = '#' + gink.muidToString(content.address);
                window.location.reload();
            };
            showing = `${content.constructor.name}(${gink.muidToString(content.address)})`;
        } else {
            content = unwrapToString(content);
            if (content.length > 20) {
                cell.style.cursor = "pointer";
                let longContent = content;
                showing = shortenedString(content);
                cell.dataset['state'] = 'short';
                cell.onclick = () => {
                    if (cell.dataset["state"] == 'short') {
                        cell.innerText = longContent;
                        cell.dataset['state'] = 'long';
                    }
                    else if (cell.dataset["state"] == 'long') {
                        cell.innerText = showing;
                        cell.dataset['state'] = 'short';
                    }
                };
            }
            else {
                showing = content;
            }
        }
        cell.innerText = showing;
    }

    /**
     * Creates page buttons at the bottom of the table, and manages
     * their onclick functionality to display the correct page.
     */
    writePageButtons() {
        const containerContents = document.getElementById('container-contents');
        const pageButtonsDiv = containerContents.appendChild(document.createElement('div'));
        pageButtonsDiv.setAttribute('id', 'page-buttons-container');
        const prevPage = pageButtonsDiv.appendChild(document.createElement('a'));
        prevPage.setAttribute('class', 'page-btn no-select');
        if (!this.isFirstPage()) {
            prevPage.innerText = '<';
            prevPage.onclick = async () => {
                await this.displayPrevPage();
            };
        }
        const thisPage = pageButtonsDiv.appendChild(document.createElement('p'));
        thisPage.innerText = this.currentPage + 1;
        thisPage.setAttribute('class', 'no-select');
        const nextPage = pageButtonsDiv.appendChild(document.createElement('a'));
        nextPage.setAttribute('class', 'page-btn no-select');
        if (!this.isLastPage()) {
            nextPage.innerText = '>';
            nextPage.onclick = async () => {
                await this.displayNextPage();
            };
        }
    }

    /**
     * @returns true if there are no previous pages.
     */
    isFirstPage() {
        return this.currentPage * this.itemsPerPage == 0;
    }

    /**
     * @returns true if there are no following pages.
     */
    isLastPage() {
        return this.currentPage * this.itemsPerPage + this.itemsPerPage >= this.entries.length;
    }
}
