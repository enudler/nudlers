// Test setup and global configuration

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.POSTGRES_HOST = 'localhost';
process.env.POSTGRES_PORT = '5432';
process.env.POSTGRES_DB = 'nudlers_test';
process.env.POSTGRES_USER = 'test_user';
process.env.POSTGRES_PASSWORD = 'test_password';
process.env.WHATSAPP_SERVICE_PORT = '3001';

// Increase timeout for integration tests
jest.setTimeout(10000);

// Suppress console output during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   error: jest.fn(),
//   warn: jest.fn(),
// };
