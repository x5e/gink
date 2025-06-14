import { Message } from "google-protobuf";
import { Bytes } from "./typedefs";

declare class ImplementedMessage extends Message {
    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): {};
}

export declare enum Behavior {
    UNSPECIFIED,
    BOX = 1,
    SEQUENCE = 2,
    PAIR_MAP = 3,
    DIRECTORY = 4,
    KEY_SET = 5,
    GROUP = 6,
    VERTEX = 7,
    PAIR_SET = 8,
    EVENT_TYPE = 9,
    PROPERTY = 10,
    EDGE_TYPE = 11,
    TABLE = 12,
    BRAID = 13,
    ACCUMULATOR = 14,
}
export declare enum Special {
    MISSING = 0,
    NULL = 3,
    TRUE = 1,
    FALSE = 2,
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
    getChangesList(): List<ChangeBuilder>;
    setChangesList(changes: ChangeBuilder[]);
    getVerifyKey(): Bytes;
    setVerifyKey(Bytes);
    setPriorHash(Bytes);
    getPriorHash(): Bytes;

    setEncrypted(Bytes);
    getEncrypted(): Bytes;
    setKeyId(number);
    getKeyId(): number;

    setTimestamp(number);
    setPrevious(number);
    setChainStart(number);
    setMedallion(number);
    setComment(string);
    setIdentity(string);
    getTimestamp(): number;
    getMedallion(): number;
    getChainStart(): number;
    getPrevious(): number;
    getComment(): string;
    getIdentity(): string;
}

export class PairBuilder extends ImplementedMessage {
    setLeft(MuidBuilder);
    getLeft(): MuidBuilder;
    setRite(MuidBuilder);
    getRite(): MuidBuilder;
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
    hasPair(): boolean;
    setPair(PairBuilder);
    getPair(): PairBuilder;
    hasPointee(): boolean;
    getPointee(): MuidBuilder;
    getDeletion(): boolean;
    hasContainer(): boolean;
    getContainer(): MuidBuilder;
    setEffective(number);
    hasEffective(): boolean;
    getEffective(): number;
    getExpiry(): number;
    setDescribing(MuidBuilder);
    getDescribing(): MuidBuilder;
    hasDescribing(): boolean;
    getPurge(): boolean;
    setPurge(boolean);
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
    hasSignal(): boolean;
    getSignal(): SignalBuilder;
    setSignal(SignalBuilder);
}

export class MuidBuilder extends ImplementedMessage {
    setMedallion(number);
    setTimestamp(number);
    setOffset(number);
    getTimestamp(): number;
    getMedallion(): number;
    getOffset(): number;
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

export class ValueBuilder extends ImplementedMessage {
    hasCharacters(): boolean;
    getCharacters(): string;
    asOctets(): boolean;
    hasInteger(): boolean;
    getInteger(): string;
    setInteger(string);
    hasSpecial(): boolean;
    getSpecial(): number;
    hasOctets(): boolean;
    getOctets_asU8(): Uint8Array;
    hasDocument(): boolean;
    getDocument(): DocumentBuilder;
    hasTuple(): boolean;
    getTuple(): TupleBuilder;
    hasTimestamp(): boolean;
    getTimestamp(): number;
    setTimestamp(number);
    setOctets(Uint8Array);
    setSpecial(Special);
    setCharacters(string);
    setTuple(TupleBuilder);
    setDocument(DocumentBuilder);
    hasFloating(): boolean;
    getFloating(): number;
    setFloating(number);
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
    getOctets_asU8(): Uint8Array;
}

export class ClaimBuilder extends ImplementedMessage {
    getMedallion(): number;
    getChainStart(): number;
    setChainStart(number);
    setMedallion(number);
    getProcessId(): number;
    setProcessId(number);
    getClaimTime(): number;
    setClaimTime(number);
}

export class KeyPairBuilder extends ImplementedMessage {
    getPublicKey_asU8(): Uint8Array;
    getSecretKey_asU8(): Uint8Array;
    setPublicKey(Uint8Array);
    setSecretKey(Uint8Array);
}

export class LogFileBuilder extends ImplementedMessage {
    setBundlesList(bundles: Array<Uint8Array>);
    getBundlesList(): Array<Uint8Array>;
    getClaimsList(): Array<ClaimBuilder>;
    setClaimsList(entries: Array<ClaimBuilder>);
    setMagicNumber(number);
    getMagicNumber(): number;
    setKeyPairsList(array: Array<KeyPairBuilder>);
    getKeyPairsList(): Array<KeyPairBuilder>;
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

export class SignalBuilder extends ImplementedMessage {
    getSignalType(): number;
    setSignalType(number);
}

export declare enum SignalType {
    UNDEFINED = 0,
    BUNDLES_SENT = 1,
}
