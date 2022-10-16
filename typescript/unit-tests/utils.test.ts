import { ensure, unwrapValue, wrapValue, matches } from "../library-implementation/utils";

test('document', async function() {
    const wrapped = wrapValue({"fee":"parking","cost":1000});
    const unwrapped = unwrapValue(wrapped);
    ensure(matches(Object.keys(unwrapped).sort(), ["cost", "fee"]));
    ensure(unwrapped["fee"]=="parking");
    ensure(unwrapped["cost"]==1000);
});


test('tuple', async function() {
    const wrapped = wrapValue(["yes", 32, null, {"cheese": "fries"}, []]);
    const unwrapped = unwrapValue(wrapped);
    ensure(JSON.stringify(unwrapped) == `["yes",32,null,{"cheese":"fries"},[]]`);
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
