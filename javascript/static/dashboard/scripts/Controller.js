class Controller {
    constructor(model, view) {
        this.model = model;
        this.view = view;

        this.container = this.model.getRootContainer();
        this.entries = undefined;
        this.ready = this.init();
    }

    async init() {
        this.entries = await this.model.containerAsArray(this.container);
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
     * To display a page, we need:
     * 1) the container
     * 2) the total number of entries
     * 3) the correct page of entries from that container
     * 4) the current page number
     *
     *
     *
     *
     *
     */


}
