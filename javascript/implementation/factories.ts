/**
 * This file contains functions that need to construct generic Containers or convert from a
 * container of runtime determined type to something else.  Typescript has problems with
 * imports if two classes depend on each other so these functions have been pulled out into
 * something neither Container nor any of its subclasses need directly.
 */
import { Muid, Value, AsOf, Entry } from "./typedefs";
import { Container } from "./Container";
import { Directory } from "./Directory";
import { Sequence } from "./Sequence";
import { Box } from "./Box";
import { Group } from "./Group";
import { PairSet } from "./PairSet";
import { PairMap } from "./PairMap";
import { KeySet } from "./KeySet";
import { Database } from "./Database";
import { ensure, valueToJson, muidTupleToMuid, rehydrate } from "./utils";
import { Behavior, ContainerBuilder } from "./builders";
import { Property } from "./Property";
import { Vertex } from "./Vertex";
import { EdgeType } from "./EdgeType";

export async function construct(
    database: Database,
    address: Muid,
    containerBuilder?: ContainerBuilder
): Promise<Container> {
    if (address.timestamp === -1) {
        if (address.offset === Behavior.DIRECTORY)
            return new Directory(database, address);
        if (address.offset === Behavior.SEQUENCE)
            return new Sequence(database, address);
        if (address.offset === Behavior.BOX) return new Box(database, address);
        if (address.offset === Behavior.PAIR_MAP)
            return new PairMap(database, address);
        if (address.offset === Behavior.PAIR_SET)
            return new PairSet(database, address);
        if (address.offset === Behavior.KEY_SET)
            return new KeySet(database, address);
        if (address.offset === Behavior.GROUP)
            return new Group(database, address);
        if (address.offset === Behavior.PROPERTY)
            return new Property(database, address);
        if (address.offset === Behavior.VERTEX)
            return new Vertex(database, address);
    }

    if (containerBuilder === undefined) {
        const containerBytes = ensure(
            await database.store.getContainerBytes(address)
        );
        containerBuilder = <ContainerBuilder>(
            ContainerBuilder.deserializeBinary(containerBytes)
        );
    }

    if (containerBuilder.getBehavior() === Behavior.BOX)
        return new Box(database, address, containerBuilder);
    if (containerBuilder.getBehavior() === Behavior.SEQUENCE)
        return new Sequence(database, address, containerBuilder);
    if (containerBuilder.getBehavior() === Behavior.KEY_SET)
        return new KeySet(database, address, containerBuilder);
    if (containerBuilder.getBehavior() === Behavior.DIRECTORY)
        return new Directory(database, address, containerBuilder);
    if (containerBuilder.getBehavior() === Behavior.PAIR_SET)
        return new PairSet(database, address, containerBuilder);
    if (containerBuilder.getBehavior() === Behavior.PAIR_MAP)
        return new PairMap(database, address, containerBuilder);
    if (containerBuilder.getBehavior() === Behavior.VERTEX)
        return new Vertex(database, address, containerBuilder);
    if (containerBuilder.getBehavior() === Behavior.EDGE_TYPE)
        return new EdgeType(database, address, containerBuilder);
    if (containerBuilder.getBehavior() === Behavior.PROPERTY)
        return new Property(database, address, containerBuilder);
    if (containerBuilder.getBehavior() === Behavior.GROUP)
        return new Group(database, address, containerBuilder);

    throw new Error(
        `container type not recognized/implemented: ${containerBuilder.getBehavior()}`
    );
}

export async function interpret(
    entry: Entry,
    database: Database
): Promise<Container | Value | undefined> {
    if (entry === undefined || entry.deletion) {
        return undefined;
    }
    if (entry.value !== undefined) return entry.value;
    if (entry.pointeeList.length > 0) {
        const muid: Muid = rehydrate(entry.pointeeList[0]);
        return construct(database, muid);
    }
    if (Array.isArray(entry.storageKey) && entry.storageKey.length === 3) {
        // For a MuidTuple effective key
        return await construct(database, muidTupleToMuid(entry.storageKey));
    }
    throw new Error(
        `don't know how to interpret entry: ${JSON.stringify(entry)}`
    );
}

export async function toJson(
    value: Value | Container,
    indent: number | boolean = false,
    asOf?: AsOf,
    seen?: Set<string>
): Promise<string> {
    return value instanceof Container
        ? await value.toJson(indent, asOf, seen)
        : valueToJson(value);
}
