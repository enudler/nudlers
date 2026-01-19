/**
 * Logic for displaying sync status labels based on progress state
 */
export interface SyncProgress {
    current: number;
    total: number;
    currentAccount?: string | null;
    currentStep?: string | null;
    percent?: number;
    phase?: string;
    success?: boolean | null;
    summary?: any;
}

export const getSyncStatusLabel = (
    syncProgress: SyncProgress | null,
    isInitializing: boolean,
    isStopping: boolean,
    stopStatus: string | null
): string => {
    if (isStopping || stopStatus) {
        return stopStatus || 'Stopping scrapers...';
    }

    if (isInitializing) {
        return 'Preparing sync...';
    }

    if (!syncProgress) {
        return 'Syncing...';
    }

    if (syncProgress.total === 1) {
        return 'Syncing account...';
    }

    const currentNum = Math.min((syncProgress.current || 0) + 1, syncProgress.total || 1);
    const totalNum = syncProgress.total || 1;
    return `Syncing accounts... (${currentNum} / ${totalNum})`;
};
