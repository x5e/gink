import { LockableLog } from "./LockableLog";
import { LogBackedStore } from "./LogBackedStore";
import { join, resolve } from "path";
import { ensure } from "./utils";
import { SimpleServer } from "./SimpleServer";

class BraidServer {
    readonly directory: string;
    static readonly EXTENSION = ".binlog"

    constructor(readonly metadataSimpleServer: SimpleServer, directory: string) {
        this.directory = resolve(directory);

    }
}
