import { ensure } from "./utils";
import { LogFileBuilder } from "./builders";
import { LockableFile } from "./LockableFile";

export class LockableLog extends LockableFile {

    protected async writeMagicNumber(): Promise<void> {
        ensure(this.fileLocked);
        const size = await this.getFileLength();
        if (size !== 0)
            throw new Error("file not empty!");
        const logFragment = new LogFileBuilder();
        logFragment.setMagicNumber(1263421767);
        await this.writeLogFragment(logFragment);
    }

    protected async writeLogFragment(fragment: LogFileBuilder, sync?: boolean): Promise<number> {
        ensure(this.fileLocked);
        const bytes: Uint8Array = fragment.serializeBinary();
        await this.fileHandle.writeFile(bytes);
        if (sync)
            await this.fileHandle.sync();
        return bytes.byteLength;
    }

    async getLogContents(start: number = 0, finish?: number): Promise<LogFileBuilder> {
        // I could imagine replacing this with a async iterator that only reads fragments of the
        // file, though that would only be worth the trouble if the file gets large enough that
        // the memory required to read the whole thing is an expensive resource.
        finish = finish ?? await this.getFileLength();
        const needToReed = finish - start;
        const uint8Array = new Uint8Array(needToReed);
        await this.fileHandle.read(uint8Array, 0, needToReed, start);
        return <LogFileBuilder>LogFileBuilder.deserializeBinary(uint8Array);
    }

}
