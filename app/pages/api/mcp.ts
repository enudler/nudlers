import { NextApiRequest, NextApiResponse } from "next";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServer } from "../../utils/mcp-setup";
import logger from "../../utils/logger";

// Global storage for active transports
// This allows us to route POST messages to the correct SSE connection
// Note: This only works in a single-process environment (like default Next.js dev/start)
const globalWithMcp = global as typeof globalThis & {
    mcpTransports: Map<string, SSEServerTransport>;
};

if (!globalWithMcp.mcpTransports) {
    globalWithMcp.mcpTransports = new Map();
}

export const config = {
    api: {
        // Disable body parsing so the MCP SDK can handle the raw request stream
        bodyParser: false,
        // Inform Next.js that the response is handled by an external resolver (MCP SDK)
        externalResolver: true,
    },
};

export default async function handler(req: any, res: any) {
    if (req.method === "GET") {
        logger.info("New MCP SSE connection request");

        // Set headers for SSE
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no"); // Disable buffering for Nginx/Vercel

        // Ensure the socket stays open
        if (res.socket) {
            res.socket.setTimeout(0);
            res.socket.setNoDelay(true);
            res.socket.setKeepAlive(true);
        }

        const transport = new SSEServerTransport("/api/mcp", res);
        const server = createMcpServer();

        await server.connect(transport);

        const sessionId = (transport as any).sessionId;

        if (sessionId) {
            logger.info(`Registered MCP session: ${sessionId}`);
            globalWithMcp.mcpTransports.set(sessionId, transport);
        } else {
            logger.error("Failed to retrieve sessionId from transport");
        }

        // Add periodic heartbeats to keep the connection alive
        const heartbeat = setInterval(() => {
            res.write(":\n\n");
            // Some systems need explicit flush
            if (typeof res.flush === "function") {
                res.flush();
            }
        }, 15000);

        // Create a promise that resolves when the client disconnects
        const closed = new Promise((resolve) => {
            req.on("close", () => {
                clearInterval(heartbeat);
                if (sessionId) {
                    logger.info(`Closed MCP session: ${sessionId}`);
                    globalWithMcp.mcpTransports.delete(sessionId);
                }
                resolve(true);
            });

            req.on("error", (err: any) => {
                clearInterval(heartbeat);
                logger.error({ error: err.message }, "MCP request error");
                resolve(true);
            });
        });

        // Keep the handler open until the client disconnects
        await closed;
        return;
    }

    if (req.method === "POST") {
        try {
            const sessionId = req.query.sessionId as string;

            if (!sessionId) {
                logger.warn("POST request missing sessionId");
                res.status(400).json({
                    jsonrpc: "2.0",
                    id: null,
                    error: { code: -32600, message: "Missing sessionId" }
                });
                return;
            }

            const transport = globalWithMcp.mcpTransports.get(sessionId);
            if (!transport) {
                logger.warn(`Session not found: ${sessionId}`);
                res.status(404).json({
                    jsonrpc: "2.0",
                    id: null,
                    error: { code: -32001, message: "Session not found" }
                });
                return;
            }

            // Delegate message handling to the transport
            await transport.handlePostMessage(req, res);
        } catch (error: any) {
            logger.error({ error: error.message, stack: error.stack }, "Error in MCP POST handler");

            // Avoid double-responding if transport already responded
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: "2.0",
                    id: null,
                    error: { code: -32603, message: error.message || "Internal error" }
                });
            }
        }
        return;
    }

    res.status(405).end("Method not allowed");
}
