/**
 * Herein lay a bunch of utility functions, mostly for creating and
 * manipulating the types defined in typedefs.ts.
 */

import { Muid, Medallion, Value, MuidTuple, KeyType } from "./typedefs";
import {
    MuidBuilder,
    ValueBuilder,
    KeyBuilder,
    Special,
    TimestampBuilder,
    TupleBuilder, DocumentBuilder
} from "./builders";

export function ensure(x: any, msg?: string) {
    if (!x)
        throw new Error(msg ?? "assert failed");
    return x;
}

let lastTime = 0;
export function generateTimestamp(): number {
    // TODO: there's probably a better way ...
    let current = Date.now() * 1000;
    if (lastTime >= current) {
        current = lastTime + 1;
    }
    lastTime = current;
    return current;
}

export function noOp(_?) { ensure(true);}

/**
 * Randomly selects a number that can be used as a medallion.
 * Note that this doesn't actually have to be cryptographically secure;
 * as long as it's unique within an organization there won't be problems.
 * This is unlikely to cause collisions as long as an organization
 * has fewer than a million instances, after that some tracking is warranted.
 * https://en.wikipedia.org/wiki/Birthday_problem#Probability_table
 * @returns Random number between 2**48 and 2**49 (exclusive)
 */
export function makeMedallion() {
    const crypto = globalThis["crypto"];
    if (crypto) {
        const getRandomValues = crypto["getRandomValues"]; // defined in browsers
        if (getRandomValues) {
            const array = new Uint16Array(3);
            globalThis.crypto.getRandomValues(array);
            return 2 ** 48 + (array[0] * 2 ** 32) + (array[1] * 2 ** 16) + array[2];
        }
        const randomInt = crypto["randomInt"];  // defined in some versions of node
        if (randomInt) {
            return randomInt((2 ** 48) + 1, (2 ** 49) - 1);
        }
    }
    return Math.floor(Math.random() * (2 ** 48)) + 1 + 2 ** 48;
}

export function muidToBuilder(address: Muid, relativeTo?: Medallion): MuidBuilder {
    const muid = new MuidBuilder();
    if (address.medallion && address.medallion != relativeTo)
        muid.setMedallion(address.medallion);
    if (address.timestamp) // not set if also pending
        muid.setTimestamp(address.timestamp);
    muid.setOffset(address.offset);
    return muid;
}

export function builderToMuid(muidBuilder: MuidBuilder, relativeTo?: Muid): Muid {
    // If a MuidBuilder in a message has a zero medallion and/or timestamp, it should be
    // interpreted that those values are the same as the trxn it comes from.
    return {
        timestamp: muidBuilder.getTimestamp() || relativeTo.timestamp,
        medallion: muidBuilder.getMedallion() || relativeTo.medallion,
        offset: ensure(muidBuilder.getOffset(), "zero offset")
    };
}

/**
 * Converts from a KeyType (number or string) to a Gink Proto
 * @param key
 * @returns
 */
export function wrapKey(key: number | string | Uint8Array): KeyBuilder {
    const keyBuilder = new KeyBuilder();
    if (typeof (key) == "string") {
        keyBuilder.setCharacters(key);
        return keyBuilder;
    }
    if (typeof (key) == "number") {
        keyBuilder.setNumber(key);
        return keyBuilder;
    }
    if (key instanceof Uint8Array) {
        keyBuilder.setOctets(key);
        return keyBuilder;
    }
    throw new Error(`key not a number or string or bytes: ${key}`);
}

/**
 * Convert from a Gink Proto known to contain a string or number
 * into the equiv Javascript object.
 * @param keyBuilder
 * @returns
 */
export function unwrapKey(keyBuilder: KeyBuilder): KeyType {
    ensure(keyBuilder);
    if (keyBuilder.hasCharacters()) {
        return keyBuilder.getCharacters();
    }
    if (keyBuilder.hasNumber()) {
        return keyBuilder.getNumber();
    }
    if (keyBuilder.hasOctets()) {
        return keyBuilder.getOctets();
    }
    throw new Error("value isn't a number or string!");
}

