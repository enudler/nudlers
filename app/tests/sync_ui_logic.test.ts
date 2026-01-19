import { describe, it, expect } from 'vitest';
import { getSyncStatusLabel, SyncProgress } from '../utils/sync-ui-utils';

describe('Sync UI Logic: getSyncStatusLabel', () => {
    it('should return stop status message when stopping', () => {
        const label = getSyncStatusLabel(null, false, true, 'Custom stop message');
        expect(label).toBe('Custom stop message');
    });

    it('should return default stop message when stopping without custom message', () => {
        const label = getSyncStatusLabel(null, false, true, null);
        expect(label).toBe('Stopping scrapers...');
    });

    it('should return preparing message when initializing', () => {
        const label = getSyncStatusLabel(null, true, false, null);
        expect(label).toBe('Preparing sync...');
    });

    it('should return singular "account" for single account sync', () => {
        const progress: SyncProgress = { current: 0, total: 1 };
        const label = getSyncStatusLabel(progress, false, false, null);
        expect(label).toBe('Syncing account...');
    });

    it('should return plural "accounts" with count for multiple accounts', () => {
        const progress: SyncProgress = { current: 1, total: 5 };
        const label = getSyncStatusLabel(progress, false, false, null);
        expect(label).toBe('Syncing accounts... (2 / 5)');
    });

    it('should handle missing progress object gracefully', () => {
        const label = getSyncStatusLabel(null, false, false, null);
        expect(label).toBe('Syncing...');
    });
});
