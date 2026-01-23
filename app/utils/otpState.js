import logger from './logger.js';

/**
 * Global state for pending OTP requests.
 * key: requestId
 * value: { resolve: Function, reject: Function, timeout: NodeJS.Timeout }
 */
const pendingRequests = new Map();

/**
 * Register a new OTP request and wait for it to be resolved via the API.
 * @param {string} requestId - Unique ID for the request
 * @param {number} timeoutMs - Timeout in milliseconds (default 5 minutes)
 * @returns {Promise<string>} - The OTP code
 */
export async function registerAndAwaitForOtp(requestId, timeoutMs = 300000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            if (pendingRequests.has(requestId)) {
                pendingRequests.delete(requestId);
                reject(new Error(`OTP request ${requestId} timed out after ${timeoutMs}ms`));
            }
        }, timeoutMs);

        pendingRequests.set(requestId, { resolve, reject, timeout });
        logger.info({ requestId }, '[OTP State] Registered pending OTP request');
    });
}

/**
 * Resolve a pending OTP request with a code.
 * @param {string} requestId - The unique ID for the request
 * @param {string} code - The OTP code received from the user
 * @returns {boolean} - True if the request was found and resolved
 */
export function resolveOtpRequest(requestId, code) {
    const request = pendingRequests.get(requestId);
    if (!request) {
        logger.warn({ requestId }, '[OTP State] Attempted to resolve unknown or expired OTP request');
        return false;
    }

    clearTimeout(request.timeout);
    pendingRequests.delete(requestId);
    request.resolve(code);
    logger.info({ requestId }, '[OTP State] Resolved OTP request');
    return true;
}

/**
 * Reject a pending OTP request (e.g. if user cancels)
 * @param {string} requestId 
 * @param {string} reason 
 */
export function rejectOtpRequest(requestId, reason = 'User cancelled') {
    const request = pendingRequests.get(requestId);
    if (!request) return false;

    clearTimeout(request.timeout);
    pendingRequests.delete(requestId);
    request.reject(new Error(reason));
    logger.info({ requestId, reason }, '[OTP State] Rejected OTP request');
    return true;
}
