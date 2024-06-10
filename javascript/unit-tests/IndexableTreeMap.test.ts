import { ensure } from "../implementation";
import { IndexableTreeMap } from "../implementation/IndexableTreeMap";

it('test basic functionality', async function () {
    const m = new IndexableTreeMap(["offset", "timestamp"]);
    m.put({
        "timestamp": 123456789,
        "medallion": 987654321,
        "offset": 1
    });
    m.put({
        "timestamp": 123456789,
        "medallion": 987654321,
        "offset": 2
    });
    m.put({
        "timestamp": 123456789,
        "medallion": 987654321,
        "offset": 3
    });
    m.put({
        "timestamp": 123456789,
        "medallion": 987654321,
        "offset": 4
    });
    m.addIndex("by-medallion-timestamp", ["medallion", "timestamp"]);
    m.addIndex("by-timestamp", ["timestamp"]);
    ensure(m.get("4,123456789"));
    ensure(m.useIndex("by-medallion-timestamp").get(`987654321,123456789`));
    ensure(m.useIndex("by-timestamp").get(`123456789`));

    m.setForAllIndexes({
        "timestamp": 111111111,
        "medallion": 222222222,
        "offset": 5
    });
    ensure(m.useIndex("by-medallion-timestamp").get(`222222222,111111111`));
    ensure(!m.useIndex("by-timestamp").get(`111111112`));

    let found1 = m.toLastWithPrefixBeforeSuffix("4");
    ensure(found1.value["offset"] == 4);
    let found2 = m.toLastWithPrefixBeforeSuffix("5");
    ensure(found2.value["offset"] == 5);

    const fakeEntries = new IndexableTreeMap(["key", "placementId"]);
    fakeEntries.addIndex("by-container-key-placement", ["containerId", "key", "placementId"]);
    const byCKPIndex = fakeEntries.useIndex("by-container-key-placement");
    fakeEntries.setForAllIndexes({
        containerId: [123456789, 111111111, 4],
        key: "test1",
        value: "value1",
        placementId: [987654321, 111111111, 1],
        deletion: false
    });
    fakeEntries.setForAllIndexes({
        containerId: [123456789, 111111111, 4],
        key: "test2",
        value: "value2",
        placementId: [876543210, 111111111, 1],
        deletion: false
    });
    fakeEntries.setForAllIndexes({
        containerId: [123456789, 111111111, 4],
        key: "test3",
        value: "value3",
        placementId: [765432100, 111111111, 1],
        deletion: false
    });
    fakeEntries.setForAllIndexes({
        containerId: [223456789, 111111111, 4], // different container
        key: "new container",
        value: "new value",
        placementId: [654321000, 111111111, 1],
        deletion: false
    });
    let found3 = byCKPIndex.toLastWithPrefixBeforeSuffix('123456789,111111111,4,test1');
    ensure(found3.value["value"] == "value1");

    let found4 = [];
    const testContainer = [123456789, 111111111, 4];
    const iterator = byCKPIndex.lowerBound(testContainer.toString());
    while (true) {
        if (iterator.equals(byCKPIndex.end())) break;
        if (!iterator.key.startsWith(testContainer.toString())) break;
        found4.push(iterator.value);
        iterator.next();
    }
    ensure(found4.length == 3);
    for (const e of found4) {
        ensure(!(e.key == "new container"));
    }
});
