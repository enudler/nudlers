---
name: test
description: Scaffold a test file for an API route or utility. Use when the user wants to add tests for a feature.
---

Create a new test file at `app/tests/$ARGUMENTS.test.ts` using Vitest with the project's established mocking patterns.

## Requirements

1. **Always mock these before imports:**
   - `getDB` from `../pages/api/db`
   - `logger` from `../utils/logger.js`
   - `encrypt`/`decrypt` from `../pages/api/utils/encryption` (if handler uses credentials)
2. **Mock `res` objects** must include `setHeader: vi.fn()` if the handler calls `res.setHeader()`
3. **Use `vi.clearAllMocks()`** in `beforeEach` and `vi.restoreAllMocks()` in `afterEach`
4. **Test both success and error paths** — including DB errors
5. **Error response assertions**: expect `{ error: "Internal Server Error" }` — never `error.message`
6. **Test 405** for unsupported HTTP methods

## Template Structure

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies BEFORE imports
vi.mock('../pages/api/db', () => ({
    getDB: vi.fn()
}));

vi.mock('../utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
    }
}));

vi.mock('../pages/api/utils/encryption', () => ({
    decrypt: vi.fn(),
    encrypt: vi.fn()
}));

import { getDB } from '../pages/api/db';
import handler from '../pages/api/FEATURE_NAME/index';

describe('FeatureName API Endpoint', () => {
    let mockClient: {
        query: ReturnType<typeof vi.fn>;
        release: ReturnType<typeof vi.fn>;
    };
    let mockRes: {
        status: ReturnType<typeof vi.fn>;
        json: ReturnType<typeof vi.fn>;
        setHeader: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockClient = {
            query: vi.fn(),
            release: vi.fn()
        };
        (getDB as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);
        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            setHeader: vi.fn()
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('GET', () => {
        it('should return data successfully', async () => {
            const mockData = { rows: [{ id: 1 }] };
            mockClient.query.mockResolvedValue(mockData);

            await handler({ method: 'GET', query: {} }, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should handle database errors', async () => {
            mockClient.query.mockRejectedValue(new Error('DB error'));

            await handler({ method: 'GET', query: {} }, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
            expect(mockClient.release).toHaveBeenCalled();
        });
    });

    it('should return 405 for unsupported methods', async () => {
        const mockReq = { method: 'PATCH' };
        await handler(mockReq, mockRes);
        expect(mockRes.status).toHaveBeenCalledWith(405);
    });
});
```

## Running Tests

```bash
cd app && npm run test
```
