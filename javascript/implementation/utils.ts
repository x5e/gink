/**
 * Herein lay a bunch of utility functions, mostly for creating and
 * manipulating the types defined in typedefs.ts.
 */

import {
    Muid,
    Medallion,
    Value,
    MuidTuple,
    ScalarKey,
    EdgeData,
    Entry,
    ActorId,
    Timestamp,
    Bytes,
    KeyPair,
    StorageKey,
} from "./typedefs";
import {
    MuidBuilder,
    ValueBuilder,
    KeyBuilder,
    Special,
    TupleBuilder,
    DocumentBuilder,
} from "./builders";

import { TreeMap, MapIterator } from "jstreemap";

const nodeOs =
    typeof window === "undefined" ? eval("require('os')") : undefined;
const hostname = nodeOs?.hostname || (() => "browser");
const userInfo = nodeOs?.userInfo || (() => ({ username: "browser-user" }));

import {
    ready as sodium_ready,
    crypto_sign_open,
    crypto_sign_keypair,
    crypto_sign,
    crypto_generichash_BYTES,
    crypto_generichash,
    crypto_shorthash,
    crypto_shorthash_KEYBYTES,
    randombytes_buf,
    crypto_secretbox_easy,
    crypto_secretbox_NONCEBYTES,
    crypto_secretbox_MACBYTES,
    crypto_secretbox_open_easy,
} from "libsodium-wrappers";

export const emptyBytes = new Uint8Array(0);

const TIMESTAMP_HEX_DIGITS = 13;
const MEDALLION_HEX_DIGITS = 11;
const OFFSET_HEX_DIGITS = 8;

const MAXIMUM_MEDALLION = 16 ** MEDALLION_HEX_DIGITS - 1;

let shorthashKey: Uint8Array = emptyBytes;

export function getShortHashKey(): Bytes {
    if (shorthashKey.length === 0)
        shorthashKey = new Uint8Array(
            Array(crypto_shorthash_KEYBYTES).fill(0x5e),
        );
    return shorthashKey;
}

export const safeMask = BigInt(2 ** 52 - 1);

export function shorterHash(data: Bytes): number {
    // I'm using this truncated shorthash because the Google protobuf library can't handle bignums.
    const out1 = crypto_shorthash(data, getShortHashKey());
    const asBigNum = new DataView(out1.buffer).getBigUint64(0, true);
    return Number(asBigNum & safeMask);
}

export const digest = (data: Bytes) =>
    crypto_generichash(crypto_generichash_BYTES, data);

export const librariesReady = sodium_ready;

export const signingBundles = true;

export function noOp(..._args: any[]) {}

export function toLastWithPrefixBeforeSuffix<V>(
    map: TreeMap<string, V>,
    prefix: string,
    suffix: string = "~",
): MapIterator<string, V> | undefined {
    const iterator = map.upperBound(prefix + suffix);
    iterator.prev();
    if (!iterator.key) return undefined;
    if (!iterator.key.startsWith(prefix)) return undefined;
    return iterator;
}

export function dumpTree<V>(map: TreeMap<string, V>) {
    let it = map.begin();
    while (it.key) {
        console.log(JSON.stringify(it.value));
        it.next();
    }
}

// Since find-process uses child-process, we can't load this if gink
// is running in a browser
// TODO: only install this package when you will be using as a backend?
const findProcess =
    typeof window === "undefined" ? eval("require('find-process')") : undefined;

export const inspectSymbol = Symbol.for("nodejs.util.inspect.custom");

export function ensure(x: any, msg?: string) {
    if (!x) {
        throw new Error(msg ?? "assert failed");
    }
    return x;
}

let lastTime = 0;
export function generateTimestamp() {
    // TODO: there's probably a better way ...
    let current = Date.now() * 1000;
    if (lastTime >= current) {
        current = lastTime + 20;
    }
    lastTime = current;
    return current;
}

/**
 * Converts a storage key (which is the key used in EntryBuilders) to a
 * key usable by addEntry, etc.
 * @param storageKey
 * @returns
 */
