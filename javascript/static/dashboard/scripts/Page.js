/**
 * This class assumes the existence of a div element
 * with an id of container-contents.
 */

class Page {
    constructor(muid, currentPage = 0, itemsPerPage = 10) {
        this.currentPage = currentPage;
        this.itemsPerPage = itemsPerPage;
        this.ready = this.init(muid);
    }

    async init(muid) {
        this.container = await gink.construct(window.instance, muid);
        this.entries = await containerAsArray(this.container);
        [this.hasKeys, this.hasValues] = hasKeysOrValues(this.container);
        gink.ensure(this.hasKeys || this.hasValues);
    }

    /**
     * Gets a subset of the entries array based on the current page and the items per page.
     * @returns a sub Array containing the entries for the current page.
     */
    getPageOfEntries() {
        const lowerBound = this.currentPage * this.itemsPerPage;
        const upperBound = this.currentPage * this.itemsPerPage + this.itemsPerPage;
        return this.entries.slice(lowerBound, upperBound);
    }

    /**
     * Changes the title and header elements of the container page.
     */
    writeTitle() {
        const containerContents = document.getElementById('container-contents');
        const title = containerContents.appendChild(document.createElement('h2'));
        title.setAttribute('id', 'title-bar');
        const muid = this.container.address;
        let containerName;
        if (muid.timestamp == -1 && muid.medallion == -1) {
            containerName = "Root Directory";
        } else {
            containerName = `${this.container.constructor.name} (${muid.timestamp},${muid.medallion},${muid.offset})`;
        }
        title.innerHTML = `<h2>${containerName}</h2>`;
    }

    /**
     * Adds info about the current page below the title.
     */
    async writeRangeInfo() {
        const containerContents = document.getElementById('container-contents');
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
        showing.innerText = `Showing entries ${this.currentPage * this.itemsPerPage + 1}-${maxEntries}`;

        const addEntryButton = containerContents.appendChild(document.createElement('button'));
        addEntryButton.innerText = "Add Entry";
        addEntryButton.onclick = async () => {
            await this.displayAddEntry();
        };
    }

    /**
     * Edits the HTML to display the contents of a container.
     * Can take either the Muid object itself, or the canonical
     * string muid.
     * @param {boolean} reloadContainer should the container be refreshed?
     * useful if data was just added or removed.
     */
    async displayPage(reloadContainer) {
        if (reloadContainer) await this.init(this.container.address);
        await this.ready;
        const containerContents = document.getElementById('container-contents');
        clearChildren(containerContents);

        this.writeTitle();
        await this.writeRangeInfo();
        this.writePageButtons();
        const thisContainerTable = containerContents.appendChild(document.createElement('table'));
        thisContainerTable.setAttribute('id', 'container-table');
        thisContainerTable.innerHTML = `
        <tr>
            ${this.hasKeys ? '<th>Key</th>' : ''}
            ${this.hasValues ? '<th>Value</th>' : ''}
        </tr>`;

        if (this.entries.length == 0) {
            const p = containerContents.appendChild(document.createElement('p'));
            p.innerText = "No entries.";
            return;
        }
        if (this.hasKeys && this.hasValues) {
            for (const [key, val] of this.getPageOfEntries()) {
                await this.createRow(key, val);
            }
        }
        else if (this.hasKeys && !this.hasValues) {
            for (const key of this.getPageOfEntries()) {
                await this.createRow(key);
            }
        }
        else if (!this.hasKeys && this.hasValues) {
            let pageOfEntries = this.getPageOfEntries();
            for (let i = 0; i < pageOfEntries.length; i++) {
                let val = pageOfEntries[i];
                let position;
                if (this.container.behavior == 2) {
                    // If this is a sequence, we need to keep track of
                    // each entry's position to delete or update it.
                    position = this.currentPage * this.itemsPerPage + i;
                }
                await this.createRow(undefined, val, position);
            }
        }
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
        this.currentPage = 0;
    }

