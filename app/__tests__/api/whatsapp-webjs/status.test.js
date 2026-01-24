import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../../../pages/api/whatsapp-webjs/status.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('/api/whatsapp-webjs/status', () => {
  let req, res;

  beforeEach(() => {
    req = { method: 'GET' };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    vi.clearAllMocks();
  });

  it('should return status from WhatsApp service', async () => {
    const mockStatus = {
      connected: true,
      session_exists: true,
      phone_number: '972501234567',
      last_connected: '2026-01-24T10:00:00Z',
      qr_required: false
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => mockStatus
    });

    await handler(req, res);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/status')
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockStatus);
  });

  it('should return 405 for non-GET requests', async () => {
    req.method = 'POST';

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  it('should handle service errors gracefully', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Failed to get WhatsApp status',
        connected: false,
        session_exists: false
      })
    );
  });

  it('should handle network errors', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Failed to get WhatsApp status',
        message: 'Network error'
      })
    );
  });

  it('should use WHATSAPP_SERVICE_URL from environment', async () => {
    process.env.WHATSAPP_SERVICE_URL = 'http://custom-service:3001';

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ connected: false })
    });

    await handler(req, res);

    expect(global.fetch).toHaveBeenCalledWith('http://custom-service:3001/status');

    delete process.env.WHATSAPP_SERVICE_URL;
  });
});