/**
 * Convert from a Gink Proto (Builder) for a Value to the corresponding JS object.
 * @param valueBuilder Gink Proto for Value
 * @returns
 */
export function unwrapValue(valueBuilder: ValueBuilder): Value {
    ensure(valueBuilder instanceof ValueBuilder);
    if (valueBuilder.hasCharacters()) {
        return valueBuilder.getCharacters();
    }
    if (valueBuilder.hasDoubled()) {
        return valueBuilder.getDoubled();
    }
    if (valueBuilder.hasInteger()) {
        return valueBuilder.getInteger();
    }
    if (valueBuilder.hasSpecial()) {
        const special = valueBuilder.getSpecial();
        if (special == Special.NULL) return null;
        if (special == Special.TRUE) return true;
        if (special == Special.FALSE) return false;
        throw new Error("bad special");
    }
    if (valueBuilder.hasOctets()) {
        return valueBuilder.getOctets();
    }
    if (valueBuilder.hasDocument()) {
        const document = valueBuilder.getDocument();
        const keys = document.getKeysList();
        const values = document.getValuesList();
        const result = new Map();
        for (let i=0;i<keys.length;i++) {
            result.set(unwrapKey(keys[i]), unwrapValue(values[i]));
        }
        return result;
    }
    if (valueBuilder.hasTuple()) {
        const tuple = valueBuilder.getTuple();
        return tuple.getValuesList().map(unwrapValue);
    }
    if (valueBuilder.hasTimestamp()) {
        //TODO: check the other fields in the Timestamp proto
        // (not critical while typescript is the only implementation)
        return new Date(valueBuilder.getTimestamp().getMillis());
    }

    throw new Error("haven't implemented unwrap for this Value");
}

/**
 * Converts from any javascript value Gink can store into the corresponding proto builder.
 * @param arg Any Javascript value Gink can store
 * @returns
 */
export function wrapValue(arg: Value): ValueBuilder {
    ensure(arg !== undefined);
    const valueBuilder = new ValueBuilder();
    if (arg instanceof Uint8Array) {
        return valueBuilder.setOctets(arg);
    }
    if (arg instanceof Date) {
        const timestamp = new TimestampBuilder();
        timestamp.setMillis(arg.valueOf());
        return valueBuilder.setTimestamp(timestamp);
    }
    if (arg === null) {
        return valueBuilder.setSpecial(Special.NULL);
    }
    if (arg === true) {
        return valueBuilder.setSpecial(Special.TRUE);
    }
    if (arg === false) {
        return valueBuilder.setSpecial(Special.FALSE);
    }
    if (typeof(arg) == "string") {
        return valueBuilder.setCharacters(arg);
    }
    if (typeof (arg) == "number") {
        if (Number.isInteger(arg) && arg <= 2147483647 && arg >= -2147483648) {
            return valueBuilder.setInteger(arg);
        }
        return valueBuilder.setDoubled(arg);
    }
    if (typeof(arg) == "bigint") {
        throw new Error("encoding bigints not implemented right now");
    }
    if (Array.isArray(arg)) {
        const tupleBuilder = new TupleBuilder();
        tupleBuilder.setValuesList(arg.map(wrapValue));
        return valueBuilder.setTuple(tupleBuilder);
    }
    if (arg instanceof Map) {
        const documentBuilder = new DocumentBuilder();
        for (const [key, val] of arg.entries()) {
            if (typeof(key) != "number" && typeof(key) != "string") {
                throw new Error("keys in documents must be numbers or strings");
            }
            documentBuilder.addKeys(wrapKey(key));
            documentBuilder.addValues(wrapValue(val));
        }
        return valueBuilder.setDocument(documentBuilder);
    }
    throw new Error(`don't know how to wrap: ${arg}`);
}

