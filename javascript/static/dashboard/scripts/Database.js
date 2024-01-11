class Database {
    constructor(store, instance) {
        if (!store) {
            store = new gink.IndexedDbStore();
        }
        if (!instance) {
            instance = new gink.GinkInstance(store);
        }
        this.store = store;
        this.instance = instance;
    }

    /**
     * Get the base container for the view to start with.
     * @returns the first container for the view to display.
     */
    getRootContainer() {
        return this.instance.getGlobalDirectory();
    }

    /**
     * Takes a string muid or Muid object and returns it
     * constructed as a container from the instance.
     * @param {string || Container} muid
     */
    async getContainer(muid) {
        if (typeof muid == "string") {
            muid = gink.strToMuid(muid);
        }
        return await gink.construct(this.instance, muid);
    }

    /**
     * Gets all container tuples in the store and returns them as an array
     * of [strMuid, Container] key, value pairs.
     * @returns an Array of [strMuid, Container]
     */
    async getAllContainers() {
        // Fill an object of strMuid -> Container entries
        const globalDir = this.instance.getGlobalDirectory();
        const allContainers = {
            [`${gink.muidToString(globalDir.address)}`]: globalDir,
        };
        const containerTuples = await this.store.getAllContainerTuples();
        for (const tuple of containerTuples) {
            allContainers[gink.muidTupleToString(tuple)] = await gink.construct(this.instance, gink.muidTupleToMuid(tuple));
        }
        return Object.entries(allContainers);
    }

    /**
     * Gets a subset of the entries array based on the current page and the items per page.
     * @returns a sub Array containing the entries for the current page.
     */
    async getPageOfEntries(container, page, itemsPerPage) {
        // IMPORTANT: A page, in this context, starts at 1, not 0.
        // Need to subtract 1 from the page to avoid errors.
        gink.ensure(container instanceof gink.Container);
        gink.ensure(typeof page == "number" && typeof itemsPerPage == "number");
        const entries = await this.containerAsArray(container);

        let lowerBound = (page - 1) * itemsPerPage;
        if (lowerBound < 0) lowerBound = 0;
        else if (lowerBound > entries.length) lowerBound = entries.length;

        let upperBound = (page - 1) * itemsPerPage + itemsPerPage;
        if (upperBound < 0) upperBound = 0;
        else if (upperBound > entries.length) upperBound = entries.length;

        return entries.slice(lowerBound, upperBound);
    }

    /**
     * Get the total number of entries in a gink container.
     * @param {Container} container
     * @returns the number of entries in a container.
     */
    async getTotalEntries(container) {
        return (await this.containerAsArray(container)).length;
    }

    /**
     * Returns a container's contents as an array. To standardize how these arrays will be
     * iterable, every array, regardless of whether they actually have both keys and values,
     * will use the form [[key, value],...]
     * if the container does not use keys, key will be undefined.
     * This is to ensure we can always loop through entries with [key, value] and we don't
     * need to perform any annoying checking for type of container.
     * @param {Container} container
     * @returns an Array of the container's contents.
     */
    async containerAsArray(container) {
        let arr, tmp;
        switch (container.behavior) {
            case 1: // Box
                arr = [[undefined, await container.get()]];
                break;
            case 2: // Sequence
                tmp = await container.toArray();
                arr = [];
                for (const value of tmp) {
                    arr.push([undefined, value]);
                }
                break;
            case 3: // KeySet
                tmp = await container.toSet();
                arr = [];
                for (const key of tmp) {
                    arr.push([key, undefined]);
                }
                break;
            case 4:
                arr = Array.from((await container.toMap()).entries());
                break;
            case 5: // PairSet
                tmp = await container.getPairs();
                arr = [];
                for (const key of tmp) {
                    arr.push([key, undefined]);
                }
                break;
            case 6: // PairMap
                arr = Array.from((await container.items()).entries());
                break;
            case 10: // Role
                tmp = await container.includedAsArray();
                arr = [];
                for (const key of tmp) {
                    arr.push([key, undefined]);
                }
                break;
            default:
                throw new Error(`not sure how to get entries for ${container.constructor.name}`);
        }
        return arr;
    }

    /**
     * Standardizes adding entries to gink containers.
     * @param {*} key optional key if adding to a key, value container.
     * @param {*} val optional value to add to database.
     */
    async addEntry(key, val, container, comment) {
        if (!comment) {
            comment = "entry added from dashboard";
        }

        let errMsg;
        gink.ensure(key || val, 'Need to specify key or value');
        gink.ensure(container, 'Need to specify container.');
        const [keyType, valueType] = determineContainerStorage(container);
        if (key) gink.ensure(keyType != "none", 'container doesnt use keys');
        if (val) gink.ensure(valueType != "none", 'container doesnt use values');
        switch (container.behavior) {
            case 1: // Box
                await container.set(val, comment);
                break;
            case 2: // Sequence
                await container.push(val, comment);
                break;
            case 3: // KeySet
                await container.add(key, comment);
                break;
            case 4: // Directory
                await container.set(key, val, comment);
                break;
            case 5: // PairSet
                errMsg = `Expecting array of 2 string muids. Ex: [FFFFFFFFFFFFFF-6734543837984-00004,FFFFFFFFFFFFFF-6734543837984-00004]`;
                try {
                    await container.include([gink.strToMuid(key[0]), gink.strToMuid(key[1])], comment);
                } catch {
                    console.error(errMsg);
                }
                break;
            case 6: // PairMap
                errMsg = `Key is expecting array of 2 string muids. Ex: [FFFFFFFFFFFFFF-6734543837984-00004,FFFFFFFFFFFFFF-6734543837984-00004]`;
                try {
                    await container.set([gink.strToMuid(key[0]), gink.strToMuid(key[1])], val, comment);
                } catch {
                    console.error(errMsg);
                }
                break;
            case 9:
                // REMEMBER TO ADD PROPERTY HERE!!
                break;
            case 10: // Role
                try {
                    await container.include(gink.strToMuid(key), comment);
                } catch {
                    console.error('Expecting muid as string. Ex:FFFFFFFFFFFFFF-6734543837984-00004');
                }
                break;
            default:
                throw new Error(`not sure how to add entry to ${container.constructor.name}`);
        }
    }

    /**
     * Standarizes deletion between containers.
     * @param {*} key key to be deleted
     * @param {number} position the position in the sequence to pop.
     * @param {*} container the Gink Container to perform the deletion.
     */
    async deleteEntry(key, position, container, comment) {
        if (!comment) {
            comment = "deleted from dashboard";
        }
        switch (container.behavior) {
            case 1: // Box
                await container.clear(false, comment);
                break;
            case 2: // Sequence
                gink.ensure(typeof position == "number", "invalid position arg");
                await container.pop(position, false, comment);
                break;
            case 3: // KeySet
                await container.delete(key, comment);
                break;
            case 4: // Directory
                await container.delete(key, comment);
                break;
            case 5: // PairSet
                msg = `Expecting array of 2 string muids. Ex: [FFFFFFFFFFFFFF-6734543837984-00004,FFFFFFFFFFFFFF-6734543837984-00004]`;
                try {
                    await container.exclude([gink.strToMuid(key[0]), gink.strToMuid(key[1])], comment);
                } catch {
                    console.error(msg);
                }
                break;
            case 6: // PairMap
                msg = `Key is expecting array of 2 string muids. Ex: [FFFFFFFFFFFFFF-6734543837984-00004,FFFFFFFFFFFFFF-6734543837984-00004]`;
                try {
                    await container.delete([gink.strToMuid(key[0]), gink.strToMuid(key[1])], comment);
                } catch {
                    console.error(msg);
                }
            case 10: // Role
                try {
                    await container.exclude(gink.strToMuid(key), comment);
                } catch {
                    console.error('Expecting muid as string. Ex:FFFFFFFFFFFFFF-6734543837984-00004');
                }
                break;
            default:
                throw new Error(`not sure how to delete entry from ${container.constructor.name}`);
        }
    }
}
