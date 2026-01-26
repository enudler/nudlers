import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from '../pages/api/whatsapp/status.js';

// Mock the whatsapp-client module
vi.mock('../utils/whatsapp-client.js', () => ({
    getStatus: vi.fn().mockReturnValue({
        status: 'DISCONNECTED',
        qr: null,
        timestamp: new Date().toISOString()
    }),
    restartClient: vi.fn().mockResolvedValue(undefined),
    destroyClient: vi.fn().mockResolvedValue(undefined),
    initializeClient: vi.fn(),
    renewQrCode: vi.fn(),
}));

import { getStatus, restartClient, destroyClient, initializeClient, renewQrCode } from '../utils/whatsapp-client.js';

// Helper to create mock req/res
function createMockReqRes(method: string, body?: object) {
    const req = {
        method,
        body: body || {},
    };
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
    return { req, res };
}

describe('WhatsApp Status API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /api/whatsapp/status', () => {
        it('should return current status', async () => {
            const { req, res } = createMockReqRes('GET');

            await handler(req as any, res as any);

            expect(getStatus).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                status: 'DISCONNECTED',
                qr: null,
            }));
        });
    });

    describe('POST /api/whatsapp/status', () => {
        it('should handle connect action', async () => {
            const { req, res } = createMockReqRes('POST', { action: 'connect' });

            await handler(req as any, res as any);

            expect(initializeClient).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: 'Connecting... QR code will be generated shortly.' });
        });

        it('should handle restart action', async () => {
            const { req, res } = createMockReqRes('POST', { action: 'restart' });

            await handler(req as any, res as any);

            expect(restartClient).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: 'Restarting client...' });
        });

        it('should handle disconnect action', async () => {
            const { req, res } = createMockReqRes('POST', { action: 'disconnect' });

            await handler(req as any, res as any);

            expect(destroyClient).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: 'Client disconnected' });
        });

        it('should handle renewQr action', async () => {
            const { req, res } = createMockReqRes('POST', { action: 'renewQr' });

            await handler(req as any, res as any);

            expect(renewQrCode).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: 'Renewing QR code... New QR will be generated shortly.' });
        });

        it('should return 400 for invalid action', async () => {
            const { req, res } = createMockReqRes('POST', { action: 'invalidAction' });

            await handler(req as any, res as any);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: 'Invalid action' });
        });
    });

    describe('Other HTTP methods', () => {
        it('should return 405 for unsupported methods', async () => {
            const { req, res } = createMockReqRes('DELETE');

            await handler(req as any, res as any);

            expect(res.status).toHaveBeenCalledWith(405);
            expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
        });
    });
});
