
const BundleBuilder = require("../builders/bundle_pb")["Bundle"];
const Behavior = require("../builders/behavior_pb")["Behavior"];
const ChangeBuilder = require("../builders/change_pb")["Change"];
const EntryBuilder = require("../builders/entry_pb")["Entry"];
const ContainerBuilder = require("../builders/container_pb")["Container"];
const SyncMessageBuilder = require("../builders/sync_message_pb")["SyncMessage"];
const GreetingBuilder = SyncMessageBuilder.Greeting;
const GreetingEntryBuilder = GreetingBuilder.GreetingEntry;
const LogFileBuilder = require("../builders/log_file_pb")["LogFile"];
const ChainEntryBuilder = LogFileBuilder.ChainEntry;
const MovementBuilder = require("../builders/movement_pb")["Movement"];
const MuidBuilder = require("../builders/muid_pb")["Muid"];
const KeyBuilder = require("../builders/key_pb")["Key"];
const ValueBuilder = require("../builders/value_pb")["Value"];
const Special = ValueBuilder.Special;
const NumberBuilder = ValueBuilder.Number;
const TimestampBuilder = ValueBuilder.Timestamp;
const DocumentBuilder = ValueBuilder.Document;
const TupleBuilder = ValueBuilder.Tuple;

module.exports = {
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
    ValueBuilder,
    Special,
    NumberBuilder,
    ChainEntryBuilder,
    TimestampBuilder,
    DocumentBuilder,
    TupleBuilder,
}