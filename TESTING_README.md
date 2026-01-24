# WhatsApp Web.js Integration - Test Suite

This document describes the comprehensive test suite for the WhatsApp Web.js Docker integration.

## Overview

The test suite covers three main areas:
1. **WhatsApp Service Tests** - Unit tests for the backend Express service
2. **API Endpoint Tests** - Tests for Next.js proxy endpoints
3. **UI Component Tests** - React component tests for the Settings modal

## Test Stack

### WhatsApp Service (whatsapp-service/)
- **Framework**: Jest 29.7.0
- **HTTP Testing**: Supertest 6.3.4
- **Coverage**: Istanbul/NYC
- **Mocking**: Jest mocks

### Next.js App (app/)
- **Framework**: Vitest 3.2.4
- **UI Testing**: React Testing Library 16.1.0
- **User Interactions**: @testing-library/user-event 14.5.2
- **DOM Assertions**: @testing-library/jest-dom 6.6.3
- **Environment**: jsdom 26.0.0

## Running Tests

### WhatsApp Service Tests

```bash
cd whatsapp-service

# Run all tests
npm test

# Run with watch mode
npm run test:watch

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run with coverage
npm test -- --coverage
```

### Next.js App Tests

```bash
cd app

# Run all tests
npm test

# Run in watch mode (not implemented yet, can add if needed)
# npm run test:watch

# Run with UI
npm run test -- --ui

# Run with coverage
npm run test -- --coverage
```

## Test Structure

### WhatsApp Service

```
whatsapp-service/
├── tests/
│   ├── setup.js                 # Test configuration
│   ├── mocks/
│   │   ├── whatsapp-client.js   # Mock WhatsApp client
│   │   └── db.js                # Mock database
│   └── unit/
│       ├── db.test.js           # Database module tests
│       ├── whatsapp.test.js     # WhatsApp client tests
│       └── routes.test.js       # API route handler tests
└── jest.config.js               # Jest configuration
```

### Next.js App

```
app/
├── __tests__/
│   ├── setup.ts                           # Test setup & global mocks
│   ├── api/
│   │   └── whatsapp-webjs/
│   │       ├── status.test.js             # Status endpoint tests
│   │       ├── send.test.js               # Send message endpoint tests
│   │       └── disconnect.test.js         # Disconnect endpoint tests
│   └── components/
│       └── SettingsModal.whatsapp.test.tsx # UI component tests
└── vitest.config.ts                        # Vitest configuration
```

## Test Coverage

### WhatsApp Service Tests

#### db.test.js (Database Module)
✅ **query()** function
  - Executes queries successfully
  - Handles query errors
  - Logs query execution

✅ **getClient()** function
  - Returns a client from the pool

✅ **close()** function
  - Closes the pool gracefully

✅ **pool** export
  - Exports pool instance

#### whatsapp.test.js (WhatsApp Client)
✅ **initializeClient()**
  - Initializes client with correct config
  - Registers event handlers
  - Calls client.initialize()
  - Prevents re-initialization

✅ **getStatus()**
  - Returns disconnected status when not initialized
  - Queries database for session info

✅ **getCurrentQR()**
  - Returns null if no QR code
  - Returns QR code when available

✅ **sendMessage()**
  - Sends message successfully
  - Formats phone numbers correctly
  - Handles group IDs
  - Throws error if not ready
  - Handles send errors gracefully

✅ **getContacts()**
  - Fetches contacts and groups
  - Filters out own contact
  - Stores contacts in database

✅ **disconnect()**
  - Logs out and destroys client
  - Updates database on disconnect

✅ **Event Handlers**
  - Generates QR code on qr event
  - Updates database on ready event
  - Updates database on disconnected event

#### routes.test.js (API Routes)
✅ **GET /status**
  - Returns connection status
  - Handles errors

✅ **GET /qr**
  - Returns QR code when available
  - Returns 400 if already connected
  - Returns 404 if QR not available

✅ **POST /send**
  - Sends message successfully
  - Returns 400 for missing fields
  - Returns 503 if not connected
  - Returns 500 on send failure

✅ **POST /disconnect**
  - Disconnects successfully
  - Handles disconnect errors

✅ **GET /contacts**
  - Returns contacts and groups
  - Returns 503 if not connected

### Next.js API Tests

#### status.test.js
✅ Returns status from WhatsApp service
✅ Returns 405 for non-GET requests
✅ Handles service errors gracefully
✅ Handles network errors
✅ Uses WHATSAPP_SERVICE_URL from environment

#### send.test.js
✅ Sends message successfully
✅ Returns 405 for non-POST requests
✅ Returns 400 for missing "to" field
✅ Returns 400 for missing "message" field
✅ Handles service errors
✅ Handles network errors
✅ Supports group messaging

#### disconnect.test.js
✅ Disconnects successfully
✅ Returns 405 for non-POST requests
✅ Handles service errors
✅ Handles network errors

### UI Component Tests

#### SettingsModal.whatsapp.test.tsx
✅ Shows WhatsApp Web.js section when enabled
✅ Displays connection status badge
✅ Shows QR code generation button when disconnected
✅ Fetches QR code when button is clicked
✅ Sends test message when form is filled

