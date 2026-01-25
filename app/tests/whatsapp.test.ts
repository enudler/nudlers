import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendWhatsAppMessage } from '../utils/whatsapp.js';
import { getOrCreateClient } from '../utils/whatsapp-client.js';

// Mock the modules
vi.mock('../utils/whatsapp-client.js', () => ({
    getOrCreateClient: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}));

describe('sendWhatsAppMessage', () => {
    let mockClient: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockClient = {
            sendMessage: vi.fn().mockResolvedValue({ id: { _serialized: 'msg123' } }),
        };
        (getOrCreateClient as any).mockReturnValue(mockClient);

        // Mock global status
        (global as any).whatsappStatus = 'READY';
    });

    it('should send a message to a single phone number', async () => {
        const result = await sendWhatsAppMessage({
            to: '972501234567',
            body: 'Hello test',
        });

        expect(mockClient.sendMessage).toHaveBeenCalledWith('972501234567@c.us', 'Hello test');
        expect(result.success).toBe(true);
        expect(result.sent).toBe(1);
    });

    it('should send a message to multiple recipients', async () => {
        const result = await sendWhatsAppMessage({
            to: '972501234567, 972507654321',
            body: 'Hello multiple',
        });

        expect(mockClient.sendMessage).toHaveBeenCalledTimes(2);
        expect(mockClient.sendMessage).toHaveBeenCalledWith('972501234567@c.us', 'Hello multiple');
        expect(mockClient.sendMessage).toHaveBeenCalledWith('972507654321@c.us', 'Hello multiple');
        expect(result.sent).toBe(2);
    });

    it('should send a message to a group', async () => {
        const result = await sendWhatsAppMessage({
            to: '1234567890@g.us',
            body: 'Hello group',
        });

        expect(mockClient.sendMessage).toHaveBeenCalledWith('1234567890@g.us', 'Hello group');
        expect(result.sent).toBe(1);
    });

    it('should handle a mix of groups and numbers', async () => {
        const result = await sendWhatsAppMessage({
            to: '972501234567, 1234567890@g.us',
            body: 'Hello mix',
        });

        expect(mockClient.sendMessage).toHaveBeenCalledTimes(2);
        expect(mockClient.sendMessage).toHaveBeenCalledWith('972501234567@c.us', 'Hello mix');
        expect(mockClient.sendMessage).toHaveBeenCalledWith('1234567890@g.us', 'Hello mix');
        expect(result.sent).toBe(2);
    });

    it('should throw error if client is not ready', async () => {
        (global as any).whatsappStatus = 'DISCONNECTED';

        await expect(sendWhatsAppMessage({
            to: '972501234567',
            body: 'Hello',
        })).rejects.toThrow(/WhatsApp client not ready/);
    });

    it('should continue if one recipient fails but others succeed', async () => {
        mockClient.sendMessage
            .mockRejectedValueOnce(new Error('Failed to send'))
            .mockResolvedValueOnce({ id: { _serialized: 'msg456' } });

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
});
