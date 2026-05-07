import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendWhatsAppMessage } from '../utils/whatsapp.js';
import { ensureConnected, sendText } from '../utils/whatsapp-transport.js';

// Mock the transport router. The two surfaces we touch from whatsapp.js are
// ensureConnected (returns the active transport's client) and sendText
// (transport-uniform wrapper around sendMessage).
vi.mock('../utils/whatsapp-transport.js', () => ({
    ensureConnected: vi.fn(),
    sendText: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}));

describe('sendWhatsAppMessage', () => {
    let mockClient: object;

    beforeEach(() => {
        vi.clearAllMocks();
        mockClient = {};
        (ensureConnected as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);
        (sendText as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'msg123' });
    });

    it('should send a message to a single phone number', async () => {
        const result = await sendWhatsAppMessage({
            to: '972501234567',
            body: 'Hello test',
        });

        expect(sendText).toHaveBeenCalledWith({ client: mockClient, chatId: '972501234567@c.us', body: 'Hello test' });
        expect(result.success).toBe(true);
        expect(result.sent).toBe(1);
    });

    it('should send a message to multiple recipients', async () => {
        const result = await sendWhatsAppMessage({
            to: '972501234567, 972507654321',
            body: 'Hello multiple',
        });

        expect(sendText).toHaveBeenCalledTimes(2);
        expect(sendText).toHaveBeenCalledWith({ client: mockClient, chatId: '972501234567@c.us', body: 'Hello multiple' });
        expect(sendText).toHaveBeenCalledWith({ client: mockClient, chatId: '972507654321@c.us', body: 'Hello multiple' });
        expect(result.sent).toBe(2);
    });

    it('should send a message to a group', async () => {
        const result = await sendWhatsAppMessage({
            to: '1234567890@g.us',
            body: 'Hello group',
        });

        expect(sendText).toHaveBeenCalledWith({ client: mockClient, chatId: '1234567890@g.us', body: 'Hello group' });
        expect(result.sent).toBe(1);
    });

    it('should handle a mix of groups and numbers', async () => {
        const result = await sendWhatsAppMessage({
            to: '972501234567, 1234567890@g.us',
            body: 'Hello mix',
        });

        expect(sendText).toHaveBeenCalledTimes(2);
        expect(sendText).toHaveBeenCalledWith({ client: mockClient, chatId: '972501234567@c.us', body: 'Hello mix' });
        expect(sendText).toHaveBeenCalledWith({ client: mockClient, chatId: '1234567890@g.us', body: 'Hello mix' });
        expect(result.sent).toBe(2);
    });

    it('should throw error if client cannot be connected', async () => {
        (ensureConnected as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
            new Error('WhatsApp client did not become ready within 60000ms')
        );

        await expect(sendWhatsAppMessage({
            to: '972501234567',
            body: 'Hello',
        })).rejects.toThrow(/did not become ready/);
    });

    it('should continue if one recipient fails but others succeed', async () => {
        // Use a deterministic non-transient error so the retry path doesn't
        // kick in (which would burn 1.5s on the test).
        (sendText as unknown as ReturnType<typeof vi.fn>)
            .mockRejectedValueOnce(new Error('chat not found'))
            .mockResolvedValueOnce({ id: 'msg456' });

        const result = await sendWhatsAppMessage({
            to: 'fail, success',
            body: 'Hello retry',
        });

        expect(result.success).toBe(true);
        expect(result.sent).toBe(1);
        expect(result.total).toBe(2);
        expect(result.results[0].success).toBe(false);
        expect(result.results[1].success).toBe(true);
    });

    it('retries once on transient transport-death errors then succeeds', async () => {
        (sendText as unknown as ReturnType<typeof vi.fn>)
            .mockRejectedValueOnce(new Error('Target frame detached'))
            .mockResolvedValueOnce({ id: 'msg789' });

        const result = await sendWhatsAppMessage({
            to: '972501234567',
            body: 'after-flap',
        });

        expect(result.success).toBe(true);
        expect(result.sent).toBe(1);
        expect(result.results[0].retried).toBe(true);
        // ensureConnected called twice: once at the top, once at the retry.
        expect(ensureConnected).toHaveBeenCalledTimes(2);
    });
});
