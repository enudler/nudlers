import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '../utils/client-logger';

interface SyncStatus {
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
    summary?: {
        oldest_sync_at: string | null;
        has_never_synced: boolean;
    };
    history?: Array<{
        id: number;
        triggered_by: string;
        vendor: string;
        status: string;
        message: string;
        created_at: string;
        duration_seconds?: number;
    }>;
    accountSyncStatus?: Array<{
        id: number;
        nickname: string;
        vendor: string;
        last_synced_at: string | null;
    }>;
}

interface StatusContextType {
    isDbConnected: boolean;
    dbError: boolean;
    syncStatus: SyncStatus | null;
    refreshStatus: (full?: boolean) => Promise<void>;
    checkDb: () => Promise<void>;
    setFullPolling: (full: boolean) => void;
}

const StatusContext = createContext<StatusContextType | undefined>(undefined);

export const useStatus = () => {
    const context = useContext(StatusContext);
    if (!context) {
        throw new Error('useStatus must be used within a StatusProvider');
    }
    return context;
};

export const StatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isDbConnected, setIsDbConnected] = useState(true);
    const [dbError, setDbError] = useState(false);
    const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
    const [isFullPolling, setIsFullPolling] = useState(false);

    const isRefreshing = useRef(false);
    const isCheckingDb = useRef(false);

    const checkDb = useCallback(async () => {
        if (isCheckingDb.current) return;
        isCheckingDb.current = true;
        try {
            const response = await fetch('/api/ping');
            if (response.ok) {
                const data = await response.json();
                const connected = data.status === 'ok';
                setIsDbConnected(connected);
                setDbError(!connected);
            } else {
                setIsDbConnected(false);
                setDbError(true);
            }
        } catch (error) {
            setIsDbConnected(false);
            setDbError(true);
        } finally {
            isCheckingDb.current = false;
        }
    }, []);

    const refreshStatus = useCallback(async (full = false) => {
        if (isRefreshing.current) return;
        isRefreshing.current = true;
        try {
            // Use the 'full' parameter, OR the global 'isFullPolling' state
            const url = `/api/scrapers/status${(full || isFullPolling) ? '' : '?minimal=true'}`;
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                // Filter out non-sync events from history if they exist
                if (data.history) {
                    data.history = data.history.filter((e: any) => e.vendor !== 'whatsapp_summary');
                }
                setSyncStatus(data);
            }
        } catch (error) {
            logger.error('Failed to fetch sync status in context', error as Error);
        } finally {
            isRefreshing.current = false;
        }
    }, [isFullPolling]);

    const setFullPolling = useCallback((full: boolean) => {
        setIsFullPolling(full);
    }, []);

    useEffect(() => {
        // Initial checks
        checkDb();
        refreshStatus();

        let dbIntervalId: NodeJS.Timeout;
        let syncIntervalId: NodeJS.Timeout;

        const setupPolling = () => {
            if (document.hidden) return;

            // Poll DB connection - slower when healthy
            const dbInterval = isDbConnected ? 60000 : 10000;
            dbIntervalId = setInterval(checkDb, dbInterval);

            // Poll Sync Status - faster when syncing
            const isSyncing = syncStatus?.syncHealth === 'syncing';
            const syncInterval = isSyncing ? 5000 : 30000;
            syncIntervalId = setInterval(() => refreshStatus(false), syncInterval);
        };

        const clearPolling = () => {
            if (dbIntervalId) clearInterval(dbIntervalId);
            if (syncIntervalId) clearInterval(syncIntervalId);
        };

        setupPolling();

        const handleVisibilityChange = () => {
            if (document.hidden) {
                clearPolling();
            } else {
                checkDb();
                refreshStatus();
                setupPolling();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Listen for dataRefresh events to force update
        const handleDataRefresh = () => {
            checkDb();
            refreshStatus();
        };
        window.addEventListener('dataRefresh', handleDataRefresh);

        return () => {
            clearPolling();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('dataRefresh', handleDataRefresh);
        };
    }, [checkDb, refreshStatus, isDbConnected, syncStatus?.syncHealth]);

    const value = {
        isDbConnected,
        dbError,
        syncStatus,
        refreshStatus,
        checkDb,
        setFullPolling
    };

    return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
};
