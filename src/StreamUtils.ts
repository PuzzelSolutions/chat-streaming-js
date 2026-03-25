/** Logging interface used throughout the library. Supply `console` or a custom logger. */
export interface DebugLogger {
    debugDisabled?: boolean;
    log: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
}

const wait = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry a promise-returning function up to {@link maxRetries} times.
 *
 * @param promisedFunction - Factory that returns a fresh `Promise` on each attempt.
 * @param delay - Milliseconds to wait between retries.
 * @param maxRetries - Maximum number of attempts (including the first).
 * @param abortReason - If a rejection matches this value (strict equality), retrying stops immediately.
 * @returns The resolved value from the first successful attempt.
 */
export const retryPromiseFunc = async (
    promisedFunction: () => Promise<unknown>,
    delay: number,
    maxRetries: number,
    abortReason?: unknown
): Promise<unknown> => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await promisedFunction();
        } catch (reason: unknown) {
            if (reason === abortReason || attempt >= maxRetries - 1) {
                throw reason;
            }
            await wait(delay);
        }
    }
};

/**
 * Race a promise against a timeout.
 *
 * @param promise - The promise to race.
 * @param ms - Timeout in milliseconds. If exceeded, the returned promise rejects with `Error('timeout')`.
 */
export const promiseTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
            wait(ms).then(() => reject(new Error('timeout')));
        })
    ]);
};

/**
 * Recursively deep-merge objects.
 *
 * **Caveat:** When a key on the incoming object maps to a primitive and the
 * corresponding key in the accumulator is also a primitive (or absent), the
 * entire accumulator is replaced with the incoming object. This means
 * flat-object merges behave like `Object.assign` only when both sides share
 * the same keys.  Nested objects with matching keys are merged recursively,
 * and arrays at matching keys are deduplicated.
 */
export const mergeDeep = (...objects: unknown[]): unknown => {
    const isObject = (obj: unknown): obj is Record<string, unknown> => obj !== null && typeof obj === 'object';
    return objects.reduce((prev: unknown, obj: unknown) => {
        if (!prev || !isObject(prev)) prev = {};
        if (isObject(obj)) {
            Object.keys(obj).forEach(key => {
                const pVal = (prev as Record<string, unknown>)[key];
                const oVal = obj[key];
                if (Array.isArray(oVal) && Array.isArray(pVal)) {
                    (prev as Record<string, unknown>)[key] = [...new Set([...oVal, ...pVal])];
                } else if (isObject(oVal) && isObject(pVal)) {
                    (prev as Record<string, unknown>)[key] = mergeDeep(pVal, oVal);
                } else {
                    if (isObject(pVal)) {
                        (prev as Record<string, unknown>)[key] = oVal;
                    } else {
                        prev = obj;
                    }
                }
            });
            return prev;
        } else {
            return obj;
        }
    }, {});
};

/**
 * Safe wrapper around `localStorage.getItem` that silently returns `undefined`
 * in environments where `localStorage` is unavailable (Node, sandboxed iframes).
 */
export const safeLocalStorageGet = (key: string): string | null | undefined => {
    try {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem(key);
        }
    } catch {
        // Node or sandboxed env -- ignore
    }
};

/** Default no-op logger used when no debug functions are supplied. */
export const noDebug: DebugLogger = {
    debugDisabled: true,
    log: () => {},
    warn: () => {},
    error: () => {},
    info: () => {}
};
