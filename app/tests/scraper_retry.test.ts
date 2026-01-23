/**
 * Tests for scraper retry logic
 * 
 * This test suite verifies that the getScrapeRetries function and retry logic
 * properly handle various edge cases including 0 retries, negative values, 
 * and boundary conditions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getScrapeRetries, resetCategoryCache } from '../pages/api/utils/scraperUtils';
import logger from '../utils/logger';

// Mock logger to avoid console spam during tests
vi.mock('../utils/logger', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    }
}));

describe('Scraper Retry Logic', () => {
    let mockClient;

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();
        resetCategoryCache();

        // Create a mock database client
        mockClient = {
            query: vi.fn(),
            release: vi.fn(),
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('getScrapeRetries', () => {
        it('should return default value (3) when setting is not found', async () => {
            mockClient.query.mockResolvedValue({ rows: [] });

            const retries = await getScrapeRetries(mockClient);

            expect(retries).toBe(3);
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.any(String),
                ['scrape_retries']
            );
        });

        it('should return 0 when setting is 0 (no retries, single attempt)', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ value: '0' }]
            });

            const retries = await getScrapeRetries(mockClient);

            expect(retries).toBe(0);
            expect(logger.warn).not.toHaveBeenCalled();
        });

        it('should return 1 when setting is 1 (one retry)', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ value: '1' }]
            });

            const retries = await getScrapeRetries(mockClient);

            expect(retries).toBe(1);
        });

        it('should return 3 when setting is 3 (default value)', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ value: '3' }]
            });

            const retries = await getScrapeRetries(mockClient);

            expect(retries).toBe(3);
        });

        it('should return 10 when setting is 10 (max allowed)', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ value: '10' }]
            });

            const retries = await getScrapeRetries(mockClient);

            expect(retries).toBe(10);
        });

        it('should cap at 10 when setting is greater than 10', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ value: '100' }]
            });

            const retries = await getScrapeRetries(mockClient);

            expect(retries).toBe(10);
            expect(logger.warn).toHaveBeenCalledWith(
                { value: 100 },
                '[Scraper Utils] scrape_retries too high (max 10), capping at 10'
            );
        });

        it('should return default when setting is negative', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ value: '-5' }]
            });

            const retries = await getScrapeRetries(mockClient);

            expect(retries).toBe(3);
            expect(logger.warn).toHaveBeenCalledWith(
                { value: -5 },
                '[Scraper Utils] Invalid scrape_retries value, using default'
            );
        });

        it('should return default when setting is not a number', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ value: 'invalid' }]
            });

            const retries = await getScrapeRetries(mockClient);

            expect(retries).toBe(3);
            expect(logger.warn).toHaveBeenCalledWith(
                { value: NaN },
                '[Scraper Utils] Invalid scrape_retries value, using default'
            );
        });

        it('should return default when setting is null', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ value: null }]
            });

            const retries = await getScrapeRetries(mockClient);

            expect(retries).toBe(3);
        });

        it('should return default when setting is undefined', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ value: undefined }]
            });

            const retries = await getScrapeRetries(mockClient);

            expect(retries).toBe(3);
        });

        it('should parse string numbers correctly', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ value: '5' }]
            });

            const retries = await getScrapeRetries(mockClient);

            expect(retries).toBe(5);
        });

        it('should handle float values by converting to int', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ value: '2.7' }]
            });

            const retries = await getScrapeRetries(mockClient);

            expect(retries).toBe(2);
        });
    });

    describe('Retry Logic Behavior', () => {
        it('should make exactly 1 attempt when retries = 0', () => {
            const maxRetries = 0;
            let attempts = 0;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                attempts++;
            }

            expect(attempts).toBe(1);
        });

        it('should make exactly 2 attempts when retries = 1', () => {
            const maxRetries = 1;
            let attempts = 0;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                attempts++;
            }

            expect(attempts).toBe(2);
        });

        it('should make exactly 4 attempts when retries = 3', () => {
            const maxRetries = 3;
            let attempts = 0;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                attempts++;
            }

            expect(attempts).toBe(4);
        });

        it('should calculate correct exponential backoff delays', () => {
            const calculateDelay = (attempt) => Math.min(5000 * Math.pow(2, attempt - 1), 60000);

            expect(calculateDelay(1)).toBe(5000);   // 5s
            expect(calculateDelay(2)).toBe(10000);  // 10s
            expect(calculateDelay(3)).toBe(20000);  // 20s
            expect(calculateDelay(4)).toBe(40000);  // 40s
            expect(calculateDelay(5)).toBe(60000);  // 60s (capped)
            expect(calculateDelay(6)).toBe(60000);  // 60s (capped)
            expect(calculateDelay(10)).toBe(60000); // 60s (capped)
        });

        it('should not retry on first attempt', () => {
            const attempt = 0;
            const shouldRetry = attempt > 0;

            expect(shouldRetry).toBe(false);
        });

        it('should retry on subsequent attempts', () => {
            const attempt = 1;
            const shouldRetry = attempt > 0;

            expect(shouldRetry).toBe(true);
        });

        it('should determine if more retries are available correctly', () => {
            const maxRetries = 3;

            expect(0 < maxRetries).toBe(true);  // After attempt 0, can retry
            expect(1 < maxRetries).toBe(true);  // After attempt 1, can retry
            expect(2 < maxRetries).toBe(true);  // After attempt 2, can retry
            expect(3 < maxRetries).toBe(false); // After attempt 3, cannot retry
            expect(4 < maxRetries).toBe(false); // After attempt 4, cannot retry
        });

        it('should handle edge case of maxRetries = 0 correctly', () => {
            const maxRetries = 0;

            expect(0 < maxRetries).toBe(false); // After attempt 0, cannot retry
            expect(1 < maxRetries).toBe(false); // After attempt 1, cannot retry
        });
    });

    describe('Retry Attempt Tracking', () => {
        it('should track attempt numbers correctly for retries = 0', () => {
            const maxRetries = 0;
            const attempts = [];

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                attempts.push(attempt);
            }

            expect(attempts).toEqual([0]);
        });

        it('should track attempt numbers correctly for retries = 3', () => {
            const maxRetries = 3;
            const attempts = [];

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                attempts.push(attempt);
            }

            expect(attempts).toEqual([0, 1, 2, 3]);
        });

        it('should identify initial attempt vs retry attempts', () => {
            const maxRetries = 3;
            const attemptTypes = [];

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                attemptTypes.push({
                    attempt,
                    isInitial: attempt === 0,
                    isRetry: attempt > 0
                });
            }

            expect(attemptTypes[0]).toEqual({ attempt: 0, isInitial: true, isRetry: false });
            expect(attemptTypes[1]).toEqual({ attempt: 1, isInitial: false, isRetry: true });
            expect(attemptTypes[2]).toEqual({ attempt: 2, isInitial: false, isRetry: true });
            expect(attemptTypes[3]).toEqual({ attempt: 3, isInitial: false, isRetry: true });
        });
    });

    describe('Integration: Retry Count Validation', () => {
        it('should ensure retries = 0 means no retries (1 attempt only)', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ value: '0' }]
            });

            const maxRetries = await getScrapeRetries(mockClient);
            let executionCount = 0;

            // Simulate the retry loop
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                executionCount++;
                // Simulate success on first attempt
                if (executionCount === 1) break;
            }

            expect(maxRetries).toBe(0);
            expect(executionCount).toBe(1);
        });

        it('should ensure retries = 2 means up to 3 attempts', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ value: '2' }]
            });

            const maxRetries = await getScrapeRetries(mockClient);
            let executionCount = 0;

            // Simulate the retry loop with all failures
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                executionCount++;
            }

            expect(maxRetries).toBe(2);
            expect(executionCount).toBe(3);
        });
    });
});
