import { ensure } from "../implementation";
import { IndexableTreeMap } from "../implementation/IndexableTreeMap";

it('test basic functionality', async function () {
    const m = new IndexableTreeMap();
    m.set("test", {
        "timestamp": 123456789,
        "medallion": 987654321
    });
    m.addIndex("by-medallion-timestamp", ["medallion", "timestamp"]);
    m.addIndex("by-timestamp", ["timestamp"]);
    ensure(m.get("test"));
    ensure(m.useIndex("by-medallion-timestamp").get(`987654321,123456789`));
    ensure(m.useIndex("by-timestamp").get(`123456789`));

    m.setForAllIndexes("test2", {
        "timestamp": 111111111,
        "medallion": 222222222
    });
    ensure(m.useIndex("by-medallion-timestamp").get(`222222222,111111111`));
    ensure(!m.useIndex("by-timestamp").get(`111111112`));


});
