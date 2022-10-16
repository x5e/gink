import { Container as ContainerBuilder } from "container_pb";
import { Muid, Value, Bytes } from "./typedefs";
import { Container } from "./Container";
import { Directory } from "./Directory";
import { List } from "./List";
import { GinkInstance } from "./GinkInstance";
import { ensure, unwrapValue, builderToMuid } from "./utils";
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
    throw new Error(`container type not recognized/implemented: ${containerBuilder.getBehavior()}`);
}

function byteToHex(byte: number) {
    const returning = byte.toString(16).toUpperCase(); 
    return byte < 0x10 ? '0'+returning : returning; 
}

export async function toJson(value: Value|Container, indent: number|boolean, asOf :number, seen: Set<string>): Promise<string> {
    ensure(indent === false, "indent not implemented");
    if (value instanceof Directory) {
        return await value.toJson(indent,asOf,seen);
    }
    if (value instanceof List) {
        return await value.toJson(indent,asOf,seen);
    }
    if (typeof(value) == "string") {
        return `"${value}"`;
    }
    if (typeof(value) == "number" || value === true || value === false || value === null) {
        return `${value}`;
    }
    if (value instanceof Uint8Array) {
        const hexString = Array.from(value).map(byteToHex).join("");
        return `"${hexString}"`;
    }

    throw new Error(`don't know how to convert to JSON: ${value}`);
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
