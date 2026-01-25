/**
 * Sends a Server-Sent Event (SSE) message to the client.
 * Safely handles cases where the response might be closed or destroyed.
 *
 * @param {Object} res - The HTTP response object
 * @param {string} event - The event name
 * @param {Object} data - The data to send (will be JSON stringified)
 */
export function sendSSE(res, event, data) {
    if (res && !res.destroyed && !res.finished && !res.writableEnded) {
        try {
            res.write(`event: ${event}\n`);
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (err) {
            // Ignore if client disconnected
        }
    }
}

/**
 * Sets up the HTTP response headers for Server-Sent Events streaming.
 *
 * @param {Object} res - The HTTP response object
 */
export function setupSSEHeaders(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
}
