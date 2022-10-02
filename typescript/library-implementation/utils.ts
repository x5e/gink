import { ChangeSetInfo, Address, Medallion, Basic, ChangeSetInfoTuple } from "../api";
import { Muid } from "muid_pb";
import { Value } from "value_pb";

export var assert = assert || function (x: any, msg?: string) {
    if (!x) throw new Error(msg ?? "assert failed");
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
            return 2 ** 48 + randomInt(1, 2 ** 48);
        }
    }
    return Math.floor(Math.random() * ((2 ** 48) - 1)) + 1 + 2 ** 48;
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

export function addressToMuid(address: Address, relativeTo?: Medallion): Muid {
    const muid = new Muid();
    if (address.medallion && address.medallion != relativeTo)
        muid.setMedallion(address.medallion);
    if (address.timestamp) // not set if also pending
        muid.setTimestamp(address.timestamp);
    muid.setOffset(address.offset);
    return muid;
}

export function muidToAddress(muid: Muid): Address {
    return {
        timestamp: muid.getTimestamp(),
        medallion: muid.getMedallion(),
        offset: muid.getOffSet(),
    }
}

export function unwrapValue(value: Value): Basic {
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
        if (special == Value.Special.NULL) return null;
        if (special == Value.Special.TRUE) return true;
        return false;
    }
    throw new Error("haven't implemented unwrap for this Value");
}

export function wrapValue(arg: Basic): Value {
    const value = new Value();
    while (true) {  // only goes through once; I'm using it like a switch statement
        if (arg === null) {
            value.setSpecial(Value.Special.NULL);
            break;
        }
        if (arg === true) {
            value.setSpecial(Value.Special.TRUE);
            break;
        }
        if (arg === false) {
            value.setSpecial(Value.Special.FALSE);
            break;
        }
        const argType = typeof (arg);
        if (argType == "string") {
            value.setCharacters(arg);
            break;
        }
        if (argType == "number") {
            //TODO: put in special cases for integers etc to increase efficiency
            const number = new Value.Number();
            number.setDoubled(arg);
            value.setNumber(number);
            break;
        }
        throw new Error(`cannot be wrapped: ${arg}`);
    }
    return value;
} 


export function commitInfoToKey(commitInfo: ChangeSetInfo): ChangeSetInfoTuple {
    return [commitInfo.timestamp, commitInfo.medallion, commitInfo.chainStart,
    commitInfo.priorTime || 0, commitInfo.comment || ""];
}

export function commitKeyToInfo(commitKey: ChangeSetInfoTuple) {
    return {
        timestamp: commitKey[0],
        medallion: commitKey[1],
        chainStart: commitKey[2],
        priorTime: commitKey[3],
        comment: commitKey[4],
    }
}
