import { Muid, Medallion, Value, Bytes } from "./typedefs";
import { Muid as MuidBuilder } from "muid_pb";
import { Value as ValueBuilder } from "value_pb";

export function ensure(x: any, msg?: string) {
    if (!x) throw new Error(msg ?? "assert failed");
    return x;
}

export function now() { return (new Date()).toISOString(); }

export function noOp(_ = null) { };

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
            return  randomInt((2 ** 48) + 1, (2 ** 49) - 1);
        }
    }
    return Math.floor(Math.random() * (2 ** 48)) + 1 + 2 ** 48;
}

let logLevel = 0;

export function setLogLevel(level: number) {
    logLevel = level;
}
/**
 * Uses console.error to log messages to stderr in a form like:
 * [04:07:03.227Z CommandLineInterace.ts:51] got chain manager, using medallion=383316229311328
 * That is to say, it's:
 * [<Timestamp> <SourceFileName>:<SourceLine>] <Message>
 * @param msg message to log
 */
export function info(msg: string) {
    if (logLevel < 1) return;
    const stackString = new Error().stack;
    const callerLine = stackString.split("\n")[2];
    const caller = callerLine.split(/\//).pop().replace(/:\d+\)/, "");
    const timestamp = now().split("T").pop();
    // using console.error because I want to write to stderr
    console.error(`[${timestamp} ${caller}] ${msg}`);
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

export function wrapKey(key: number|string): ValueBuilder {
    const value = new ValueBuilder();
    if (typeof(key) == "string") {
        value.setCharacters(key);
        return value;
    }
    if (typeof(key) == "number") {
        const number = new ValueBuilder.Number();
        number.setDoubled(key);
        value.setNumber(number);
        return value;
    }
    throw new Error(`key not a number or string: ${key}`);
}

export function unwrapKey(value: ValueBuilder): number|string {
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

export function unwrapValue(value: ValueBuilder): Value {
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
    if (value.hasSpecial()) {
        const special = value.getSpecial();
        if (special == ValueBuilder.Special.NULL) return null;
        if (special == ValueBuilder.Special.TRUE) return true;
        return false;
    }
    if (value.hasOctects()) {
        return value.getOctects();
    }
    throw new Error("haven't implemented unwrap for this Value");
}

export function wrapValue(arg: Value): ValueBuilder {
    const value = new ValueBuilder();
    do {  // only goes through once; I'm using it like a switch statement
        if (arg instanceof Uint8Array) {
            value.setOctects(arg);
            break;
        }
        if (arg === null) {
            value.setSpecial(ValueBuilder.Special.NULL);
            break;
        }
        if (arg === true) {
            value.setSpecial(ValueBuilder.Special.TRUE);
            break;
        }
        if (arg === false) {
            value.setSpecial(ValueBuilder.Special.FALSE);
            break;
        }
        const argType = typeof (arg);
        if (argType == "string") {
            value.setCharacters(arg);
            break;
        }
        if (argType == "number") {
            //TODO: put in special cases for integers etc to increase efficiency
            const number = new ValueBuilder.Number();
            number.setDoubled(arg);
            value.setNumber(number);
            break;
        }
        throw new Error(`cannot be wrapped: ${arg}`);
    } while (false);
    return value;
} 

export function matches(a: any[], b: any[]) {
    if (a.length != b.length) return false;
    for (let i=0; i<a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

export function muidToString(muid: Muid) {
    // TODO(https://github.com/google/gink/issues/61): return canonical representation
    return `${muid.timestamp},${muid.medallion},${muid.offset}`;
}
