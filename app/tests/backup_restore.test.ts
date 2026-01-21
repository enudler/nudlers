import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the database module
vi.mock('../pages/api/db', () => ({
    getDB: vi.fn()
}));

// Mock the logger
vi.mock('../utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
    }
}));

import { getDB } from '../pages/api/db';
import exportHandler from '../pages/api/maintenance/database/export';
import importHandler from '../pages/api/maintenance/database/import';

describe('Backup and Restore APIs', () => {
    let mockClient: {
        query: ReturnType<typeof vi.fn>;
        release: ReturnType<typeof vi.fn>;
    };
    let mockReq: any;
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
            setHeader: vi.fn().mockReturnThis()
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Export API', () => {
        it('should export all tables successfully', async () => {
            mockReq = {
                method: 'GET'
            };

            mockClient.query.mockResolvedValue({
                rowCount: 1,
                rows: [{ id: 1, name: 'test' }]
            });

            await exportHandler(mockReq, mockRes);

            expect(mockClient.query).toHaveBeenCalledTimes(7); // Number of TABLES_TO_EXPORT
            expect(mockRes.status).toHaveBeenCalledWith(200);

            const responseData = mockRes.json.mock.calls[0][0];
            expect(responseData.version).toBe('1.0');
            expect(responseData.tables).toHaveProperty('vendor_credentials');
            expect(responseData.tables).toHaveProperty('transactions');
            expect(responseData.tables.transactions.rowCount).toBe(1);
            expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should handle missing tables gracefully', async () => {
            mockReq = { method: 'GET' };
            mockClient.query.mockRejectedValueOnce(new Error('relation "vendor_credentials" does not exist'));
            mockClient.query.mockResolvedValue({ rowCount: 0, rows: [] });

            await exportHandler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const responseData = mockRes.json.mock.calls[0][0];
            expect(responseData.tables.vendor_credentials.error).toBe('Table not found');
        });
    });

    describe('Import API', () => {
        const mockBackupData = {
            version: '1.0',
            tables: {
                vendor_credentials: { data: [{ id: 1, vendor: 'test' }] },
                transactions: { data: [{ identifier: 'tx1', vendor: 'test', price: 10 }] }
            }
        };

        describe('Replace Mode', () => {
            it('should truncate tables in reverse order and then import', async () => {
                mockReq = {
                    method: 'POST',
                    body: { data: mockBackupData, mode: 'replace' }
                };

                await importHandler(mockReq, mockRes);

                // Verify transactions
                expect(mockClient.query).toHaveBeenCalledWith('BEGIN');

                // Check truncate order (reverse of TABLES_IMPORT_ORDER)
                // TABLES_IMPORT_ORDER: vendor_credentials, transactions, categorization_rules, scrape_events, card_ownership, budgets, card_vendors
                // TABLES_CLEAR_ORDER: card_vendors, budgets, card_ownership, scrape_events, categorization_rules, transactions, vendor_credentials

                const truncateCalls = mockClient.query.mock.calls
                    .filter(call => call[0].includes('TRUNCATE TABLE'))
                    .map(call => call[0]);

                expect(truncateCalls[0]).toContain('card_vendors');
                expect(truncateCalls[truncateCalls.length - 1]).toContain('vendor_credentials');

                // Check insert calls
                const insertCalls = mockClient.query.mock.calls
                    .filter(call => call[0].includes('INSERT INTO'))
                    .map(call => call[0]);

                expect(insertCalls[0]).toContain('vendor_credentials');
                expect(insertCalls[1]).toContain('transactions');

                expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
                expect(mockRes.status).toHaveBeenCalledWith(200);
                expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
            });

            it('should reset sequences for tables with id pk', async () => {
                mockReq = {
                    method: 'POST',
                    body: { data: { tables: { vendor_credentials: { data: [{ id: 1 }] } } }, mode: 'replace' }
                };

                await importHandler(mockReq, mockRes);

                const sequenceCalls = mockClient.query.mock.calls
                    .filter(call => call[0].includes('setval(pg_get_serial_sequence'));

                expect(sequenceCalls.length).toBeGreaterThan(0);
                expect(sequenceCalls[0][0]).toContain("'vendor_credentials', 'id'");
            });
        });

        describe('Merge Mode', () => {
            const mergeBackupData = {
                version: '1.0',
                tables: {
                    vendor_credentials: { data: [{ id: 1, vendor: 'test' }] },
                    transactions: { data: [{ identifier: 'tx1', vendor: 'test', price: 10 }] }
                }
            };

            it('should use ON CONFLICT for transactions', async () => {
                mockReq = {
                    method: 'POST',
                    body: { data: mergeBackupData, mode: 'merge' }
                };

                await importHandler(mockReq, mockRes);

                const transactionInsertCall = mockClient.query.mock.calls
                    .find(call => call[0] && call[0].includes('INSERT INTO transactions') || call[0].includes('INSERT INTO "transactions"'));

                expect(transactionInsertCall).toBeDefined();
                expect(transactionInsertCall![0]).toContain('ON CONFLICT ("identifier", "vendor") DO NOTHING');
            });

            it('should use ON CONFLICT for other tables with single id pk', async () => {
                mockReq = {
                    method: 'POST',
                    body: { data: mergeBackupData, mode: 'merge' }
                };

                await importHandler(mockReq, mockRes);

                const vcInsertCall = mockClient.query.mock.calls
                    .find(call => call[0] && call[0].includes('INSERT INTO vendor_credentials') || call[0].includes('INSERT INTO "vendor_credentials"'));

                expect(vcInsertCall).toBeDefined();
                expect(vcInsertCall![0]).toContain('ON CONFLICT ("id") DO NOTHING');
            });
        });

        it('should rollback on error', async () => {
            const errorClient = {
                query: vi.fn().mockImplementation(async (query: any) => {
                    if (query === 'BEGIN' || query === 'ROLLBACK') return {};
                    throw new Error('Import failed');
                }),
                release: vi.fn()
            };

            (getDB as any).mockResolvedValueOnce(errorClient);

            mockReq = {
                method: 'POST',
                body: { data: mockBackupData, mode: 'replace' }
            };

            await importHandler(mockReq, mockRes);

            expect(errorClient.query).toHaveBeenCalledWith('ROLLBACK');
            expect(mockRes.status).toHaveBeenCalledWith(500);
        });
    });
});
