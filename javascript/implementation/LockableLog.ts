import { flock } from "fs-ext";
import { FileHandle, open } from "fs/promises";
import { ChainTracker } from "./ChainTracker";


export class LockableLog {

    public ready: Promise<void>;
    protected fileHandle: FileHandle;
    protected fileLocked: boolean = false;
    protected chainTracker: ChainTracker = new ChainTracker({});


    constructor(
        readonly filename: string,
        readonly exclusive: boolean = false,
    ) {
        this.ready = this.setupFile();
    }

    protected async setupFile() {
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


}