    /**
     * Displays the page to add a new entry to the database.
     */
    async displayAddEntry() {
        await this.ready;
        const containerContents = document.getElementById('container-contents');
        clearChildren(containerContents);
        this.writeTitle();
        this.writeCancelButton();

        const entryFields = containerContents.appendChild(document.createElement('div'));
        entryFields.setAttribute('id', 'add-entry-container');
        entryFields.setAttribute('class', 'entry-container');
        if (this.hasKeys) {
            entryFields.innerHTML += `
            <div class="input-container">
                <input type="text" name="key" class="commit-input" id="key-input" placeholder="Key" />
            </div>
            `;
        }
        if (this.hasValues) {
            entryFields.innerHTML += `
            <div class="input-container">
                <input type="text" name="val" class="commit-input" id="val-input" placeholder="Value" />
            </div>
            `;
        }
        const submitButton = entryFields.appendChild(document.createElement('button'));
        submitButton.innerText = 'Commit Entry';
        submitButton.setAttribute('id', 'commit-button');
        submitButton.onclick = async () => {
            let key = document.getElementById('key-input');
            key = key ? key.value : undefined;
            let val = document.getElementById('val-input');
            val = val ? val.value : undefined;
            await addContainerEntry(key, val, this.container);
            await this.displayPage(true);
        };
    }

    async displayEntry(key, value, position) {
        const containerContents = document.getElementById('container-contents');
        clearChildren(containerContents);
        this.writeTitle();
        this.writeCancelButton();
        const entryContainer = containerContents.appendChild(document.createElement('div'));
        entryContainer.setAttribute('id', 'view-entry');
        entryContainer.setAttribute('class', 'entry-container');
        if (key != undefined) {
            entryContainer.innerHTML += `
            <div>
                <h2>Key</h2>
                <p>${key}</p>
            </div>
            `;
        }
        if (value != undefined) {
            entryContainer.innerHTML += `
            <div>
                <h2>Value</h2>
                <p>${value}</p>
            </div>
            `;
        }
        const buttonContainer = containerContents.appendChild(document.createElement('div'));
        buttonContainer.setAttribute('id', 'update-delete-container');

        const updateButton = buttonContainer.appendChild(document.createElement('button'));
        updateButton.innerText = "Update Entry";
        updateButton.onclick = async () => {
            await this.displayUpdateEntry(key, value, position);
        };

        const deleteButton = buttonContainer.appendChild(document.createElement('button'));
        deleteButton.innerText = "Delete Entry";
        deleteButton.onclick = async () => {
            if (confirm("Delete and commit?")) {
                await deleteContainerEntry(key, position, this.container);
            }
            await this.displayPage(true);
        };
    }

    async displayUpdateEntry(oldKey, oldValue, position) {
        const containerContents = document.getElementById('container-contents');
        clearChildren(containerContents);
        this.writeTitle();
        this.writeCancelButton();
        const entryContainer = containerContents.appendChild(document.createElement('div'));
        entryContainer.setAttribute('id', 'view-entry');
        entryContainer.setAttribute('class', 'entry-container');
        if (oldKey != undefined) {
            entryContainer.innerHTML += `
            <div>
                <h2>Key</h2>
                <div id="entry-key"></div>
            </div>
            `;
        }
        if (oldValue != undefined) {
            entryContainer.innerHTML += `
            <div>
                <h2>Value</h2>
                <div id="entry-value"></div>
            </div>
            `;
        }

        let keyInput, valueInput;
        const keyContainer = document.getElementById('entry-key');
        if (keyContainer) {
            keyContainer.innerText = '';
            keyInput = keyContainer.appendChild(document.createElement('input'));
            keyInput.setAttribute('id', 'key-input');
            keyInput.setAttribute('class', 'commit-input');
            keyInput.value = oldKey;
        }
        const valueContainer = document.getElementById('entry-value');
        if (valueContainer) {
            valueContainer.innerText = '';
            valueInput = valueContainer.appendChild(document.createElement('input'));
            valueInput.setAttribute('id', 'value-input');
            valueInput.setAttribute('class', 'commit-input');
            valueInput.value = oldValue;
        }

        const buttonContainer = containerContents.appendChild(document.createElement('div'));
        buttonContainer.setAttribute('id', 'commit-abort-container');

        const commitButton = buttonContainer.appendChild(document.createElement('button'));
        commitButton.innerText = "Commit Entry";
        commitButton.onclick = async () => {
            let newKey, newValue;
            if (keyContainer) newKey = keyInput.value;
            if (valueContainer) newValue = valueInput.value;
            if (confirm("Commit updated entry?")) {
                await deleteContainerEntry(oldKey, position, this.container);
                await addContainerEntry(newKey, newValue, this.container);
            }
            await this.displayPage(true);
        };

        const abortButton = buttonContainer.appendChild(document.createElement('button'));
        abortButton.innerText = "Abort";
        abortButton.onclick = async () => {
            await this.displayEntry(oldKey, oldValue, position);
        };
    }

