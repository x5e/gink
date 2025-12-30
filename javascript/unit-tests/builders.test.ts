import { SyncMessageBuilder, Signal } from "../implementation/builders";
import { ensure } from "../implementation/utils";

it("encode the readonly signal in a sync message and decode it",  function () {
    const builder = new SyncMessageBuilder();
    builder.setSignal(Signal.READ_ONLY_CONNECTION);
    const bytes = builder.serializeBinary();

    const decoded = <SyncMessageBuilder> SyncMessageBuilder.deserializeBinary(bytes);
    ensure(decoded.hasSignal(), "decoded message has signal");
    const decodedSignal = decoded.getSignal();
    ensure(decodedSignal === Signal.READ_ONLY_CONNECTION, "signal type is readonly");
});
