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
  LinearProgress,
  Switch,
  useMediaQuery
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
import { formatISODate } from '../utils/dateUtils';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import dynamic from 'next/dynamic';
import { ScrapeReportSummary, ScrapeReportTransaction } from './ScrapeReport';
const ScrapeReport = dynamic(() => import('./ScrapeReport'), { ssr: false });
import ImageIcon from '@mui/icons-material/Image';
import CloseIcon from '@mui/icons-material/Close';
import LockIcon from '@mui/icons-material/Lock';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import SendIcon from '@mui/icons-material/Send';

// Tag thrown by SSE 'error' handler so the outer catch can recognise an expected,
// already-classified failure (e.g. INVALID_CREDENTIALS) and log it quietly instead
// of emitting a console.error + raw Error stack trace.
class KnownSyncFailure extends Error {
  readonly type: string;
  readonly originalMessage: string | null;
  constructor(type: string, message: string, originalMessage: string | null) {
    super(message);
    this.name = 'KnownSyncFailure';
    this.type = type;
    this.originalMessage = originalMessage;
  }
}

interface SyncStatusModalProps {
  open: boolean;
  onClose: () => void;
  width: number;
  onWidthChange: (width: number) => void;
  onSyncSuccess?: () => void;
}

interface _SyncStatus {
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

const ResizeHandle = styled(Box)({
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
});

const StatusCard = styled(Box)(({ theme }) => ({
  padding: '16px',
  borderRadius: '12px',
  border: `1px solid ${theme.palette.divider}`,
  background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.5)' : 'rgba(241, 245, 249, 0.6)',
  marginBottom: '12px'
}));

const AccountItem = styled(ListItem)({
  borderRadius: '8px',
  marginBottom: '4px',
  '&:hover': {
    backgroundColor: 'rgba(96, 165, 250, 0.1)',
  }
});

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

// formatRelativeTime is now defined inside the component so it can use the `t` function.

const formatDateTime = (dateStr: string) => {
  const date = parseDate(dateStr);
  return date.toLocaleString();
};

