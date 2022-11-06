import { ensure, unwrapValue, wrapValue, matches, valueToJson, isPathDangerous } from "../typescript-implementation/utils";

test('document', async function() {
    const wrapped = wrapValue((new Map()).set("fee","parking").set("cost",1000));
    const unwrapped = unwrapValue(wrapped);
    if (unwrapped instanceof Map) {
        const keys = Array.from(unwrapped.keys()).sort();
        ensure(matches(keys, ["cost", "fee"]), keys.toString());
        ensure(unwrapped.get("fee")=="parking");
        ensure(unwrapped.get("cost")==1000);
    } else {
        throw new Error("wrap/unwrap failed");
    }
});


test('tuple', async function() {
    const wrapped = wrapValue(["yes", 32, null, (new Map()).set("cheese","fries"), []]);
    const unwrapped = unwrapValue(wrapped);
    var asJson = valueToJson(unwrapped);
    ensure(asJson == `["yes",32,null,{"cheese":"fries"},[]]`, asJson);
});

test('timestamp', async function () {
    const example = new Date(1665892249196);
    const wrapped = wrapValue(example);
    const unwrapped = unwrapValue(wrapped);
    if (unwrapped instanceof Date) {
        ensure(unwrapped.toISOString() == '2022-10-16T03:50:49.196Z');
    } else {
        throw new Error("date conversion failed");
    }
});

test('isPathDangerous', function() {
    ensure(isPathDangerous("/") == true);
    ensure(isPathDangerous("/../foo") == true);
    ensure(isPathDangerous("/foo/.bar") == true);
    ensure(isPathDangerous("/user123@example.com/some.file") == false);
    ensure(isPathDangerous("/normal-file-1234") == false); 
});