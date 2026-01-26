import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pkg from 'whatsapp-web.js';
import { getClient, getOrCreateClient, initializeClient, getStatus, destroyClient, restartClient, hasPersistedSession, clearSession, renewQrCode } from '../utils/whatsapp-client.js';
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
        rmSync: vi.fn(),
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
        delete (global as any).whatsappAutoRestoreAttempted;
    });

    afterEach(async () => {
        await destroyClient();
        vi.useRealTimers();
    });

    describe('getClient', () => {
        it('should return null when no client exists', () => {
            const client = getClient();
            expect(client).toBeNull();
            expect(pkg.Client).not.toHaveBeenCalled();
        });

        it('should return existing client instance', async () => {
            // First initialize the client
            initializeClient();
            await vi.runAllTimersAsync();

            // Then getClient should return it without creating new
            const clientCallCount = (pkg.Client as any).mock.calls.length;
            const client = getClient();

            expect(client).toBeDefined();
            expect(pkg.Client).toHaveBeenCalledTimes(clientCallCount); // No new calls
        });
    });

    describe('initializeClient', () => {
        it('should initialize client successfully', async () => {
            const client = initializeClient();
            expect(client).toBeDefined();
            expect(pkg.Client).toHaveBeenCalled();

            // Wait for initialize to be called
            await vi.runAllTimersAsync();
            expect(client.initialize).toHaveBeenCalled();
        });

        it('should return existing client instance (singleton)', () => {
            const client1 = initializeClient();
            const client2 = initializeClient();
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

            initializeClient();

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

            initializeClient();

            // Process lock recovery logic
            await vi.runOnlyPendingTimersAsync();
            await vi.advanceTimersByTimeAsync(2000);

            expect(fs.unlinkSync).toHaveBeenCalled();
            expect(mockClient.initialize).toHaveBeenCalledTimes(2);
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('SingletonLock'));
        });
    });

    describe('getOrCreateClient', () => {
        it('should create client if none exists', async () => {
            const client = getOrCreateClient();
            expect(client).toBeDefined();
            expect(pkg.Client).toHaveBeenCalled();
        });

        it('should return existing client without creating new one', async () => {
            initializeClient();
            const callCount = (pkg.Client as any).mock.calls.length;

            getOrCreateClient();
            expect(pkg.Client).toHaveBeenCalledTimes(callCount); // No additional calls
        });
    });

    describe('status and events', () => {
        it('should update status on events', async () => {
            const mockClient = {
                on: vi.fn(),
                initialize: vi.fn().mockResolvedValue(undefined),
                destroy: vi.fn(),
            };
            (pkg.Client as any).mockReturnValueOnce(mockClient);

            initializeClient();

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

            initializeClient();

            const disconnectListener = mockClient.on.mock.calls.find(call => call[0] === 'disconnected')?.[1];
            if (disconnectListener) await disconnectListener('reason');

            expect(getStatus().status).toBe('DISCONNECTED');
            expect(mockClient.destroy).toHaveBeenCalled();
        });
    });

    describe('restartClient', () => {
        it('should restart client', async () => {
            initializeClient();
            expect(pkg.Client).toHaveBeenCalledTimes(1);

            const restartPromise = restartClient();

            // Advance timers to trigger the delay in restartClient
            await vi.runAllTimersAsync();

            await restartPromise;
            expect(pkg.Client).toHaveBeenCalledTimes(2);
        });
    });

    describe('hasPersistedSession', () => {
        it('should return true when session files exist', () => {
            (fs.existsSync as any).mockReturnValue(true);

            const result = hasPersistedSession();

            expect(result).toBe(true);
            expect(fs.existsSync).toHaveBeenCalledTimes(2); // Default folder and Local State
            expect(logger.info).toHaveBeenCalledWith(
                expect.objectContaining({ sessionPath: expect.any(String) }),
                'Found persisted WhatsApp session'
            );
        });

        it('should return false when no session files exist', () => {
            (fs.existsSync as any).mockReturnValue(false);

            const result = hasPersistedSession();

            expect(result).toBe(false);
        });

        it('should return false when only partial session exists', () => {
            (fs.existsSync as any)
                .mockReturnValueOnce(true)  // Default folder exists
                .mockReturnValueOnce(false); // Local State doesn't exist

            const result = hasPersistedSession();

            expect(result).toBe(false);
        });

        it('should handle errors gracefully and return false', () => {
            (fs.existsSync as any).mockImplementation(() => {
                throw new Error('File system error');
            });

            const result = hasPersistedSession();

            expect(result).toBe(false);
            expect(logger.warn).toHaveBeenCalledWith(
                expect.objectContaining({ err: 'File system error' }),
                'Error checking for persisted session'
            );
        });
    });

    describe('clearSession', () => {
        it('should clear session when session path exists', () => {
            (fs.existsSync as any).mockReturnValue(true);

            const result = clearSession();

            expect(result).toBe(true);
            expect(fs.rmSync).toHaveBeenCalledWith(
                expect.stringContaining('session-nudlers-client'),
                { recursive: true, force: true }
            );
            expect(logger.info).toHaveBeenCalledWith(
                expect.objectContaining({ sessionPath: expect.any(String) }),
                'Clearing persisted WhatsApp session...'
            );
            expect(logger.info).toHaveBeenCalledWith('WhatsApp session cleared successfully');
        });

        it('should return true when no session exists', () => {
            (fs.existsSync as any).mockReturnValue(false);

            const result = clearSession();

            expect(result).toBe(true);
            expect(fs.rmSync).not.toHaveBeenCalled();
            expect(logger.info).toHaveBeenCalledWith('No persisted session to clear');
        });

        it('should return false and log error when rmSync fails', () => {
            (fs.existsSync as any).mockReturnValue(true);
            (fs.rmSync as any).mockImplementation(() => {
                throw new Error('Permission denied');
            });

            const result = clearSession();

            expect(result).toBe(false);
            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({ err: 'Permission denied' }),
                'Failed to clear WhatsApp session'
            );
        });
    });

    describe('renewQrCode', () => {
        it('should destroy client, clear session, and initialize new client', async () => {
            const mockClient = {
                on: vi.fn(),
                initialize: vi.fn().mockResolvedValue(undefined),
                destroy: vi.fn().mockResolvedValue(undefined),
            };
            (pkg.Client as any).mockReturnValue(mockClient);
            (fs.existsSync as any).mockReturnValue(true);

            // Initialize first client
            initializeClient();
            await vi.runAllTimersAsync();

            // Reset mocks to track renewal calls
            vi.clearAllMocks();
            (fs.existsSync as any).mockReturnValue(true);

            // Renew QR code
            const renewPromise = renewQrCode();
            await vi.runAllTimersAsync();
            await renewPromise;

            // Should have destroyed old client
            expect(mockClient.destroy).toHaveBeenCalled();

            // Should have cleared session
            expect(fs.rmSync).toHaveBeenCalledWith(
                expect.stringContaining('session-nudlers-client'),
                { recursive: true, force: true }
            );

            // Should have created new client
            expect(pkg.Client).toHaveBeenCalled();

            // Should log the renewal
            expect(logger.info).toHaveBeenCalledWith('Renewing WhatsApp QR code...');
        });

        it('should continue even if clearSession fails', async () => {
            const mockClient = {
                on: vi.fn(),
                initialize: vi.fn().mockResolvedValue(undefined),
                destroy: vi.fn().mockResolvedValue(undefined),
            };
            (pkg.Client as any).mockReturnValue(mockClient);
            (fs.existsSync as any).mockReturnValue(true);
            (fs.rmSync as any).mockImplementation(() => {
                throw new Error('Permission denied');
            });

            // Initialize first client
            initializeClient();
            await vi.runAllTimersAsync();

            // Reset mocks to track renewal calls
            vi.clearAllMocks();
            (fs.existsSync as any).mockReturnValue(true);
            (fs.rmSync as any).mockImplementation(() => {
                throw new Error('Permission denied');
            });

            // Renew QR code
            const renewPromise = renewQrCode();
            await vi.runAllTimersAsync();
            await renewPromise;

            // Should have logged warning but continued
            expect(logger.warn).toHaveBeenCalledWith('Failed to clear session, but continuing with QR renewal');

            // Should still have created new client
            expect(pkg.Client).toHaveBeenCalled();
        });
    });
});

