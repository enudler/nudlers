import React, { useState, useEffect, useCallback } from 'react';
import {
  Drawer,
  Box,
  Typography,
  CircularProgress,
  Tooltip,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Avatar,
  Button,
  LinearProgress
} from '@mui/material';
import { logger } from '../utils/client-logger';
import { styled, keyframes } from '@mui/material/styles';
import SyncIcon from '@mui/icons-material/Sync';

import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import HistoryIcon from '@mui/icons-material/History';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TimerIcon from '@mui/icons-material/Timer';
import { BEINLEUMI_GROUP_VENDORS, BANK_VENDORS } from '../utils/constants';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import dynamic from 'next/dynamic';
const ScrapeReport = dynamic(() => import('./ScrapeReport'), { ssr: false });
import ImageIcon from '@mui/icons-material/Image';
import CloseIcon from '@mui/icons-material/Close';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';

interface SyncStatusModalProps {
  open: boolean;
  onClose: () => void;
  width: number;
  onWidthChange: (width: number) => void;
  onSyncSuccess?: () => void;
}

interface SyncStatus {
  syncHealth: string;
  settings: {
    enabled: boolean;
    syncHour: number;
    daysBack: number;
  };
  activeAccounts: number;
  latestScrape: {
    id: number;
    triggered_by: string;
    vendor: string;
    status: string;
    message: string;
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
}

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

// Drawer style with dynamic width
const StyledDrawer = styled(Drawer, { shouldForwardProp: (prop) => prop !== 'width' })<{ width: number }>(({ theme, width }) => ({
  '& .MuiDrawer-paper': {
    background: theme.palette.mode === 'dark'
      ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)'
      : 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(20px)',
    borderLeft: `1px solid ${theme.palette.divider}`,
    color: theme.palette.text.primary,
    width: `${width}px`,
    maxWidth: '90vw',
    boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.3)',
    transition: 'width 0s', // Disable transition while resizing for smoothness
  },
  '& .MuiBackdrop-root': {
    backgroundColor: 'transparent',
  }
}));

const ResizeHandle = styled(Box)(({ theme }) => ({
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: 0,
  width: '6px',
  cursor: 'ew-resize',
  zIndex: 1000,
  '&:hover': {
    backgroundColor: 'rgba(96, 165, 250, 0.5)',
  },
  '&:active': {
    backgroundColor: 'rgba(96, 165, 250, 0.8)',
  }
}));

const StatusCard = styled(Box)(({ theme }) => ({
  padding: '16px',
  borderRadius: '12px',
  border: `1px solid ${theme.palette.divider}`,
  background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.5)' : 'rgba(241, 245, 249, 0.6)',
  marginBottom: '12px'
}));

const AccountItem = styled(ListItem)(({ theme }) => ({
  borderRadius: '8px',
  marginBottom: '4px',
  '&:hover': {
    backgroundColor: 'rgba(96, 165, 250, 0.1)',
  }
}));

// Helper function to parse date strings from API (now returns ISO strings with timezone)
const parseDate = (dateStr: string | null): Date => {
  if (!dateStr) return new Date();

  // API should return ISO strings (e.g., "2026-01-29T10:30:00.000Z")
  // But handle edge cases where it might not be properly formatted
  let date: Date;

  // If it already has 'Z' or timezone offset, parse directly
  if (dateStr.includes('Z') || dateStr.match(/[+-]\d{2}:?\d{2}$/)) {
    date = new Date(dateStr);
  }
  // If it's PostgreSQL format without timezone (shouldn't happen but handle it)
  else if (dateStr.match(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/)) {
    // Treat as UTC by appending 'Z'
    const isoStr = dateStr.replace(' ', 'T').replace(/\.(\d+)?$/, (match, millis) => {
      return millis ? `.${millis.padEnd(3, '0')}` : '.000';
    }) + (dateStr.includes('.') ? '' : '.000') + 'Z';
    date = new Date(isoStr);
  }
  // Try parsing as-is
  else {
    date = new Date(dateStr);
  }

  // Validate the date is valid
  if (isNaN(date.getTime())) {
    logger.warn('Invalid date string in parseDate', { dateStr });
    return new Date();
  }

  return date;
};

const formatRelativeTime = (dateStr: string | null) => {
  if (!dateStr) return 'Never';
  const date = parseDate(dateStr);
  const now = new Date();

  // Both dates are in milliseconds since epoch (UTC), so comparison is timezone-independent
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  // Handle negative differences (future dates) gracefully
  if (diffMs < 0) {
    const absDiffMins = Math.abs(diffMins);
    if (absDiffMins < 1) return 'Just now';
    if (absDiffMins < 60) return `in ${absDiffMins} min`;
    return 'Just now'; // If it's very close, just say "just now"
  }

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
};

const formatDateTime = (dateStr: string) => {
  const date = parseDate(dateStr);
  return date.toLocaleString();
};

