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
        this.pageType = "container";

        // Get data from database
        const container = await this.database.getContainer(strMuid);
        const totalEntries = await this.database.getTotalEntries(container);

        // Before we display anything, make sure the page and items per page actually makes sense.
        if (((currentPage - 1) * itemsPerPage) >= totalEntries) {
            // Eventually want a better solution than this, since the hash will be wrong
            currentPage = Math.floor(totalEntries / itemsPerPage);
        }

        const [keyType, valueType] = determineContainerStorage(container);

        await this.writeTitle(container);

        // Add entry button
        const addEntryButton = this.createElement("button", this.root, "add-entry-button");
        addEntryButton.innerText = "Add Entry";
        addEntryButton.onclick = async () => {
            await this.displayAddEntry(container);
        };

        // If there are no entries, stop here.
        if (totalEntries == 0) {
            const p = this.createElement("p", this.root);
            p.innerText = "No entries.";
            return;
        }

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
        const upperBound = (currentPage - 1) * itemsPerPage + itemsPerPage;
        const maxEntries = upperBound >= totalEntries ? totalEntries : upperBound;
        showing.innerText = `Showing entries ${lowerBound}-${maxEntries}`;

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

        const pageOfEntries = await this.database.getPageOfEntries(container, currentPage, itemsPerPage);

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
        if (pageOfEntries.length) {
            if (keyType == "none") gink.ensure(pageOfEntries[0][0] == undefined);
            else if (keyType != "none") gink.ensure(pageOfEntries[0][0] != undefined);
            if (valueType == "none") gink.ensure(pageOfEntries[0][1] == undefined);
            else if (valueType != "none") gink.ensure(pageOfEntries[0][1] != undefined);
        }

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
                keyCell.innerText = await this.getCellValue(key);
            }
            if (value != undefined) {
                const valCell = this.createElement("td", row);
                valCell.innerText = await this.getCellValue(value);
            }
            position++;
        }
    }

    /**
     * Displays the page to add a new entry to the database.
     * @param {Container} container gink container as context for displaying entry.
     */
    async displayAddEntry(container) {
        this.clearChildren(this.root);
        this.pageType = "add-entry";
        const [keyType, valueType] = determineContainerStorage(container);

        await this.writeTitle(container);
        this.writeCancelButton();

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
                keyInput1.setAttribute("list", "datalist-1");
                const datalist1 = this.createElement("datalist", keyInput1, "datalist-1");
                await this.enableContainersAutofill(datalist1);
            }
            if (keyType == "pair") {
                keyInput2 = this.createElement("input", keyContainer, "key-input-2", "commit-input");
                keyInput2.setAttribute("type", "text");
                keyInput2.setAttribute("placeholder", "Muid");
                keyInput2.setAttribute("list", "datalist-2");
                const datalist2 = this.createElement("datalist", keyInput2, "datalist-2");
                await this.enableContainersAutofill(datalist2);
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

        // Comment inputs
        const commentContainer = this.createElement("div", entryFields, undefined, "input-container");
        const commentH2 = this.createElement("h2", commentContainer);
        commentH2.innerText = "Comment";
        const commentInput = this.createElement("input", commentContainer, "comment-input", "commit-input");
        commentInput.setAttribute("type", "text");
        commentInput.setAttribute("placeholder", "Commit message (optional)");

        // Button to commit entry
        const submitButton = this.createElement("button", entryFields, "commit-button");
        submitButton.innerText = 'Commit Entry';
        submitButton.onclick = async () => {
            // If any field is empty don't let submission go any further.
            if (keyInput1 && !keyInput1.value) return;
            if (keyInput2 && !keyInput2.value) return;
            if (valueInput && !valueInput.value) return;

            let newKey, newValue, newComment;
            if (keyInput1 && !keyInput2) {
                if (keyType == "muid") {
                    newKey = gink.strToMuid(keyInput1.value);
                }
                else {
                    newKey = keyInput1.value;
                }
            }
            else if (keyInput1 && keyInput2) newKey = [gink.strToMuid(keyInput1.value), gink.strToMuid(keyInput2.value)];
            if (valueInput) newValue = valueInput.value;
            newComment = commentInput.value;

            if (confirm("Commit entry?")) {
                await this.database.addEntry(interpretKey(newKey, container), newValue, container, newComment);
            }
            await this.displayPage(...this.unwrapHash(window.location.hash));
        };
    }

    /**
     * Display a particular entry within a gink container.
     * @param {*} key the key of the entry (may be undefined if container doesn't use keys)
     * @param {*} value the value of the entry (may be undefined if container doesn't use values)
     * @param {number} position the position of the entry. this is only used for sequences.
     * @param {Container} container the gink container as context for the entry.
     */
    async displayEntry(key, value, position, container) {
        this.clearChildren(this.root);
        this.pageType = "entry";

        await this.writeTitle(container);
        this.writeCancelButton();

        const entryContainer = this.createElement("div", this.root, "view-entry", "entry-container");
        if (key != undefined) {
            const keyContainer = this.createElement("div", entryContainer, undefined, "input-container");
            const keyH2 = this.createElement("h2", keyContainer);
            keyH2.innerText = "Key";
            // Determines whether value needs to be a link to another container, etc.
            keyContainer.innerHTML += await this.entryValueAsHtml(key);
        }

        if (value != undefined) {
            const valueContainer = this.createElement("div", entryContainer, undefined, "input-container");
            const valueH2 = this.createElement("h2", valueContainer);
            valueH2.innerText = "Value";
            // Determines whether value needs to be a link to another container, etc.
            valueContainer.innerHTML += await this.entryValueAsHtml(value);
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
                await this.database.deleteEntry(interpretKey(key, container), position, container);
            }
            await this.displayPage(...this.unwrapHash(window.location.hash));
        };
    }

    /**
     * Displays the page to update an existing entry.
     * @param {*} oldKey previous key from entry page.
     * @param {*} oldValue previous value from entry page.
     * @param {number} position position of the entry. only used if container is a sequence.
     * @param {Container} container gink container for context.
     */
    async displayUpdateEntry(oldKey, oldValue, position, container) {
        this.clearChildren(this.root);
        this.pageType = "update";
        const [keyType, valueType] = determineContainerStorage(container);

        await this.writeTitle(container);
        this.writeCancelButton();

        // Main entry container
        const entryContainer = this.createElement("div", this.root, "view-entry", "entry-container");
        let keyInput1, keyInput2, valueInput;
        // Key - 2 inputs if container uses pairs, 1 input if container uses keys
        if (oldKey != undefined) {
            const keyH2 = this.createElement("h2", entryContainer);
            keyH2.innerText = "Key";
            keyInput1 = this.createElement("input", entryContainer, "key-input-1", "commit-input");
            if (keyType == "pair") {
                keyInput2 = this.createElement("input", entryContainer, "key-input-2", "commit-input");
                keyInput1.setAttribute("placeholder", gink.muidToString(oldKey[0]));
                keyInput2.setAttribute("placeholder", gink.muidToString(oldKey[1]));

                keyInput1.setAttribute("list", "datalist-1");
                const datalist1 = this.createElement("datalist", keyInput1, "datalist-1");
                await this.enableContainersAutofill(datalist1);

                keyInput2.setAttribute("list", "datalist-2");
                const datalist2 = this.createElement("datalist", keyInput2, "datalist-2");
                await this.enableContainersAutofill(datalist2);
            } else if (keyType == "muid") {
                keyInput1.setAttribute("placeholder", gink.muidToString(oldKey.address));

                keyInput1.setAttribute("list", "datalist-1");
                const datalist1 = this.createElement("datalist", keyInput1, "datalist-1");
                await this.enableContainersAutofill(datalist1);
            } else {
                keyInput1.setAttribute("placeholder", oldKey);
            }
        }
        // Value  - 1 input if container uses values
        if (oldValue != undefined) {
            const valueH2 = this.createElement("h2", entryContainer);
            valueH2.innerText = "Value";
            valueInput = this.createElement("input", entryContainer, "value-input", "commit-input");
            valueInput.setAttribute("placeholder", oldValue);
        }
        // Comment - optional for user
        const commentH2 = this.createElement("h2", entryContainer);
        commentH2.innerText = "Comment";
        const commentInput = this.createElement("input", entryContainer, "comment-input", "commit-input");
        commentInput.setAttribute("placeholder", "Commit Message (optional)");

        // Commit and Abort buttons
        const buttonContainer = this.createElement("div", this.root, "commit-abort-container");
        const commitButton = this.createElement("button", buttonContainer, "commit-button");
        commitButton.innerText = "Commit Entry";
        commitButton.onclick = async () => {
            // Assume nothing has changed until we see what user has input.
            let newKey = oldKey;
            if (keyType == "pair") {
                gink.ensure(keyInput1 && keyInput2);
                let muid1 = oldKey[0];
                let muid2 = oldKey[1];
                if (keyInput1.value) {
                    muid1 = keyInput1.value;
                }
                if (keyInput2.value) {
                    muid2 = keyInput2.value;
                }
                newKey = [muid1, muid2];
            } else if (keyType != "none") {
                gink.ensure(keyInput1 && !keyInput2);
                if (keyInput1.value) {
                    newKey = keyInput1.value;
                }

            }
            let newValue = oldValue;
            if (valueType != "none") {
                gink.ensure(valueInput);
                if (valueInput.value) {
                    newValue = valueInput.value;
                }
            }
            // Its ok if comment has no value, the database will handle that.
            let newComment = commentInput.value;

            // Nothing has changed. Should this go back to container screen?
            if ((newKey == oldKey) && (newValue == oldValue)) return;

            if (confirm("Commit updated entry?")) {
                await this.database.deleteEntry(interpretKey(oldKey, container), position, container, newComment);
                await this.database.addEntry(interpretKey(newKey, container), newValue, container, newComment);
            }
            await this.displayPage(...this.unwrapHash(window.location.hash));
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
        return (currentPage - 1) * itemsPerPage + itemsPerPage >= totalEntries;
    }

    /**
     * Unwraps an expected hash into:
     * string muid, page, items per page
     * Expecting : FFFFFFFFFFFFFF-FFFFFFFFFFFFF-00004+3+10
     * 3 = page, 10 = items per page
     * If only a muid is present, assume page 1, 10 items.
     * @param {string} hash
     * @returns an Array of [stringMuid, pageNumber, itemsPerPage]
     */
    unwrapHash(hash) {
        let stringMuid = "FFFFFFFFFFFFFF-FFFFFFFFFFFFF-00004";
        let pageNumber = 1;
        let itemsPerPage = 10;
        if (window.location.hash == '#self') {
            stringMuid = gink.muidToString(this.database.getSelfContainer().address);
        }
        else if (hash) {
            hash = hash.substring(1);
            let splitHash = hash.split("+");
            stringMuid = splitHash[0];
            if (!(splitHash.length == 1)) {
                pageNumber = splitHash[1];
                itemsPerPage = splitHash[2];
            }
        }
        return [stringMuid, Number(pageNumber), Number(itemsPerPage)];
    }

    /**
     * Fills a datalist element with options of all containers that exist
     * in the store.
     * @param {HTMLDataListElement} htmlDatalistElement
     */
    async enableContainersAutofill(htmlDatalistElement) {
        gink.ensure(htmlDatalistElement instanceof HTMLDataListElement, "Can only fill datalist");
        const containers = await this.database.getAllContainers();
        for (const [strMuid, container] of containers) {
            const option = document.createElement("option");
            option.value = strMuid;
            htmlDatalistElement.appendChild(option);
        }
    }

    /**
     * For the entry page - interprets the value and converts it into fitting html
     * For example, takes a gink.Container and makes it a link to its container page.
     * @param {*} value a string, container, or array of 2 containers (pair)
     * @returns a string of HTML
     */
    async entryValueAsHtml(value) {
        let asHtml;
        if (Array.isArray(value) && value.length == 2 && value[0].timestamp) {
            let container1 = await this.database.getContainer(value[0]);
            let container2 = await this.database.getContainer(value[1]);
            asHtml = `
            <div id="pair-key-container">
                <strong><a href="#${gink.muidToString(container1.address)}+1+10">${container1.constructor.name}</a></strong>, <strong><a href="#${gink.muidToString(container2.address)}+1+10">${container2.constructor.name}</a></strong>
            </div>
        `;
        }
        else if (value instanceof gink.Container) {
            asHtml = `<strong><a href="#${gink.muidToString(value.address)}+1+10">${value.constructor.name}(${gink.muidToString(value.address)})</a></strong>`;
        } else {
            value = unwrapToString(value);
            asHtml = `<p>${value}</p>`;
        }
        return asHtml;
    }

    /**
     * Takes a value of a number, string, or gink.Container,
     * and decides how the value should be displayed in the cell.
     * @param {*} value
     */
    async getCellValue(value) {
        let cellValue;
        if (Array.isArray(value) && value.length == 2 && value[0].timestamp) {
            let container1 = await this.database.getContainer(value[0]);
            let container2 = await this.database.getContainer(value[1]);
            cellValue = `${container1.constructor.name}-${container2.constructor.name}`;
        }
        else if (value instanceof gink.Container) {
            cellValue = `${value.constructor.name}(${gink.muidToString(value.address)})`;
        } else {
            value = unwrapToString(value);
            if (value.length > 20) {
                cellValue = shortenedString(value);
            }
            else {
                cellValue = value;
            }
        }
        return cellValue;
    }

    /**
     * Changes the title and header elements of the container page.
     */
    async writeTitle(container) {
        let titleContainer = this.getElement("#title-container");
        if (titleContainer != undefined) {
            this.clearChildren(titleContainer);
        } else {
            titleContainer = this.createElement("div", this.root, "title-container");
        }

        const title = this.createElement("h2", titleContainer, "title-bar");
        const muid = container.address;

        let containerName = await this.database.getContainerName(container);

        if (containerName == undefined) {
            if (muid.timestamp == -1 && muid.medallion == -1 && muid.offset == 4) {
                containerName = "Root Directory";
            } else {
                containerName = `${container.constructor.name} (${muid.timestamp},${muid.medallion},${muid.offset})`;
            }
        }
        title.innerText = containerName;

        title.onclick = async () => {
            await this.writeContainerNameInput(containerName, container);
        };
    }

    async writeContainerNameInput(previousName, container) {
        const titleContainer = this.getElement("#title-container");
        this.clearChildren(titleContainer);

        const containerNameInput = this.createElement("input", titleContainer, "title-input");
        containerNameInput.setAttribute("type", "text");
        containerNameInput.setAttribute("placeholder", previousName);

        const submitButton = this.createElement("button", titleContainer, undefined, "container-name-btn");
        submitButton.innerText = "✓";
        submitButton.onclick = async () => {
            let newName;
            if (!containerNameInput.value) newName = previousName;
            else {
                await this.database.setContainerName(container, containerNameInput.value);
            }
            await this.writeTitle(container);
        };

        const cancelButton = this.createElement("button", titleContainer, undefined, "container-name-btn");
        cancelButton.innerText = "X";
        cancelButton.onclick = async () => {
            await this.writeTitle(container);
        };
    }

    /**
     * Creates an X button at the top left corner of #root.
     */
    writeCancelButton() {
        const cancelButton = this.createElement("button", this.root, "cancel-button");
        cancelButton.innerText = 'X';
        cancelButton.onclick = async () => {
            await this.displayPage(...this.unwrapHash(window.location.hash));
        };
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
