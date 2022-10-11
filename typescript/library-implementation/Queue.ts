import { Container as ContainerBuilder } from "container_pb";
import { GinkInstance } from "./GinkInstance";
import { Container } from "./Container";
import { Basic, Muid } from "./typedefs";
import { ChangeSet } from "./ChangeSet";
import { ensure } from "./utils";

/**
 * Kind of like the Gink version of a Javascript Array; supports push, pop, shift.
 * Doesn't support unshift at the moment because order is defined by insertion order.
 */
export class Queue extends Container {

    constructor(ginkInstance: GinkInstance, address?: Muid, containerBuilder?: ContainerBuilder) {
        super(ginkInstance, address, containerBuilder);
        if (this.address) {
            ensure(this.containerBuilder.getBehavior() == ContainerBuilder.Behavior.BOX);
        }
    }

    /**
     * Adds an element to the end of the queue.
     * @param value 
     * @param changeSet 
     * @returns 
     */
    async push(value: Basic | Container, changeSet?: ChangeSet): Promise<Muid> {
        //TODO(TESTME)
        return await this.addEntry(undefined, value, changeSet);
    }

    /**
     * Returns 
     * @param muid 
     * @param changeSet 
     */
    async pop(muid?: Muid, changeSet?: ChangeSet): Promise<Container | Basic | undefined> {
        //TODO(TESTME)
        throw new Error("not implemented");
    }

    /**
     * Removes a value from the beginning of the queue and returns it.
     * @param changeSet 
     */
    async shift(changeSet?: ChangeSet): Promise<Container | Basic | undefined> {
        //TODO(TESTME)
        throw new Error("not implemented");
    }

    async entries(): Promise<void> {
        //TODO(TESTME)
        throw new Error("not implemented");
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