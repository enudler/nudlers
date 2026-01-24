import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../../../pages/api/whatsapp-webjs/disconnect.js';

global.fetch = vi.fn();

describe('/api/whatsapp-webjs/disconnect', () => {
  let req, res;

  beforeEach(() => {
    req = { method: 'POST' };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    vi.clearAllMocks();
  });

  it('should disconnect successfully', async () => {
    const mockResponse = {
      success: true,
      message: 'WhatsApp session disconnected'
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    await handler(req, res);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/disconnect'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
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

  it('should handle service errors', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Failed to disconnect' })
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to disconnect' });
  });

  it('should handle network errors', async () => {
    global.fetch.mockRejectedValue(new Error('Network timeout'));

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Failed to disconnect',
        message: 'Network timeout'
      })
    );
  });
});
