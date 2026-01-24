// Mock dependencies before importing
jest.mock('whatsapp-web.js');
jest.mock('qrcode');
jest.mock('../../src/db');

const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const db = require('../../src/db');

// Import after mocking
const whatsapp = require('../../src/whatsapp');

describe('WhatsApp Module', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock client
    mockClient = {
      initialize: jest.fn().mockResolvedValue(),
      on: jest.fn(),
      sendMessage: jest.fn(),
      getContacts: jest.fn(),
      getChats: jest.fn(),
      logout: jest.fn().mockResolvedValue(),
      destroy: jest.fn().mockResolvedValue(),
      info: null
    };

    Client.mockImplementation(() => mockClient);
    QRCode.toDataURL = jest.fn().mockResolvedValue('data:image/png;base64,mockqr');
    db.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('initializeClient()', () => {
    it('should initialize WhatsApp client with correct config', async () => {
      await whatsapp.initializeClient();

      expect(Client).toHaveBeenCalledWith(
        expect.objectContaining({
          authStrategy: expect.any(LocalAuth),
          puppeteer: expect.objectContaining({
            headless: true,
            args: expect.arrayContaining(['--no-sandbox', '--disable-setuid-sandbox'])
          })
        })
      );
    });

    it('should register event handlers', async () => {
      await whatsapp.initializeClient();

      expect(mockClient.on).toHaveBeenCalledWith('qr', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('authenticated', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('auth_failure', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('disconnected', expect.any(Function));
    });

    it('should call client.initialize()', async () => {
      await whatsapp.initializeClient();

      expect(mockClient.initialize).toHaveBeenCalled();
    });

    it('should not initialize if already initialized', async () => {
      await whatsapp.initializeClient();
      mockClient.initialize.mockClear();

      await whatsapp.initializeClient();

      expect(mockClient.initialize).not.toHaveBeenCalled();
    });
  });

  describe('getStatus()', () => {
    it('should return disconnected status when not initialized', async () => {
      const status = await whatsapp.getStatus();

      expect(status).toMatchObject({
        connected: false,
        session_exists: false,
        phone_number: null
      });
    });

    it('should query database for session info', async () => {
      db.query.mockResolvedValue({
        rows: [{
          session_id: 'default',
          phone_number: '972501234567',
          connected: true,
          last_connected_at: new Date().toISOString()
        }],
        rowCount: 1
      });

      const status = await whatsapp.getStatus();

      expect(db.query).toHaveBeenCalledWith(
        'SELECT * FROM whatsapp_sessions WHERE session_id = $1',
        ['default']
      );
      expect(status.session_exists).toBe(true);
    });
  });

  describe('getCurrentQR()', () => {
    it('should return null if no QR code', () => {
      const qr = whatsapp.getCurrentQR();

      expect(qr).toBeNull();
    });

    it('should return QR code if available', async () => {
      // Initialize and trigger QR event
      await whatsapp.initializeClient();
      const qrHandler = mockClient.on.mock.calls.find(call => call[0] === 'qr')[1];

      await qrHandler('test-qr-data');

      const qr = whatsapp.getCurrentQR();

      expect(qr).toMatchObject({
        qr_code: 'data:image/png;base64,mockqr',
        expires_at: expect.any(Date)
      });
    });
  });

  describe('sendMessage()', () => {
    beforeEach(async () => {
      await whatsapp.initializeClient();
      const readyHandler = mockClient.on.mock.calls.find(call => call[0] === 'ready')[1];
      mockClient.info = { wid: { user: '972501234567' } };
      await readyHandler();
    });

    it('should send message successfully', async () => {
      mockClient.sendMessage.mockResolvedValue({
        id: { id: 'msg-123' }
      });

      const result = await whatsapp.sendMessage('+972501234567', 'Hello');

      expect(mockClient.sendMessage).toHaveBeenCalledWith('972501234567@c.us', 'Hello');
      expect(result).toMatchObject({
        success: true,
        message_id: 'msg-123'
      });
    });

    it('should format phone numbers correctly', async () => {
      mockClient.sendMessage.mockResolvedValue({ id: { id: 'msg-123' } });

      await whatsapp.sendMessage('+972-50-123-4567', 'Test');

      expect(mockClient.sendMessage).toHaveBeenCalledWith('972501234567@c.us', 'Test');
    });

    it('should handle group IDs without modification', async () => {
      mockClient.sendMessage.mockResolvedValue({ id: { id: 'msg-123' } });

      await whatsapp.sendMessage('120363123456@g.us', 'Group message');

      expect(mockClient.sendMessage).toHaveBeenCalledWith('120363123456@g.us', 'Group message');
    });

    it('should throw error if not ready', async () => {
      // Simulate disconnect
      const disconnectHandler = mockClient.on.mock.calls.find(call => call[0] === 'disconnected')[1];
      await disconnectHandler('LOGOUT');

      const result = await whatsapp.sendMessage('+972501234567', 'Hello');

      expect(result.success).toBe(false);
      expect(result.error).toBe('WhatsApp client is not ready');
    });

    it('should handle send errors gracefully', async () => {
      mockClient.sendMessage.mockRejectedValue(new Error('Network error'));

      const result = await whatsapp.sendMessage('+972501234567', 'Hello');

      expect(result).toMatchObject({
        success: false,
        error: 'Network error'
      });
    });
  });

  describe('getContacts()', () => {
    beforeEach(async () => {
      await whatsapp.initializeClient();
      const readyHandler = mockClient.on.mock.calls.find(call => call[0] === 'ready')[1];
      mockClient.info = { wid: { user: '972501234567' } };
      await readyHandler();
    });

    it('should fetch contacts and groups', async () => {
      mockClient.getContacts.mockResolvedValue([
        {
          id: { _serialized: '972507654321@c.us' },
          name: 'John Doe',
          number: '972507654321',
          isUser: true,
          isMe: false
        }
      ]);

      mockClient.getChats.mockResolvedValue([
        {
          id: { _serialized: '120363123456@g.us' },
          name: 'Family Group',
          isGroup: true,
          participants: [{ id: '1' }, { id: '2' }]
        }
      ]);

      const result = await whatsapp.getContacts();

      expect(result.contacts).toHaveLength(1);
      expect(result.groups).toHaveLength(1);
      expect(result.contacts[0]).toMatchObject({
        id: '972507654321@c.us',
        name: 'John Doe',
        is_group: false
      });
      expect(result.groups[0]).toMatchObject({
        id: '120363123456@g.us',
        name: 'Family Group',
        is_group: true,
        participant_count: 2
      });
    });

    it('should filter out own contact', async () => {
      mockClient.getContacts.mockResolvedValue([
        {
          id: { _serialized: '972501234567@c.us' },
          name: 'Me',
          isUser: true,
          isMe: true
        }
      ]);

      mockClient.getChats.mockResolvedValue([]);

      const result = await whatsapp.getContacts();

      expect(result.contacts).toHaveLength(0);
    });

    it('should store contacts in database', async () => {
      mockClient.getContacts.mockResolvedValue([
        {
          id: { _serialized: '972507654321@c.us' },
          name: 'Test',
          number: '972507654321',
          isUser: true,
          isMe: false
        }
      ]);
      mockClient.getChats.mockResolvedValue([]);

      await whatsapp.getContacts();

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO whatsapp_contacts'),
        expect.arrayContaining(['972507654321@c.us', 'Test'])
      );
    });
  });

  describe('disconnect()', () => {
    it('should logout and destroy client', async () => {
      await whatsapp.initializeClient();

      const result = await whatsapp.disconnect();

      expect(mockClient.logout).toHaveBeenCalled();
      expect(mockClient.destroy).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should update database on disconnect', async () => {
      await whatsapp.initializeClient();

      await whatsapp.disconnect();

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE whatsapp_sessions'),
        expect.arrayContaining([false])
      );
    });
  });

  describe('Event Handlers', () => {
    it('should generate QR code on qr event', async () => {
      await whatsapp.initializeClient();
      const qrHandler = mockClient.on.mock.calls.find(call => call[0] === 'qr')[1];

      await qrHandler('raw-qr-data');

      expect(QRCode.toDataURL).toHaveBeenCalledWith('raw-qr-data');
      const qr = whatsapp.getCurrentQR();
      expect(qr).not.toBeNull();
    });

    it('should update database on ready event', async () => {
      await whatsapp.initializeClient();
      const readyHandler = mockClient.on.mock.calls.find(call => call[0] === 'ready')[1];
      mockClient.info = { wid: { user: '972501234567' } };

      await readyHandler();

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE whatsapp_sessions'),
        expect.arrayContaining(['972501234567', true])
      );
    });

    it('should update database on disconnected event', async () => {
      await whatsapp.initializeClient();
      const disconnectHandler = mockClient.on.mock.calls.find(call => call[0] === 'disconnected')[1];

      await disconnectHandler('LOGOUT');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE whatsapp_sessions'),
        expect.arrayContaining([false])
      );
    });
  });
});
