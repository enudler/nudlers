import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../pages/api/db', () => ({ getDB: vi.fn() }));
vi.mock('../utils/logger.js', () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));
vi.mock('../pages/api/utils/encryption', () => ({
    decrypt: (value: string) => value,
    VaultLockedError: class VaultLockedError extends Error {}
}));
vi.mock('../pages/api/utils/scraperUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../pages/api/utils/scraperUtils')>();
    return {
        ...actual,
        checkScraperConcurrency: vi.fn().mockResolvedValue(undefined),
        getFetchCategoriesSetting: vi.fn().mockResolvedValue(false),
        getUpdateCategoryOnRescrapeSetting: vi.fn().mockResolvedValue(false),
        getLogHttpRequestsSetting: vi.fn().mockResolvedValue(false),
        loadCategorizationRules: vi.fn().mockResolvedValue([]),
        loadCategoryMappings: vi.fn().mockResolvedValue({}),
        getBillingCycleStartDay: vi.fn().mockResolvedValue(10),
        getScrapeRetries: vi.fn().mockResolvedValue(3),
        getScraperTimeout: vi.fn().mockResolvedValue(90000),
        insertScrapeAudit: vi.fn().mockImplementation(async (_client, _trigger, vendor) => vendor),
        updateScrapeAudit: vi.fn().mockResolvedValue(undefined),
        updateCredentialLastSynced: vi.fn().mockResolvedValue(undefined),
        runScraper: vi.fn(),
        processScrapedAccounts: vi.fn().mockResolvedValue({ savedTransactions: 0 })
    };
});

import { getDB } from '../pages/api/db';
import { runScraper, updateScrapeAudit, getScrapeRetries } from '../pages/api/utils/scraperUtils';
import handler from '../pages/api/scrapers/sync-all-stream';

describe('Sync-all credential preflight', () => {
    let client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
    let res: any;
    const rows = [
        { id: 1, vendor: 'yahav', username: 'bank-user', password: 'test-password', id_number: null },
        { id: 2, vendor: 'visaCal', username: 'card-user', password: 'test-password', id_number: null }
    ];

    function events(): Array<{ event: string; data: any }> {
        return res.write.mock.calls.map(([text]: [string]) => text).join('').split('\n\n')
            .filter(Boolean).map((block: string) => {
                const [event, data] = block.split('\n');
                return { event: event.slice(7), data: JSON.parse(data.slice(6)) };
            });
    }

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        client = { query: vi.fn().mockResolvedValue({ rows }), release: vi.fn() };
        vi.mocked(getDB).mockResolvedValue(client as any);
        vi.mocked(getScrapeRetries).mockResolvedValue(3);
        vi.mocked(runScraper).mockResolvedValue({ success: true, accounts: [] });
        res = {
            setHeader: vi.fn(), flushHeaders: vi.fn(), on: vi.fn(),
            write: vi.fn(), end: vi.fn()
        };
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it.each([0, 3])('skips an invalid Yahav account immediately with %s configured retries', async retries => {
        vi.mocked(getScrapeRetries).mockResolvedValue(retries);
        const done = handler({ method: 'POST', body: {} }, res);
        await vi.advanceTimersByTimeAsync(0);

        expect(runScraper).toHaveBeenCalledTimes(1);
        expect(runScraper).toHaveBeenCalledWith(client, expect.objectContaining({ companyId: 'visaCal' }),
            expect.any(Object), expect.any(Function), expect.any(Function));
        expect(vi.getTimerCount()).toBe(0);
        await done;

        expect(updateScrapeAudit).toHaveBeenCalledWith(client, 'yahav', 'failed', expect.stringContaining('national ID'));
        const sent = events();
        expect(sent.find(e => e.event === 'account_error')?.data).toEqual({
            id: 1, message: expect.stringContaining('national ID'), retriedAttempts: 0
        });
        expect(sent.filter(e => e.event === 'account_complete').map(e => e.data.id)).toEqual([2]);
        expect(sent.some(e => e.data.type === 'retryWait')).toBe(false);
        expect(client.release).toHaveBeenCalledOnce();
        expect(res.end).toHaveBeenCalledOnce();
    });

    it('still retries a transient scrape failure for valid credentials', async () => {
        client.query.mockResolvedValue({ rows: [{ ...rows[0], id_number: '012345678' }, rows[1]] });
        vi.mocked(runScraper).mockRejectedValueOnce(new Error('Temporary network failure'));
        const done = handler({ method: 'POST', body: {} }, res);
        await vi.advanceTimersByTimeAsync(0);
        expect(runScraper).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(1);

        await vi.advanceTimersByTimeAsync(5000);
        await done;
        expect(runScraper).toHaveBeenCalledTimes(3);
        expect(vi.mocked(runScraper).mock.calls[1][2].nationalID).toBe('012345678');
        expect(events().filter(e => e.event === 'account_complete').map(e => e.data.id)).toEqual([1, 2]);
        expect(events().some(e => e.event === 'account_error')).toBe(false);
    });
});