const getStatusColor = (status: string) => {
  const root = document.documentElement;
  const getVar = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();

  switch (status) {
    case 'completed':
    case 'success':
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
import { useTranslation } from 'react-i18next';
import { useNotification } from './NotificationContext';
import { useStatus } from '../context/StatusContext';
import NDatePicker from './NDatePicker';

const SyncStatusModal: React.FC<SyncStatusModalProps> = ({ open, onClose, width, onWidthChange, onSyncSuccess }) => {
  const theme = useTheme();
  const { t } = useTranslation('sync');

  const formatRelativeTime = (dateStr: string | null): string => {
    if (!dateStr) return t('relativeTime.never');
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
      if (absDiffMins < 1) return t('relativeTime.justNow');
      if (absDiffMins < 60) return t('relativeTime.inMinutes', { count: absDiffMins });
      return t('relativeTime.justNow'); // If it's very close, just say "just now"
    }

    if (diffMins < 1) return t('relativeTime.justNow');
    if (diffMins < 60) return t('relativeTime.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('relativeTime.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('relativeTime.daysAgo', { count: diffDays });
    return date.toLocaleDateString();
  };

  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { showNotification } = useNotification();
  const { syncStatus: status, refreshStatus: fetchStatus, setFullPolling, setIsVaultModalOpen, isVaultLocked } = useStatus();
  const loading = !status;
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
  const [sessionSummary, setSessionSummary] = useState<ScrapeReportSummary | null>(null);
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
  const [selectedErrorEvent, setSelectedErrorEvent] = useState<SyncEvent | null>(null);

  // Pending sync request from AccountsView or inline sync button
  interface PendingSyncRequest {
    accountId: number;
    vendor: string;
    nickname: string;
  }
  const [pendingSyncRequest, setPendingSyncRequest] = useState<PendingSyncRequest | null>(null);
  const [syncOptionsStartDate, setSyncOptionsStartDate] = useState<string>('');
  const [syncOptionsShowBrowser, setSyncOptionsShowBrowser] = useState(false);
  const [isLoadingStartDate, setIsLoadingStartDate] = useState(false);
  const [syncOptionsDateError, setSyncOptionsDateError] = useState<string | null>(null);

  // OTP State
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const otpInputRef = React.useRef<HTMLInputElement>(null);

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
          currentStep: status.latestScrape.message || t('progress.syncing'),
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
  }, [status, isSyncing, isInitializing, isStopping, t]);
  // Initial fetch and start
  useEffect(() => {
    if (open) {
      setFullPolling(true);
      fetchStatus(true);
    } else {
      setFullPolling(false);
    }
  }, [open, fetchStatus, setFullPolling]);

  // Listen for triggerSync events from AccountsView
  useEffect(() => {
    const handleTriggerSync = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.accountId) {
        prepareSyncOptionsForAccount(detail.accountId, detail.vendor, detail.nickname || detail.vendor);
      }
    };
    window.addEventListener('triggerSync', handleTriggerSync);
    return () => window.removeEventListener('triggerSync', handleTriggerSync);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prepareSyncOptionsForAccount declared below; closure captures it correctly at runtime
  }, [status?.settings?.daysBack]);

  // Clear pending sync request when drawer closes
  useEffect(() => {
    if (!open) setPendingSyncRequest(null);
  }, [open]);

  // No local polling, managed by StatusContext

  const fetchLastTransactionDate = async (vendor: string): Promise<Date | null> => {
    try {
      const response = await fetch(`/api/scrapers/last-transaction-date?vendor=${encodeURIComponent(vendor)}`);
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

  const validateSyncDate = (dateStr: string): string | null => {
    if (!dateStr) return t('options.errorRequired');
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return t('options.errorInvalid');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date > today) return t('options.errorFuture');
    return null;
  };

  const handleSyncDateChange = (value: string) => {
    setSyncOptionsStartDate(value);
    setSyncOptionsDateError(validateSyncDate(value));
  };

  const prepareSyncOptionsForAccount = async (accountId: number, vendor: string, nickname: string) => {
    setSyncOptionsShowBrowser(vendor === 'hapoalim');
    setIsLoadingStartDate(true);
    setSyncOptionsDateError(null);
    setPendingSyncRequest({ accountId, vendor, nickname });
    try {
      const lastDate = await fetchLastTransactionDate(vendor);
      const startDate = lastDate ? new Date(lastDate) : new Date();
      const daysBack = status?.settings?.daysBack || 30;
      startDate.setDate(startDate.getDate() - daysBack);
      const computed = formatISODate(startDate);
      setSyncOptionsStartDate(computed);
      setSyncOptionsDateError(validateSyncDate(computed));
    } catch {
      const fallback = new Date();
      fallback.setDate(fallback.getDate() - 30);
      const computed = formatISODate(fallback);
      setSyncOptionsStartDate(computed);
      setSyncOptionsDateError(validateSyncDate(computed));
    } finally {
      setIsLoadingStartDate(false);
    }
  };

  interface SyncAccountCredentials {
    id: number;
    nickname?: string;
    vendor: string;
    username?: string;
    password?: string;
    id_number?: string;
    bank_account_number?: string;
    card6_digits?: string;
    phone_number?: string;
  }

  const prepareCredentials = (account: SyncAccountCredentials, vendor: string) => {
    // Match the logic from scraperUtils.js prepareCredentials
    // NOTE: account.id is the database row ID, account.id_number is the actual credential ID number
    if (vendor === 'visaCal' || vendor === 'max') {
      return {
        username: String(account.username || ''),
        password: String(account.password || '')
      };
    } else if (vendor === 'yahav') {
      return {
        username: String(account.username || ''),
        password: String(account.password || ''),
        nationalID: String(account.id_number || '')
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
    } else if (vendor === 'onezero') {
      // OneZero: email lives in the username column. The long-term OTP token is loaded
      // server-side from the DB by credentialId — never sent through the browser.
      return {
        email: String(account.username || ''),
        password: String(account.password || ''),
        phoneNumber: String(account.phone_number || '')
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
    if (isVaultLocked) {
      setIsVaultModalOpen(true);
      onClose();
      return;
    }

    if (isSyncing) {
      if (isStopping) return;
      setIsStopping(true);

      // Cancel client-side fetch 
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Stop all server-side scrapers
      try {
        setStopStatus(t('progress.stopSending'));
        const response = await fetch('/api/scrapers/stop', { method: 'POST' });
        const data = await response.json();
        if (data.success) {
          setStopStatus(t('progress.stopSuccess'));
          setTimeout(async () => {
            setIsSyncing(false);
            setSyncProgress(null);
            setSyncStartTime(null);
            setStopStatus(null);
            await fetchStatus();
          }, 2000);
        } else {
          setStopStatus(t('progress.stopPartialFail'));
          setTimeout(() => setStopStatus(null), 3000);
        }
      } catch (err) {
        logger.error('Failed to call stop_scrapers API', err);
        setStopStatus(t('progress.stopError'));
        setTimeout(() => setStopStatus(null), 3000);
      } finally {
        setIsStopping(false);
      }
      return;
    }

    // Optimistic UI update - set state immediately for instant feedback
    setIsSyncing(true);
    setIsInitializing(false);
    setSessionReport([]);
    setSessionSummary(null);
    setShowReport(false);
    setOtpRequired(false);
    setOtpCode('');
    setOtpSubmitting(false);
    setOtpError(null);
    setSyncStartTime(Date.now());
    setElapsedSeconds(0);
    setSyncQueue([]);
    setSyncProgress({ current: 0, total: 0, currentAccount: t('progress.initializing'), currentStep: t('progress.preparingToSync'), percent: 0, phase: 'initialization' });

    const runSync = async () => {
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch('/api/scrapers/sync-all-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ daysBack: status?.settings?.daysBack || 30 }),
          signal: abortControllerRef.current.signal
        });

        if (!response.ok) {
          // Reset state on error
          setIsSyncing(false);
          setSyncProgress(null);
          setSyncStartTime(null);
          throw new Error('Failed to start batch sync');
        }

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
              let eventData;
              try {
                eventData = JSON.parse(line.slice(6));
              } catch (e) {
                logger.error('Failed to parse SSE data', e as Error);
                continue;
              }

              switch (currentEvent) {
                case 'queue':
                  const initialQueue: QueueItem[] = eventData.accounts.map((acc: { id: number; nickname: string; vendor: string }) => ({
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
                    currentStep: t('progress.initializing'),
                    percent: 5,
                    phase: 'initialization'
                  }));
                  break;

                case 'progress':
                  if (eventData.step === 'otpRequired') {
                    setOtpRequired(true);
                    setOtpError(null);
                    setTimeout(() => otpInputRef.current?.focus(), 100);
                  } else if (eventData.step === 'otpSuccess') {
                    setOtpRequired(false);
                    setOtpSubmitting(false);
                    setOtpCode('');
                  } else if (eventData.step === 'otpFailed') {
                    setOtpSubmitting(false);
                    setOtpError(eventData.message || t('progress.verificationFailed'));
                    setOtpCode('');
                    setTimeout(() => otpInputRef.current?.focus(), 100);
                  }

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
                  // Preserve total batch summary if server sends one, or create from eventData
                  const batchSummary = eventData.summary || { durationSeconds: eventData.durationSeconds };
                  setSessionSummary(batchSummary);
                  setSyncProgress(null);
                  setSyncStartTime(null);
                  setShowReport(true);
                  await fetchStatus();
                  if (onSyncSuccess) onSyncSuccess();
                  return;

                case 'error':
                  if (eventData.type === 'VAULT_LOCKED') {
                    setIsVaultModalOpen(true);
                    onClose();
                    return;
                  }
                  throw new KnownSyncFailure(
                    eventData.type || 'UNKNOWN',
                    eventData.message || eventData.originalMessage || t('progress.syncFailed'),
                    eventData.originalMessage || null,
                  );
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (err instanceof KnownSyncFailure) {
          logger.warn(`Sync failed: ${err.message}`, { type: err.type, originalMessage: err.originalMessage });
          setSyncQueue(prev => prev.map(item =>
            item.status === 'active' ? { ...item, status: 'failed', error: err.message } : item
          ));
        } else {
          logger.error('Batch sync failed', err);
        }
        setIsSyncing(false);
        setSyncProgress(null);
        setSyncStartTime(null);
        setShowReport(true);
      }
    };

    runSync();
  };

  const handleOtpSubmit = async () => {
    if (!otpCode.trim()) return;

    setOtpSubmitting(true);
    setOtpError(null);

    try {
      const response = await fetch('/api/scrapers/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpCode: otpCode.trim() })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || t('progress.verificationFailed'));
      }
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : t('progress.verificationFailed'));
      setOtpSubmitting(false);
    }
  };

  const handleSyncSingle = async (accountId: number, initialNickname?: string, initialVendor?: string, overrideStartDate?: string, overrideShowBrowser?: boolean) => {
    if (isVaultLocked) {
      setIsVaultModalOpen(true);
      onClose();
      return;
    }

    if (isSyncing || isInitializing) return;

    // Optimistic UI update - set state immediately for instant feedback
    setIsSyncing(true);
    setIsInitializing(false);
    setSessionReport([]);
    setSessionSummary(null);
    setShowReport(false);
    setOtpRequired(false);
    setOtpCode('');
    setOtpSubmitting(false);
    setOtpError(null);
    const start = Date.now(); // local capture: syncStartTime state is stale in this closure
    setSyncStartTime(start);
    setElapsedSeconds(0);
    setSyncQueue([{
      id: accountId,
      accountName: initialNickname || t('progress.loadingPlaceholder'),
      vendor: initialVendor || t('progress.loadingPlaceholder'),
      status: 'active'
    }]);
    window.dispatchEvent(new CustomEvent('dataRefresh'));

    // Fetch account details 
    let account;
    try {
      const response = await fetch(`/api/credentials/${accountId}`);
      if (!response.ok) throw new Error('Failed to fetch account credentials');
      account = await response.json();
    } catch (err) {
      logger.error('Failed to fetch account credentials', err);
      showNotification(t('progress.fetchAccountFailed'), 'error');
      setIsSyncing(false);
      setSyncProgress(null);
      setSyncStartTime(null);
      return;
    }

    // Update queue with real data from fetch
    setSyncQueue([{
      id: account.id,
      accountName: account.nickname || account.vendor,
      vendor: account.vendor,
      status: 'active'
    }]);

    const runSingle = async () => {
      abortControllerRef.current = new AbortController();

      try {
        let computedStartDate: string;
        if (overrideStartDate) {
          computedStartDate = overrideStartDate;
        } else {
          const lastDate = await fetchLastTransactionDate(account.vendor);
          const startDate = lastDate ? new Date(lastDate) : new Date();
          const daysBack = status?.settings?.daysBack || 30;
          startDate.setDate(startDate.getDate() - daysBack);
          computedStartDate = formatISODate(startDate);
        }

        const credentials = prepareCredentials(account, account.vendor);
        const config = {
          options: {
            companyId: account.vendor,
            startDate: computedStartDate,
            combineInstallments: false,
            showBrowser: overrideShowBrowser !== undefined ? overrideShowBrowser : false,
            additionalTransactionInformation: true
          },
          credentials: credentials,
          credentialId: account.id
        };

        const syncResponse = await fetch('/api/scrapers/run-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
          signal: abortControllerRef.current.signal
        });

        if (!syncResponse.ok) {
          try {
            const errorData = await syncResponse.json();
            if (errorData.type === 'VAULT_LOCKED') {
              setIsVaultModalOpen(true);
              onClose();
              return;
            }
          } catch {
            // not json
          }
          throw new Error(`Failed to sync ${account.nickname || account.vendor}`);
        }

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
                let eventData;
                try {
                  eventData = JSON.parse(line.slice(6));
                } catch (e) {
                  logger.error('Failed to parse SSE data', e as Error);
                  continue;
                }

                if (currentEvent === 'progress') {
                  // Handle OTP events
                  if (eventData.step === 'otpRequired') {
                    setOtpRequired(true);
                    setOtpError(null);
                    setTimeout(() => otpInputRef.current?.focus(), 100);
                  } else if (eventData.step === 'otpSuccess') {
                    setOtpRequired(false);
                    setOtpSubmitting(false);
                    setOtpCode('');
                  } else if (eventData.step === 'otpFailed') {
                    setOtpSubmitting(false);
                    setOtpError(eventData.message || t('progress.verificationFailed'));
                    setOtpCode('');
                    setTimeout(() => otpInputRef.current?.focus(), 100);
                  }

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
                  if (eventData.type === 'VAULT_LOCKED') {
                    setIsVaultModalOpen(true);
                    onClose();
                    return;
                  }
                  throw new KnownSyncFailure(
                    eventData.type || 'UNKNOWN',
                    eventData.message || eventData.originalMessage || t('progress.syncFailed'),
                    eventData.originalMessage || null,
                  );
                } else if (currentEvent === 'complete') {
                  const finalSummary = eventData.summary || {};
                  const finalDuration = finalSummary.durationSeconds ?? Math.floor((Date.now() - start) / 1000);

                  setSessionSummary({
                    ...finalSummary,
                    durationSeconds: finalDuration
                  });

                  setSyncProgress({
                    current: 0,
                    total: 1,
                    currentAccount: account.nickname || account.vendor,
                    currentStep: t('progress.completedSuccessfully'),
                    percent: 100,
                    phase: 'complete',
                    success: true,
                    summary: {
                      ...finalSummary,
                      durationSeconds: finalDuration
                    }
                  });

                  if (eventData.summary && eventData.summary.processedTransactions) {
                    setSessionReport(prev => [...prev, ...eventData.summary.processedTransactions.map((t: ProcessedTransaction) => ({
                      ...t,
                      accountName: account.nickname || account.vendor,
                      source: t.source,
                      rule: t.rule,
                      oldCategory: t.oldCategory
                    }))]);
                  }

                  setSyncQueue(prev => prev.map(item =>
                    item.id === account.id ? { ...item, status: 'completed', summary: { ...finalSummary, durationSeconds: finalDuration } } : item
                  ));

                  if (onSyncSuccess) onSyncSuccess();
                  break;
                }
              }
            }
          }
        }

        await fetchStatus();
        setSyncProgress(null);
        setIsSyncing(false);
        setSyncStartTime(null);
        setShowReport(true);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setIsSyncing(false);
          setSyncProgress(null);
          return;
        }
        if (err instanceof KnownSyncFailure) {
          logger.warn(`Sync failed: ${err.message}`, { account: account.nickname || account.vendor, type: err.type, originalMessage: err.originalMessage });
        } else {
          logger.error('Failed to sync account', err, { account: account.nickname || account.vendor });
        }
        setSyncQueue(prev => prev.map(item =>
          item.id === account.id ? { ...item, status: 'failed', error: err instanceof Error ? err.message : String(err) } : item
        ));
        // Reset state on error
        setIsSyncing(false);
        setSyncProgress(null);
        setSyncStartTime(null);
        setShowReport(true);
      }
    };

    runSingle();
  };

  const handleStartSyncWithOptions = () => {
    if (!pendingSyncRequest) return;
    const { accountId, nickname, vendor } = pendingSyncRequest;
    setPendingSyncRequest(null);
    handleSyncSingle(accountId, nickname, vendor, syncOptionsStartDate, syncOptionsShowBrowser);
  };

  interface SyncEvent {
    id: number;
    triggered_by: string;
    vendor: string;
    status: string;
    message: string;
    created_at: string;
    duration_seconds?: number;
    retry_count?: number;
  }

  const handleHistoryClick = async (event: SyncEvent) => {
    // If it's a failed event, show error details modal instead of report
    if (event.status === 'failed') {
      setSelectedErrorEvent(event);
      return;
    }

    // setLoading(true); // Redundant now as status is managed by context
    try {
      const response = await fetch(`/api/scrape-events/${event.id}/report`);
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
      // setLoading(false);
    }
  };

  const getSyncHealthDisplay = () => {
    if (!status) return { icon: <CloudOffIcon />, label: t('health.connecting.label'), color: '#64748b', description: t('health.connecting.description') };

    switch (status.syncHealth) {
      case 'healthy':
        return {
          icon: <CloudDoneIcon sx={{ fontSize: 48 }} />,
          label: t('health.healthy.label'),
          color: '#22c55e',
          description: t('health.healthy.description')
        };
      case 'syncing':
        return {
          icon: <SyncIcon sx={{ fontSize: 48, animation: `${spin} 1.5s linear infinite` }} />,
          label: t('health.syncing.label'),
          color: '#60a5fa',
          description: t('health.syncing.description')
        };
      case 'error':
        return {
          icon: <ErrorIcon sx={{ fontSize: 48 }} />,
          label: t('health.error.label'),
          color: 'var(--n-error)',
          description: t('health.error.description')
        };
      case 'stale':
        return {
          icon: <WarningIcon sx={{ fontSize: 48 }} />,
          label: t('health.stale.label'),
          color: 'var(--n-warning)',
          description: t('health.stale.description')
        };
      case 'outdated':
        return {
          icon: <WarningIcon sx={{ fontSize: 48 }} />,
          label: t('health.outdated.label'),
          color: 'var(--n-warning)',
          description: t('health.outdated.description')
        };
      case 'never_synced':
        return {
          icon: <CloudOffIcon sx={{ fontSize: 48 }} />,
          label: t('health.neverSynced.label'),
          color: '#64748b',
          description: t('health.neverSynced.description')
        };
      case 'no_accounts':
        return {
          icon: <CloudOffIcon sx={{ fontSize: 48 }} />,
          label: t('health.noAccounts.label'),
          color: '#64748b',
          description: t('health.noAccounts.description')
        };
      default:
        if (status?.latestScrape?.created_at) {
          return {
            icon: <AccessTimeIcon sx={{ fontSize: 48 }} />,
            label: t('health.idle.label', { time: formatRelativeTime(status.latestScrape.created_at) }),
            color: '#64748b',
            description: t('health.idle.description')
          };
        }
        return {
          icon: <SyncIcon sx={{ fontSize: 48 }} />,
          label: t('health.unknown.label'),
          color: '#64748b',
          description: t('health.unknown.description')
        };
    }
  };

  const healthDisplay = getSyncHealthDisplay();

  return (
    <StyledDrawer
      anchor="right"
      open={open}
      onClose={onClose}
      variant={isMobile ? 'temporary' : 'persistent'}
      width={width}
      ModalProps={{
        keepMounted: true,
        hideBackdrop: !isMobile,
      }}
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
            {t('modal.title')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {status && status.activeAccounts > 0 && (
            <Tooltip title={isSyncing ? t('modal.tooltipStop') : isVaultLocked ? t('modal.tooltipUnlockToSync') : t('modal.tooltipSyncAll')}>
              <Button
                onClick={handleSyncAll}
                variant="contained"
                size="small"
                disabled={isStopping || isInitializing || isVaultLocked}
                color={isSyncing ? "error" : "success"}
                startIcon={
                  isStopping || isInitializing ? (
                    <CircularProgress size={16} sx={{ color: 'inherit' }} />
                  ) : isSyncing ? (
                    <CircularProgress size={16} sx={{ color: 'inherit' }} />
                  ) : isVaultLocked ? (
                    <LockIcon />
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
                {isStopping ? t('modal.stopping') : isInitializing ? t('modal.starting') : isSyncing ? t('modal.stopNow') : isVaultLocked ? t('modal.locked') : t('modal.syncNow')}
              </Button>
            </Tooltip>
          )}

          <Tooltip title={t('modal.close')}>
            <IconButton onClick={onClose} size="small" sx={{ ml: 1 }}>
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      {/* Content */}
      <Box sx={{ p: 2, overflowY: 'auto', flex: 1 }}>
        {pendingSyncRequest && !isSyncing && !showReport ? (
          <StatusCard sx={{
            background: `linear-gradient(135deg, rgba(96, 165, 250, 0.1) 0%, rgba(96, 165, 250, 0.05) 100%)`,
            borderColor: 'rgba(96, 165, 250, 0.4)'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                {getVendorIcon(pendingSyncRequest.vendor)}
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {pendingSyncRequest.nickname}
                  </Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.disabled }}>
                    {pendingSyncRequest.vendor}
                  </Typography>
                </Box>
              </Box>
              <IconButton size="small" onClick={() => setPendingSyncRequest(null)}>
                <CloseIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>

            <Box sx={{ mb: 2 }}>
              <NDatePicker
                value={syncOptionsStartDate}
                onChange={handleSyncDateChange}
                label={t('options.startDate')}
                error={syncOptionsDateError}
                loading={isLoadingStartDate}
                maxDate={new Date()}
              />
            </Box >

            <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600, display: 'block' }}>
                  {t('options.showBrowser')}
                </Typography>
                {pendingSyncRequest.vendor === 'hapoalim' && (
                  <Typography variant="caption" sx={{ color: 'var(--n-info)', fontSize: '10px' }}>
                    {t('options.showBrowserHapoalimHint')}
                  </Typography>
                )}
              </Box>
              <Switch
                checked={syncOptionsShowBrowser}
                onChange={(e) => setSyncOptionsShowBrowser(e.target.checked)}
                size="small"
              />
            </Box>

            <Button
              variant="contained"
              fullWidth
              onClick={handleStartSyncWithOptions}
              disabled={isLoadingStartDate || !syncOptionsStartDate || !!syncOptionsDateError || isVaultLocked}
              startIcon={isVaultLocked ? <LockIcon /> : <PlayArrowIcon />}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                background: isVaultLocked ? theme.palette.action.disabledBackground : '#22c55e',
                '&:hover': { background: isVaultLocked ? theme.palette.action.disabledBackground : '#16a34a' }
              }}
            >
              {isVaultLocked ? t('options.vaultLocked') : t('options.startSync')}
            </Button>
          </StatusCard >
        ) : showReport ? (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">{t('report.title')}</Typography>
              <Button size="small" onClick={() => setShowReport(false)} sx={{ color: '#aaa' }}>
                {t('report.closeReport')}
              </Button>
            </Box>

            {sessionReport.length === 0 ? (
              <Typography variant="body2" sx={{ color: '#aaa', fontStyle: 'italic', textAlign: 'center', py: 4 }}>
                {t('report.noNew')}
              </Typography>
            ) : (
              <ScrapeReport report={sessionReport as ScrapeReportTransaction[]} summary={sessionSummary || undefined} />
            )}

            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
              <Button variant="outlined" onClick={() => setShowReport(false)}>
                {t('report.backToStatus')}
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
                    {isStopping ? t('progress.stoppingSync') : t('progress.syncProgress')}
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
                      {t('progress.initializingSession')}
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
                          <ErrorIcon sx={{ fontSize: 18, color: 'var(--n-error)' }} />
                        ) : isActive ? (
                          <SyncIcon sx={{ fontSize: 18, color: '#60a5fa', animation: `${spin} 2s linear infinite` }} />
                        ) : (
                          <Box sx={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)' }} />
                        )}

                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body2" sx={{ fontWeight: isActive ? 600 : 500, color: isActive ? '#60a5fa' : isCompleted ? '#22c55e' : isFailed ? 'var(--n-error)' : 'text.secondary' }}>
                              {item.accountName}
                            </Typography>
                            {isCompleted && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {item.summary && (
                                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                                    {item.summary.savedTransactions !== undefined && item.summary.savedTransactions > 0 && (
                                      <Typography variant="caption" sx={{ color: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)', px: 0.5, borderRadius: '4px' }}>
                                        {t('progress.newCount', { count: item.summary.savedTransactions })}
                                      </Typography>
                                    )}
                                  </Box>
                                )}
                                <Typography variant="caption" sx={{ color: '#22c55e', fontWeight: 600 }}>
                                  {t('progress.done')}
                                </Typography>
                              </Box>
                            )}
                          </Box>

                          {isActive && (
                            <Box sx={{ mt: 1 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                  {syncProgress?.currentStep || t('progress.syncing')}
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

                              {otpRequired && (
                                <Box sx={{
                                  mt: 1.5,
                                  p: 1.5,
                                  borderRadius: 1,
                                  backgroundColor: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
                                  border: '1px solid rgba(59, 130, 246, 0.3)'
                                }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                    <LockIcon sx={{ fontSize: 16, color: 'var(--n-info)' }} />
                                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'var(--n-info)' }}>
                                      {t('progress.twoFactorRequired')}
                                    </Typography>
                                  </Box>
                                  <Box sx={{ display: 'flex', gap: 1 }}>
                                    <input
                                      ref={otpInputRef}
                                      value={otpCode}
                                      onChange={(e) => {
                                        setOtpCode(e.target.value.replace(/\D/g, ''));
                                        setOtpError(null);
                                      }}
                                      onKeyDown={(e) => e.key === 'Enter' && otpCode && handleOtpSubmit()}
                                      placeholder={t('progress.enterCode')}
                                      disabled={otpSubmitting}
                                      maxLength={8}
                                      style={{
                                        flex: 1,
                                        background: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : '#fff',
                                        border: otpError ? '1px solid #ef4444' : '1px solid rgba(59, 130, 246, 0.3)',
                                        borderRadius: '4px',
                                        padding: '4px 8px',
                                        color: theme.palette.text.primary,
                                        fontSize: '0.875rem',
                                        textAlign: 'center',
                                        letterSpacing: '0.1em',
                                        outline: 'none'
                                      }}
                                    />
                                    <Button
                                      size="small"
                                      variant="contained"
                                      onClick={handleOtpSubmit}
                                      disabled={!otpCode || otpSubmitting}
                                      sx={{
                                        minWidth: 32,
                                        p: 0,
                                        background: 'var(--n-info)',
                                        '&:hover': { background: '#2563eb' }
                                      }}
                                    >
                                      {otpSubmitting ? <CircularProgress size={14} color="inherit" /> : <SendIcon sx={{ fontSize: 14 }} />}
                                    </Button>
                                  </Box>
                                  {otpError && (
                                    <Typography variant="caption" sx={{ color: 'var(--n-error)', mt: 0.5, display: 'block' }}>
                                      {otpError}
                                    </Typography>
                                  )}
                                </Box>
                              )}

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
                                    {t('progress.viewBrowserScreenshot')}
                                  </Button>
                                </Box>
                              )}
                            </Box>
                          )}

                          {isFailed && item.error && (
                            <Typography variant="caption" sx={{ color: 'var(--n-error)', display: 'block', mt: 0.5, fontSize: '10px' }}>
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
                      {stopStatus || t('progress.terminatingProcesses')}
                    </Typography>
                  </Box>
                )}
              </Box>
            )}

            {/* Main Status Display - Hidden when syncing, initializing, or idle (unknown health with a latestScrape) */}
            {!isSyncing && !isInitializing && !(
              status && !['healthy', 'syncing', 'error', 'stale', 'outdated', 'never_synced', 'no_accounts'].includes(status.syncHealth) && !!status.latestScrape?.created_at
            ) && (
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
                      {t('health.lastActivity', { time: formatRelativeTime(status.latestScrape.created_at) })}
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
                  {t('stats.accounts')}
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
                  {t('stats.days')}
                </Typography>
              </Box>
            </Box>

            {/* Account Sync Status */}
            {status?.accountSyncStatus && status.accountSyncStatus.length > 0 && (
              <StatusCard>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <AccountBalanceIcon sx={{ color: '#60a5fa', fontSize: 20 }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {t('accountStatus.title')}
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
                          <Tooltip title={isVaultLocked ? t('accountStatus.tooltipUnlockToSync') : t('accountStatus.tooltipSyncOne')}>
                            <IconButton
                              size="small"
                              onClick={() => prepareSyncOptionsForAccount(account.id, account.vendor, account.nickname || account.vendor)}
                              disabled={isSyncing || isInitializing || isStopping || isVaultLocked}
                              sx={{
                                color: isVaultLocked ? theme.palette.text.disabled : '#60a5fa',
                                p: 0.5,
                                '&:hover': { backgroundColor: isVaultLocked ? 'transparent' : 'rgba(96, 165, 250, 0.1)' }
                              }}
                            >
                              {isVaultLocked ? <LockIcon sx={{ fontSize: 18 }} /> : <RefreshIcon sx={{ fontSize: 18 }} />}
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
                    {t('history.title')}
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
        slotProps={{
          paper: {
            sx: {
              background: 'transparent',
              boxShadow: 'none'
            }
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
      {/* Error Details Modal */}
      <Dialog
        open={!!selectedErrorEvent}
        onClose={() => setSelectedErrorEvent(null)}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              background: theme.palette.mode === 'dark'
                ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)'
                : 'rgba(255, 255, 255, 0.98)',
              backdropFilter: 'blur(20px)',
              borderRadius: '12px',
              border: '1px solid rgba(239, 68, 68, 0.3)'
            }
          }
        }}
      >
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <ErrorIcon sx={{ color: 'var(--n-error)', fontSize: 28 }} />
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--n-error)' }}>
                {t('errorDetails.title')}
              </Typography>
            </Box>
            <IconButton onClick={() => setSelectedErrorEvent(null)} size="small">
              <CloseIcon />
            </IconButton>
          </Box>

          {selectedErrorEvent && (
            <>
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ color: theme.palette.text.disabled, display: 'block', mb: 0.5 }}>
                  {t('errorDetails.vendor')}
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  {selectedErrorEvent.vendor}
                </Typography>
              </Box>

              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ color: theme.palette.text.disabled, display: 'block', mb: 0.5 }}>
                  {t('errorDetails.errorMessage')}
                </Typography>
                <Box sx={{
                  p: 2,
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)'
                }}>
                  <Typography variant="body2" sx={{ color: theme.palette.text.primary, wordBreak: 'break-word' }}>
                    {selectedErrorEvent.message}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" sx={{ color: theme.palette.text.disabled, display: 'block', mb: 0.5 }}>
                    {t('errorDetails.retryAttempts')}
                  </Typography>
                  <Box sx={{
                    p: 1.5,
                    borderRadius: '8px',
                    backgroundColor: 'rgba(96, 165, 250, 0.1)',
                    border: '1px solid rgba(96, 165, 250, 0.2)',
                    textAlign: 'center'
                  }}>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: '#60a5fa' }}>
                      {selectedErrorEvent.retry_count !== undefined ? selectedErrorEvent.retry_count + 1 : 1}
                    </Typography>
                  </Box>
                </Box>

                {selectedErrorEvent.duration_seconds && (
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" sx={{ color: theme.palette.text.disabled, display: 'block', mb: 0.5 }}>
                      {t('errorDetails.duration')}
                    </Typography>
                    <Box sx={{
                      p: 1.5,
                      borderRadius: '8px',
                      backgroundColor: 'rgba(167, 139, 250, 0.1)',
                      border: '1px solid rgba(167, 139, 250, 0.2)',
                      textAlign: 'center'
                    }}>
                      <Typography variant="h5" sx={{ fontWeight: 700, color: '#a78bfa' }}>
                        {formatTime(Math.round(selectedErrorEvent.duration_seconds))}
                      </Typography>
                    </Box>
                  </Box>
                )}
              </Box>


              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ color: theme.palette.text.disabled, display: 'block', mb: 0.5 }}>
                  {t('errorDetails.timestamp')}
                </Typography>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  {formatDateTime(selectedErrorEvent.created_at)}
                </Typography>
              </Box>

              <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button
                  variant="outlined"
                  onClick={() => setSelectedErrorEvent(null)}
                  sx={{
                    borderColor: 'rgba(148, 163, 184, 0.3)',
                    color: theme.palette.text.secondary
                  }}
                >
                  {t('modal.close')}
                </Button>
              </Box>
            </>
          )}
        </Box>
      </Dialog>
    </StyledDrawer>
  );
};

export default SyncStatusModal;
