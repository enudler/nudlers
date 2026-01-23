import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '../utils/client-logger';

export interface SyncStatus {
    dbStatus: 'ok' | 'error';
    syncHealth: string;
    settings: {
        enabled: boolean;
        syncHour: number;
        daysBack: number;
    };
    activeAccounts: number;
    latestScrape: {
        id?: number;
        triggered_by: string;
        vendor: string;
        status: string;
        message?: string;
        created_at: string;
        duration_seconds?: number;
    } | null;
    history: Array<{
        id: number;
        triggered_by: string;
        vendor: string;
        status: string;
        message: string;
        created_at: string;
        duration_seconds?: number;
    }>;
    accountSyncStatus: Array<{
        id: number;
        nickname: string;
        vendor: string;
        last_synced_at: string | null;
    }>;
    error?: string;
}

interface SyncStatusContextType {
    status: SyncStatus | null;
    loading: boolean;
    refreshStatus: () => Promise<void>;
    dbConnected: boolean;
}

const SyncStatusContext = createContext<SyncStatusContextType | undefined>(undefined);

export const useSyncStatus = () => {
    const context = useContext(SyncStatusContext);
    if (context === undefined) {
        throw new Error('useSyncStatus must be used within a SyncStatusProvider');
    }
    return context;
};

export const SyncStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [status, setStatus] = useState<SyncStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isTabVisibleRef = useRef(true);

    const fetchStatus = useCallback(async () => {
        try {
            const response = await fetch('/api/scrapers/status');
            const data = await response.json();

            if (!response.ok) {
                setStatus(prev => ({
                    ...prev!,
                    dbStatus: 'error',
                    error: data.error || 'Failed to fetch status'
                }));
            } else {
                setStatus(data);
            }
        } catch (error) {
            logger.error('Failed to fetch sync status', error as Error);
            setStatus(prev => ({
                ...prev!,
                dbStatus: 'error',
                error: (error as Error).message
            }));
        } finally {
            setLoading(false);
        }
    }, []);

    const calculateInterval = useCallback(() => {
        if (!isTabVisibleRef.current) return 300000; // 5 minutes if tab is hidden

        if (status?.syncHealth === 'syncing') {
            return 5000; // 5 seconds if actively syncing
        }

        return 30000; // 30 seconds normally
    }, [status?.syncHealth]);

    const startPolling = useCallback(() => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
        }

        const interval = calculateInterval();
        pollingIntervalRef.current = setInterval(fetchStatus, interval);
    }, [calculateInterval, fetchStatus]);

    useEffect(() => {
        fetchStatus();

        const handleVisibilityChange = () => {
            isTabVisibleRef.current = document.visibilityState === 'visible';
            if (isTabVisibleRef.current) {
                fetchStatus();
            }
            // Restart polling with adjusted interval
            startPolling();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        startPolling();

        // Listen for custom dataRefresh events to avoid extra polling
        const handleRefresh = () => fetchStatus();
        window.addEventListener('dataRefresh', handleRefresh);

        return () => {
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('dataRefresh', handleRefresh);
        };
    }, [fetchStatus, startPolling]);

    // If sync status changes from syncing to something else, or vice-versa, restart polling to adjust interval
    useEffect(() => {
        startPolling();
    }, [status?.syncHealth, startPolling]);

    const value = {
        status,
        loading,
        refreshStatus: fetchStatus,
        dbConnected: status?.dbStatus === 'ok'
    };

    return <SyncStatusContext.Provider value={value}>{children}</SyncStatusContext.Provider>;
};
