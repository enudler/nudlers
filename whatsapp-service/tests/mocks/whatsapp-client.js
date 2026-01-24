// Mock WhatsApp client for testing

class MockClient {
  constructor(options) {
    this.options = options;
    this.isReady = false;
    this.info = null;
    this.eventHandlers = {};
  }

  on(event, handler) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
  }

  async initialize() {
    // Simulate initialization
    setTimeout(() => {
      this.emit('loading_screen', 50, 'Loading...');
      this.emit('qr', 'mock-qr-code-data');
    }, 10);
    return Promise.resolve();
  }

  emit(event, ...args) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].forEach(handler => handler(...args));
    }
  }

  async sendMessage(chatId, message) {
    if (!this.isReady) {
      throw new Error('Client not ready');
    }
    return {
      id: {
        id: 'mock-message-id-12345'
      },
      ack: 1,
      timestamp: Date.now()
    };
  }

  async getContacts() {
    return [
      {
        id: { _serialized: '972501234567@c.us' },
        name: 'Test Contact',
        pushname: 'Test',
        number: '972501234567',
        isUser: true,
        isMe: false
      },
      {
        id: { _serialized: 'status@broadcast' },
        name: 'My Status',
        isUser: false,
        isMe: true
      }
    ];
  }

  async getChats() {
    return [
      {
        id: { _serialized: '120363123456789@g.us' },
        name: 'Test Group',
        isGroup: true,
        participants: [
          { id: '972501234567@c.us' },
          { id: '972507654321@c.us' }
        ]
      }
    ];
  }

  async logout() {
    this.isReady = false;
    this.info = null;
    return Promise.resolve();
  }

  async destroy() {
    this.isReady = false;
    this.info = null;
    this.eventHandlers = {};
    return Promise.resolve();
  }

  // Test helpers
  simulateConnection() {
    this.isReady = true;
    this.info = {
      wid: { user: '972501234567' },
      pushname: 'Test User',
      platform: 'android'
    };
    this.emit('authenticated');
    this.emit('ready');
  }

  simulateDisconnection() {
    this.isReady = false;
    this.emit('disconnected', 'LOGOUT');
  }

  simulateAuthFailure() {
    this.emit('auth_failure', 'Authentication failed');
  }
}

class MockLocalAuth {
  constructor(options) {
    this.options = options;
  }
}

module.exports = {
  Client: MockClient,
  LocalAuth: MockLocalAuth
};
