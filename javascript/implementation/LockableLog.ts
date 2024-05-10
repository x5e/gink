import { flock } from "fs-ext";
import { FileHandle, open } from "fs/promises";
import { ensure } from "./utils"
import { Stats } from "fs";
import { LogFileBuilder } from "./builders";

export class LockableLog {

    protected fileHandle: FileHandle;
    protected fileLocked: boolean = false;
    private lockableLogReady: Promise<void>;

    constructor(
        readonly filename: string,
        readonly exclusive: boolean = false,
    ) {
        this.lockableLogReady = this.initializeLockableLog();
    }

    get ready() { return this.lockableLogReady; }

    private async initializeLockableLog(): Promise<void> {
        this.fileHandle = await open(this.filename, "a+");
        if (this.exclusive) {
            await this.lockFile(false);
        }
    }

    protected async lockFile(block: boolean): Promise<boolean> {
        const thisLogBackedStore = this;
        return new Promise((resolve, reject) => {
            flock(this.fileHandle.fd, (block ? "ex" : "exnb"), (err) => {
                if (err) {
                    return reject(err);
                }
                thisLogBackedStore.fileLocked = true;
                resolve(true);
            });
        });
    }

    protected async unlockFile(): Promise<boolean> {
        const thisLogBackedStore = this;
        return new Promise((resolve, reject) => {
            flock(this.fileHandle.fd, ("un"), async (err) => {
                if (err) {
                    return reject(err);
                }
                thisLogBackedStore.fileLocked = false;
                resolve(true);
            });
        });
    }

    protected async getFileLength(): Promise<number> {
        let stats: Stats
        try {
            stats = await this.fileHandle.stat();
        } catch (problem) {
            console.error(`problem with fileHandle.stat ${problem}`);
            throw problem;
        }
        return stats.size;
    }

    protected async writeMagicNumber(): Promise<void> {
        ensure(this.fileLocked);
        const size = await this.getFileLength();
        if (size != 0)
            throw new Error("file not empty!");
        const logFragment = new LogFileBuilder();
        logFragment.setMagicNumber(1263421767);
        const bytes: Uint8Array = logFragment.serializeBinary();
        await this.fileHandle.writeFile(bytes);
    }

    async getContents(start: number=0, finish?: number): Promise<LogFileBuilder> {
        finish = finish ?? await this.getFileLength();
        const needToReed = finish - start;
        const uint8Array = new Uint8Array(needToReed);
        await this.fileHandle.read(uint8Array, 0, needToReed, start);
        return <LogFileBuilder>LogFileBuilder.deserializeBinary(uint8Array);
    }


}
