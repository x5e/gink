/**
 * This file contains functions that need to constuct generic Containers or convert from a
 * container of runtime determined type to something else.  Typescript has problems with
 * imports if two classes depend on each other so these functions have been pulled out into
 * something neither Container nor any of its subclasses need directly.
 */
import { Container as ContainerBuilder } from "gink/protoc.out/container_pb";
import { Muid, Value, Bytes, AsOf, Entry } from "./typedefs";
import { Container } from "./Container";
import { Directory } from "./Directory";
import { List } from "./List";
import { Box } from "./Box";
import { GinkInstance } from "./GinkInstance";
import { ensure, unwrapValue, builderToMuid, valueToJson, muidTupleToMuid } from "./utils";
import { Entry as EntryBuilder } from "gink/protoc.out/entry_pb";
import { Behavior } from "gink/protoc.out/behavior_pb";

export async function construct(ginkInstance: GinkInstance, address: Muid, containerBuilder?: ContainerBuilder): Promise<Container> {
    if (address.timestamp === -1) {
        if (address.offset === Behavior.SCHEMA) return new Directory(ginkInstance, address);
        if (address.offset === Behavior.QUEUE) return new List(ginkInstance, address);
        if (address.offset === Behavior.BOX) return new Box(ginkInstance, address);
    }
    if (containerBuilder === undefined) {
        const containerBytes = ensure(await ginkInstance.store.getContainerBytes(address));
        containerBuilder = ContainerBuilder.deserializeBinary(containerBytes);
    }
    if (containerBuilder.getBehavior() == Behavior.SCHEMA) return (new Directory(ginkInstance, address, containerBuilder));
    if (containerBuilder.getBehavior() == Behavior.QUEUE) return (new List(ginkInstance, address, containerBuilder));
    if (containerBuilder.getBehavior() == Behavior.BOX) return (new Box(ginkInstance, address, containerBuilder));
    throw new Error(`container type not recognized/implemented: ${containerBuilder.getBehavior()}`);
}

export async function interpret(entry: Entry, ginkInstance: GinkInstance): Promise<Container | Value | undefined> {
    if (entry === undefined || entry.deleting) {
        return undefined;
    }
    if (entry.immediate !== undefined)
        return entry.immediate;
    if (entry.pointeeList.length > 0) {
        const muid: Muid = {
            timestamp: entry.pointeeList[0][0],
            medallion: entry.pointeeList[0][1],
            offset: entry.pointeeList[0][2],
        }
        return construct(ginkInstance, muid);
    }
    throw new Error(`don't know how to interpret entry: ${JSON.stringify(entry)}`);

}

export async function toJson(value: Value | Container, indent: number | boolean = false, asOf?: AsOf, seen?: Set<string>): Promise<string> {
    ensure(indent === false, "indent not implemented");
    if (value instanceof Container) {
        if (value instanceof Directory) {
            return await value.toJson(indent, asOf, seen);
        }
        if (value instanceof List) {
            return await value.toJson(indent, asOf, seen);
        }
        if (value instanceof Box) {
            return await value.toJson(indent, asOf, seen);
        }
        throw new Error(`container type not recognized: ${value}`)
    } else {
        return valueToJson(value);
    }
}

export async function convertEntryBytes(ginkInstance: GinkInstance, entryBytes: Bytes, entryAddress?: Muid): Promise<Value | Container | undefined> {
    ensure(entryBytes instanceof Uint8Array);
    const entryBuilder = EntryBuilder.deserializeBinary(entryBytes);
    if (entryBuilder.hasValue()) {
        return unwrapValue(entryBuilder.getValue());
    }
    if (entryBuilder.hasPointee()) {
        const destAddress = builderToMuid(entryBuilder.getPointee(), entryAddress)
        return await construct(ginkInstance, destAddress);
    }
    if (entryBuilder.hasDeleting() && entryBuilder.getDeleting()) {
        return undefined;
    }
    throw new Error("unsupported entry type");
}


/**
 * Starts an async iterator that returns all of the containers pointing to the object in question.
 * @param pointingTo Object to find things pointing at.
 * @param asOf Effective time to look at.
 * @returns an async generator of [key, Container], where key is they Directory key, or List entry muid, or undefined for Box
 */
Container._getBackRefsFunction = function(instance: GinkInstance, pointingTo: Container, asOf?: AsOf): 
    AsyncGenerator<[KeyType | Muid | undefined, Container], void, unknown> {
    return (async function* () {
        const entries = await instance.store.getBackRefs(pointingTo.address);
        for (const entry of entries) {
            const containerMuid = muidTupleToMuid(entry.containerId);
            const containerBuilder = containerMuid.timestamp === 0 ? undefined :
                ContainerBuilder.deserializeBinary(await instance.store.getContainerBytes(containerMuid));
            if (entry.behavior == Behavior.SCHEMA) {
                if (instance.store.getEntry(containerMuid, entry.semanticKey[0], asOf)) {
                    yield <[KeyType | Muid | undefined, Container]>
                        [entry.semanticKey[0], new Directory(instance, containerMuid, containerBuilder)];
                }
            }
            if (entry.behavior == Behavior.QUEUE) {
                const entryMuid = muidTupleToMuid(entry.entryId);
                if (instance.store.getEntry(containerMuid, entryMuid, asOf)) {
                    yield [entryMuid, new List(instance, containerMuid, containerBuilder)];
                }
            }
            if (entry.behavior == Behavior.BOX) {
                if (instance.store.getEntry(containerMuid, undefined, asOf)) {
                    yield [undefined, new Box(instance, containerMuid, containerBuilder)];
                }
            }
        }
    })();
}