import { CallBack } from "./typedefs";

export class PromiseChainLock {

    // Chain of promises that allow multiple attempts to acquire to wait their turn for the lock.
    private queue: Promise<void> = Promise.resolve();

    /**
     * An async function that waits to acquire the lock, then provides a function to unlock.
     * Use like:
     * const unlockingFunction = await promiseChainLock.acquireLock();
     * try {
     *   // Do some stuff.
     * } finally {
     *   unlockingFunction();
     * }
     * @returns a promise that resolves when the lock has been acquired, resolving to a cb to unlock it.
     */
    async acquireLock(): Promise<CallBack> {
        let calledWhenLockAcquired: (cb: CallBack) => void = null;
        let calledToReleaseLock: CallBack = null;
        const resolvesWhenLockAcquired = new Promise<CallBack>((r) => { calledWhenLockAcquired = r; });
        this.queue = this.queue.then(() => {
            const resolvesWhenLockReleased = new Promise<void>((r) => { calledToReleaseLock = r; });
            calledWhenLockAcquired(calledToReleaseLock);
            return resolvesWhenLockReleased;
        });
        return resolvesWhenLockAcquired;
    }
}
