/**
 * Utility functions for app settings conversion and validation.
 */

/**
 * Converts a millisecond duration to seconds for display.
 * @param ms Duration in milliseconds
 * @returns Duration in seconds
 */
export function msToSeconds(ms: number | string | undefined | null): number {
    if (ms === undefined || ms === null || ms === '') return 0;
    const val = typeof ms === 'string' ? parseInt(ms) : ms;
    if (isNaN(val)) return 0;
    return val / 1000;
}

/**
 * Converts a second duration to milliseconds for storage.
 * @param seconds Duration in seconds
 * @returns Duration in milliseconds
 */
export function secondsToMs(seconds: number | string | undefined | null): number {
    if (seconds === undefined || seconds === null || seconds === '') return 0;
    const val = typeof seconds === 'string' ? parseInt(seconds) : seconds;
    if (isNaN(val)) return 0;
    return val * 1000;
}
