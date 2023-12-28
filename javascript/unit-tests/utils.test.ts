import { ensure, muidTupleToString, muidToString, unwrapValue, wrapValue, matches, valueToJson, isPathDangerous } from "../implementation/utils";

it('document', async function () {
    const wrapped = wrapValue((new Map()).set("fee", "parking").set("cost", 1000));
    const unwrapped = unwrapValue(wrapped);
    if (unwrapped instanceof Map) {
        const keys = Array.from(unwrapped.keys()).sort();
        ensure(matches(keys, ["cost", "fee"]), keys.toString());
        ensure(unwrapped.get("fee") == "parking");
        ensure(unwrapped.get("cost") == 1000);
    } else {
        throw new Error("wrap/unwrap failed");
    }
});

it('canonical string representation of muids', async () => {
    const muidTuple: [number, number, number] = [1642579230975519, 555027746660010, 11];
    const muid = {
        timestamp: 1642579230975519,
        medallion: 555027746660010,
        offset: 11
    };
    ensure(muidTupleToString(muidTuple) == "05D5EAC793E61F-1F8CB77AE1EAA-0B");
    ensure(muidToString(muid) == "05D5EAC793E61F-1F8CB77AE1EAA-0B");
});

it('tuple', async function () {
    const wrapped = wrapValue(["yes", 32, null, (new Map()).set("cheese", "fries"), []]);
    const unwrapped = unwrapValue(wrapped);
    var asJson = valueToJson(unwrapped);
    ensure(asJson == `["yes",32,null,{"cheese":"fries"},[]]`, asJson);
});

it('timestamp', async function () {
    const example = new Date(1665892249196);
    const wrapped = wrapValue(example);
    const unwrapped = unwrapValue(wrapped);
    if (unwrapped instanceof Date) {
        ensure(unwrapped.toISOString() == '2022-10-16T03:50:49.196Z');
    } else {
        throw new Error("date conversion failed");
    }
});

it('isPathDangerous', function () {
    ensure(isPathDangerous("/") == true);
    ensure(isPathDangerous("/../foo") == true);
    ensure(isPathDangerous("/foo/.bar") == true);
    ensure(isPathDangerous("/user123@example.com/some.file") == false);
    ensure(isPathDangerous("/normal-file-1234") == false);
});
