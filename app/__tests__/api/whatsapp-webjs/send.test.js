import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../../../pages/api/whatsapp-webjs/send.js';

global.fetch = vi.fn();

describe('/api/whatsapp-webjs/send', () => {
  let req, res;

  beforeEach(() => {
    req = {
      method: 'POST',
      body: {}
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    vi.clearAllMocks();
  });

  it('should send message successfully', async () => {
    req.body = { to: '+972501234567', message: 'Test message' };

    const mockResponse = {
      success: true,
      message_id: 'msg-123',
      timestamp: '2026-01-24T10:00:00Z'
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    await handler(req, res);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/send'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: '+972501234567', message: 'Test message' })
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockResponse);
  });

  it('should return 405 for non-POST requests', async () => {
    req.method = 'GET';

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  it('should return 400 for missing "to" field', async () => {
    req.body = { message: 'Test' }; // Missing 'to'

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Missing required fields'
      })
    );
  });

  it('should return 400 for missing "message" field', async () => {
    req.body = { to: '+972501234567' }; // Missing 'message'

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Missing required fields'
      })
    );
  });

  it('should handle service errors', async () => {
    req.body = { to: '+972501234567', message: 'Test' };

    global.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'WhatsApp not connected' })
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'WhatsApp not connected' });
  });

  it('should handle network errors', async () => {
    req.body = { to: '+972501234567', message: 'Test' };

    global.fetch.mockRejectedValue(new Error('Connection refused'));

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Failed to send message',
        message: 'Connection refused'
      })
    );
  });

  it('should support group messaging', async () => {
    req.body = { to: '120363123456@g.us', message: 'Group message' };

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message_id: 'msg-456' })
    });

    await handler(req, res);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ to: '120363123456@g.us', message: 'Group message' })
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