const getStatusColor = (status: string) => {
  const root = document.documentElement;
  const getVar = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();

  switch (status) {
    case 'completed':
    case 'healthy':
      return getVar('--status-success');
    case 'started':
    case 'syncing':
      return getVar('--status-syncing');
    case 'failed':
    case 'error':
      return getVar('--status-error');
    case 'stale':
    case 'outdated':
      return getVar('--status-warning');
    default:
      return getVar('--text-secondary');
  }
};

const getVendorIcon = (vendor: string) => {
  if (vendor.toLowerCase().includes('bank') || vendor.toLowerCase().includes('leumi') ||
    vendor.toLowerCase().includes('hapoalim') || vendor.toLowerCase().includes('discount') ||
    vendor.toLowerCase().includes('mizrahi')) {
    return <AccountBalanceIcon />;
  }
  return <CreditCardIcon />;
};

import { useTheme } from '@mui/material/styles';
import { useNotification } from './NotificationContext';

const SyncStatusModal: React.FC<SyncStatusModalProps> = ({ open, onClose, width, onWidthChange, onSyncSuccess }) => {
  const theme = useTheme();
  const { showNotification } = useNotification();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [syncProgress, setSyncProgress] = useState<{
    current: number;
    total: number;
    currentAccount: string | null;
    currentStep?: string | null;
    percent?: number;
    phase?: string;
    success?: boolean | null;
    summary?: {
      savedTransactions?: number;
      duplicateTransactions?: number;
      transactions?: number;
      processedTransactions?: Array<{
        name: string;
        amount: number;
        category: string;
        date: string;
        accountName?: string;
      }>;
    };
    latestScreenshot?: {
      url: string;
      filename: string;
      stepName: string;
      timestamp: string;
    } | null;
  } | null>(null);

  const [syncStartTime, setSyncStartTime] = useState<number | null>(null);

  interface ProcessedTransaction {
    name: string;
    amount: number;
    category: string;
    date: string;
    accountName?: string;
    source?: string;
    rule?: string;
    oldCategory?: string;
  }

  const [sessionReport, setSessionReport] = useState<ProcessedTransaction[]>([]);
  const [sessionSummary, setSessionSummary] = useState<any>(null);
  const [showReport, setShowReport] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [stopStatus, setStopStatus] = useState<string | null>(null);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  interface QueueItem {
    id: number | string;
    accountName: string;
    vendor: string;
    status: 'pending' | 'active' | 'completed' | 'failed';
    error?: string;
    summary?: {
      savedTransactions?: number;
      duplicateTransactions?: number;
      transactions?: number;
    };
  }
  const [syncQueue, setSyncQueue] = useState<QueueItem[]>([]);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Resizing state
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault(); // Prevent text selection
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    // Calculate new width: Window width - mouse X position
    const newWidth = window.innerWidth - e.clientX;
    const clampedWidth = Math.max(400, Math.min(newWidth, window.innerWidth - 50));

    onWidthChange(clampedWidth);
  }, [isResizing, onWidthChange]);

  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      localStorage.setItem('syncStatusDrawerWidth', width.toString());
    }
  }, [isResizing, width]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSyncing && syncStartTime) {
      const updateTimer = () => {
        setElapsedSeconds(Math.floor((Date.now() - syncStartTime) / 1000));
      };
      updateTimer();
      interval = setInterval(updateTimer, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSyncing, syncStartTime]);

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/sync_status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      logger.error('Failed to fetch sync status', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Sync state recovery on mount or status change
  useEffect(() => {
    if (status && status.syncHealth === 'syncing' && !isSyncing) {
      setIsSyncing(true);
      if (status.latestScrape) {
        const startTime = new Date(status.latestScrape.created_at).getTime();
        setSyncStartTime(startTime);
        setSyncProgress({
          current: 0,
          total: 1, // When recovering from status, we only know about the one active scrape
          currentAccount: status.latestScrape.vendor,
          currentStep: status.latestScrape.message || 'Syncing...',
          percent: 50, // Placeholder since we don't know exact percent
          phase: 'processing'
        });
      }
    } else if (status && status.syncHealth !== 'syncing' && isSyncing && !isInitializing && !isStopping) {
      // If server says we are no longer syncing, clear everything
      // Only do this if we are not currently starting or stopping a sync manually
      setIsSyncing(false);
      setSyncProgress(null);
      setSyncStartTime(null);
    }
  }, [status, isSyncing]); // Removed syncProgress from dependencies to avoid loop



  // Smart Polling Strategy
  useEffect(() => {
    if (!open) return;

    let pollingInterval: NodeJS.Timeout | null = null;
    let isTabVisible = true;

    const startPolling = () => {
      if (pollingInterval) clearInterval(pollingInterval);
      if (!isTabVisible) return;

      // Poll every 10 seconds to reduce CPU usage
      const intervalTime = 10000;

      pollingInterval = setInterval(async () => {
        await fetchStatus();
        // If syncing state changed during poll, restart with new interval
      }, intervalTime);
    };

    const handleVisibilityChange = () => {
      isTabVisible = document.visibilityState === 'visible';
      if (isTabVisible) {
        fetchStatus();
        startPolling();
      } else {
        if (pollingInterval) clearInterval(pollingInterval);
      }
    };

    // Initial fetch and start
    fetchStatus();
    startPolling();

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [open, fetchStatus, isSyncing]);

  // Also refresh when a data refresh event is dispatched
  useEffect(() => {
    const handleRefresh = () => fetchStatus();
    window.addEventListener('dataRefresh', handleRefresh);
    return () => window.removeEventListener('dataRefresh', handleRefresh);
  }, [fetchStatus]);

  const fetchLastTransactionDate = async (vendor: string): Promise<Date | null> => {
    try {
      const response = await fetch(`/api/last_transaction_date?vendor=${encodeURIComponent(vendor)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.lastDate) {
          return new Date(data.lastDate);
        }
      }
    } catch (err) {
      logger.error('Failed to fetch last transaction date', err, { vendor });
    }
    return null;
  };

  const prepareCredentials = (account: any, vendor: string) => {
    // Match the logic from scraperUtils.js prepareCredentials
    // NOTE: account.id is the database row ID, account.id_number is the actual credential ID number
    if (vendor === 'visaCal' || vendor === 'max') {
      return {
        username: String(account.username || ''),
        password: String(account.password || '')
      };
    } else if (BEINLEUMI_GROUP_VENDORS.includes(vendor)) {
      const bankUsername = account.username || account.id_number || '';
      return {
        username: String(bankUsername),
        password: String(account.password || '')
      };
    } else if (vendor === 'hapoalim') {
      // For Hapoalim, the userCode is stored in the username field
      const userCode = account.username || account.id_number || '';
      return {
        userCode: String(userCode),
        password: String(account.password || '')
      };
    } else if (BANK_VENDORS.includes(vendor)) {
      const bankId = account.username || account.id_number || '';
      const bankNum = account.bank_account_number || '';
      return {
        username: String(bankId),
        password: String(account.password || ''),
        num: String(bankNum)
      };
    } else {
      // Credit cards (isracard, amex, etc.)
      return {
        id: String(account.id_number || account.username || ''),
        card6Digits: String(account.card6_digits || ''),
        password: String(account.password || '')
      };
    }
  };

  const handleSyncAll = async () => {
    if (isSyncing) {
      if (isStopping) return;
      setIsStopping(true);

      // Cancel client-side fetch 
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Stop all server-side scrapers
      try {
        setStopStatus('Sending stop command...');
        const response = await fetch('/api/stop_scrapers', { method: 'POST' });
        const data = await response.json();
        if (data.success) {
          setStopStatus('Successfully stopped all processes.');
          setTimeout(async () => {
            setIsSyncing(false);
            setSyncProgress(null);
            setSyncStartTime(null);
            setStopStatus(null);
            await fetchStatus();
          }, 2000);
        } else {
          setStopStatus('Failed to stop some processes.');
          setTimeout(() => setStopStatus(null), 3000);
        }
      } catch (err) {
        logger.error('Failed to call stop_scrapers API', err);
        setStopStatus('Error stopping scrapers.');
        setTimeout(() => setStopStatus(null), 3000);
      } finally {
        setIsStopping(false);
      }
      return;
    }

    setIsInitializing(true);
    setSessionReport([]);
    setSessionSummary(null);
    setShowReport(false);
    setSyncStartTime(Date.now());
    setElapsedSeconds(0);
    setSyncQueue([]);
    setSyncProgress({ current: 0, total: 0, currentAccount: null });

    const runSync = async () => {
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch('/api/sync_all_stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ daysBack: status?.settings?.daysBack || 30 }),
          signal: abortControllerRef.current.signal
        });

        if (!response.ok) throw new Error('Failed to start batch sync');
        setIsSyncing(true);
        setIsInitializing(false);

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error('No reader available');

        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7);
            } else if (line.startsWith('data: ')) {
              const eventData = JSON.parse(line.slice(6));

              switch (currentEvent) {
                case 'queue':
                  const initialQueue: QueueItem[] = eventData.accounts.map((acc: any) => ({
                    id: acc.id,
                    accountName: acc.nickname,
                    vendor: acc.vendor,
                    status: 'pending'
                  }));
                  setSyncQueue(initialQueue);
                  setSyncProgress(prev => ({ ...prev!, total: initialQueue.length }));
                  break;

                case 'account_start':
                  setSyncQueue(prev => prev.map(item =>
                    item.id === eventData.id ? { ...item, status: 'active' } : item
                  ));
                  setSyncProgress(prev => ({
                    current: eventData.index,
                    total: prev?.total || 0,
                    currentAccount: eventData.nickname,
                    currentStep: 'Initializing...',
                    percent: 5,
                    phase: 'initialization'
                  }));
                  break;

                case 'progress':
                  setSyncProgress(prev => ({
                    ...prev!,
                    currentStep: eventData.message || prev?.currentStep,
                    percent: eventData.percent || prev?.percent,
                    phase: eventData.phase || prev?.phase,
                    success: eventData.success
                  }));
                  break;

                case 'screenshot':
                  setSyncProgress(prev => ({
                    ...prev!,
                    latestScreenshot: {
                      url: eventData.url,
                      filename: eventData.filename,
                      stepName: eventData.stepName,
                      timestamp: eventData.timestamp
                    }
                  }));
                  break;

                case 'account_complete':
                  setSyncQueue(prev => prev.map(item =>
                    item.id === eventData.id ? { ...item, status: 'completed', summary: eventData.summary } : item
                  ));
                  if (eventData.summary && eventData.summary.processedTransactions) {
                    setSessionReport(prev => [...prev, ...eventData.summary.processedTransactions]);
                  }
                  break;

                case 'account_error':
                  setSyncQueue(prev => prev.map(item =>
                    item.id === eventData.id ? { ...item, status: 'failed', error: eventData.message } : item
                  ));
                  break;

                case 'complete':
                  setIsSyncing(false);
                  setSessionSummary({ durationSeconds: eventData.durationSeconds });
                  setShowReport(true);
                  await fetchStatus();
                  if (onSyncSuccess) onSyncSuccess();
                  return;

                case 'error':
                  throw new Error(eventData.message);
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        logger.error('Batch sync failed', err);
        setIsSyncing(false);
        setSyncStartTime(null);
        setShowReport(true);
      } finally {
        setIsInitializing(false);
      }
    };

    runSync();
  };

  const handleSyncSingle = async (accountId: number) => {
    if (isSyncing || isInitializing) return;

    setIsInitializing(true);
    // Clear previous session report to start fresh
    setSessionReport([]);
    setSessionSummary(null);
    setShowReport(false);
    setSyncStartTime(Date.now());
    setElapsedSeconds(0);
    setSyncQueue([]);
    setSyncProgress({ current: 0, total: 1, currentAccount: null });

    const runSingle = async () => {
      try {
        // Fetch full credentials for this specific account
        const response = await fetch(`/api/credentials/${accountId}`);
        if (!response.ok) throw new Error('Failed to fetch account credentials');
        const account = await response.json();

        setIsSyncing(true);
        setIsInitializing(false);
        setSyncQueue([{
          id: account.id,
          accountName: account.nickname || account.vendor,
          vendor: account.vendor,
          status: 'active'
        }]);
        setSyncProgress({
          current: 0,
          total: 1,
          currentAccount: account.nickname || account.vendor,
          currentStep: 'Initializing...'
        });

        // Trigger global refresh so header knows we started
        window.dispatchEvent(new CustomEvent('dataRefresh'));

        abortControllerRef.current = new AbortController();

        try {
          const lastDate = await fetchLastTransactionDate(account.vendor);
          const startDate = lastDate ? new Date(lastDate) : new Date();
          const daysBack = status?.settings?.daysBack || 30;
          startDate.setDate(startDate.getDate() - daysBack);

          const credentials = prepareCredentials(account, account.vendor);
          const config = {
            options: {
              companyId: account.vendor,
              startDate: startDate.toISOString().split('T')[0],
              combineInstallments: false,
              showBrowser: false,
              additionalTransactionInformation: true
            },
            credentials: credentials,
            credentialId: account.id
          };

          const syncResponse = await fetch('/api/scrape_stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
            signal: abortControllerRef.current.signal
          });

          if (!syncResponse.ok) throw new Error(`Failed to sync ${account.nickname || account.vendor}`);

          const reader = syncResponse.body?.getReader();
          const decoder = new TextDecoder();

          if (reader) {
            let buffer = '';
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              let currentEvent = '';
              for (const line of lines) {
                if (line.startsWith('event: ')) {
                  currentEvent = line.slice(7);
                } else if (line.startsWith('data: ')) {
                  const eventData = JSON.parse(line.slice(6));

                  if (currentEvent === 'progress') {
                    setSyncProgress(prev => ({
                      current: 0,
                      total: 1,
                      currentAccount: account.nickname || account.vendor,
                      currentStep: eventData.message || '',
                      percent: eventData.percent || 0,
                      phase: eventData.phase || '',
                      success: eventData.success,
                      latestScreenshot: prev?.latestScreenshot
                    }));
                  } else if (currentEvent === 'screenshot') {
                    setSyncProgress(prev => ({
                      ...prev!,
                      latestScreenshot: {
                        url: eventData.url,
                        filename: eventData.filename,
                        stepName: eventData.stepName,
                        timestamp: eventData.timestamp
                      }
                    }));
                  } else if (currentEvent === 'error') {
                    throw new Error(eventData.message || 'Sync failed');
                  } else if (currentEvent === 'complete') {
                    setSyncProgress({
                      current: 0,
                      total: 1,
                      currentAccount: account.nickname || account.vendor,
                      currentStep: '✓ Completed successfully',
                      percent: 100,
                      phase: 'complete',
                      success: true,
                      summary: eventData.summary
                    });

                    if (eventData.summary && eventData.summary.processedTransactions) {
                      setSessionReport(prev => [...prev, ...eventData.summary.processedTransactions.map((t: any) => ({
                        ...t,
                        accountName: account.nickname || account.vendor,
                        source: t.source,
                        rule: t.rule,
                        oldCategory: t.oldCategory
                      }))]);
                    }
                    setSyncQueue(prev => prev.map(item =>
                      item.id === account.id ? { ...item, status: 'completed', summary: eventData.summary } : item
                    ));
                    if (onSyncSuccess) onSyncSuccess();
                    break;
                  }
                }
              }
            }
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            setIsSyncing(false);
            setSyncProgress(null);
            setIsInitializing(false);
            return;
          }
          logger.error('Failed to sync account', err, { account: account.nickname || account.vendor });
          setSyncQueue(prev => prev.map(item =>
            item.id === account.id ? { ...item, status: 'failed', error: err instanceof Error ? err.message : String(err) } : item
          ));
        }

        await fetchStatus();
        setSyncProgress(null);
        setIsSyncing(false);
        const finalDuration = syncStartTime ? Math.floor((Date.now() - syncStartTime) / 1000) : elapsedSeconds;
        setSessionSummary({
          durationSeconds: finalDuration
        });
        setSyncStartTime(null);
        setShowReport(true);
      } catch (err) {
        logger.error('Single sync failed', err);
        setSyncProgress(null);
        setIsSyncing(false);
        setSyncStartTime(null);
      } finally {
        setIsInitializing(false);
      }
    };

    runSingle();
  };

  interface SyncEvent {
    id: number;
    triggered_by: string;
    vendor: string;
    status: string;
    message: string;
    created_at: string;
    duration_seconds?: number;
  }

  const handleHistoryClick = async (event: SyncEvent) => {
    // if (event.status !== 'completed') return; // Allow viewing partial reports or errors if data exists

    setLoading(true);
    try {
      const response = await fetch(`/api/get_scrape_report?id=${event.id}`);
      if (response.ok) {
        const data = await response.json();
        // Handle both formats: direct transactions array or nested in processedTransactions
        const txns = Array.isArray(data) ? data : (data.processedTransactions || []);
        setSessionReport(txns);
        setSessionSummary(data); // Store the full report object as summary
        setShowReport(true);
      } else {
        logger.error('Failed to fetch report for event', undefined, { eventId: event.id });
      }
    } catch (err) {
      logger.error('Failed to fetch report', err, { eventId: event.id });
    } finally {
      setLoading(false);
    }
  };

  const getSyncHealthDisplay = () => {
    if (!status) return { icon: <CloudOffIcon />, label: 'Connecting...', color: '#64748b', description: 'Fetching sync status...' };

    switch (status.syncHealth) {
      case 'healthy':
        return {
          icon: <CloudDoneIcon sx={{ fontSize: 48 }} />,
          label: 'All Synced',
          color: '#22c55e',
          description: 'Your transactions are up to date'
        };
      case 'syncing':
        return {
          icon: <SyncIcon sx={{ fontSize: 48, animation: `${spin} 1.5s linear infinite` }} />,
          label: 'Syncing',
          color: '#60a5fa',
          description: 'Sync in progress...'
        };
      case 'error':
        return {
          icon: <ErrorIcon sx={{ fontSize: 48 }} />,
          label: 'Sync Error',
          color: '#ef4444',
          description: 'Last sync encountered an error'
        };
      case 'stale':
        return {
          icon: <WarningIcon sx={{ fontSize: 48 }} />,
          label: 'Needs Sync',
          color: '#f59e0b',
          description: 'Some accounts need to be synced'
        };
      case 'outdated':
        return {
          icon: <WarningIcon sx={{ fontSize: 48 }} />,
          label: 'Outdated',
          color: '#f59e0b',
          description: 'Transactions may be outdated'
        };
      case 'never_synced':
        return {
          icon: <CloudOffIcon sx={{ fontSize: 48 }} />,
          label: 'Never Synced',
          color: '#64748b',
          description: 'Start your first sync to fetch transactions'
        };
      case 'no_accounts':
        return {
          icon: <CloudOffIcon sx={{ fontSize: 48 }} />,
          label: 'No Accounts',
          color: '#64748b',
          description: 'Add accounts to start syncing'
        };
      default:
        if (status?.latestScrape?.created_at) {
          return {
            icon: <AccessTimeIcon sx={{ fontSize: 48 }} />,
            label: `Last Sync: ${formatRelativeTime(status.latestScrape.created_at)}`,
            color: '#64748b',
            description: 'System is idle'
          };
        }
        return {
          icon: <SyncIcon sx={{ fontSize: 48 }} />,
          label: 'Status Unknown',
          color: '#64748b',
          description: 'Status unavailable'
        };
    }
  };

  const healthDisplay = getSyncHealthDisplay();

  return (
    <StyledDrawer
      anchor="right"
      open={open}
      onClose={onClose}
      width={width}
    >
      <ResizeHandle onMouseDown={handleMouseDown} />
      {/* Header */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        p: 2,
        borderBottom: `1px solid ${theme.palette.divider}`,
        pl: 3 // Extra padding for handle
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <SyncIcon sx={{ color: '#60a5fa' }} />
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
            Sync Status
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {status && status.activeAccounts > 0 && (
            <Tooltip title={isSyncing ? "Stop sync immediately" : "Sync all accounts now"}>
              <Button
                onClick={handleSyncAll}
                variant="contained"
                size="small"
                disabled={isStopping || isInitializing}
                color={isSyncing ? "error" : "success"}
                startIcon={
                  isStopping || isInitializing ? (
                    <CircularProgress size={16} sx={{ color: 'inherit' }} />
                  ) : isSyncing ? (
                    <CircularProgress size={16} sx={{ color: 'inherit' }} />
                  ) : (
                    <PlayArrowIcon />
                  )
                }
                sx={{
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  px: 1.5,
                  py: 0.5,
                  minWidth: '110px'
                }}
              >
                {isStopping ? 'Stopping...' : isInitializing ? 'Starting...' : isSyncing ? 'Stop Now' : 'Sync Now'}
              </Button>
            </Tooltip>
          )}

        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ p: 2, overflowY: 'auto', flex: 1 }}>
        {showReport ? (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Sync Report</Typography>
              <Button size="small" onClick={() => setShowReport(false)} sx={{ color: '#aaa' }}>
                Close Report
              </Button>
            </Box>

            {sessionReport.length === 0 ? (
              <Typography variant="body2" sx={{ color: '#aaa', fontStyle: 'italic', textAlign: 'center', py: 4 }}>
                No new transactions found during this sync.
              </Typography>
            ) : (
              <ScrapeReport report={sessionReport} summary={sessionSummary} />
            )}

            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
              <Button variant="outlined" onClick={() => setShowReport(false)}>
                Back to Status
              </Button>
            </Box>
          </Box>
        ) : loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress sx={{ color: '#60a5fa' }} />
          </Box>
        ) : (
          <>
            {/* Sync Progress */}
            {(isSyncing || isInitializing) && (
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    {isStopping ? 'Stopping Sync...' : 'Sync Progress'}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TimerIcon sx={{ fontSize: 14, color: '#60a5fa' }} />
                    <Typography variant="caption" sx={{ color: '#60a5fa', fontWeight: 600 }}>
                      {formatTime(elapsedSeconds)}
                    </Typography>
                  </Box>
                </Box>

                {syncQueue.length === 0 && isInitializing && (
                  <StatusCard sx={{ textAlign: 'center', py: 3 }}>
                    <CircularProgress size={24} sx={{ mb: 1, color: '#60a5fa' }} />
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      Initializing session...
                    </Typography>
                  </StatusCard>
                )}

                {syncQueue.map((item) => {
                  const isActive = item.status === 'active';
                  const isCompleted = item.status === 'completed';
                  const isFailed = item.status === 'failed';

                  return (
                    <StatusCard key={item.id} sx={{
                      mb: 1,
                      p: isActive ? 2 : 1.5,
                      background: isActive
                        ? 'linear-gradient(135deg, rgba(96, 165, 250, 0.1) 0%, rgba(96, 165, 250, 0.05) 100%)'
                        : isCompleted ? 'rgba(34, 197, 94, 0.05)' : isFailed ? 'rgba(239, 68, 68, 0.05)' : 'rgba(30, 41, 59, 0.2)',
                      borderColor: isActive ? 'rgba(96, 165, 250, 0.4)' : isCompleted ? 'rgba(34, 197, 94, 0.2)' : isFailed ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      opacity: isActive || isCompleted || isFailed ? 1 : 0.6
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        {isCompleted ? (
                          <Box sx={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#fff' }} />
                          </Box>
                        ) : isFailed ? (
                          <ErrorIcon sx={{ fontSize: 18, color: '#ef4444' }} />
                        ) : isActive ? (
                          <SyncIcon sx={{ fontSize: 18, color: '#60a5fa', animation: `${spin} 2s linear infinite` }} />
                        ) : (
                          <Box sx={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)' }} />
                        )}

                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body2" sx={{ fontWeight: isActive ? 600 : 500, color: isActive ? '#60a5fa' : isCompleted ? '#22c55e' : isFailed ? '#ef4444' : 'text.secondary' }}>
                              {item.accountName}
                            </Typography>
                            {isCompleted && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {item.summary && (
                                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                                    {item.summary.savedTransactions !== undefined && item.summary.savedTransactions > 0 && (
                                      <Typography variant="caption" sx={{ color: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)', px: 0.5, borderRadius: '4px' }}>
                                        {item.summary.savedTransactions} new
                                      </Typography>
                                    )}
                                  </Box>
                                )}
                                <Typography variant="caption" sx={{ color: '#22c55e', fontWeight: 600 }}>
                                  Done
                                </Typography>
                              </Box>
                            )}
                          </Box>

                          {isActive && (
                            <Box sx={{ mt: 1 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                  {syncProgress?.currentStep || 'Syncing...'}
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#60a5fa', fontWeight: 600 }}>
                                  {syncProgress?.percent || 0}%
                                </Typography>
                              </Box>
                              <LinearProgress
                                variant={isStopping ? "indeterminate" : "determinate"}
                                value={isStopping ? undefined : (syncProgress?.percent || 0)}
                                sx={{
                                  height: 4,
                                  borderRadius: 2,
                                  backgroundColor: 'rgba(96, 165, 250, 0.1)',
                                  '& .MuiLinearProgress-bar': {
                                    backgroundColor: isStopping ? '#94a3b8' : '#60a5fa'
                                  }
                                }}
                              />
                              {syncProgress?.latestScreenshot && (
                                <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'center' }}>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<ImageIcon />}
                                    onClick={() => setSelectedScreenshot(syncProgress.latestScreenshot?.url || null)}
                                    sx={{
                                      fontSize: '10px',
                                      py: 0.5,
                                      borderColor: 'rgba(96, 165, 250, 0.3)',
                                      color: '#60a5fa',
                                      '&:hover': {
                                        borderColor: '#60a5fa',
                                        backgroundColor: 'rgba(96, 165, 250, 0.1)'
                                      }
                                    }}
                                  >
                                    View Browser Screenshot
                                  </Button>
                                </Box>
                              )}
                            </Box>
                          )}

                          {isFailed && item.error && (
                            <Typography variant="caption" sx={{ color: '#ef4444', display: 'block', mt: 0.5, fontSize: '10px' }}>
                              {item.error}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </StatusCard>
                  );
                })}

                {isStopping && (
                  <Box sx={{ mt: 2, p: 1.5, borderRadius: '8px', backgroundColor: 'rgba(148, 163, 184, 0.1)', border: '1px solid rgba(148, 163, 184, 0.2)' }}>
                    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', textAlign: 'center' }}>
                      {stopStatus || 'Terminating browser processes...'}
                    </Typography>
                  </Box>
                )}
              </Box>
            )}

            {/* Main Status Display - Hidden when syncing, initializing, or idle */}
            {!isSyncing && !isInitializing && healthDisplay.description !== 'System is idle' && (
              <StatusCard sx={{
                background: `linear-gradient(135deg, ${healthDisplay.color}10 0%, ${healthDisplay.color}05 100%)`,
                borderColor: `${healthDisplay.color}40`
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Box sx={{ color: healthDisplay.color, '& svg': { fontSize: 36 } }}>
                    {healthDisplay.icon}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: healthDisplay.color }}>
                      {healthDisplay.label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                      {healthDisplay.description}
                    </Typography>

                  </Box>
                </Box>
                {status?.latestScrape && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: theme.palette.text.disabled }}>
                      Last activity: {formatRelativeTime(status.latestScrape.created_at)}
                    </Typography>
                    {status.latestScrape.duration_seconds && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <TimerIcon sx={{ fontSize: 10, color: theme.palette.text.disabled }} />
                        <Typography variant="caption" sx={{ fontSize: '10px', color: theme.palette.text.disabled }}>
                          {formatTime(Math.round(status.latestScrape.duration_seconds))}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                )}
              </StatusCard>
            )}

            {/* Quick Stats */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <Box sx={{
                flex: 1,
                p: 1.5,
                borderRadius: '10px',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.2)',
                textAlign: 'center'
              }}>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#22c55e' }}>
                  {status?.activeAccounts || 0}
                </Typography>
                <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontSize: '10px' }}>
                  Accounts
                </Typography>
              </Box>
              <Box sx={{
                flex: 1,
                p: 1.5,
                borderRadius: '10px',
                backgroundColor: 'rgba(167, 139, 250, 0.1)',
                border: '1px solid rgba(167, 139, 250, 0.2)',
                textAlign: 'center'
              }}>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#a78bfa' }}>
                  {status?.settings.daysBack || 30}
                </Typography>
                <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontSize: '10px' }}>
                  Days
                </Typography>
              </Box>
            </Box>

            {/* Account Sync Status */}
            {status?.accountSyncStatus && status.accountSyncStatus.length > 0 && (
              <StatusCard>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <AccountBalanceIcon sx={{ color: '#60a5fa', fontSize: 20 }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Account Status
                  </Typography>
                </Box>
                <List dense sx={{ py: 0 }}>
                  {status.accountSyncStatus.map((account, index) => {
                    const lastSynced = account.last_synced_at ? parseDate(account.last_synced_at) : null;
                    const now = new Date();
                    // Both dates are in milliseconds since epoch (UTC), so comparison is timezone-independent
                    const hoursSinceSync = lastSynced ? Math.max(0, (now.getTime() - lastSynced.getTime()) / 3600000) : Infinity;
                    const isStale = hoursSinceSync > 48;
                    const isRecent = hoursSinceSync < 24;

                    return (
                      <AccountItem key={index} sx={{ py: 1 }}>
                        <ListItemIcon sx={{ minWidth: 40 }}>
                          <Avatar sx={{
                            width: 32,
                            height: 32,
                            bgcolor: isRecent ? 'rgba(34, 197, 94, 0.2)' : isStale ? 'rgba(245, 158, 11, 0.2)' : 'rgba(148, 163, 184, 0.2)'
                          }}>
                            {getVendorIcon(account.vendor)}
                          </Avatar>
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {account.nickname || account.vendor}
                            </Typography>
                          }
                          secondary={
                            <Typography variant="caption" sx={{ color: theme.palette.text.disabled }}>
                              {account.vendor}
                            </Typography>
                          }
                        />
                        <ListItemSecondaryAction sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Tooltip title="Sync this account only">
                            <IconButton
                              size="small"
                              onClick={() => handleSyncSingle(account.id)}
                              disabled={isSyncing || isInitializing || isStopping}
                              sx={{
                                color: '#60a5fa',
                                p: 0.5,
                                '&:hover': { backgroundColor: 'rgba(96, 165, 250, 0.1)' }
                              }}
                            >
                              <RefreshIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                          <Chip
                            icon={<AccessTimeIcon sx={{ fontSize: 14 }} />}
                            label={formatRelativeTime(account.last_synced_at)}
                            size="small"
                            sx={{
                              backgroundColor: isRecent ? 'rgba(34, 197, 94, 0.2)' : isStale ? 'rgba(245, 158, 11, 0.2)' : 'rgba(148, 163, 184, 0.2)',
                              color: isRecent ? 'var(--status-success)' : isStale ? 'var(--status-warning)' : theme.palette.text.secondary,
                              '& .MuiChip-icon': {
                                color: 'inherit'
                              }
                            }}
                          />
                        </ListItemSecondaryAction>
                      </AccountItem>
                    );
                  })}
                </List>
              </StatusCard>
            )}

            {/* Recent Sync History */}
            {status?.history && status.history.length > 0 && (
              <StatusCard>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <HistoryIcon sx={{ color: '#a78bfa', fontSize: 20 }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Recent Activity
                  </Typography>
                </Box>
                <Box sx={{
                  maxHeight: '200px',
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  '&::-webkit-scrollbar': {
                    width: '6px',
                  },
                  '&::-webkit-scrollbar-track': {
                    background: 'rgba(148, 163, 184, 0.1)',
                    borderRadius: '3px',
                  },
                  '&::-webkit-scrollbar-thumb': {
                    background: 'rgba(148, 163, 184, 0.3)',
                    borderRadius: '3px',
                  }
                }}>
                  {status.history.map((event) => (
                    <Box
                      key={event.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 2,
                        py: 1.5,
                        borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        borderRadius: '8px',
                        px: 1,
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          transform: 'translateX(4px)'
                        },
                        '&:last-child': { borderBottom: 'none' }
                      }}
                      onClick={() => handleHistoryClick(event)}
                    >
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: getStatusColor(event.status),
                          mt: 0.75,
                          flexShrink: 0
                        }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {event.vendor}
                          </Typography>
                          <Chip
                            label={event.status}
                            size="small"
                            sx={{
                              height: '18px',
                              fontSize: '10px',
                              backgroundColor: `${getStatusColor(event.status)}20`,
                              color: getStatusColor(event.status)
                            }}
                          />
                        </Box>
                        {event.message && (
                          <Typography
                            variant="caption"
                            sx={{
                              color: theme.palette.text.disabled,
                              display: 'block',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {event.message}
                          </Typography>
                        )}
                      </Box>
                      <Box sx={{ flexShrink: 0, textAlign: 'right' }}>
                        <Typography variant="caption" sx={{ color: theme.palette.text.disabled, display: 'block' }}>
                          {formatRelativeTime(event.created_at)}
                        </Typography>
                        {event.duration_seconds && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end', mt: 0.5 }}>
                            <TimerIcon sx={{ fontSize: 10, color: theme.palette.text.disabled }} />
                            <Typography variant="caption" sx={{ fontSize: '10px', color: theme.palette.text.disabled }}>
                              {formatTime(Math.round(event.duration_seconds))}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </StatusCard>
            )}
          </>
        )}
      </Box>

      {/* Screenshot Overlay Viewer */}
      <Dialog
        open={!!selectedScreenshot}
        onClose={() => setSelectedScreenshot(null)}
        maxWidth="xl"
        fullWidth
        PaperProps={{
          sx: {
            background: 'transparent',
            boxShadow: 'none'
          }
        }}
      >
        <DialogContent sx={{ p: 0, position: 'relative', bgcolor: 'black', overflow: 'hidden' }}>
          <IconButton
            onClick={() => setSelectedScreenshot(null)}
            sx={{
              position: 'absolute',
              right: 16,
              top: 16,
              color: 'white',
              bgcolor: 'rgba(0,0,0,0.5)',
              zIndex: 10,
              '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' }
            }}
          >
            <CloseIcon />
          </IconButton>
          {selectedScreenshot && (
            <Box
              component="img"
              src={selectedScreenshot}
              sx={{
                width: '100%',
                display: 'block',
                maxHeight: '90vh',
                objectFit: 'contain'
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </StyledDrawer >
  );
};

export default SyncStatusModal;