export function fromStorageKey(
    storageKey: StorageKey,
): ScalarKey | Muid | [Muid, Muid] {
    let newKey: ScalarKey | Muid | [Muid, Muid];
    if (Array.isArray(storageKey)) {
        if (storageKey.length === 3) {
            newKey = muidTupleToMuid(storageKey);
        } else if (storageKey.length === 2) {
            newKey = [
                muidTupleToMuid(storageKey[0]),
                muidTupleToMuid(storageKey[1]),
            ];
        } else {
            throw new Error("Invalid key length?");
        }
    } else {
        newKey = storageKey;
    }
    return newKey;
}

const MIN_RANDOM_MEDALLION = 16 ** (MEDALLION_HEX_DIGITS - 1);
const MAX_RANDOM_MEDALLION = MIN_RANDOM_MEDALLION * 2 - 1;

var nodeCrypto =
    typeof window === "undefined" ? eval("require('crypto')") : undefined;

/**
 * Randomly selects a number that can be used as a medallion.
 * Note that this doesn't actually have to be cryptographically secure;
 * as long as it's unique within an organization there won't be problems.
 * This is unlikely to cause collisions as long as an organization
 * has fewer than a million instances, after that some tracking is warranted.
 * https://en.wikipedia.org/wiki/Birthday_problem#Probability_table
 */
export function generateMedallion() {
    const cryptoLib = nodeCrypto || window.crypto;
    if (cryptoLib) {
        if (cryptoLib.getRandomValues) {
            const array = new Uint8Array(MEDALLION_HEX_DIGITS - 1);
            cryptoLib.getRandomValues(array);
            let total = 1;
            for (let i = 0; i < array.length; i++) {
                const inc = array[i] & 15;
                ensure(
                    inc >= 0 && total > 0,
                    `problem, inc=${inc}, total=${total}, i=${i}`,
                );
                total = total * 16;
                total = total + inc;
            }
            ensure(
                total >= MIN_RANDOM_MEDALLION && total <= MAX_RANDOM_MEDALLION,
                `generated medallion not in expected range ${total} ${array[0]} ${array[1]}`,
            );
            return total;
        }
        if (cryptoLib.randomInt) {
            return cryptoLib.randomInt(
                MIN_RANDOM_MEDALLION,
                MAX_RANDOM_MEDALLION,
            );
        }
    }
    var basic =
        Math.floor(Math.random() * MIN_RANDOM_MEDALLION) + MIN_RANDOM_MEDALLION;
    ensure(basic >= MIN_RANDOM_MEDALLION && basic <= MAX_RANDOM_MEDALLION);
    return basic;
}

export function muidToBuilder(
    address: Muid,
    relativeTo?: Medallion,
): MuidBuilder {
    const muid = new MuidBuilder();
    if (address.medallion && address.medallion !== relativeTo)
        muid.setMedallion(address.medallion);
    if (address.timestamp)
        // not set if also pending
        muid.setTimestamp(address.timestamp);
    muid.setOffset(address.offset);
    return muid;
}

export function builderToMuid(
    muidBuilder: MuidBuilder,
    relativeTo?: Muid,
): Muid {
    // If a MuidBuilder in a message has a zero medallion and/or timestamp, it should be
    // interpreted that those values are the same as the trxn it comes from.
    return {
        timestamp: muidBuilder.getTimestamp() || relativeTo.timestamp,
        medallion: muidBuilder.getMedallion() || relativeTo.medallion,
        offset: ensure(muidBuilder.getOffset(), "zero offset"),
    };
}

/**
 * Converts from a KeyType (number or string) to a Gink Proto
 * @param key
 * @returns
 */
