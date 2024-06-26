
const BundleBuilder = require("../proto/bundle_pb")["Bundle"];
const Behavior = require("../proto/behavior_pb")["Behavior"];
const ChangeBuilder = require("../proto/change_pb")["Change"];
const EntryBuilder = require("../proto/entry_pb")["Entry"];
const ContainerBuilder = require("../proto/container_pb")["Container"];
const SyncMessageBuilder = require("../proto/sync_message_pb")["SyncMessage"];
const AckBuilder = SyncMessageBuilder.Ack;
const GreetingBuilder = SyncMessageBuilder.Greeting;
const GreetingEntryBuilder = GreetingBuilder.GreetingEntry;
const LogFileBuilder = require("../proto/log_file_pb")["LogFile"];
const ClaimBuilder = require("../proto/claim_pb")["Claim"];
const MovementBuilder = require("../proto/movement_pb")["Movement"];
const MuidBuilder = require("../proto/muid_pb")["Muid"];
const KeyBuilder = require("../proto/key_pb")["Key"];
const PairBuilder = require("../proto/pair_pb")["Pair"];
const ValueBuilder = require("../proto/value_pb")["Value"];
const HeaderBuilder = require("../proto/header_pb")["Header"];
const ClearanceBuilder = require("../proto/clearance_pb")["Clearance"];
const Special = ValueBuilder.Special;
const NumberBuilder = ValueBuilder.Number;
const TimestampBuilder = ValueBuilder.Timestamp;
const DocumentBuilder = ValueBuilder.Document;
const TupleBuilder = ValueBuilder.Tuple;

module.exports = {
    HeaderBuilder,
    BundleBuilder,
    Behavior,
    ChangeBuilder,
    EntryBuilder,
    ContainerBuilder,
    SyncMessageBuilder,
    GreetingBuilder,
    GreetingEntryBuilder,
    LogFileBuilder,
    MovementBuilder,
    MuidBuilder,
    KeyBuilder,
    PairBuilder,
    ValueBuilder,
    Special,
    NumberBuilder,
    ClaimBuilder,
    TimestampBuilder,
    DocumentBuilder,
    TupleBuilder,
    ClearanceBuilder,
    AckBuilder
};