export function matches(a: any[], b: any[]) {
    if (a.length != b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

export function muidToString(muid: Muid) {
    // TODO(https://github.com/google/gink/issues/61): return canonical representation
    return `${muid.timestamp},${muid.medallion},${muid.offset}`;
}

function byteToHex(byte: number) {
    const returning = byte.toString(16).toUpperCase();
    return byte < 0x10 ? '0' + returning : returning;
}

export function valueToJson(value: Value): string {
    // Note that this function doesn't check for circular references or anything like that, but
    // I think this is okay because circular objects can't be encoded into the database in the first place.
    if (typeof (value) == "string") {
        return `"${value}"`;
    }
    if (typeof (value) == "number" || value === true || value === false || value === null) {
        return `${value}`;
    }
    if (value instanceof Uint8Array) {
        const hexString = Array.from(value).map(byteToHex).join("");
        return `"${hexString}"`;
    }
    if ("function" === typeof value["toISOString"]) {
        return `"${(value as Date).toISOString()}"`;
    }
    if (Array.isArray(value)) {
        return "[" + value.map(valueToJson).join(",") + "]";
    }
    if (value instanceof Map || value[Symbol.toStringTag] === "Map") {
        const entries = Array.from((value)["entries"]());
        entries.sort();
        return "{" + entries.map(function (pair) { return `"${pair[0]}":` + valueToJson(pair[1]); }).join(",") + "}";
    }
    throw new Error(`value not recognized: ${value}`);
}

export function muidToTuple(muid: Muid): MuidTuple {
    return [muid.timestamp, muid.medallion, muid.offset];
}

export function muidTupleToMuid(tuple: MuidTuple): Muid {
    return {
        timestamp: tuple[0],
        medallion: tuple[1],
        offset: tuple[2],
    };
}

/**
 * Checks the resource path to ensure that it will resolve to a sensible file.
 * Specifically, it will require that each path component start with [a-zA-Z0-9_],
 * and only allow [a-zA-Z0-9_.@-] for following characters.  This is to prevent
 * users from accessing hidden files with a dot prefix and traversing up with dot-dot
 * @param path resource requested
 * @returns True if the path doesn't look like something we should let users access.
 */
export function isPathDangerous(path: string): boolean {
    const pathParts = path.split(/\/+/).filter((part) => part.length > 0);
    return (pathParts.length == 0 || !pathParts.every((part) => /^\w[\w.@-]*$/.test(part)));
}

/**
* Uses `console.error` to log messages to stderr in a form like:
* [04:07:03.227Z CommandLineInterface.ts:51] got chain manager, using medallion=383316229311328
* That is to say, it's:
* [<Timestamp> <SourceFileName>:<SourceLine>] <Message>
* @param msg message to log
*/
export function logToStdErr(msg: string) {
    const stackString = (new Error()).stack;
    const callerLine = stackString ? stackString.split("\n")[2] : "";
    const caller = callerLine.split(/\//).pop()?.replace(/:\d+\)/, "");
    const timestamp = ((new Date()).toISOString()).split("T").pop();
    // using console.error because I want to write to stderr
    console.error(`[${timestamp} ${caller}] ${msg}`);
}

export function sameData(key1: any, key2: any): boolean {
    if (key1 instanceof Uint8Array && key2 instanceof Uint8Array) {
        if (key1.byteLength != key2.byteLength) return false;
        for (let i =0; i< key1.byteLength; i++) {
            if (key1[i] != key2[i]) return false;
        }
        return true;
    }
    if (Array.isArray(key1) && Array.isArray(key2)) {
        if (key1.length != key2.length) return false;
        for (let i=0;i<key1.length;i++) {
            if (key1[i] != key2[i]) return false;
        }
        return true;
    }
    if (typeof key1 == "number" || typeof key1 == "string") {
        return key1 == key2;
    }
    return false;
}
