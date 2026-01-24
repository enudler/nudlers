jest.mock('../../src/whatsapp');

const request = require('supertest');
const express = require('express');
const whatsapp = require('../../src/whatsapp');

// Import routes
const statusRoute = require('../../src/routes/status');
const qrRoute = require('../../src/routes/qr');
const sendRoute = require('../../src/routes/send');
const disconnectRoute = require('../../src/routes/disconnect');
const contactsRoute = require('../../src/routes/contacts');

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/status', statusRoute);
  app.use('/qr', qrRoute);
  app.use('/send', sendRoute);
  app.use('/disconnect', disconnectRoute);
  app.use('/contacts', contactsRoute);
  return app;
};

describe('Route Handlers', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  describe('GET /status', () => {
    it('should return connection status', async () => {
      const mockStatus = {
        connected: true,
        session_exists: true,
        phone_number: '972501234567',
        last_connected: new Date().toISOString(),
        qr_required: false
      };
      whatsapp.getStatus.mockResolvedValue(mockStatus);

      const response = await request(app).get('/status');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockStatus);
    });

    it('should handle errors', async () => {
      whatsapp.getStatus.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/status');

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        error: 'Failed to get WhatsApp status'
      });
    });
  });

  describe('GET /qr', () => {
    it('should return QR code when available', async () => {
      const mockQR = {
        qr_code: 'data:image/png;base64,mock',
        expires_at: new Date()
      };
      whatsapp.getCurrentQR.mockReturnValue(mockQR);

      const response = await request(app).get('/qr');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockQR);
    });

    it('should return 400 if already connected', async () => {
      whatsapp.getCurrentQR.mockReturnValue(null);
      whatsapp.getStatus.mockResolvedValue({ connected: true });

      const response = await request(app).get('/qr');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Already connected');
    });

    it('should return 404 if QR not available and not connected', async () => {
      whatsapp.getCurrentQR.mockReturnValue(null);
      whatsapp.getStatus.mockResolvedValue({ connected: false });

      const response = await request(app).get('/qr');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('QR code not available');
    });
  });

  describe('POST /send', () => {
    it('should send message successfully', async () => {
      whatsapp.getStatus.mockResolvedValue({ connected: true });
      whatsapp.sendMessage.mockResolvedValue({
        success: true,
        message_id: 'msg-123',
        timestamp: new Date().toISOString()
      });

      const response = await request(app)
        .post('/send')
        .send({ to: '+972501234567', message: 'Hello' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message_id: 'msg-123'
      });
      expect(whatsapp.sendMessage).toHaveBeenCalledWith('+972501234567', 'Hello');
    });

    it('should return 400 if missing required fields', async () => {
      const response = await request(app)
        .post('/send')
        .send({ to: '+972501234567' }); // Missing message

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    it('should return 503 if not connected', async () => {
      whatsapp.getStatus.mockResolvedValue({ connected: false });

      const response = await request(app)
        .post('/send')
        .send({ to: '+972501234567', message: 'Hello' });

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('WhatsApp not connected');
    });

    it('should return 500 on send failure', async () => {
      whatsapp.getStatus.mockResolvedValue({ connected: true });
      whatsapp.sendMessage.mockResolvedValue({
        success: false,
        error: 'Network error'
      });

      const response = await request(app)
        .post('/send')
        .send({ to: '+972501234567', message: 'Hello' });

      expect(response.status).toBe(500);
    });
  });

  describe('POST /disconnect', () => {
    it('should disconnect successfully', async () => {
      whatsapp.disconnect.mockResolvedValue({
        success: true,
        message: 'Disconnected'
      });

      const response = await request(app).post('/disconnect');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(whatsapp.disconnect).toHaveBeenCalled();
    });

    it('should handle disconnect errors', async () => {
      whatsapp.disconnect.mockResolvedValue({
        success: false,
        error: 'Already disconnected'
      });

      const response = await request(app).post('/disconnect');

      expect(response.status).toBe(500);
    });
  });

  describe('GET /contacts', () => {
    it('should return contacts and groups', async () => {
      whatsapp.getStatus.mockResolvedValue({ connected: true });
      whatsapp.getContacts.mockResolvedValue({
        contacts: [
          { id: '972501234567@c.us', name: 'John', phone_number: '+972501234567', is_group: false }
        ],
        groups: [
          { id: '120363123456@g.us', name: 'Family', is_group: true, participant_count: 5 }
        ]
      });

      const response = await request(app).get('/contacts?refresh=true');

      expect(response.status).toBe(200);
      expect(response.body.contacts).toHaveLength(1);
      expect(response.body.groups).toHaveLength(1);
    });

    it('should return 503 if not connected', async () => {
      whatsapp.getStatus.mockResolvedValue({ connected: false });

      const response = await request(app).get('/contacts');

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('WhatsApp not connected');
    });
  });
});
