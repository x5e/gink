class Page {
    constructor() {
        this.pageType = undefined;
        this.root = this.getElement("#root");
    }

    /**
     * Changes the title and header elements of the container page.
     */
    writeTitle(container) {
        const title = this.createElement("h2", this.root, "title-bar");
        const muid = container.address;
        let containerName;
        if (muid.timestamp == -1 && muid.medallion == -1) {
            containerName = "Root Directory";
        } else {
            containerName = `${container.constructor.name} (${muid.timestamp},${muid.medallion},${muid.offset})`;
        }
        title.innerText = containerName;
    }

    /**
     * Edits the HTML to display the contents of a container.
     */
    async displayPage(args) {
        const { container, pageOfEntries, currentPage, itemsPerPage, totalEntries } = args;
        this.pageType = "container";

        const [keyType, valueType] = determineContainerStorage(container);

        this.clearChildren(this.root);

        this.writeTitle();

        // Total entries
        const numEntries = this.createElement("p", this.root);
        numEntries.innerText = `Total entries: ${totalEntries}`;

        // Items per page selector
        if (totalEntries > 10) {
            const itemsPerPageSelect = this.createElement("select", this.root);
            const options = ['10', '25', '50', '100', '250', '500', '1000'];
            for (const option of options) {
                if (Number(option) > totalEntries) break;
                const currentOption = this.createElement("option", itemsPerPageSelect);
                currentOption.innerText = option;
                currentOption.value = option;
            }
            itemsPerPageSelect.value = `${itemsPerPage}`;
            itemsPerPageSelect.onchange = async () => {
                window.location.hash = `${gink.muidToString(container.address)}+${currentPage}+${itemsPerPageSelect.value}`;
            };
        }

        // Range information
        const showing = this.createElement("p", this.root);
        const lowerBound = currentPage * itemsPerPage + (totalEntries == 0 ? 0 : 1);
        const upperBound = currentPage * itemsPerPage + itemsPerPage;
        const maxEntries = upperBound >= totalEntries ? totalEntries : upperBound;
        showing.innerText = `Showing entries ${lowerBound}-${maxEntries}`;

        // Add entry button
        const addEntryButton = this.createElement("button", this.root, "add-entry-button");
        addEntryButton.innerText = "Add Entry";
        addEntryButton.onclick = async () => {
            await this.displayAddEntry(container);
        };

        // Create the paging buttons
        const pageButtonsDiv = this.createElement("div", this.root, "page-buttons-container");
        pageButtonsDiv.style.fontWeight = "bold";
        const prevPage = this.createElement("a", pageButtonsDiv, undefined, "page-btn no-select");
        prevPage.innerText = '<';
        if (!this.isFirstPage(currentPage, itemsPerPage)) {
            prevPage.onclick = async () => {
                window.location.hash = `${gink.muidToString(container.address)}+${currentPage - 1}+${itemsPerPage}`;
            };
        } else {
            prevPage.style.opacity = 0;
            prevPage.style.cursor = "auto";
        }
        const thisPage = this.createElement("p", pageButtonsDiv, undefined, "no-select");
        thisPage.innerText = `Page ${currentPage}`;
        const nextPage = this.createElement("a", pageButtonsDiv, undefined, "page-btn no-select");
        nextPage.innerText = '>';
        if (!this.isLastPage(currentPage, itemsPerPage, totalEntries)) {
            nextPage.onclick = async () => {
                window.location.hash = `${gink.muidToString(container.address)}+${currentPage + 1}+${itemsPerPage}`;
            };
        } else {
            nextPage.style.opacity = 0;
            nextPage.style.cursor = "auto";
        }

        // If there are no entries, don't bother making the table
        if (totalEntries == 0) {
            const p = this.createElement("p", this.root);
            p.innerText = "No entries.";
            return;
        }

        // Create table based on page of entries.
        const containerTable = this.createElement("table".root, "container-table");
        const headerRow = this.createElement("tr", containerTable);
        if (keyType != "none") {
            const keyHeader = this.createElement("th", headerRow);
            keyHeader.innerText = "Key";
        }
        if (valueType != "none") {
            const valueHeader = this.createElement("th", headerRow);
            valueHeader.innerText = "Value";
        }

        // Make sure nothing is broken
        if (containerKeyType == "none") gink.ensure(pageOfEntries[0][0] == undefined);
        else if (containerKeyType != "none") gink.ensure(pageOfEntries[0][0] != undefined);
        if (containerValueType == "none") gink.ensure(pageOfEntries[0][1] == undefined);
        else if (containerValueType != "none") gink.ensure(pageOfEntries[0][1] != undefined);

        // Loop through entries to create table rows
        let position = 0;
        for (const [key, value] of pageOfEntries) {
            const row = this.createElement("tr", containerTable, undefined, "entry-row");
            row.dataset["position"] = position;
            row.onclick = async () => {
                await this.displayEntry(key, value, Number(row.dataset["position"]));
            };
            if (key != undefined) {
                const keyCell = this.createElement("td", row);
                keyCell.innerText = await getCellValue(key);
            }
            if (value != undefined) {
                const valCell = row.appendChild(document.createElement('td'));
                valCell.innerText = await getCellValue(val);
            }
            position++;
        }
    }

    /**
     * Displays the page to add a new entry to the database.
     */
    async displayAddEntry(args) {
        const { container, pageOfEntries, currentPage, itemsPerPage, totalEntries } = args;
        const [keyType, valueType] = determineContainerStorage(container);
        this.pageType = "add-entry";
        this.clearChildren(this.root);
        this.writeTitle();

        const cancelButton = this.createElement("button", this.root, "cancel-button");
        cancelButton.innerText = 'X';
        cancelButton.onclick = async () => {
            // Just reload to get back to container page where we left off.
            window.location.reload();
        };

        const entryFields = this.createElement("div", this.root, "add-entry-container", "entry-container");
        let keyInput1, keyInput2, valueInput;
        // Key inputs - if container uses keys.
        if (keyType != "none") {
            const keyContainer = this.createElement("div", entryFields, undefined, "input-container");
            const keyH2 = this.createElement("h2", keyContainer);
            keyH2.innerText = "Key";
            keyInput1 = this.createElement("input", keyContainer, "key-input-1", "commit-input");
            keyInput1.setAttribute("type", "text");
            keyInput1.setAttribute("placeholder", "Key");
            if (keyType == "muid" || keyType == "pair") {
                keyInput1.setAttribute("placeholder", "Muid");
                // TODO: create a datalist with all container muids
                // await enableContainerAutofill(datalist1);
            }
            if (keyType == "pair") {
                keyInput2 = this.createElement("input", keyContainer, "key-input-2", "commit-input");
                keyInput2.setAttribute("type", "text");
                keyInput2.setAttribute("placeholder", "Muid");
                // await enableContainerAutofill(datalist2);
            }
        }

        // Value inputs - if container uses values.
        if (valueType != "none") {
            const valueContainer = this.createElement("div", entryFields, undefined, "input-container");
            const valueH2 = this.createElement("h2", valueContainer);
            valueH2.innerText = "Value";
            valueInput = this.createElement("input", valueContainer, "value-input", "commit-input");
            valueInput.setAttribute("type", "text");
            valueInput.setAttribute("placeholder", "Value");
        }

        const commentContainer = this.createElement("div", entryFields, undefined, "input-container");
        const commentH2 = this.createElement("h2", commentContainer);
        commentH2.innerText = "Comment";
        const commentInput = this.createElement("input", commentContainer, "comment-input", "commit-input");
        commentInput.setAttribute("type", "text");
        commentInput.setAttribute("placeholder", "Commit message (optional)");

        const submitButton = entryFields.appendChild(document.createElement('button'));
        submitButton.innerText = 'Commit Entry';
        submitButton.setAttribute('id', 'commit-button');
        submitButton.onclick = async () => {
            let key = document.getElementById('key-input');
            key = key ? key.value : undefined;
            let val = document.getElementById('val-input');
            val = val ? val.value : undefined;
            let msg = document.getElementById('msg-input');
            msg = msg ? msg.value : undefined;
            await addContainerEntry(key, val, this.container, msg);
            await this.displayPage();
        };
    }

    async displayEntry(key, value, position) {
        const containerContents = document.getElementById('container-contents');
        this.pageType = "entry";
        clearChildren(containerContents);
        this.writeTitle();
        this.writeCancelButton();
        const entryContainer = containerContents.appendChild(document.createElement('div'));
        entryContainer.setAttribute('id', 'view-entry');
        entryContainer.setAttribute('class', 'entry-container');
        if (key != undefined) {
            entryContainer.innerHTML += `
            <div class="entry-page-kv">
                <h2>Key</h2>
                ${await entryValueAsHtml(key)}
            </div>
            `;
        }
        if (value != undefined) {
            entryContainer.innerHTML += `
            <div class="entry-page-kv">
                <h2>Value</h2>
                ${await entryValueAsHtml(value)}
            </div>
            `;
        }
        const buttonContainer = containerContents.appendChild(document.createElement('div'));
        buttonContainer.setAttribute('id', 'update-delete-container');

        const updateButton = buttonContainer.appendChild(document.createElement('button'));
        updateButton.setAttribute("id", "update-button");
        updateButton.innerText = "Update Entry";
        updateButton.onclick = async () => {
            await this.displayUpdateEntry(key, value, position);
        };

        const deleteButton = buttonContainer.appendChild(document.createElement('button'));
        deleteButton.setAttribute("id", "delete-button");
        deleteButton.innerText = "Delete Entry";
        deleteButton.onclick = async () => {
            if (confirm("Delete and commit?")) {
                await deleteContainerEntry(key, position, this.container);
            }
            await this.displayPage();
        };
    }

    async displayUpdateEntry(oldKey, oldValue, position) {
        const containerContents = document.getElementById('container-contents');
        this.pageType = "update";
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
                <div id="entry-key"><input class="commit-input" id="key-input" placeholder="Key" /></div>
            </div>
            `;
        }
        if (oldValue != undefined) {
            entryContainer.innerHTML += `
            <div>
                <h2>Value</h2>
                <div id="entry-value"><input class="commit-input" id="val-input" placeholder="Value" /></div>
            </div>
            `;
        }
        entryContainer.innerHTML += `
            <div>
                <div id="entry-comment"><input class="commit-input" id="comment-input" placeholder="Commit Message (Optional)" /></div>
            </div>
            `;

        const keyInput = document.getElementById('key-input');
        if (keyInput) {
            // keyContainer.innerText = '';
            keyInput.value = oldKey;
        }
        const valInput = document.getElementById('val-input');
        if (valInput) {
            // valueContainer.innerText = '';
            valInput.value = oldValue;
        }

        const buttonContainer = containerContents.appendChild(document.createElement('div'));
        buttonContainer.setAttribute('id', 'commit-abort-container');

        const commitButton = buttonContainer.appendChild(document.createElement('button'));
        commitButton.setAttribute("id", "commit-button");
        commitButton.innerText = "Commit Entry";
        commitButton.onclick = async () => {
            let newKey, newValue, newComment;
            if (keyInput) newKey = keyInput.value;
            if (valInput) newValue = valInput.value;
            newComment = document.getElementById("comment-input").value;

            if (confirm("Commit updated entry?")) {
                await deleteContainerEntry(oldKey, position, this.container, newComment);
                await addContainerEntry(newKey, newValue, this.container, newComment);
            }
            await this.displayPage();
        };

        const abortButton = buttonContainer.appendChild(document.createElement('button'));
        abortButton.innerText = "Abort";
        abortButton.onclick = async () => {
            await this.displayEntry(oldKey, oldValue, position);
        };
    }

    /**
     * @returns true if there are no previous pages.
     */
    isFirstPage(currentPage, itemsPerPage) {
        return currentPage * itemsPerPage == 0;
    }

    /**
     * @returns true if there are no following pages.
     */
    isLastPage(currentPage, itemsPerPage, totalEntries) {
        return currentPage * itemsPerPage + itemsPerPage >= totalEntries;
    }

    // HTML Utility Methods

    /**
     * Gets an HTML element in the DOM based on the selector.
     * @param {string} selector HTML selector
     * @returns an HTMLElement if found, else undefined.
     */
    getElement(selector) {
        return document.querySelector(selector);
    }

    /**
     * Creates an HTML Element based on the provided tag.
     * Optionally appends to a provided element.
     * @param {string} tag type of element to create.
     * @param {HTMLElement} appendTo optional HTMLElement to append to.
     * @param {string} id optional id for newly created element.
     * @param {string} className optional class for newly created element.
     * @returns the newly created HTMLElement.
     */
    createElement(tag, appendTo, id, className) {
        const element = document.createElement(tag);
        if (id) element.setAttribute("id", id);
        if (className) element.setAttribute("class", className);
        if (appendTo) {
            appendTo.appendChild(element);
        }
        return element;
    }

    /**
     * Utility function to clear the children of
     * an HTMLElement.
     * @param {HTMLElement} node
     */
    clearChildren(node) {
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
    }
}
