import { Container as ContainerBuilder } from "container_pb";
import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { Basic, Muid } from "./typedefs";
import { ChangeSet } from "./ChangeSet";
import { ensure, muidToBuilder } from "./utils";
import { Exit as ExitBuilder } from "exit_pb";
import { Change as ChangeBuilder } from "change_pb";
import { Entry as EntryBuilder } from "entry_pb";

/**
 * Kind of like the Gink version of a Javascript Array; supports push, pop, shift.
 * Doesn't support unshift at the moment because order is defined by insertion order.
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
     * 
     * @returns The most recently added element.
     */
    async peek(): Promise<Container | Basic> {
        return (await this.getEntry(undefined))[1];
    }

    /**
     * Removes and returns the specified entry of the list (default last),
     * in the provided change set or immedately if no CS is supplied.
     * Returns undefined when called on an empty list (and no changes are made).
     * @param muid 
     * @param changeSet 
     */
    async pop(muid?: Muid, changeSet?: ChangeSet): Promise<Container | Basic | undefined> {
        //TODO(TESTME)
        await this.initialized;
        let returning: Container | Basic;
        if (muid) {
            throw new Error("not implemented");
        } else {
            const result = await this.getEntry(undefined);
            if (!result[0]) return undefined;
            muid = result[0];
            returning = result[1];
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
     * Removes a value from the beginning of the queue and returns it.
     * @param changeSet 
     */
    async shift(changeSet?: ChangeSet): Promise<Container | Basic | undefined> {
        //TODO(TESTME)
        throw new Error("not implemented");
    }

    entries(): AsyncGenerator<[Muid, Container | Basic | undefined], void, unknown> {
        const thisList = this;
        return (async function*(){
            const pairs = await thisList.ginkInstance.store.getVisibleEntries(thisList.address);
            for (const [muid, bytes] of pairs) {
                yield [muid, await thisList.convertEntryBytes(bytes, muid)]
            }
        })();
    }

    async keys(): Promise<void> {
        //TODO(TESTME)
        throw new Error("not implemented");
    }

    async values(): Promise<void> {
        //TODO(TESTME)
        throw new Error("not implemented");
    }

    async at(index: number): Promise<void> {
        //TODO(TESTME)
    }


    async size(): Promise<number> {
        //TODO(TESTME)
        throw new Error("not implemented");
    }

}
