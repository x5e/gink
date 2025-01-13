import { flock } from "fs-ext";
import { FileHandle, open } from "fs/promises";
import { Stats } from "fs";

export class LockableFile {
    protected fileHandle: FileHandle;
    protected fileLocked: boolean = false;
    private lockableFileReady: Promise<void>;

    constructor(
        readonly filename: string,
        readonly exclusive: boolean = false,
    ) {
        this.lockableFileReady = this.initializeLockableFile();
    }

    get ready() {
        return this.lockableFileReady;
    }

    private async initializeLockableFile(): Promise<void> {
        this.fileHandle = await open(this.filename, "a+");
        if (this.exclusive) {
            await this.lockFile(false);
        }
    }

    protected async lockFile(block: boolean): Promise<boolean> {
        // console.error(`about to lock ${this.filename}`);
        const thisLockableFile = this;
        return new Promise((resolve, reject) => {
            flock(this.fileHandle.fd, block ? "ex" : "exnb", (err) => {
                if (err) {
                    return reject(err);
                }
                thisLockableFile.fileLocked = true;
                resolve(true);
            });
        });
    }

    protected async unlockFile(): Promise<boolean> {
        // console.error(`about to unlock ${this.filename}`)
        const thisLogBackedStore = this;
        return new Promise((resolve, reject) => {
            flock(this.fileHandle.fd, "un", async (err) => {
                if (err) {
                    return reject(err);
                }
                thisLogBackedStore.fileLocked = false;
                resolve(true);
            });
        });
    }

    protected async getFileLength(): Promise<number> {
        let stats: Stats;
        try {
            stats = await this.fileHandle.stat();
        } catch (problem) {
            console.error(`problem with fileHandle.stat ${problem}`);
            throw problem;
        }
        return stats.size;
    }
}