    /**
     * Puts an X button at the top left of #container-contents.
     */
    writeCancelButton() {
        const containerContents = document.getElementById('container-contents');
        const cancelButton = containerContents.appendChild(document.createElement('button'));
        cancelButton.setAttribute('id', 'cancel-button');
        cancelButton.innerText = 'X';
        cancelButton.onclick = async () => {
            await this.displayPage();
        };
    }

    /**
     * Creates a row in the container contents table.
     * @param {*} key
     * @param {*} val
     * @param {number} position optional, used for sequences to
     * keep track of which entry to update/delete.
     */
    async createRow(key, val, position) {
        const table = document.getElementById('container-table');
        const row = table.appendChild(document.createElement('tr'));
        if (position != undefined) {
            row.dataset["position"] = position;
        }
        row.setAttribute('class', 'entry-row');
        row.onclick = async () => {
            await this.displayEntry(key, val, Number(row.dataset["position"]));
        };
        if (key != undefined) await this.createCell(row, key);
        if (val != undefined) await this.createCell(row, val);
    }

    /**
     * Creates a cell in a row within a table.
     * @param {HTMLRowElement} row an HTML row node.
     * @param {*} content a key or value to place into the row.
     */
    async createCell(row, content) {
        const cell = row.appendChild(document.createElement('td'));
        cell.dataset['state'] = 'long';
        if (Array.isArray(content) && content.length == 2 && content[0].timestamp) {
            let container1 = await gink.construct(window.instance, content[0]);
            let container2 = await gink.construct(window.instance, content[1]);
            cell.style.fontWeight = "bold";
            cell.innerHTML = `
            <a href="#${gink.muidToString(container1.address)}">${container1.constructor.name}</a>-<a href="#${gink.muidToString(container2.address)}">${container2.constructor.name}</a>
            `;
        }
        else if (content instanceof gink.Container) {
            cell.style.fontWeight = "bold";
            cell.style.cursor = "pointer";
            cell.onclick = () => {
                window.location.hash = '#' + gink.muidToString(content.address);
            };
            cell.innerText = `${content.constructor.name}(${gink.muidToString(content.address)})`;
        } else {
            content = unwrapToString(content);
            if (content.length > 20) {
                cell.innerText = shortenedString(content);
            }
            else {
                cell.innerText = content;
            }
        }
    }

    /**
     * Creates page buttons at the bottom of the table, and manages
     * their onclick functionality to display the correct page.
     */
    writePageButtons() {
        const containerContents = document.getElementById('container-contents');
        const pageButtonsDiv = containerContents.appendChild(document.createElement('div'));
        pageButtonsDiv.style.fontWeight = "bold";
        pageButtonsDiv.setAttribute('id', 'page-buttons-container');
        const prevPage = pageButtonsDiv.appendChild(document.createElement('a'));
        prevPage.setAttribute('class', 'page-btn no-select');
        prevPage.innerText = '<';
        if (!this.isFirstPage()) {
            prevPage.onclick = async () => {
                await this.displayPrevPage();
            };
        } else {
            prevPage.style.opacity = 0;
            prevPage.style.cursor = "auto";
        }
        const thisPage = pageButtonsDiv.appendChild(document.createElement('p'));
        thisPage.innerText = `Page ${this.currentPage + 1}`;
        thisPage.setAttribute('class', 'no-select');
        const nextPage = pageButtonsDiv.appendChild(document.createElement('a'));
        nextPage.setAttribute('class', 'page-btn no-select');
        nextPage.innerText = '>';
        if (!this.isLastPage()) {
            nextPage.onclick = async () => {
                await this.displayNextPage();
            };
        } else {
            nextPage.style.opacity = 0;
            nextPage.style.cursor = "auto";
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
