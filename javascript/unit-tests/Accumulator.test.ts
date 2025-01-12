import { Accumulator } from "../implementation/Accumulator";
import {
    Box,
    IndexedDbStore,
    Database,
    MemoryStore,
    Muid,
} from "../implementation/index";
import { ensure, generateTimestamp } from "../implementation/utils";

it("basic accumulator operation", async function () {
    // set up the objects
    for (const store of [
        // new IndexedDbStore("Box.test1", true),
        new MemoryStore(true),
    ]) {
        const instance = new Database({ store });
        await instance.ready;
        const accumulator: Accumulator = await Accumulator.create(instance);

        // set a value
        await accumulator.addNumber(3.7);

        // check that the desired result exists in the database
        const result = await accumulator.getNumber();
        ensure(result === 3.7, `result is ${result}`);

    }
});
