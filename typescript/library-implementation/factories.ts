/**
 * This file contains functions that need to constuct generic Containers or convert from a
 * container of runtime determined type to something else.  Typescript has problems with
 * imports if two classes depend on each other so these functions have been pulled out into
 * something neither Container nor any of its subclasses need directly.
 */
import { Container as ContainerBuilder } from "container_pb";
import { Muid, Value, Bytes } from "./typedefs";
import { Container } from "./Container";
import { Directory } from "./Directory";
import { List } from "./List";
import { Box } from "./Box";
import { GinkInstance } from "./GinkInstance";
import { ensure, unwrapValue, builderToMuid, valueToJson } from "./utils";
import { Entry as EntryBuilder } from "entry_pb";

export async function construct(ginkInstance: GinkInstance, address?: Muid, containerBuilder?: ContainerBuilder): Promise<Container> {
    if (!containerBuilder) {
        const containerBytes = ensure(await ginkInstance.store.getContainerBytes(address));
        containerBuilder = ContainerBuilder.deserializeBinary(containerBytes);
    }
    if (containerBuilder.getBehavior() == ContainerBuilder.Behavior.SCHEMA) {
        return (new Directory(ginkInstance, address, containerBuilder));
    }
    if (containerBuilder.getBehavior() == ContainerBuilder.Behavior.QUEUE) {
        return (new List(ginkInstance, address, containerBuilder));
    }
    if (containerBuilder.getBehavior() == ContainerBuilder.Behavior.BOX) {
        return (new Box(ginkInstance, address, containerBuilder));
    }
    throw new Error(`container type not recognized/implemented: ${containerBuilder.getBehavior()}`);
}

export async function toJson(value: Value | Container, indent: number | boolean = false, asOf: number = Infinity, seen?: Set<string>): Promise<string> {
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
    if (entryBuilder.hasDestination()) {
        const destAddress = builderToMuid(entryBuilder.getDestination(), entryAddress)
        return await construct(ginkInstance, destAddress);
    }
    if (entryBuilder.hasDeleting() && entryBuilder.getDeleting()) {
        return undefined;
    }
    throw new Error("unsupported entry type");
}