## Coverage Thresholds

### WhatsApp Service
- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%
- **Statements**: 70%

### Next.js App
- Coverage reporting available via `--coverage` flag
- No minimum thresholds enforced (can be added if needed)

## Mocking Strategy

### WhatsApp Client Mock
The mock client (`tests/mocks/whatsapp-client.js`) provides:
- Event handler registration
- Message sending simulation
- Contact/group fetching
- Connection state management
- Helper methods for test scenarios:
  - `simulateConnection()`
  - `simulateDisconnection()`
  - `simulateAuthFailure()`

### Database Mock
The database mock (`tests/mocks/db.js`) provides:
- Query simulation for common operations
- In-memory data storage
- Reset functionality for test isolation

### API Mocking
- **global.fetch** is mocked in all test environments
- Each test can customize fetch responses
- Network errors can be simulated

## Writing New Tests

### WhatsApp Service Test Example

```javascript
describe('Feature Name', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should do something', async () => {
    // Arrange
    const mockData = { key: 'value' };
    mockFunction.mockResolvedValue(mockData);

    // Act
    const result = await functionUnderTest();

    // Assert
    expect(result).toEqual(mockData);
    expect(mockFunction).toHaveBeenCalledWith(expectedArgs);
  });
});
```

### API Endpoint Test Example

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('/api/endpoint', () => {
  let req, res;

  beforeEach(() => {
    req = { method: 'GET', query: {} };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    vi.clearAllMocks();
  });

  it('should handle request', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: 'test' })
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: 'test' });
  });
});
```

### UI Component Test Example

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('Component', () => {
  it('should render and handle interaction', async () => {
    const user = userEvent.setup();

    render(<Component />);

    expect(screen.getByText('Hello')).toBeInTheDocument();

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Clicked')).toBeInTheDocument();
    });
  });
});
```

## Debugging Tests

### WhatsApp Service

```bash
# Run specific test file
npm test -- db.test.js

# Run tests matching pattern
npm test -- --testNamePattern="should send message"

# Run with verbose output
npm test -- --verbose

# Run in debug mode
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Next.js App

```bash
# Run specific test file
npm test -- status.test.js

# Run tests matching pattern
npm test -- --grep "should handle errors"

# Run with UI for debugging
npm test -- --ui

# Run in browser mode (if needed)
npm test -- --browser
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Test

on: [push, pull_request]

jobs:
  test-whatsapp-service:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
      - run: cd whatsapp-service && npm ci
      - run: cd whatsapp-service && npm test -- --coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./whatsapp-service/coverage/lcov.info

  test-nextjs-app:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
      - run: cd app && npm ci
      - run: cd app && npm test -- --coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./app/coverage/lcov.info
```

## Best Practices

### General
1. ✅ Write tests before or alongside code (TDD/BDD)
2. ✅ Follow AAA pattern: Arrange, Act, Assert
3. ✅ One assertion per test (when possible)
4. ✅ Clear, descriptive test names
5. ✅ Isolate tests - no dependencies between tests
6. ✅ Clean up after tests (use beforeEach/afterEach)

### Mocking
1. ✅ Mock external dependencies (database, API calls, etc.)
2. ✅ Don't mock what you're testing
3. ✅ Clear mocks between tests
4. ✅ Use realistic mock data

### Coverage
1. ✅ Aim for >70% coverage
2. ✅ Focus on critical paths first
3. ✅ Don't obsess over 100% coverage
4. ✅ Test edge cases and error scenarios

### Performance
1. ✅ Keep tests fast (< 1s per test)
2. ✅ Use parallel execution when possible
3. ✅ Avoid unnecessary async operations
4. ✅ Use test.skip() for slow tests during development

## Troubleshooting

### Common Issues

#### "Cannot find module" errors
```bash
# WhatsApp service
cd whatsapp-service && npm install

# Next.js app
cd app && npm install
```

#### Jest/Vitest timeouts
```javascript
// Increase timeout for specific test
it('slow test', async () => {
  // Test code
}, 30000); // 30 second timeout
```

#### Mock not working
```javascript
// Ensure mocks are cleared
beforeEach(() => {
  jest.clearAllMocks(); // Jest
  vi.clearAllMocks();   // Vitest
});
```

#### React component not rendering
```javascript
// Ensure proper theme wrapper
const { render } = require('@testing-library/react');
const { ThemeProvider, createTheme } = require('@mui/material/styles');

render(
  <ThemeProvider theme={createTheme()}>
    <Component />
  </ThemeProvider>
);
```

## Future Improvements

- [ ] Add E2E tests with Playwright
- [ ] Add visual regression tests
- [ ] Add performance benchmarks
- [ ] Increase coverage thresholds to 80%
- [ ] Add mutation testing
- [ ] Add snapshot testing for UI components
- [ ] Set up automated coverage reporting
- [ ] Add contract tests between services

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Supertest](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

## Support

For issues with the test suite:
1. Check this documentation
2. Review test output and error messages
3. Check mock configurations
4. Open an issue on GitHub with:
   - Test output
   - Expected vs actual behavior
   - Environment details
