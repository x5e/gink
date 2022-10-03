import { CallBack } from "./typedefs";

export class PromiseChainLock {

    // Chain of promises that allow multiple attempts to aquire to wait their turn for the lock.
    private queue: Promise<void> = Promise.resolve();

    /**
     * An async function that waits to aquire the lock, then provides a function to unlock.
     * Use like: 
     * let unlockingFunction: CallBack;
     * try {
     *   unlockingFunction = await promiseChainLock.aquireLock();
     * } finally {
     *   unlockingFunction();
     * }
     * @returns a promise that resolves when the lock has been aquired, resolving to a cb to unlock it.
     */
    async acquireLock(): Promise<CallBack> {
        let calledWhenLockAquired: (cb: CallBack) => void = null;
        var calledToReleaseLock: CallBack = null;
        var resolvesWhenLockAquired = new Promise<CallBack>((r) => { calledWhenLockAquired = r; });
        this.queue = this.queue.then(() => {
            var resolvesWhenLockReleased = new Promise<void>((r) => { calledToReleaseLock = r; });
            calledWhenLockAquired(calledToReleaseLock);
            return resolvesWhenLockReleased;
        });
        return resolvesWhenLockAquired;
    }
}
