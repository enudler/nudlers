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
import CloseIcon from '@mui/icons-material/Close';
import SyncIcon from '@mui/icons-material/Sync';

import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import HistoryIcon from '@mui/icons-material/History';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { BEINLEUMI_GROUP_VENDORS, BANK_VENDORS } from '../utils/constants';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ScrapeReport from './ScrapeReport';

interface SyncStatusModalProps {
  open: boolean;
  onClose: () => void;
  width: number;
  onWidthChange: (width: number) => void;
}

interface SyncStatus {
  syncHealth: string;
  settings: {
    enabled: boolean;
    intervalHours: number;
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
  } | null;
  history: Array<{
    id: number;
    triggered_by: string;
    vendor: string;
    status: string;
    message: string;
    created_at: string;
  }>;
  accountSyncStatus: Array<{
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

const SyncStatusModal: React.FC<SyncStatusModalProps> = ({ open, onClose, width, onWidthChange }) => {
  const theme = useTheme();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
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
  } | null>(null);

  interface ProcessedTransaction {
    name: string;
    amount: number;
    category: string;
    date: string;
    accountName?: string;
  }

  const [sessionReport, setSessionReport] = useState<ProcessedTransaction[]>([]);
  const [showReport, setShowReport] = useState(false);
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



  // Reset report when opening
  // Fetch status when opening
  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchStatus();
    }
  }, [open, fetchStatus]);

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
    if (vendor === 'visaCal' || vendor === 'max') {
      return {
        username: String(account.username || ''),
        password: String(account.password || '')
      };
    } else if (BEINLEUMI_GROUP_VENDORS.includes(vendor)) {
      const bankUsername = account.username || account.id || account.id_number || '';
      return {
        username: String(bankUsername),
        password: String(account.password || '')
      };
    } else if (vendor === 'hapoalim') {
      const userCode = account.username || account.id || account.id_number || '';
      return {
        userCode: String(userCode),
        password: String(account.password || '')
      };
    } else if (BANK_VENDORS.includes(vendor)) {
      const bankId = account.username || account.id || account.id_number || '';
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
      // Cancel sync if already running
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setIsSyncing(false);
      setSyncProgress(null);
      return;
    }

    setIsSyncing(true);
    setSyncProgress({ current: 0, total: 0, currentAccount: null });

    try {
      // Fetch all active accounts
      const response = await fetch('/api/sync_all', {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch accounts');
      }

      const data = await response.json();
      const accounts = data.accounts || [];

      if (accounts.length === 0) {
        setSyncProgress(null);
        setIsSyncing(false);
        return;
      }

      setSyncProgress({ current: 0, total: accounts.length, currentAccount: null });

      // Sync each account sequentially
      for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        setSyncProgress({
          current: i,
          total: accounts.length,
          currentAccount: account.nickname || account.vendor
        });

        // Create abort controller for this sync
        abortControllerRef.current = new AbortController();

        try {
          // Get last transaction date to determine start date
          const lastDate = await fetchLastTransactionDate(account.vendor);
          const startDate = lastDate ? new Date(lastDate) : new Date();
          // Go back configured days or default to 30
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

          // Trigger sync using scrape_stream API
          const syncResponse = await fetch('/api/scrape_stream', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(config),
            signal: abortControllerRef.current.signal
          });

          if (!syncResponse.ok) {
            throw new Error(`Failed to sync ${account.nickname || account.vendor}`);
          }

          // Read SSE stream to completion with detailed progress
          const reader = syncResponse.body?.getReader();
          const decoder = new TextDecoder();

          if (reader) {
            let buffer = '';
            let currentStep = '';
            let lastProgress = null;

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
                    currentStep = eventData.message || '';
                    lastProgress = eventData;
                    // Update sync progress with detailed step info
                    setSyncProgress({
                      current: i,
                      total: accounts.length,
                      currentAccount: account.nickname || account.vendor,
                      currentStep: currentStep,
                      percent: eventData.percent || 0,
                      phase: eventData.phase || '',
                      success: eventData.success
                    });
                  } else if (currentEvent === 'error') {
                    throw new Error(eventData.message || 'Sync failed');
                  } else if (currentEvent === 'complete') {
                    // Account synced successfully
                    setSyncProgress({
                      current: i,
                      total: accounts.length,
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
                        accountName: account.nickname || account.vendor
                      }))]);
                    }
                    break;
                  }
                }
              }
            }
          }

          // Update progress after account completes
          setSyncProgress({
            current: i + 1,
            total: accounts.length,
            currentAccount: null,
            currentStep: null,
            percent: 0,
            phase: '',
            success: null
          });
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            // User cancelled
            setIsSyncing(false);
            setSyncProgress(null);
            return;
          }
          logger.error('Failed to sync account', err, {
            account: account.nickname || account.vendor
          });
          // Continue with next account even if one fails
        }
      }

      // Refresh status after all syncs complete
      await fetchStatus();
      setSyncProgress(null);
      setIsSyncing(false);
      setShowReport(true);
    } catch (err) {
      logger.error('Sync all failed', err);
      setSyncProgress(null);
      setIsSyncing(false);
      // Even on error, show what we got
      setShowReport(true);
    }
  };

  interface SyncEvent {
    id: number;
    triggered_by: string;
    vendor: string;
    status: string;
    message: string;
    created_at: string;
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
            <Tooltip title={isSyncing ? "Cancel sync" : "Sync all accounts now"}>
              <Button
                onClick={handleSyncAll}
                variant="contained"
                size="small"
                startIcon={isSyncing ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : <PlayArrowIcon />}
                sx={{
                  backgroundColor: isSyncing ? '#ef4444' : '#22c55e',
                  color: '#fff',
                  '&:hover': {
                    backgroundColor: isSyncing ? '#dc2626' : '#16a34a',
                  },
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  px: 1.5,
                  py: 0.5
                }}
              >
                {isSyncing ? 'Cancel' : 'Sync Now'}
              </Button>
            </Tooltip>
          )}

          <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }} disabled={isSyncing}>
            <CloseIcon fontSize="small" />
          </IconButton>
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
              <ScrapeReport report={sessionReport} />
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
            {isSyncing && syncProgress && (
              <StatusCard sx={{
                background: 'linear-gradient(135deg, rgba(96, 165, 250, 0.1) 0%, rgba(96, 165, 250, 0.05) 100%)',
                borderColor: 'rgba(96, 165, 250, 0.4)'
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                  {syncProgress.success === true ? (
                    <Box sx={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#fff' }} />
                    </Box>
                  ) : syncProgress.success === false ? (
                    <ErrorIcon sx={{ fontSize: 24, color: '#ef4444' }} />
                  ) : (
                    <SyncIcon sx={{ fontSize: 24, color: '#60a5fa', animation: `${spin} 1.5s linear infinite` }} />
                  )}
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#60a5fa' }}>
                      Syncing accounts... ({Math.min(syncProgress.current + 1, syncProgress.total)} / {syncProgress.total})
                    </Typography>
                    {syncProgress.currentAccount && (
                      <>
                        <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500, mt: 0.5 }}>
                          {syncProgress.currentAccount}
                        </Typography>
                        {syncProgress.currentStep && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                            {syncProgress.success === null && (
                              <CircularProgress size={12} sx={{ color: '#60a5fa' }} />
                            )}
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              {syncProgress.currentStep}
                            </Typography>
                            {syncProgress.percent !== undefined && (
                              <Typography variant="caption" sx={{ color: theme.palette.text.disabled, ml: 'auto' }}>
                                {syncProgress.percent}%
                              </Typography>
                            )}
                          </Box>
                        )}
                        {syncProgress.phase && (
                          <Typography variant="caption" sx={{ color: theme.palette.text.disabled, display: 'block', mt: 0.5, textTransform: 'capitalize' }}>
                            {syncProgress.phase.replace('_', ' ')}
                          </Typography>
                        )}
                      </>
                    )}
                  </Box>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={syncProgress.percent !== undefined ? syncProgress.percent : (syncProgress.current / syncProgress.total) * 100}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: 'rgba(96, 165, 250, 0.2)',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: syncProgress.success === false ? '#ef4444' : syncProgress.success === true ? '#22c55e' : '#60a5fa'
                    }
                  }}
                />
                {syncProgress.summary && (
                  <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${theme.palette.divider}` }}>
                    <Typography variant="caption" sx={{ color: theme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                      Summary:
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {syncProgress.summary.savedTransactions !== undefined && (
                        <Chip label={`${syncProgress.summary.savedTransactions} saved`} size="small" sx={{ backgroundColor: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', height: 20, fontSize: '0.7rem' }} />
                      )}
                      {syncProgress.summary.duplicateTransactions !== undefined && syncProgress.summary.duplicateTransactions > 0 && (
                        <Chip label={`${syncProgress.summary.duplicateTransactions} duplicates`} size="small" sx={{ backgroundColor: 'rgba(148, 163, 184, 0.2)', color: '#94a3b8', height: 20, fontSize: '0.7rem' }} />
                      )}
                      {syncProgress.summary.transactions !== undefined && (
                        <Chip label={`${syncProgress.summary.transactions} total`} size="small" sx={{ backgroundColor: 'rgba(96, 165, 250, 0.2)', color: '#60a5fa', height: 20, fontSize: '0.7rem' }} />
                      )}
                    </Box>
                  </Box>
                )}
              </StatusCard>
            )}

            {/* Main Status Display - Hidden when syncing */}
            {!isSyncing && (
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
                  <Typography variant="caption" sx={{ color: theme.palette.text.disabled, display: 'block' }}>
                    Last activity: {formatRelativeTime(status.latestScrape.created_at)}
                  </Typography>
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
                backgroundColor: 'rgba(96, 165, 250, 0.1)',
                border: '1px solid rgba(96, 165, 250, 0.2)',
                textAlign: 'center'
              }}>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#60a5fa' }}>
                  {status?.history.filter(h => h.status === 'completed').length || 0}
                </Typography>
                <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontSize: '10px' }}>
                  Syncs
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
                        <ListItemSecondaryAction>
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
                      <Typography variant="caption" sx={{ color: theme.palette.text.disabled, flexShrink: 0 }}>
                        {formatRelativeTime(event.created_at)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </StatusCard>
            )}
          </>
        )}
      </Box>
    </StyledDrawer>
  );
};

export default SyncStatusModal;