export function wrapKey(key: number | string | Uint8Array): KeyBuilder {
    const keyBuilder = new KeyBuilder();
    if (typeof key === "string") {
        keyBuilder.setCharacters(key);
        return keyBuilder;
    }
    if (typeof key === "number") {
        ensure(Number.isSafeInteger(key), `key=${key} not a safe integer`);
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
export function unwrapKey(keyBuilder: KeyBuilder): ScalarKey {
    ensure(keyBuilder);
    if (keyBuilder.hasCharacters()) {
        return keyBuilder.getCharacters();
    }
    if (keyBuilder.hasNumber()) {
        return keyBuilder.getNumber();
    }
    if (keyBuilder.hasOctets()) {
        return new Uint8Array(keyBuilder.getOctets_asU8());
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
    if (valueBuilder.hasFloating()) {
        return valueBuilder.getFloating();
    }
    if (valueBuilder.hasInteger()) {
        return BigInt(valueBuilder.getInteger());
    }
    if (valueBuilder.hasSpecial()) {
        const special = valueBuilder.getSpecial();
        if (special === Special.NULL) return null;
        if (special === Special.TRUE) return true;
        if (special === Special.FALSE) return false;
        throw new Error("bad special");
    }
    if (valueBuilder.hasOctets()) {
        return new Uint8Array(valueBuilder.getOctets_asU8());
    }
    if (valueBuilder.hasDocument()) {
        const document = valueBuilder.getDocument();
        const keys = document.getKeysList();
        const values = document.getValuesList();
        const result = new Map();
        for (let i = 0; i < keys.length; i++) {
            result.set(unwrapKey(keys[i]), unwrapValue(values[i]));
        }
        return result;
    }
    if (valueBuilder.hasTuple()) {
        const tuple = valueBuilder.getTuple();
        return tuple.getValuesList().map(unwrapValue);
    }
    if (valueBuilder.hasTimestamp()) {
        const epochMicros = valueBuilder.getTimestamp();
        const epochMillis = epochMicros / 1000;
        const date = new Date(epochMillis);
        return date;
    }
    throw new Error("haven't implemented unwrap for this Value");
}

/**
 * Converts a hex string (presumably encoded previously) to
 * an authentication token, prefixed with 'token '
 * @param {string} hex hexadecimal string to convert
 * @returns a string 'token {token}'
 */
export function decodeToken(hex: string): string {
    ensure(hex.substring(0, 2) === "0x", "Hex string should start with 0x");
    let token: string = "";
    for (let i = 0; i < hex.length; i += 2) {
        let hexValue = hex.substring(i, i + 2);
        token += String.fromCharCode(parseInt(hexValue, 16));
    }
    ensure(
        token.includes("token "),
        `Token '${token}' does not begin with 'token '`,
    );
    return token;
}

/**
 * Encodes an authentication token as hexadecimal, prefixed by '0x'.
 * @param {string} token the token to encode
 * @returns an encoded hexadecimal string
 */
export function encodeToken(token: string): string {
    let result: string = "0x";
    if (!token.includes("token ")) {
        token = "token " + token;
    }
    for (let i = 0; i < token.length; i++) {
        let hex = token.charCodeAt(i).toString(16);
        result += hex.padStart(2, "0");
    }
    return result;
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
        return valueBuilder.setTimestamp(arg.getTime() * 1000);
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
    if (typeof arg === "string") {
        return valueBuilder.setCharacters(arg);
    }
    if (typeof arg === "number") {
        return valueBuilder.setFloating(arg);
    }
    if (typeof arg === "bigint") {
        return valueBuilder.setInteger(arg.toString());
    }
    if (Array.isArray(arg)) {
        const tupleBuilder = new TupleBuilder();
        tupleBuilder.setValuesList(arg.map(wrapValue));
        return valueBuilder.setTuple(tupleBuilder);
    }
    if (arg instanceof Map) {
        const documentBuilder = new DocumentBuilder();
        for (const [key, val] of arg.entries()) {
            if (typeof key !== "number" && typeof key !== "string") {
                throw new Error("keys in documents must be numbers or strings");
            }
            documentBuilder.addKeys(wrapKey(key));
            documentBuilder.addValues(wrapValue(val));
        }
        return valueBuilder.setDocument(documentBuilder);
    }
    if (typeof arg === "object") {
        if (Object.getPrototypeOf(arg) !== Object.prototype) {
            throw new Error(`Don't know how to serialize: ${arg}`);
        }
        const documentBuilder = new DocumentBuilder();
        for (const [key, val] of Object.entries(arg)) {
            documentBuilder.addKeys(wrapKey(key));
            documentBuilder.addValues(wrapValue(<Value>val));
        }
        return valueBuilder.setDocument(documentBuilder);
    }
    throw new Error(`don't know how to wrap: ${arg}`);
}

export function isDate(value: any): boolean {
    return (
        typeof value === "object" &&
        Object.prototype.toString.call(value) === "[object Date]"
    );
}

export function matches(a: any[], b: any[]) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

export function pairKeyToArray(storageKey: String): Array<Muid> {
    const split = storageKey.split(",");
    ensure(split.length === 2);
    return [strToMuid(split[0]), strToMuid(split[1])];
}

/**
 * Converts a Muid object to its canonical string representation
 * Refer to docs/muid.md
 * @param muid
 * @returns a string of the canonical string representation
 */
export function muidToString(muid: Muid): string {
    let timestamp = intToHex(muid.timestamp, TIMESTAMP_HEX_DIGITS);
    let medallion = intToHex(muid.medallion, MEDALLION_HEX_DIGITS);
    let offset = intToHex(muid.offset, OFFSET_HEX_DIGITS);
    let result = `${timestamp}-${medallion}-${offset}`;
    ensure(result.length === 34, `${result} isn't 34 characters long`);
    return result;
}

export function muidTupleToString(muidTuple: MuidTuple): string {
    let timestamp: string;
    if (muidTuple[0] === Infinity || muidTuple[0] === -1) {
        timestamp = "F".repeat(TIMESTAMP_HEX_DIGITS);
    } else {
        timestamp = intToHex(muidTuple[0], TIMESTAMP_HEX_DIGITS);
    }
    let medallion = intToHex(muidTuple[1], MEDALLION_HEX_DIGITS);
    let offset = intToHex(muidTuple[2], OFFSET_HEX_DIGITS);
    return `${timestamp}-${medallion}-${offset}`;
}

export function strToMuidTuple(value: string): MuidTuple {
    const nums = value.split("-");
    return [
        muidHexToInt(nums[0]),
        muidHexToInt(nums[1]),
        muidHexToInt(nums[2]),
    ];
}

export function strToMuid(value: string): Muid {
    const nums = value.split("-");
    return {
        timestamp: muidHexToInt(nums[0]),
        medallion: muidHexToInt(nums[1]),
        offset: muidHexToInt(nums[2]),
    };
}

/**
 * Converts a hexadecimal string to an integer. String should
 * not contain more than 14 characters.
 * @param hexString hexadecimal string <= 14 characters
 * @returns a signed integer.
 */
function muidHexToInt(hexString: string): number {
    ensure(hexString.length <= 14);
    let beginningAddition = BigInt(0);
    if (hexString.length === 14) {
        let beginning = hexString.substring(0, 1);
        hexString = hexString.substring(1);
        if (beginning === "1") {
            beginningAddition = BigInt(16) ** BigInt(14);
        }
    }
    let len = hexString.length;
    let mod = BigInt(16) ** BigInt(len);
    let num = BigInt(parseInt(hexString, 16));
    mod = mod * (num > mod >> BigInt(1) ? BigInt(1) : BigInt(0));
    return Number(num + beginningAddition - mod);
}

/**
 * Converts a number to its hexadecimal equivalent.
 * @param value
 * @param padding maximum size of hex string, padded by 0s.
 * @returns a hexadecimal string
 */
export function intToHex(value: number, padding?: number): string {
    const digits = padding || 0;
    const twosComplement =
        value < 0 ? BigInt(16) ** BigInt(digits) + BigInt(value) : value;

    return twosComplement.toString(16).padStart(digits, "0").toUpperCase();
}

export const oneByteToHex = (byte: number) =>
    byte.toString(16).padStart(2, "0").toUpperCase();

export const bytesToHex = (bytes: Uint8Array) =>
    Array.from(bytes).map(oneByteToHex).join("");

export const parseByte = (twoHexDigits: string) => parseInt(twoHexDigits, 16);

export const hexToBytes = (hex: string) =>
    Uint8Array.from(hex.match(/.{1,2}/g).map(parseByte));

export function timestampToString(timestamp: Timestamp): string {
    return intToHex(timestamp, 14);
}

export function valueToJson(value: Value): string {
    // Note that this function doesn't check for circular references or anything like that, but
    // I think this is okay because circular objects can't be encoded into the database in the first place.
    if (value instanceof Uint8Array) {
        value = Array.from(value).map(intToHex).join("");
    }
    const type = typeof value;
    if (type === "bigint") {
        return String(value);
    }
    if (
        type === "string" ||
        type === "number" ||
        value === true ||
        value === false ||
        value === null
    ) {
        return JSON.stringify(value);
    }
    if ("function" === typeof value["toISOString"]) {
        return `"${(value as Date).toISOString()}"`;
    }
    if (Array.isArray(value)) {
        return "[" + value.map(valueToJson).join(",") + "]";
    }
    if (value instanceof Map || value[Symbol.toStringTag] === "Map") {
        const entries = Array.from(value["entries"]());
        entries.sort();
        return (
            "{" +
            entries
                .map(function (pair) {
                    return `"${pair[0]}":` + valueToJson(pair[1]);
                })
                .join(",") +
            "}"
        );
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
    return (
        pathParts.length === 0 ||
        !pathParts.every((part) => /^\w[\w.@-]*$/.test(part))
    );
}

/**
 * Uses `console.error` to log messages to stderr in a form like:
 * [04:07:03.227Z CommandLineInterface.ts:51] got chain manager, using medallion=383316229311328
 * That is to say, it's:
 * [<Timestamp> <SourceFileName>:<SourceLine>] <Message>
 * @param msg message to log
 */
export function logToStdErr(msg: string) {
    const stackString = new Error().stack;
    const callerLine = stackString ? stackString.split("\n")[2] : "";
    const caller = callerLine
        .split(/\//)
        .pop()
        ?.replace(/:\d+\)/, "");
    const timestamp = new Date().toISOString().split("T").pop();
    // using console.error because I want to write to stderr
    const procId = process ? process.pid : 0;
    console.error(`[${timestamp} ${caller} ${procId}] ${msg}`);
}

export function sameData(key1: any, key2: any): boolean {
    if (key1 instanceof Uint8Array && key2 instanceof Uint8Array) {
        if (key1.byteLength !== key2.byteLength) return false;
        for (let i = 0; i < key1.byteLength; i++) {
            if (key1[i] !== key2[i]) return false;
        }
        return true;
    }
    if (Array.isArray(key1) && Array.isArray(key2)) {
        if (key1.length !== key2.length) return false;
        for (let i = 0; i < key1.length; i++) {
            if (!sameData(key1[i], key2[i])) return false;
        }
        return true;
    }
    if (
        typeof key1 === "number" ||
        typeof key1 === "string" ||
        typeof key1 === "undefined"
    ) {
        return key1 === key2;
    }
    return false;
}

export function entryToEdgeData(entry: Entry): EdgeData {
    return {
        source: muidTupleToMuid(entry.sourceList[0]),
        target: muidTupleToMuid(entry.targetList[0]),
        value: entry.value,
        etype: muidTupleToMuid(entry.containerId),
        effective: <number>entry.storageKey,
    };
}

export const dehydrate = muidToTuple;
export const rehydrate = muidTupleToMuid;

export function getActorId(): ActorId {
    if (typeof window === "undefined") return process.pid;
    else {
        // So we don't assign multiple gink instances in different windows the same actorId
        if (!window.localStorage.getItem(`gink-current-window`)) {
            window.localStorage.setItem(`gink-current-window`, "1");
        }
        let currentWindow = Number(
            window.localStorage.getItem(`gink-current-window`),
        );
        // Using 2^22 since that is the max pid for any process on a 64 bit machine.
        const aId = 2 ** 22 + currentWindow;
        currentWindow++;
        window.localStorage.setItem(
            `gink-current-window`,
            String(currentWindow),
        );

        window.localStorage.setItem(`gink-${aId}`, `${Date.now()}`);
        // Heartbeat the browser's localStorage every 1 second with the current time.
        // This is to tell isAlive() that the window is still alive.
        setInterval(() => {
            window.localStorage.setItem(`gink-${aId}`, `${Date.now()}`);
        }, 1000);
        window.onunload = () => {
            window.localStorage.removeItem(`gink-${aId}`);
        };
        return aId;
    }
}

/**
 * Used to (attempt to) identify the user who starts a gink chain.
 * @returns either the 'username@hostname' of the process running gink,
 * or a generic 'browser-client' if gink is running in a browser.
 */
export function getIdentity(): string {
    if (typeof window === "undefined")
        return `${userInfo().username}@${hostname()}`;
    else {
        return (
            "browser-client-" +
            "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
                (
                    +c ^
                    (crypto.getRandomValues(new Uint8Array(1))[0] &
                        (15 >> (+c / 4)))
                ).toString(16),
            )
        );
    }
}

/**
 * This function exists to determine if the process or window that previously wrote to a chain is still around.
 * If not, then it's safe to append to that chain (to reduce the number of chain starts).  If the creator of a
 * chain is still active, then you can't assume that the chain is free for reuse.
 * @param actorId
 * @returns
 */
export async function isAlive(actorId: ActorId): Promise<boolean> {
    if (typeof window === "undefined") {
        ensure(findProcess, "find-process library didn't load in browser");
        const found = await findProcess("pid", actorId);
        ensure(found.length === 0 || found.length === 1);
        return found.length === 1;
    } else {
        const lastPinged = window.localStorage.getItem(`gink-${actorId}`);
        if (!lastPinged) return false;

        const lastPingedTime = Number(lastPinged);
        const currentTime = Date.now();

        // Compare current time to the last window heartbeat
        // Using 5 seconds here for a bit of a buffer
        return currentTime - lastPingedTime < 5000;
    }
}

export function getType(extension: string) {
    const types = {
        html: "text/html",
        css: "text/css",
        js: "application/javascript",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        json: "application/json",
        xml: "application/xml",
    };
    const result = types[extension];
    if (!result) {
        throw new Error(`type not found for extension: ${extension}`);
    }
    return result;
}

export function mergeBytes(arrayOne: Bytes, arrayTwo: Bytes): Bytes {
    const mergedArray = new Uint8Array(arrayOne.length + arrayTwo.length);
    mergedArray.set(arrayOne);
    mergedArray.set(arrayTwo, arrayOne.length);
    return mergedArray;
}

export function signBundle(message: Bytes, secretKey: Bytes): Bytes {
    if (secretKey.length != 64)
        throw new Error("secret key not appropriate length!");
    if (signingBundles) {
        //return mergeBytes(secretKey, message);
        return crypto_sign(message, secretKey);
    } else return message;
}

export function verifyBundle(signedBundle: Bytes, verifyKey: Bytes) {
    ensure(verifyKey.length == 32);
    if (signingBundles) {
        crypto_sign_open(signedBundle, verifyKey);
    }
}

export function createKeyPair(): KeyPair {
    const result = crypto_sign_keypair();
    ensure(
        bytesToHex(result.privateKey).endsWith(bytesToHex(result.publicKey)),
    );
    return {
        publicKey: result.publicKey,
        secretKey: result.privateKey,
    };

    /*
    //uncomment for deterministic debugging
    const x = '5FF46DD6A05CCA09822D96CA4AF957D4ED22E059B1D82AA8DD692FF092B5A15C';
    const y = '26F20F23EB12D508DF46DB9EE51BCA3E005AD00845F8A92A1E0E3E2440FE35E0';
    return {
        secretKey: hexToBytes( x + y),
        publicKey: hexToBytes(y),
    }
    */
}

export function getSig(bytes: Bytes): number {
    let result = 0;
    for (let i = 0; i < bytes.byteLength; i++) {
        result = result ^ bytes[i];
    }
    return result;
}

export function encryptMessage(message: string | Bytes, key: Bytes): Bytes {
    let nonce = randombytes_buf(crypto_secretbox_NONCEBYTES);
    nonce = randombytes_buf(crypto_secretbox_NONCEBYTES);
    const ciphertext = crypto_secretbox_easy(message, nonce, key);
    return mergeBytes(nonce, ciphertext);
}

export function decryptMessage(message: Bytes, key: Bytes): Bytes {
    if (
        message.length <
        crypto_secretbox_NONCEBYTES + crypto_secretbox_MACBYTES
    ) {
        throw new Error("Message length shorter than nonce + MAC");
    }
    let nonce = message.slice(0, crypto_secretbox_NONCEBYTES),
        ciphertext = message.slice(crypto_secretbox_NONCEBYTES);
    return crypto_secretbox_open_easy(ciphertext, nonce, key);
}

export function concatenate(a: Bytes, b: Bytes): Bytes {
    const c = new Uint8Array(a.length + b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
}
