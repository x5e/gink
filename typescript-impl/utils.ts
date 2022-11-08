/**
 * Herein lay a bunch of utility functions, mostly for creating and 
 * manipulating the types defined in typedefs.ts.
 */

import { Muid, Medallion, Value, MuidTuple, CallBack } from "./typedefs";
import { Muid as MuidBuilder } from "gink/protoc.out/muid_pb";
import { Value as ValueBuilder } from "gink/protoc.out/value_pb";

export function ensure(x: any, msg?: string) {
    if (!x) 
        throw new Error(msg ?? "assert failed");
    return x;
}

export function noOp(_?:any) { };

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
export function wrapKey(key: number | string): ValueBuilder {
    const value = new ValueBuilder();
    if (typeof (key) == "string") {
        value.setCharacters(key);
        return value;
    }
    if (typeof (key) == "number") {
        const number = new ValueBuilder.Number();
        number.setDoubled(key);
        value.setNumber(number);
        return value;
    }
    throw new Error(`key not a number or string: ${key}`);
}

/**
 * Convert from a Gink Proto known to contain a string or number 
 * into the equiv Javascript object.
 * @param value 
 * @returns 
 */
export function unwrapKey(value: ValueBuilder): number | string {
    ensure(value);
    if (value.hasCharacters()) {
        return value.getCharacters();
    }
    if (value.hasNumber()) {
        const number = value.getNumber();
        if (!number.hasDoubled()) {
            //TODO
            throw new Error("haven't implemented unwrapping for non-double encoded numbers");
        }
        return number.getDoubled();
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
    if (valueBuilder.hasNumber()) {
        const number = valueBuilder.getNumber();
        if (!number.hasDoubled()) {
            //TODO
            throw new Error("haven't implemented unwrapping for non-double encoded numbers");
        }
        return number.getDoubled();
    }
    if (valueBuilder.hasSpecial()) {
        const special = valueBuilder.getSpecial();
        if (special == ValueBuilder.Special.NULL) return null;
        if (special == ValueBuilder.Special.TRUE) return true;
        return false;
    }
    if (valueBuilder.hasOctects()) {
        return valueBuilder.getOctects();
    }
    if (valueBuilder.hasDocument()) {
        const document = valueBuilder.getDocument();
        const keys = document.getKeysList();
        const values = document.getValuesList();
        const result = new Map();
        for (let i=0;i<keys.length;i++) {
            result.set(unwrapValue(keys[i]), unwrapValue(values[i]));
        }
        return result
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
        return valueBuilder.setOctects(arg);
    }
    if (arg instanceof Date) {
        const timestamp = new ValueBuilder.Timestamp();
        timestamp.setMillis(arg.valueOf());
        return valueBuilder.setTimestamp(timestamp);
    }
    if (arg === null) {
        return valueBuilder.setSpecial(ValueBuilder.Special.NULL);
    }
    if (arg === true) {
        return valueBuilder.setSpecial(ValueBuilder.Special.TRUE);
    }
    if (arg === false) {
        return valueBuilder.setSpecial(ValueBuilder.Special.FALSE);
    }
    const argType = typeof (arg);
    if (argType == "string") {
        return valueBuilder.setCharacters(arg);
    }
    if (argType == "number") {
        //TODO: put in special cases for integers etc to increase efficiency
        const number = new ValueBuilder.Number();
        number.setDoubled(arg);
        return valueBuilder.setNumber(number);
    }
    if (Array.isArray(arg)) {
        const tuple = new ValueBuilder.Tuple();
        tuple.setValuesList(arg.map(wrapValue));
        return valueBuilder.setTuple(tuple);
    }
    if (arg instanceof Map) {
        const document = new ValueBuilder.Document();
        for (const [key, val] of arg.entries()) {
            if (typeof(key) != "number" && typeof(key) != "string") {
                throw new Error("keys in documents must be numbers or strings");
            }
            document.addKeys(wrapValue(key));
            document.addValues(wrapValue(val));
        }
        return valueBuilder.setDocument(document);
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
    if (value instanceof Date) {
        return `"${value.toISOString()}"`;
    }
    if (Array.isArray(value)) {
        return "[" + value.map(valueToJson).join(",") + "]";
    }
    if (value instanceof Map) {
        const entries = Array.from(value.entries());
        entries.sort();
        return "{" + entries.map(function (pair) { return `"${pair[0]}":` + valueToJson(pair[1]) }).join(",") + "}";
    }
    throw new Error(`value not recognized: ${value}`)
}

export function muidTupleToMuid(tuple: MuidTuple): Muid {
    return {
        timestamp: tuple[0],
        medallion: tuple[1],
        offset: tuple[2],
    }
}

/**
 * Checks the resource path to ensure that it will resolve to a sensible file.
 * @param path resource requested
 * @returns True if the path doesn't look like something we should let users access.
 */
export function isPathDangerous(path: string): boolean {
    const pathParts = path.split(/\/+/).filter((part) => part.length > 0);
    return (pathParts.length == 0 || !pathParts.every((part) => /^\w[\w.@-]*$/.test(part)));
}

/**
* Uses console.error to log messages to stderr in a form like:
* [04:07:03.227Z CommandLineInterace.ts:51] got chain manager, using medallion=383316229311328
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