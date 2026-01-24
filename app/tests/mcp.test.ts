import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from '../pages/api/mcp';
import { EventEmitter } from 'events';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock Response class to capture SSE stream and standard responses
class MockResponse extends EventEmitter {
    statusCode = 200;
    headers: Record<string, string | string[]> = {};
    body = '';
    chunks: string[] = [];
    finished = false;

    status(code: number) {
        this.statusCode = code;
        return this;
    }

    setHeader(name: string, value: string | string[]) {
        this.headers[name.toLowerCase()] = value;
        return this;
    }

    getHeader(name: string) {
        return this.headers[name.toLowerCase()];
    }

    writeHead(code: number, headers?: any) {
        this.statusCode = code;
        if (headers) {
            for (const [key, value] of Object.entries(headers)) {
                this.headers[key.toLowerCase()] = value as string;
            }
        }
        return this;
    }

    write(chunk: any) {
        const str = chunk.toString();
        this.chunks.push(str);
        this.body += str;
        return true;
    }

    end(chunk?: any) {
        if (chunk) {
            this.write(chunk);
        }
        this.finished = true;
        this.emit('finish');
        return this;
    }

    // Next.js specific
    send(body: any) {
        this.write(body);
        this.end();
        return this;
    }
}

// Mock Request class
class MockRequest extends EventEmitter {
    method: string;
    url: string;
    query: Record<string, string> = {};
    body: any = {};
    headers: Record<string, string> = {};

    constructor(method: string, url: string) {
        super();
        this.method = method;
        this.url = url;
    }
}

describe('MCP Server API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetch.mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(''),
            json: () => Promise.resolve({})
        } as Response);
    });

    it('should establish an SSE connection on GET', async () => {
        const req = new MockRequest('GET', '/api/mcp');
        const res = new MockResponse();
        (res as any).socket = {
            setTimeout: vi.fn(),
            setNoDelay: vi.fn(),
            setKeepAlive: vi.fn(),
        };
        (res as any).flush = vi.fn();

        // Emit close after some time to let the handler finish
        setTimeout(() => req.emit('close'), 200);

        await handler(req, res);

        // Expect SSE headers
        expect(res.headers['content-type']).toBe('text/event-stream');
        expect(res.headers['cache-control']).toContain('no-cache');
        expect(res.headers['connection']).toBe('keep-alive');

        const output = res.body;
        expect(output).toContain('event: endpoint');
        expect(output).toContain('/api/mcp?sessionId=');
    });

    it('should handle POST messages for tools', async () => {
        const initReq = new MockRequest('GET', '/api/mcp');
        const initRes = new MockResponse();
        (initRes as any).socket = {
            setTimeout: vi.fn(),
            setNoDelay: vi.fn(),
            setKeepAlive: vi.fn(),
        };

        // Start GET handler in background
        const handlerPromise = handler(initReq, initRes);

        await new Promise(resolve => setTimeout(resolve, 100));

        const match = initRes.body.match(/sessionId=([a-zA-Z0-9-]+)/);
        expect(match).toBeTruthy();
        const sessionId = match![1];

        const postReq = new MockRequest('POST', `/api/mcp?sessionId=${sessionId}`);
        postReq.query = { sessionId };
        postReq.headers = { 'content-type': 'application/json' };

        postReq.body = {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: { name: "test-client", version: "1.0.0" }
            }
        };

        const postRes = new MockResponse();
        setTimeout(() => {
            postReq.emit('data', Buffer.from(JSON.stringify(postReq.body)));
            postReq.emit('end');
        }, 10);

        await handler(postReq, postRes);
        await new Promise(resolve => setTimeout(resolve, 200));

        expect(postRes.statusCode).toBeLessThan(300);
        expect(initRes.body).toContain('serverInfo');
        expect(initRes.body).toContain('nudlers');

        // Cleanup
        initReq.emit('close');
        await handlerPromise;
    });

    it('should list available tools', async () => {
        // 1. Establish connection
        const initReq = new MockRequest('GET', '/api/mcp');
        const initRes = new MockResponse();
        (initRes as any).socket = {
            setTimeout: vi.fn(),
            setNoDelay: vi.fn(),
            setKeepAlive: vi.fn(),
        };
        const handlerPromise = handler(initReq, initRes);
        await new Promise(resolve => setTimeout(resolve, 100));

        const match = initRes.body.match(/sessionId=([a-zA-Z0-9-]+)/);
        const sessionId = match![1];

        // 2. Initialize
        const valReq = new MockRequest('POST', `/api/mcp?sessionId=${sessionId}`);
        valReq.query = { sessionId };
        valReq.headers = { 'content-type': 'application/json' };
        valReq.body = {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: { name: "test-client", version: "1.0.0" }
            }
        };
        setTimeout(() => {
            valReq.emit('data', Buffer.from(JSON.stringify(valReq.body)));
            valReq.emit('end');
        }, 10);

        const valRes = new MockResponse();
        await handler(valReq, valRes);
        await new Promise(resolve => setTimeout(resolve, 200));
        expect(valRes.statusCode).toBeLessThan(300);

        // 3. List Tools
        const postReq = new MockRequest('POST', `/api/mcp?sessionId=${sessionId}`);
        postReq.query = { sessionId };
        postReq.headers = { 'content-type': 'application/json' };
        postReq.body = {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/list",
            params: {}
        };

        setTimeout(() => {
            postReq.emit('data', Buffer.from(JSON.stringify(postReq.body)));
            postReq.emit('end');
        }, 10);

        const postRes = new MockResponse();
        await handler(postReq, postRes);

        await new Promise(resolve => setTimeout(resolve, 1000));
        expect(postRes.statusCode).toBeLessThan(300);

        // Verify "get_monthly_summary" is in the output stream
        expect(initRes.body).toContain('get_monthly_summary');

        // Cleanup
        initReq.emit('close');
        await handlerPromise;
    });

    // Cleanup
    afterEach(() => {
        // Close any lingering sessions if possible
    });
});
