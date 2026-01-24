import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pkg from 'whatsapp-web.js';
import { getClient, getStatus, destroyClient, restartClient } from '../utils/whatsapp-client.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

// Mock whatsapp-web.js
vi.mock('whatsapp-web.js', () => {
    const Client = vi.fn().mockImplementation(() => ({
        on: vi.fn(),
        initialize: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn().mockResolvedValue(undefined),
        sendMessage: vi.fn(),
    }));
    return {
        default: {
            Client,
            LocalAuth: vi.fn().mockImplementation(() => ({})),
        }
    };
});

// Mock logger
vi.mock('../utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}));

// Mock fs
vi.mock('fs', () => ({
    default: {
        existsSync: vi.fn(),
        unlinkSync: vi.fn(),
    },
}));

describe('WhatsApp Client Utils', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        // Reset global state
        delete (global as any).whatsappClient;
        delete (global as any).whatsappStatus;
        delete (global as any).whatsappQR;
    });

    afterEach(async () => {
        await destroyClient();
        vi.useRealTimers();
    });

    it('should initialize client successfully', async () => {
        const client = getClient();
        expect(client).toBeDefined();
        expect(pkg.Client).toHaveBeenCalled();

        // Wait for initialize to be called
        await vi.runAllTimersAsync();
        expect(client.initialize).toHaveBeenCalled();
    });

    it('should return existing client instance (singleton)', () => {
        const client1 = getClient();
        const client2 = getClient();
        expect(client1).toBe(client2);
        expect(pkg.Client).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization failure and retry', async () => {
        const mockClient = {
            on: vi.fn(),
            initialize: vi.fn()
                .mockRejectedValueOnce(new Error('Init failed 1'))
                .mockRejectedValueOnce(new Error('Init failed 2'))
                .mockResolvedValueOnce(undefined),
            destroy: vi.fn(),
        };
        (pkg.Client as any).mockReturnValueOnce(mockClient);

        getClient();

        // Process first failure logic
        await vi.runOnlyPendingTimersAsync();

        // Advance time for first retry (2s)
        await vi.advanceTimersByTimeAsync(2000);

        // Advance time for second retry (4s)
        await vi.advanceTimersByTimeAsync(4000);

        expect(mockClient.initialize).toHaveBeenCalledTimes(3);
        expect(logger.error).toHaveBeenCalledWith(
            expect.objectContaining({ err: 'Init failed 1', retry: 1 }),
            expect.any(String)
        );
    });

    it('should recover from SingletonLock error', async () => {
        const mockClient = {
            on: vi.fn(),
            initialize: vi.fn()
                .mockRejectedValueOnce(new Error('SingletonLock'))
                .mockResolvedValueOnce(undefined),
            destroy: vi.fn(),
        };
        (pkg.Client as any).mockReturnValueOnce(mockClient);
        (fs.existsSync as any).mockReturnValue(true);

        getClient();

        // Process lock recovery logic
        await vi.runOnlyPendingTimersAsync();
        await vi.advanceTimersByTimeAsync(2000);

        expect(fs.unlinkSync).toHaveBeenCalled();
        expect(mockClient.initialize).toHaveBeenCalledTimes(2);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('SingletonLock'));
    });

    it('should update status on events', async () => {
        const mockClient = {
            on: vi.fn(),
            initialize: vi.fn().mockResolvedValue(undefined),
            destroy: vi.fn(),
        };
        (pkg.Client as any).mockReturnValueOnce(mockClient);

        getClient();

        // Find the 'qr' event listener and call it
        const qrListener = mockClient.on.mock.calls.find(call => call[0] === 'qr')?.[1];
        if (qrListener) qrListener('mock-qr-code');

        expect(getStatus().status).toBe('QR_READY');
        expect(getStatus().qr).toBe('mock-qr-code');

        // Find the 'ready' event listener and call it
        const readyListener = mockClient.on.mock.calls.find(call => call[0] === 'ready')?.[1];
        if (readyListener) readyListener();

        expect(getStatus().status).toBe('READY');
        expect(getStatus().qr).toBeNull();
    });

    it('should handle disconnection', async () => {
        const mockClient = {
            on: vi.fn(),
            initialize: vi.fn().mockResolvedValue(undefined),
            destroy: vi.fn().mockResolvedValue(undefined),
        };
        (pkg.Client as any).mockReturnValueOnce(mockClient);

        getClient();

        const disconnectListener = mockClient.on.mock.calls.find(call => call[0] === 'disconnected')?.[1];
        if (disconnectListener) await disconnectListener('reason');

        expect(getStatus().status).toBe('DISCONNECTED');
        expect(mockClient.destroy).toHaveBeenCalled();
    });

    it('should restart client', async () => {
        getClient();
        expect(pkg.Client).toHaveBeenCalledTimes(1);

        const restartPromise = restartClient();

        // Advance timers to trigger the delay in restartClient
        await vi.runAllTimersAsync();

        await restartPromise;
        expect(pkg.Client).toHaveBeenCalledTimes(2);
    });
});
