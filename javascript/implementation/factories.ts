/**
 * This file contains functions that need to construct generic Containers or convert from a
 * container of runtime determined type to something else.  Typescript has problems with
 * imports if two classes depend on each other so these functions have been pulled out into
 * something neither Container nor any of its subclasses need directly.
 */
import { Muid, Value, Bytes, AsOf, Entry } from "./typedefs";
import { Container } from "./Container";
import { Directory } from "./Directory";
import { Sequence } from "./Sequence";
import { Box } from "./Box";
import { Role } from "./Role";
import { PairSet } from "./PairSet";
import { PairMap } from "./PairMap";
import { KeySet } from "./KeySet";
import { GinkInstance } from "./GinkInstance";
import { ensure, unwrapValue, builderToMuid, valueToJson, muidTupleToMuid, rehydrate } from "./utils";
import { Behavior, EntryBuilder, ContainerBuilder } from "./builders";
import { Property } from "./Property";
import { Vertex } from "./Vertex";

export async function construct(
    ginkInstance: GinkInstance,
    address: Muid,
    containerBuilder?: ContainerBuilder): Promise<Container> {

    if (address.timestamp === -1) {
        if (address.offset === Behavior.DIRECTORY) return new Directory(ginkInstance, address);
        if (address.offset === Behavior.SEQUENCE) return new Sequence(ginkInstance, address);
        if (address.offset === Behavior.BOX) return new Box(ginkInstance, address);
        if (address.offset === Behavior.PAIR_MAP) return new PairMap(ginkInstance, address);
        if (address.offset === Behavior.PAIR_SET) return new PairSet(ginkInstance, address);
        if (address.offset === Behavior.KEY_SET) return new KeySet(ginkInstance, address);
        if (address.offset === Behavior.ROLE) return new Role(ginkInstance, address);
        if (address.offset === Behavior.PROPERTY) return new Property(ginkInstance, address);
        if (address.offset === Behavior.VERTEX) return new Vertex(ginkInstance, address);
    }

    if (containerBuilder === undefined) {
        const containerBytes = ensure(await ginkInstance.store.getContainerBytes(address));
        containerBuilder = <ContainerBuilder>ContainerBuilder.deserializeBinary(containerBytes);
    }

    if (containerBuilder.getBehavior() == Behavior.BOX)
        return (new Box(ginkInstance, address, containerBuilder));
    if (containerBuilder.getBehavior() == Behavior.SEQUENCE)
        return (new Sequence(ginkInstance, address, containerBuilder));
    if (containerBuilder.getBehavior() == Behavior.KEY_SET)
        return (new KeySet(ginkInstance, address, containerBuilder));
    if (containerBuilder.getBehavior() == Behavior.DIRECTORY)
        return (new Directory(ginkInstance, address, containerBuilder));
    if (containerBuilder.getBehavior() == Behavior.PAIR_SET)
        return (new PairSet(ginkInstance, address, containerBuilder));
    if (containerBuilder.getBehavior() == Behavior.PAIR_MAP)
        return (new PairMap(ginkInstance, address, containerBuilder));
    if (containerBuilder.getBehavior() == Behavior.VERTEX)
        return (new Vertex(ginkInstance, address, containerBuilder));
    if (containerBuilder.getBehavior() == Behavior.VERB)
        throw new Error("Verbs aren't implemented in Type/Javascript yet!");
    if (containerBuilder.getBehavior() == Behavior.PROPERTY)
        return (new Property(ginkInstance, address, containerBuilder));
    if (containerBuilder.getBehavior() == Behavior.ROLE)
        return (new Role(ginkInstance, address, containerBuilder));

    throw new Error(`container type not recognized/implemented: ${containerBuilder.getBehavior()}`);
}

export async function interpret(entry: Entry, ginkInstance: GinkInstance): Promise<Container | Value | undefined> {
    if (entry === undefined || entry.deletion) {
        return undefined;
    }
    if (entry.value !== undefined)
        return entry.value;
    if (entry.pointeeList.length > 0) {
        const muid: Muid = rehydrate(entry.pointeeList[0]);
        return construct(ginkInstance, muid);
    }
    if (typeof (entry.effectiveKey) == "object" && entry.effectiveKey.length == 3 && !(entry.effectiveKey instanceof Uint8Array)) {
        // For a MuidTuple effective key
        return await construct(ginkInstance, muidTupleToMuid(entry.effectiveKey));
    }
    throw new Error(`don't know how to interpret entry: ${JSON.stringify(entry)}`);

}

export async function toJson(value: Value | Container, indent: number | boolean = false, asOf?: AsOf, seen?: Set<string>): Promise<string> {
    ensure(indent === false, "indent not implemented");
    if (value instanceof Container) {
        if (value instanceof Directory || value instanceof Sequence || value instanceof Box) {
            return await value.toJson(indent, asOf, seen);
        }
        if (value instanceof Role || value instanceof PairSet || value instanceof PairMap) {
            return await value.toJson(indent, asOf, seen);
        }
        if (value instanceof KeySet) {
            return await value.toJson(indent, asOf, seen);
        }
        throw new Error(`container type not recognized: ${value}`);
    } else {
        return valueToJson(value);
    }
}

export async function convertEntryBytes(ginkInstance: GinkInstance, entryBytes: Bytes, entryAddress?: Muid): Promise<Value | Container | undefined> {
    ensure(entryBytes instanceof Uint8Array);
    const entryBuilder = <EntryBuilder>EntryBuilder.deserializeBinary(entryBytes);
    if (entryBuilder.hasValue()) {
        return unwrapValue(entryBuilder.getValue());
    }
    if (entryBuilder.hasPointee()) {
        const destAddress = builderToMuid(entryBuilder.getPointee(), entryAddress);
        return await construct(ginkInstance, destAddress);
    }
    if (entryBuilder.getDeletion()) {
        return undefined;
    }
    throw new Error("unsupported entry type");
}

/*
* I can't import List, Directory, etc. into this Container.ts because it will cause the inherits clauses to break.
* So anything that creates containers from the Container class has to be implemented elsewhere and patched in.
*/
Container._getBackRefsFunction = function (instance: GinkInstance, pointingTo: Container, asOf?: AsOf):
    AsyncGenerator<[KeyType | Muid | undefined, Container], void, unknown> {
    return (async function* () {
        const entries = await instance.store.getBackRefs(pointingTo.address);
        for (const entry of entries) {
            const containerMuid = muidTupleToMuid(entry.containerId);
            const entryMuid = muidTupleToMuid(entry.entryId);
            const there = await instance.store.getEntryById(entryMuid, asOf);
            if (!there) continue;
            const containerBytes = await instance.store.getContainerBytes(containerMuid);
            const containerBuilder = <ContainerBuilder>ContainerBuilder.deserializeBinary(containerBytes);
            if (entry.behavior == Behavior.DIRECTORY) {
                yield <[KeyType | Muid | undefined, Container]>
                    [entry.effectiveKey, new Directory(instance, containerMuid, containerBuilder)];
            }
            if (entry.behavior == Behavior.SEQUENCE) {
                yield [entryMuid, new Sequence(instance, containerMuid, containerBuilder)];
            }
            if (entry.behavior == Behavior.BOX) {
                yield [undefined, new Box(instance, containerMuid, containerBuilder)];
            }
        }
    })();
};
