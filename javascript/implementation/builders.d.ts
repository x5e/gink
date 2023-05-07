import { Message } from "google-protobuf";
import {Entry} from "./typedefs";

declare class ImplementedMessage extends Message {
    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): {};
}

export declare enum Behavior {
    UNSPECIFIED,
    BOX=1,
    DIRECTORY=7, SEQUENCE=8,
    PROPERTY=9,
}
export declare enum Special {
    MISSING=0,
    NULL=3, TRUE=1, FALSE=2,
}
export class ContainerBuilder extends ImplementedMessage {
    getBehavior(): Behavior;
    setBehavior(Behavior);
}

export class ClearanceBuilder extends ImplementedMessage {
    setContainer(MuidBuilder);
    getContainer(): MuidBuilder;
    getPurge(): boolean;
    setPurge(boolean);
}

export class ChangeBuilder extends ImplementedMessage {
    setEntry(entryBuilder: EntryBuilder);
    setContainer(ContainerBuilder);
    hasContainer(): boolean;
    getContainer(): ContainerBuilder;
    hasEntry(): boolean;
    getEntry(): EntryBuilder;
    hasMovement(): boolean;
    getMovement(): MovementBuilder;
    setMovement(MovementBuilder);
    hasClearance(): boolean;
    getClearance(): ClearanceBuilder;
    setClearance(ClearanceBuilder);
}

export class BundleBuilder extends ImplementedMessage {
    setTimestamp(number);
    setPrevious(number);
    setChainStart(number);
    setMedallion(number);
    setComment(string);
    getChangesMap(): Map<number, ChangeBuilder>;
    getTimestamp(): number;
    getMedallion(): number;
    getChainStart(): number;
    getPrevious(): number;
    getComment(): string;
}

export class EntryBuilder extends ImplementedMessage {
    setContainer(MuidBuilder);
    setBehavior(Behavior);
    getBehavior(): Behavior;
    hasKey(): boolean;
    getKey(): KeyBuilder;
    setKey(KeyBuilder);
    setPointee(MuidBuilder);
    setDeletion(boolean);
    setValue(ValueBuilder);
    hasValue(): boolean;
    getValue(): ValueBuilder;
    hasPointee(): boolean;
    getPointee(): MuidBuilder;
    getDeletion(): boolean;
    hasContainer(): boolean;
    getContainer(): MuidBuilder;
    hasEffective(): boolean;
    getEffective(): number;
    getExpiry(): number;
    setDescribing(MuidBuilder);
    getDescribing(): MuidBuilder;
    hasDescribing(): boolean;
}

export class GreetingBuilder extends ImplementedMessage {
    addEntries(GreetingEntry);
}

export class GreetingEntryBuilder extends ImplementedMessage {
    setMedallion(number);
    setChainStart(number);
    setSeenThrough(number);
}

export class AckBuilder extends ImplementedMessage {
    getMedallion();
    getTimestamp();
    getChainStart();
    setMedallion(number);
    setTimestamp(number);
    setChainStart(number);
}

export class SyncMessageBuilder extends ImplementedMessage {
    setGreeting(GreetingBuilder);
    hasBundle(): boolean;
    getBundle_asU8(): Uint8Array;
    hasGreeting(): boolean;
    getGreeting(): GreetingBuilder;
    hasAck(): boolean;
    getAck(): AckBuilder;
    setBundle(Uint8Array);
    setAck(AckBuilder);
}

export class MuidBuilder extends ImplementedMessage {
    setMedallion(number);
    setTimestamp(number);
    setOffset(number);
    getTimestamp(): number;
    getMedallion(): number;
    getOffset(): number;
}

export class NumberBuilder extends ImplementedMessage {
    hasDoubled(): boolean;
    getDoubled(): number;
    setDoubled(number);
}

export class DocumentBuilder extends ImplementedMessage {
    getKeysList(): Array<KeyBuilder>;
    getValuesList(): Array<ValueBuilder>;
    addKeys(KeyBuilder);
    addValues(ValueBuilder);
}

export class TupleBuilder extends ImplementedMessage {
    getValuesList(): Array<ValueBuilder>;
    setValuesList(values: Array<ValueBuilder>);
}

export class TimestampBuilder extends ImplementedMessage {
    getMillis(): number;
    setMillis(number);
}

export class ValueBuilder extends ImplementedMessage {
    hasCharacters(): boolean;
    getCharacters(): string;
    asOctets(): boolean;
    getOctets(): Uint8Array;
    hasInteger(): boolean;
    hasBigInt(): boolean;
    getInteger(): number;
    hasSpecial(): boolean;
    getSpecial(): number;
    hasOctets(): boolean;
    getOctets(): Uint8Array;
    hasDocument(): boolean;
    getDocument(): DocumentBuilder;
    hasTuple(): boolean;
    getTuple(): TupleBuilder;
    hasTimestamp(): boolean;
    getTimestamp(): TimestampBuilder;
    setOctets(Uint8Array);
    setTimestamp(TimestampBuilder);
    setSpecial(Special);
    setCharacters(string);
    setInteger(NumberBuilder);
    setTuple(TupleBuilder);
    setDocument(DocumentBuilder);
    hasDoubled(): boolean;
    getDoubled(): number;
    setDoubled(number);
}

export class KeyBuilder extends ImplementedMessage {
    setCharacters(string);
    setNumber(number);
    setOctets(Uint8Array);
    hasCharacters(): boolean;
    getCharacters(): string;
    hasNumber(): boolean;
    getNumber(): number;
    hasOctets(): boolean;
    getOctets(): Uint8Array;
}

export class ChainEntryBuilder extends ImplementedMessage {
    getMedallion(): number;
    getChainStart(): number;
    setChainStart(number);
    setMedallion(number);
}

export class LogFileBuilder extends ImplementedMessage {
    setCommitsList(commits: Array<Uint8Array>);
    getCommitsList(): Array<Uint8Array>;
    getChainEntriesList(): Array<ChainEntryBuilder>;
    setChainEntriesList(entries: Array<ChainEntryBuilder>);
}

export class MovementBuilder extends ImplementedMessage {
    getEntry(): MuidBuilder;
    getDest(): number;
    setDest(number);
    hasContainer(): boolean;
    getContainer(): MuidBuilder;
    setEntry(MuidBuilder);
    setContainer(MuidBuilder);
    getPurge(): boolean;
    setPurge(boolean);
}
