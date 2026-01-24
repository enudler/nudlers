// Mock database for testing

const mockData = {
  sessions: [],
  contacts: []
};

const mockQuery = jest.fn(async (text, params) => {
  // Simulate different queries
  if (text.includes('INSERT INTO whatsapp_sessions')) {
    const session = {
      id: 1,
      session_id: params[0],
      phone_number: params[1],
      connected: params[2],
      last_connected_at: params[3]
    };
    mockData.sessions.push(session);
    return { rows: [session], rowCount: 1 };
  }

  if (text.includes('UPDATE whatsapp_sessions')) {
    return { rows: [], rowCount: 1 };
  }

  if (text.includes('SELECT * FROM whatsapp_sessions')) {
    const session = mockData.sessions.find(s => s.session_id === params[0]);
    return { rows: session ? [session] : [], rowCount: session ? 1 : 0 };
  }

  if (text.includes('INSERT INTO whatsapp_contacts')) {
    const contact = {
      id: mockData.contacts.length + 1,
      contact_id: params[0],
      name: params[1],
      phone_number: params[2],
      is_group: params[3],
      participant_count: params[4]
    };
    mockData.contacts.push(contact);
    return { rows: [contact], rowCount: 1 };
  }

  if (text.includes('SELECT * FROM whatsapp_contacts')) {
    return { rows: mockData.contacts, rowCount: mockData.contacts.length };
  }

  // Default for SELECT NOW() and health checks
  if (text.includes('SELECT NOW()') || text.includes('SELECT 1')) {
    return { rows: [{ now: new Date() }], rowCount: 1 };
  }

  return { rows: [], rowCount: 0 };
});

const mockGetClient = jest.fn(async () => ({
  query: mockQuery,
  release: jest.fn()
}));

const mockClose = jest.fn(async () => {
  mockData.sessions = [];
  mockData.contacts = [];
});

const mockPool = {
  totalCount: 10
};

// Reset function for tests
const resetMockData = () => {
  mockData.sessions = [];
  mockData.contacts = [];
  mockQuery.mockClear();
  mockGetClient.mockClear();
  mockClose.mockClear();
};

module.exports = {
  query: mockQuery,
  getClient: mockGetClient,
  close: mockClose,
  pool: mockPool,
  resetMockData,
  getMockData: () => mockData
};
