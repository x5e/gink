import { Container as ContainerBuilder } from "container_pb";
import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { Basic, Muid, MuidBytesPair, MuidContentsPair } from "./typedefs";
import { ChangeSet } from "./ChangeSet";
import { ensure, muidToBuilder } from "./utils";
import { Exit as ExitBuilder } from "exit_pb";
import { Change as ChangeBuilder } from "change_pb";

/**
 * Kind of like the Gink version of a Javascript Array; supports push, pop, shift.
 * Doesn't support unshift because order is defined by insertion order.
 */
export class List extends Container {

    constructor(ginkInstance: GinkInstance, address?: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, containerBuilder);
        if (this.address) {
            ensure(this.containerBuilder.getBehavior() == ContainerBuilder.Behavior.BOX);
        }
    }

    /**
     * Adds an element to the end of the list.
     * @param value 
     * @param changeSet 
     * @returns 
     */
    async push(value: Basic | Container, changeSet?: ChangeSet): Promise<Muid> {
        return await this.addEntry(undefined, value, changeSet);
    }

    /**
     * Removes and returns the specified entry of the list (default last),
     * in the provided change set or immedately if no CS is supplied.
     * Returns undefined when called on an empty list (and no changes are made).
     * @param muid 
     * @param changeSet 
     */
    async pop(what?: Muid | number, changeSet?: ChangeSet): Promise<Container | Basic | undefined> {
        await this.initialized;
        let returning: Container | Basic;
        let muid: Muid;
        if (what && typeof (what) == "object") {
            muid = what;
            const entry = await this.ginkInstance.store.getEntry(this.address, muid);
            ensure(entry[0].timestamp == muid.timestamp && entry[0].offset == muid.offset);
            returning = await this.convertEntryBytes(entry[1], muid);
        } else {
            what = (typeof (what) == "number") ? what : -1;
            // Should probably change the implementation to not copy all intermediate entries into memory.
            const changePairs = await this.ginkInstance.store.getVisibleEntries(this.address, what)
            if (changePairs.length == 0) return undefined;
            const changePair = changePairs.at(-1);
            returning = await this.convertEntryBytes(changePair[1], changePair[0]);
            muid = changePair[0];
        }
        let immediate: boolean = false;
        if (!changeSet) {
            immediate = true;
            changeSet = new ChangeSet();
        }
        const exitBuilder = new ExitBuilder();
        exitBuilder.setEntry(muidToBuilder(muid));
        exitBuilder.setSource(muidToBuilder(this.address));
        const changeBuilder = new ChangeBuilder();
        changeBuilder.setExit(exitBuilder);
        changeSet.addChange(changeBuilder);
        if (immediate) {
            await this.ginkInstance.addChangeSet(changeSet);
        }
        return returning;
    }

    /**
     * Alias for this.pop(0, changeSet)
     */
    async shift(changeSet?: ChangeSet): Promise<Container | Basic | undefined> {
        return await this.pop(0, changeSet)
    }

    /**
     * 
     * @param index Index to look for the thing, negative counts from end.
     * @param asOf 
     * @returns value at the position of the list, or undefined if list is too small
     */
    async at(index: number, asOf: number=Infinity) {
        const pairs = await this.ginkInstance.store.getVisibleEntries(this.address, index, asOf);
        if (pairs.length == 0) return undefined;
        if (index >= 0 && pairs.length < index+1) return undefined;
        if (index < 0 && pairs.length < -index) return undefined;
        const [muid, bytes] = pairs.at(-1);
        return this.convertEntryBytes(bytes, muid);
    }

    async toArray(asOf: number=Infinity, through: number = Infinity): Promise<(Container | Basic)[]> {
        const thisList = this;
        const pairs: MuidBytesPair[] = await thisList.ginkInstance.store.getVisibleEntries(thisList.address, through, asOf);
        const transformed = await Promise.all(pairs.map(async function (changePair: MuidBytesPair): Promise<Container | Basic> {
            return await thisList.convertEntryBytes(changePair[1], changePair[0])
        }));
        return transformed;
    }

    async size(asOf: number=Infinity): Promise<number> {
        //TODO(TESTME)
        const pairs: MuidBytesPair[] = await this.ginkInstance.store.getVisibleEntries(this.address, Infinity, asOf);
        return pairs.length;
    }

    entries(asOf: number=Infinity, through: number=Infinity): AsyncGenerator<MuidContentsPair, void, unknown> {
        const thisList = this;
        return (async function*(){
            // Note: loading all entry data into memory despite using an async generator due to shitty IndexedDb 
            // behavior of closing transactions when you await on something else.  Hopefully they'll fix that in
            // the future and I can improve this.  Alternative, it might make sense to hydrate everything in a single pass.
            const pairs = await thisList.ginkInstance.store.getVisibleEntries(thisList.address, through, asOf);
            for (const pair of pairs) {
                const hydrated = await thisList.convertEntryBytes(pair[1], pair[0]);
                const yielding: MuidContentsPair = [pair[0], hydrated];
                yield yielding;
            }
        })();
    }

}
