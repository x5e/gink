class Page {
    constructor(database) {
        this.database = database;
        this.pageType = undefined;
        this.root = this.getElement("#root");
    }

    /**
     * Edits the HTML to display the contents of a container.
     */
    async displayPage(strMuid, currentPage, itemsPerPage) {
        this.clearChildren(this.root);
        // Get data from database
        const container = await this.database.getContainer(strMuid);
        const pageOfEntries = await this.database.getPageOfEntries(container, currentPage, itemsPerPage);
        const totalEntries = await container.size();

        this.pageType = "container";

        const [keyType, valueType] = determineContainerStorage(container);

        this.writeTitle(container);

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
        const lowerBound = (currentPage - 1) * itemsPerPage + (totalEntries == 0 ? 0 : 1);
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
        if (!this.isFirstPage(currentPage)) {
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
        const containerTable = this.createElement("table", this.root, "container-table");
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
        if (keyType == "none") gink.ensure(pageOfEntries[0][0] == undefined);
        else if (keyType != "none") gink.ensure(pageOfEntries[0][0] != undefined);
        if (valueType == "none") gink.ensure(pageOfEntries[0][1] == undefined);
        else if (valueType != "none") gink.ensure(pageOfEntries[0][1] != undefined);

        // Loop through entries to create table rows
        let position = 0;
        for (const [key, value] of pageOfEntries) {
            const row = this.createElement("tr", containerTable, undefined, "entry-row");
            row.dataset["position"] = position;
            row.onclick = async () => {
                await this.displayEntry(key, value, Number(row.dataset["position"]), container);
            };
            if (key != undefined) {
                const keyCell = this.createElement("td", row);
                keyCell.innerText = await getCellValue(key);
            }
            if (value != undefined) {
                const valCell = this.createElement("td", row);
                valCell.innerText = await getCellValue(value);
            }
            position++;
        }
    }

    /**
     * Displays the page to add a new entry to the database.
     */
    async displayAddEntry(container) {
        const [keyType, valueType] = determineContainerStorage(container);
        this.pageType = "add-entry";
        this.clearChildren(this.root);
        this.writeTitle(container);

        const cancelButton = this.createElement("button", this.root, "cancel-button");
        cancelButton.innerText = 'X';
        cancelButton.onclick = async () => {
            await this.displayPage(...unwrapHash(window.location.hash));
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

        const submitButton = this.createElement("button", entryFields, "commit-button");
        submitButton.innerText = 'Commit Entry';
        submitButton.onclick = async () => {
            // If any field is empty, stop now.
            if (keyInput1 && !keyInput1.value) return;
            if (keyInput2 && !keyInput2.value) return;
            if (valueInput && !valueInput.value) return;

            let newKey, newValue, newComment;
            if (keyInput1 && !keyInput2) newKey = keyInput1.value;
            else if (keyInput1 && keyInput2) newKey = [keyInput1.value, keyInput2.value];
            if (valueInput) newValue = valueInput.value;
            newComment = commentInput.value;

            if (confirm("Commit entry?")) {
                await this.database.addEntry(newKey, newValue, container, newComment);
            }
            await this.displayPage(...unwrapHash(window.location.hash));
        };
    }

    async displayEntry(key, value, position, container) {
        this.clearChildren(this.root);
        this.pageType = "entry";

        this.writeTitle(container);

        const cancelButton = this.createElement("button", this.root, "cancel-button");
        cancelButton.innerText = 'X';
        cancelButton.onclick = async () => {
            await this.displayPage(...unwrapHash(window.location.hash));
        };

        const entryContainer = this.createElement("div", this.root, "view-entry", "entry-container");
        if (key != undefined) {
            const keyContainer = this.createElement("div", entryContainer, undefined, "input-container");
            const keyH2 = this.createElement("h2", keyContainer);
            keyH2.innerText = "Key";
            // Determines whether value needs to be a link to another container, etc.
            keyContainer.innerHTML += await entryValueAsHtml(key);
        }

        if (value != undefined) {
            const valueContainer = this.createElement("div", entryContainer, undefined, "input-container");
            const valueH2 = this.createElement("h2", valueContainer);
            valueH2.innerText = "Value";
            // Determines whether value needs to be a link to another container, etc.
            valueContainer.innerHTML += await entryValueAsHtml(value);
        }

        // Update and Delete buttons
        const buttonContainer = this.createElement("div", this.root, "update-delete-container");
        const updateButton = this.createElement("button", buttonContainer, "update-button");
        updateButton.innerText = "Update Entry";
        updateButton.onclick = async () => {
            await this.displayUpdateEntry(key, value, position, container);
        };

        const deleteButton = this.createElement("button", buttonContainer, "delete-button");
        deleteButton.innerText = "Delete Entry";
        deleteButton.onclick = async () => {
            if (confirm("Delete and commit?")) {
                await this.database.deleteEntry(key, position, container);
            }
            await this.displayPage(...unwrapHash(window.location.hash));
        };
    }

    /**
     * Displays the page to update an existing entry.
     * @param {*} oldKey
     * @param {*} oldValue
     * @param {*} position
     */
    async displayUpdateEntry(oldKey, oldValue, position, container) {
        this.pageType = "update";
        const [keyType, valueType] = determineContainerStorage(container);
        this.clearChildren(this.root);
        this.writeTitle(container);

        const cancelButton = this.createElement("button", this.root, "cancel-button");
        cancelButton.innerText = 'X';
        cancelButton.onclick = async () => {
            await this.displayPage(unwrapHash(window.location.hash));
        };

        const entryContainer = this.createElement("div", this.root, "view-entry", "entry-container");
        let keyInput1, keyInput2, valueInput;
        if (oldKey != undefined) {
            const keyH2 = this.createElement("h2", entryContainer);
            keyH2.innerText = "Key";
            keyInput1 = this.createElement("input", entryContainer, "key-input-1", "commit-input");
            keyInput1.setAttribute("placeholder", "Key");
            if (keyType == "muid" || keyType == "pair") {
                keyInput1.setAttribute("placeholder", "Muid");
            }
            if (keyType == "pair") {
                keyInput2 = this.createElement("input", entryContainer, "key-input-2", "commit-input");
                keyInput2.setAttribute("placeholder", "Muid");
            }
        }
        if (oldValue != undefined) {
            const valueH2 = this.createElement("h2", entryContainer);
            valueH2.innerText = "Value";
            valueInput = this.createElement("input", entryContainer, "value-input", "commit-input");
            valueInput.setAttribute("placeholder", "Value");
        }
        const commentH2 = this.createElement("h2", entryContainer);
        commentH2.innerText = "Comment";
        const commentInput = this.createElement("input", entryContainer, "comment-input", "commit-input");
        commentInput.setAttribute("placeholder", "Commit Message (optional)");

        const buttonContainer = this.createElement("div", this.root, "commit-abort-container");

        const commitButton = this.createElement("button", buttonContainer, "commit-button");
        commitButton.innerText = "Commit Entry";
        commitButton.onclick = async () => {
            // If any field is empty, stop now.
            if (keyInput1 && !keyInput1.value) return;
            if (keyInput2 && !keyInput2.value) return;
            if (valueInput && !valueInput.value) return;

            let newKey, newValue, newComment;
            if (keyInput1 && !keyInput2) newKey = keyInput1.value;
            else if (keyInput1 && keyInput2) newKey = [keyInput1.value, keyInput2.value];
            if (valueInput) newValue = valueInput.value;
            newComment = commentInput.value;

            if (confirm("Commit updated entry?")) {
                await this.database.deleteEntry(oldKey, position, container, newComment);
                await this.database.addEntry(newKey, newValue, container, newComment);
            }
            await this.displayPage(...unwrapHash(window.location.hash));
        };

        const abortButton = this.createElement("button", buttonContainer);
        abortButton.innerText = "Abort";
        abortButton.onclick = async () => {
            await this.displayEntry(oldKey, oldValue, position, container);
        };
    }

    /**
     * @returns true if there are no previous pages.
     */
    isFirstPage(currentPage) {
        return currentPage == 1;
    }

    /**
     * @returns true if there are no following pages.
     */
    isLastPage(currentPage, itemsPerPage, totalEntries) {
        return currentPage * itemsPerPage + itemsPerPage >= totalEntries;
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
