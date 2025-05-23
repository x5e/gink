import {
    ensure,
    muidTupleToString,
    muidToString,
    unwrapValue,
    wrapValue,
    matches,
    valueToJson,
    isPathDangerous,
    strToMuid,
    encodeToken,
    decodeToken,
    toLastWithPrefixBeforeSuffix,
    createKeyPair,
    librariesReady,
    bytesToHex,
    mergeBytes,
    sameData,
    getSig,
    shorterHash,
    emptyBytes,
    safeMask,
    generateTimestamp,
    generateMedallion,
} from "../implementation/utils";
import { TreeMap } from "jstreemap";

it("shorterHash", async function () {
    ensure(safeMask.toString(16).match(/^f{13}$/));
    await librariesReady;
    const result1 = shorterHash(emptyBytes);
    ensure(result1, result1.toString());

    const bytes11 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const result11 = shorterHash(bytes11);
    ensure(result11, result11.toString());
});

it("generate", async function () {
    await librariesReady;
    const pair = createKeyPair();
    ensure(pair.secretKey.length == 64);
    ensure(pair.publicKey.length == 32);
    const secretHex = bytesToHex(pair.secretKey);
    const publicHex = bytesToHex(pair.publicKey);
    if (false) {
        console.log(`${secretHex}\n${publicHex}`);
    }
});

it("merge", async function () {
    const a = new Uint8Array([94, 154]);
    const b = new Uint8Array([10, 255]);
    const c = mergeBytes(a, b);
    const d = new Uint8Array([94, 154, 10, 255]);
    ensure(sameData(c, d));
});

it("getSig", async function () {
    const sig1 = getSig(new Uint8Array([3, 4]));
    ensure(sig1 == 7);
    const sig2 = getSig(new Uint8Array([7, 2]));
    ensure(sig2 == 5);
});

it("document", async function () {
    for (const wrapped of [
        wrapValue(new Map().set("fee", "parking").set("cost", 1000)),
        wrapValue(<any>{ fee: "parking", cost: 1000 }),
    ]) {
        const unwrapped = unwrapValue(wrapped);
        if (unwrapped instanceof Map) {
            const keys = Array.from(unwrapped.keys()).sort();
            ensure(matches(keys, ["cost", "fee"]), keys.toString());
            ensure(unwrapped.get("fee") === "parking");
            ensure(unwrapped.get("cost") === 1000);
        } else {
            throw new Error("wrap/unwrap failed");
        }
    }
});

it("canonical string representation of muids", async () => {
    const timestamp = generateTimestamp();
    const medallion = generateMedallion();
    const offset = 137;
    const muidTuple: [number, number, number] = [timestamp, medallion, offset];
    const muidTupleAsString = muidTupleToString(muidTuple);
    const tupleFromString = strToMuid(muidTupleAsString);
    ensure(
        tupleFromString.timestamp === muidTuple[0],
        `Timestamp: ${tupleFromString.timestamp} should be ${muidTuple[0]}`,
    );
    ensure(
        tupleFromString.medallion === muidTuple[1],
        `Medallion: ${tupleFromString.medallion} should be ${muidTuple[1]}`,
    );
    ensure(
        tupleFromString.offset === muidTuple[2],
        `Offset: ${tupleFromString.offset} should be ${muidTuple[2]}`,
    );

    const muid = {
        timestamp,
        medallion,
        offset,
    };
    const muid1String = muidToString(muid);
    const muid1FromString = strToMuid(muid1String);
    ensure(
        muid1FromString.timestamp === muid.timestamp,
        `Timestamp: ${muid1FromString.timestamp} should be ${muid.timestamp}`,
    );
    ensure(
        muid1FromString.medallion === muid.medallion,
        `Medallion: ${muid1FromString.medallion} should be ${muid.medallion}`,
    );
    ensure(
        muid1FromString.offset === muid.offset,
        `Offset: ${muid1FromString.offset} should be ${muid.offset}`,
    );

    const muid2 = {
        timestamp: -1,
        medallion: -1,
        offset: 4,
    };
    const muid2String = muidToString(muid2);
    const muid2FromString = strToMuid(muid2String);
    ensure(
        muid2FromString.timestamp === muid2.timestamp,
        `Timestamp: ${muid2FromString.timestamp} should be ${muid2.timestamp}`,
    );
    ensure(
        muid2FromString.medallion === muid2.medallion,
        `Medallion: ${muid2FromString.medallion} should be ${muid2.medallion}`,
    );
    ensure(
        muid2FromString.offset === muid2.offset,
        `Offset: ${muid2FromString.offset} should be ${muid2.offset}`,
    );
});

it("tuple", async function () {
    const wrapped = wrapValue([
        "yes",
        32,
        null,
        new Map().set("cheese", "fries"),
        [],
    ]);
    const unwrapped = unwrapValue(wrapped);
    var asJson = valueToJson(unwrapped);
    ensure(asJson === `["yes",32,null,{"cheese":"fries"},[]]`, asJson);
});

it("timestamp", async function () {
    const example = new Date(1665892249196);
    const wrapped = wrapValue(example);
    const unwrapped = unwrapValue(wrapped);
    if (unwrapped instanceof Date) {
        ensure(unwrapped.toISOString() === "2022-10-16T03:50:49.196Z");
    } else {
        throw new Error("date conversion failed");
    }
});

it("isPathDangerous", function () {
    ensure(isPathDangerous("/") === true);
    ensure(isPathDangerous("/../foo") === true);
    ensure(isPathDangerous("/foo/.bar") === true);
    ensure(isPathDangerous("/user123@example.com/some.file") === false);
    ensure(isPathDangerous("/normal-file-1234") === false);
});

it("encodeToken and decodeToken", function () {
    const token = "adjhbajhfbajb21j4b4b5b5jkn5kj1n5kjn1";
    const asHex = encodeToken(token);
    const backToToken = decodeToken(asHex);

    ensure(backToToken.includes("token "));
    ensure(
        token === backToToken.substring(7),
        `original: '${token}' | fromHex: '${backToToken.substring(7)}'`,
    );
});

it("toLastWithPrefixBeforeSuffix", function () {
    const map = new TreeMap<string, string>();
    const result1 = toLastWithPrefixBeforeSuffix(map, "foo", "bar");
    ensure(!result1);
    const result2 = toLastWithPrefixBeforeSuffix(map, "foo");
    ensure(!result2);
    map.set("goo", "bar");
    const result3 = toLastWithPrefixBeforeSuffix(map, "foo");
    ensure(!result3);
    const result4 = toLastWithPrefixBeforeSuffix(map, "zoo");
    ensure(!result4);
    const result5 = toLastWithPrefixBeforeSuffix(map, "go");
    ensure(!!result5 && result5.key === "goo" && result5.value == "bar");
    map.set("gool", "bat");
    const result6 = toLastWithPrefixBeforeSuffix(map, "goo");
    ensure(!!result6 && result6.value === "bat");
    map.set("goz", "zzz");
    const result7 = toLastWithPrefixBeforeSuffix(map, "goo");
    ensure(!!result7 && result7.value === "bat");
    const result8 = toLastWithPrefixBeforeSuffix(map, "goo", "f");
    ensure(!!result8 && result8.key === "goo");
});
