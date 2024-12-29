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
    containerBuilder?: ContainerBuilder,
): Promise<Container> {
    if (address.timestamp === -1) {
        if (address.offset === Behavior.DIRECTORY)
            return Directory.get(database, address);
        if (address.offset === Behavior.SEQUENCE)
            return Sequence.get(database, address);
        if (address.offset === Behavior.BOX) return Box.get(database, address);
        if (address.offset === Behavior.PAIR_MAP)
            return PairMap.get(database, address);
        if (address.offset === Behavior.PAIR_SET)
            return PairSet.get(database, address);
        if (address.offset === Behavior.KEY_SET)
            return KeySet.get(database, address);
        if (address.offset === Behavior.GROUP)
            return Group.get(database, address);
        if (address.offset === Behavior.PROPERTY)
            return Property.get(database, address);
        if (address.offset === Behavior.VERTEX)
            return Vertex.get(database, address);
    }

    if (containerBuilder === undefined) {
        const containerBytes = ensure(
            await database.store.getContainerBytes(address),
        );
        containerBuilder = <ContainerBuilder>(
            ContainerBuilder.deserializeBinary(containerBytes)
        );
    }

    if (containerBuilder.getBehavior() === Behavior.BOX)
        return Box.get(database, address);
    if (containerBuilder.getBehavior() === Behavior.SEQUENCE)
        return Sequence.get(database, address);
    if (containerBuilder.getBehavior() === Behavior.KEY_SET)
        return KeySet.get(database, address);
    if (containerBuilder.getBehavior() === Behavior.DIRECTORY)
        return Directory.get(database, address);
    if (containerBuilder.getBehavior() === Behavior.PAIR_SET)
        return PairSet.get(database, address);
    if (containerBuilder.getBehavior() === Behavior.PAIR_MAP)
        return PairMap.get(database, address);
    if (containerBuilder.getBehavior() === Behavior.VERTEX)
        return Vertex.get(database, address);
    if (containerBuilder.getBehavior() === Behavior.EDGE_TYPE)
        return EdgeType.get(database, address);
    if (containerBuilder.getBehavior() === Behavior.PROPERTY)
        return Property.get(database, address);
    if (containerBuilder.getBehavior() === Behavior.GROUP)
        return Group.get(database, address);

    throw new Error(
        `container type not recognized/implemented: ${containerBuilder.getBehavior()}`,
    );
}

export async function interpret(
    entry: Entry,
    database: Database,
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
        `don't know how to interpret entry: ${JSON.stringify(entry)}`,
    );
}

export async function toJson(
    value: Value | Container,
    indent: number | boolean = false,
    asOf?: AsOf,
    seen?: Set<string>,
): Promise<string> {
    return value instanceof Container
        ? await value.toJson(indent, asOf, seen)
        : valueToJson(value);
}
