import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '../utils/client-logger';
import { Box, Tooltip, Typography, Chip } from '@mui/material';
import { styled, keyframes } from '@mui/material/styles';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import SyncIcon from '@mui/icons-material/Sync';
import SyncDisabledIcon from '@mui/icons-material/SyncDisabled';
import CloudOffIcon from '@mui/icons-material/CloudOff';

interface SyncStatus {
  syncHealth: string;
  settings: {
    enabled: boolean;
    syncHour: number;
    daysBack: number;
  };
  activeAccounts: number;
  latestScrape: {
    triggered_by: string;
    vendor: string;
    status: string;
    created_at: string;
  } | null;
}

const spin = keyframes`
  0% { transform: rotate(0deg); }
  50% { transform: rotate(180deg); }
  100% { transform: rotate(360deg); }
`;

const pulse = keyframes`
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
`;

const StatusContainer = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 10px',
  borderRadius: '8px',
  cursor: 'pointer',
  transition: 'all 0.2s ease-in-out',
  '&:hover': {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
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
    logger.warn(`Invalid date string: ${dateStr}`);
    return new Date();
  }

  return date;
};

const formatRelativeTime = (dateStr: string) => {
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
    if (absDiffMins < 1) return 'just now';
    if (absDiffMins < 60) return `in ${absDiffMins}m`;
    return 'just now'; // If it's very close, just say "just now"
  }

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

interface SyncStatusIndicatorProps {
  onClick?: () => void;
}

const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ onClick }) => {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/sync_status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      logger.error('Failed to fetch sync status', error as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Refresh status every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Also refresh when a data refresh event is dispatched
  useEffect(() => {
    const handleRefresh = () => fetchStatus();
    window.addEventListener('dataRefresh', handleRefresh);
    return () => window.removeEventListener('dataRefresh', handleRefresh);
  }, [fetchStatus]);

  if (loading) {
    return null;
  }

  const getStatusInfo = () => {
    if (!status) {
      return {
        icon: <CloudOffIcon sx={{ fontSize: 18, color: '#64748b' }} />,
        label: 'Connecting...',
        color: '#64748b',
        tooltip: 'Fetching sync status...'
      };
    }

    const health = status.syncHealth;
    const lastSync = status.latestScrape?.created_at
      ? formatRelativeTime(status.latestScrape.created_at)
      : 'Never';

    switch (health) {
      case 'healthy':
        return {
          icon: <CheckCircleIcon sx={{ fontSize: 18, color: '#22c55e' }} />,
          label: 'Synced',
          color: '#22c55e',
          tooltip: `Last sync: ${lastSync}`
        };
      case 'syncing':
        return {
          icon: <SyncIcon sx={{ fontSize: 18, color: '#60a5fa', animation: `${spin} 1.5s linear infinite` }} />,
          label: 'Syncing',
          color: '#60a5fa',
          tooltip: 'Sync in progress...'
        };
      case 'error':
        return {
          icon: <ErrorIcon sx={{ fontSize: 18, color: '#ef4444', animation: `${pulse} 2s ease-in-out infinite` }} />,
          label: 'Error',
          color: '#ef4444',
          tooltip: 'Last sync failed'
        };
      case 'stale':
        return {
          icon: <WarningIcon sx={{ fontSize: 18, color: '#f59e0b' }} />,
          label: 'Stale',
          color: '#f59e0b',
          tooltip: `Last sync: ${lastSync}`
        };
      case 'outdated':
        return {
          icon: <WarningIcon sx={{ fontSize: 18, color: '#f59e0b', animation: `${pulse} 2s ease-in-out infinite` }} />,
          label: 'Outdated',
          color: '#f59e0b',
          tooltip: `Last sync: ${lastSync} - consider syncing`
        };
      case 'never_synced':
        return {
          icon: <SyncDisabledIcon sx={{ fontSize: 18, color: '#64748b' }} />,
          label: 'Never synced',
          color: '#64748b',
          tooltip: 'No sync history'
        };
      case 'no_accounts':
        return {
          icon: <SyncDisabledIcon sx={{ fontSize: 18, color: '#64748b' }} />,
          label: 'No accounts',
          color: '#64748b',
          tooltip: 'Add accounts to start syncing'
        };
      default:
        return {
          icon: <SyncIcon sx={{ fontSize: 18, color: '#64748b' }} />,
          label: 'Sync Status',
          color: '#64748b',
          tooltip: 'Status unavailable'
        };
    }
  };

  const statusInfo = getStatusInfo();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onClick) {
      onClick();
    }
  };

  return (
    <Tooltip
      title={
        <Box sx={{ p: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Sync Status: {statusInfo.label}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
            {statusInfo.tooltip}
          </Typography>
          {status && (
            <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.5)', mt: 0.5 }}>
              {status.activeAccounts} active account{status.activeAccounts !== 1 ? 's' : ''}
            </Typography>
          )}
        </Box>
      }
      arrow
    >
      <StatusContainer onClick={handleClick} role="button" tabIndex={0}>
        {statusInfo.icon}
        <Typography
          variant="caption"
          sx={{
            color: statusInfo.color,
            fontWeight: 500,
            display: { xs: 'none', sm: 'block' }
          }}
        >
          {statusInfo.label}
        </Typography>
      </StatusContainer>
    </Tooltip>
  );
};

export default SyncStatusIndicator;
