import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Popover from '@mui/material/Popover';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import { styled, keyframes } from '@mui/material/styles';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import SyncIcon from '@mui/icons-material/Sync';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import DateRangeIcon from '@mui/icons-material/DateRange';
import Collapse from '@mui/material/Collapse';
import Chip from '@mui/material/Chip';
import { useNotification } from './NotificationContext';

interface CardInfo {
  last4: string;
  accountNumber: string;
  transactionCount: number;
}

interface AccountResult {
  vendor: string;
  nickname: string;
  status: 'success' | 'failed';
  transactionCount?: number;
  cardsCount?: number;
  cards?: CardInfo[];
  error?: string;
}

interface DateRange {
  startDate: string;
  endDate: string;
}

interface SyncDetails {
  results?: AccountResult[];
  errors?: AccountResult[];
  dateRange?: DateRange;
}

interface SyncRun {
  id: number;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  total_accounts: number;
  successful_accounts: number;
  failed_accounts: number;
  total_transactions: number;
  triggered_by: string;
  details?: SyncDetails;
}

interface SyncConfig {
  isEnabled: boolean;
  scheduleHours: number[];
  daysToSync: number;
}

interface SyncStatus {
  latestRun: SyncRun | null;
  history: SyncRun[];
  config: SyncConfig;
  nextScheduledRun: string | null;
  nextSyncDateRange?: DateRange;
  activeAccounts: number;
}

const pulse = keyframes`
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
`;

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const StatusContainer = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 12px',
  borderRadius: '12px',
  cursor: 'pointer',
  transition: 'all 0.2s ease-in-out',
  '&:hover': {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
});

const StatusDot = styled(Box)<{ status: string }>(({ status }) => {
  let color = '#64748b';
  let animate = false;
  
  switch (status) {
    case 'success':
      color = '#22c55e';
      break;
    case 'partial':
      color = '#f59e0b';
      break;
    case 'failed':
      color = '#ef4444';
      break;
    case 'running':
      color = '#3b82f6';
      animate = true;
      break;
    default:
      color = '#64748b';
  }
  
  return {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: color,
    boxShadow: `0 0 8px ${color}`,
    animation: animate ? `${pulse} 1.5s ease-in-out infinite` : 'none',
  };
});

const PopoverContent = styled(Box)({
  padding: '16px',
  minWidth: '360px',
  maxWidth: '440px',
});

const HistoryItem = styled(Box)<{ status: string }>(({ status }) => {
  let borderColor = '#e2e8f0';
  switch (status) {
    case 'success':
      borderColor = '#22c55e';
      break;
    case 'partial':
      borderColor = '#f59e0b';
      break;
    case 'failed':
      borderColor = '#ef4444';
      break;
    case 'running':
      borderColor = '#3b82f6';
      break;
  }
  
  return {
    padding: '10px 12px',
    borderLeft: `3px solid ${borderColor}`,
    backgroundColor: 'rgba(248, 250, 252, 0.5)',
    borderRadius: '0 8px 8px 0',
    marginBottom: '8px',
    '&:last-child': {
      marginBottom: 0,
    },
  };
});

const ActionButton = styled(Button)({
  textTransform: 'none',
  borderRadius: '8px',
  fontWeight: 500,
});

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatLocalTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString(undefined, { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
}

function formatLocalDateTime(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const isToday = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();
  
  const timeStr = date.toLocaleTimeString(undefined, { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
  
  if (isToday) {
    return `Today at ${timeStr}`;
  } else if (isYesterday) {
    return `Yesterday at ${timeStr}`;
  }
  
  return date.toLocaleString(undefined, { 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false
  });
}

function formatNextRunTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const isToday = date.toDateString() === today.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  
  const timeStr = date.toLocaleTimeString(undefined, { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
  
  // Calculate time until next run
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  
  let relativeStr = '';
  if (diffMins > 0 && diffMins < 60) {
    relativeStr = ` (in ${diffMins}m)`;
  } else if (diffHours > 0 && diffHours < 24) {
    relativeStr = ` (in ${diffHours}h)`;
  }
  
  if (isToday) {
    return `Today at ${timeStr}${relativeStr}`;
  } else if (isTomorrow) {
    return `Tomorrow at ${timeStr}`;
  }
  
  return date.toLocaleString(undefined, { 
    weekday: 'short',
    month: 'short', 
    day: 'numeric',
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false
  });
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const formatDate = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    
    return date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric'
    });
  };
  
  return `${formatDate(start)} → ${formatDate(end)}`;
}

function formatDateOnly(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric'
  });
}


const StatusIcon: React.FC<{ status: string; size?: number }> = ({ status, size = 16 }) => {
  switch (status) {
    case 'success':
      return <CheckCircleIcon sx={{ color: '#22c55e', fontSize: size }} />;
    case 'partial':
      return <WarningIcon sx={{ color: '#f59e0b', fontSize: size }} />;
    case 'failed':
      return <ErrorIcon sx={{ color: '#ef4444', fontSize: size }} />;
    case 'running':
      return <SyncIcon sx={{ color: '#3b82f6', fontSize: size, animation: `${spin} 1s linear infinite` }} />;
    default:
      return <ScheduleIcon sx={{ color: '#64748b', fontSize: size }} />;
  }
};

// Vendor display names and icons
const VENDOR_INFO: Record<string, { name: string; isBank: boolean }> = {
  hapoalim: { name: 'Bank Hapoalim', isBank: true },
  leumi: { name: 'Bank Leumi', isBank: true },
  discount: { name: 'Discount Bank', isBank: true },
  mizrahi: { name: 'Mizrahi Bank', isBank: true },
  beinleumi: { name: 'First International', isBank: true },
  massad: { name: 'Bank Massad', isBank: true },
  isracard: { name: 'Isracard', isBank: false },
  amex: { name: 'American Express', isBank: false },
  max: { name: 'Max', isBank: false },
  visaCal: { name: 'Visa Cal', isBank: false },
  leumiCard: { name: 'Leumi Card', isBank: false },
  beyahadBishvilha: { name: 'Beyahad Bishvilha', isBank: false },
};

const getVendorDisplayName = (vendor: string): string => {
  return VENDOR_INFO[vendor]?.name || vendor;
};

const isVendorBank = (vendor: string): boolean => {
  return VENDOR_INFO[vendor]?.isBank || false;
};

export default function SyncStatusIndicator() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const { showNotification } = useNotification();

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/scheduled_sync_status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch sync status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    
    // Refresh status every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleTriggerSync = async () => {
    setTriggering(true);
    try {
      const response = await fetch('/api/scheduled_sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual: true }),
      });
      
      if (response.ok) {
        showNotification('Sync started! This may take several minutes.', 'success');
        fetchStatus();
      } else {
        const data = await response.json();
        showNotification(data.message || 'Failed to start sync', 'error');
      }
    } catch (error) {
      showNotification('Failed to trigger sync', 'error');
    } finally {
      setTriggering(false);
      handleClose();
    }
  };

  const open = Boolean(anchorEl);
  const latestRun = status?.latestRun;
  const isRunning = latestRun?.status === 'running';

  if (loading) {
    return (
      <StatusContainer>
        <CircularProgress size={14} sx={{ color: 'rgba(255, 255, 255, 0.7)' }} />
      </StatusContainer>
    );
  }

  const getStatusLabel = () => {
    if (!latestRun) return 'No sync yet';
    if (isRunning) return 'Syncing...';
    return formatRelativeTime(latestRun.completed_at || latestRun.started_at);
  };

  const getTooltipText = () => {
    if (!latestRun) return 'No automatic sync has run yet';
    if (isRunning) return 'Automatic sync is in progress';
    
    const timeStr = formatLocalDateTime(latestRun.completed_at || latestRun.started_at);
    const statusStr = latestRun.status === 'success' ? 'successful' : 
                      latestRun.status === 'partial' ? 'partially successful' : 'failed';
    return `Last sync was ${statusStr} at ${timeStr}`;
  };

  return (
    <>
      <Tooltip title={getTooltipText()} arrow>
        <StatusContainer onClick={handleClick}>
          <StatusDot status={latestRun?.status || 'unknown'} />
          <Typography
            variant="caption"
            sx={{
              color: 'rgba(255, 255, 255, 0.8)',
              fontSize: '0.75rem',
              fontWeight: 500,
              display: { xs: 'none', md: 'block' },
            }}
          >
            {getStatusLabel()}
          </Typography>
        </StatusContainer>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: {
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
            mt: 1,
          },
        }}
      >
        <PopoverContent>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#1e293b' }}>
              Automatic Sync Status
            </Typography>
            {status?.config.isEnabled && (
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 0.5,
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                padding: '4px 8px',
                borderRadius: '6px',
              }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#22c55e' }} />
                <Typography variant="caption" sx={{ color: '#166534', fontWeight: 500 }}>
                  Enabled
                </Typography>
              </Box>
            )}
          </Box>

          {/* Current Status */}
          {latestRun && (
            <Box sx={{ 
              p: 2, 
              backgroundColor: 'rgba(248, 250, 252, 0.8)',
              borderRadius: '12px',
              mb: 2,
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <StatusIcon status={latestRun.status} size={20} />
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b' }}>
                  {isRunning ? 'Sync in Progress' : 
                   latestRun.status === 'success' ? 'Last Sync Successful' :
                   latestRun.status === 'partial' ? 'Last Sync Partial' : 'Last Sync Failed'}
                </Typography>
              </Box>
              
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mt: 1 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    {isRunning ? 'Started' : 'Completed'}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: '#1e293b' }}>
                    {formatLocalDateTime(latestRun.completed_at || latestRun.started_at)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>Transactions</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: '#1e293b' }}>
                    {latestRun.total_transactions.toLocaleString()}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>Accounts</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: '#1e293b' }}>
                    {latestRun.successful_accounts}/{latestRun.total_accounts} synced
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>Triggered By</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: '#1e293b', textTransform: 'capitalize' }}>
                    {latestRun.triggered_by}
                  </Typography>
                </Box>
              </Box>

              {/* Date Range Synced */}
              {latestRun.details?.dateRange && (
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 1,
                  mt: 1.5,
                  p: 1,
                  backgroundColor: 'rgba(99, 102, 241, 0.05)',
                  borderRadius: '8px',
                }}>
                  <DateRangeIcon sx={{ color: '#6366f1', fontSize: 16 }} />
                  <Typography variant="caption" sx={{ color: '#4f46e5' }}>
                    Synced transactions from <strong>{formatDateOnly(latestRun.details.dateRange.startDate)}</strong> to <strong>{formatDateOnly(latestRun.details.dateRange.endDate)}</strong>
                  </Typography>
                </Box>
              )}

              {/* Expandable Account Details */}
              {latestRun.details && ((latestRun.details.results?.length ?? 0) > 0 || (latestRun.details.errors?.length ?? 0) > 0) && (
                <>
                  <Button
                    size="small"
                    onClick={() => setDetailsExpanded(!detailsExpanded)}
                    endIcon={detailsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    sx={{
                      mt: 1.5,
                      textTransform: 'none',
                      color: '#3b82f6',
                      fontSize: '0.75rem',
                      p: 0,
                      minWidth: 'auto',
                      '&:hover': { backgroundColor: 'transparent' },
                    }}
                  >
                    {detailsExpanded ? 'Hide Details' : 'Show Account Details'}
                  </Button>
                  
                  <Collapse in={detailsExpanded}>
                    <Box sx={{ mt: 1.5 }}>
                      {/* Successful accounts */}
                      {latestRun.details.results && latestRun.details.results.length > 0 && (
                        <Box sx={{ mb: 1.5 }}>
                          <Typography variant="caption" sx={{ color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                            <CheckCircleIcon sx={{ fontSize: 12 }} />
                            Synced Successfully ({latestRun.details.results.length})
                          </Typography>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            {latestRun.details.results.map((result, idx) => (
                              <Box
                                key={idx}
                                sx={{
                                  p: 1,
                                  backgroundColor: 'rgba(34, 197, 94, 0.05)',
                                  borderRadius: '6px',
                                  borderLeft: '2px solid #22c55e',
                                }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    {isVendorBank(result.vendor) ? (
                                      <AccountBalanceIcon sx={{ fontSize: 14, color: '#64748b' }} />
                                    ) : (
                                      <CreditCardIcon sx={{ fontSize: 14, color: '#64748b' }} />
                                    )}
                                    <Box>
                                      <Typography variant="caption" sx={{ fontWeight: 600, color: '#1e293b', display: 'block', lineHeight: 1.2 }}>
                                        {getVendorDisplayName(result.vendor)}
                                      </Typography>
                                      {result.nickname && (
                                        <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.65rem' }}>
                                          {result.nickname}
                                        </Typography>
                                      )}
                                    </Box>
                                  </Box>
                                  <Chip
                                    size="small"
                                    label={`${result.transactionCount || 0} txns`}
                                    sx={{
                                      height: '18px',
                                      fontSize: '0.65rem',
                                      backgroundColor: 'rgba(34, 197, 94, 0.1)',
                                      color: '#166534',
                                      '& .MuiChip-label': { px: 1 },
                                    }}
                                  />
                                </Box>
                                {/* Show cards breakdown if available */}
                                {result.cards && result.cards.length > 0 && (
                                  <Box sx={{ mt: 0.75, pl: 2.5 }}>
                                    {result.cards.map((card, cardIdx) => (
                                      <Box
                                        key={cardIdx}
                                        sx={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          py: 0.25,
                                        }}
                                      >
                                        <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.65rem' }}>
                                          •••• {card.last4}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.65rem' }}>
                                          {card.transactionCount} txns
                                        </Typography>
                                      </Box>
                                    ))}
                                  </Box>
                                )}
                              </Box>
                            ))}
                          </Box>
                        </Box>
                      )}

                      {/* Failed accounts */}
                      {latestRun.details.errors && latestRun.details.errors.length > 0 && (
                        <Box>
                          <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                            <ErrorIcon sx={{ fontSize: 12 }} />
                            Failed ({latestRun.details.errors.length})
                          </Typography>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            {latestRun.details.errors.map((error, idx) => (
                              <Box
                                key={idx}
                                sx={{
                                  p: 1,
                                  backgroundColor: 'rgba(239, 68, 68, 0.05)',
                                  borderRadius: '6px',
                                  borderLeft: '2px solid #ef4444',
                                }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  {isVendorBank(error.vendor) ? (
                                    <AccountBalanceIcon sx={{ fontSize: 14, color: '#64748b' }} />
                                  ) : (
                                    <CreditCardIcon sx={{ fontSize: 14, color: '#64748b' }} />
                                  )}
                                  <Box>
                                    <Typography variant="caption" sx={{ fontWeight: 600, color: '#1e293b', display: 'block', lineHeight: 1.2 }}>
                                      {getVendorDisplayName(error.vendor)}
                                    </Typography>
                                    {error.nickname && (
                                      <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.65rem' }}>
                                        {error.nickname}
                                      </Typography>
                                    )}
                                  </Box>
                                </Box>
                                {error.error && (
                                  <Typography variant="caption" sx={{ color: '#dc2626', fontSize: '0.65rem', mt: 0.5, display: 'block' }}>
                                    {error.error.length > 60 ? error.error.substring(0, 60) + '...' : error.error}
                                  </Typography>
                                )}
                              </Box>
                            ))}
                          </Box>
                        </Box>
                      )}
                    </Box>
                  </Collapse>
                </>
              )}
            </Box>
          )}

          {/* Next Scheduled */}
          {status?.nextScheduledRun && !isRunning && (
            <Box sx={{ 
              p: 1.5,
              backgroundColor: 'rgba(59, 130, 246, 0.05)',
              borderRadius: '10px',
              mb: 2,
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: status?.nextSyncDateRange ? 0.75 : 0 }}>
                <ScheduleIcon sx={{ color: '#3b82f6', fontSize: 18 }} />
                <Typography variant="body2" sx={{ color: '#1e40af' }}>
                  Next sync: <strong>{formatNextRunTime(status.nextScheduledRun)}</strong>
                </Typography>
              </Box>
              {status?.nextSyncDateRange && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 3.25 }}>
                  <DateRangeIcon sx={{ color: '#6366f1', fontSize: 14 }} />
                  <Typography variant="caption" sx={{ color: '#4f46e5' }}>
                    Will fetch: <strong>{formatDateOnly(status.nextSyncDateRange.startDate)}</strong> → <strong>{formatDateOnly(status.nextSyncDateRange.endDate)}</strong>
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          {/* Schedule Info */}
          {status?.config.scheduleHours && status.config.scheduleHours.length > 0 && (
            <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 2 }}>
              Scheduled at: {status.config.scheduleHours.map(h => 
                `${h.toString().padStart(2, '0')}:00`
              ).join(', ')} daily
            </Typography>
          )}

          <Divider sx={{ my: 2 }} />

          {/* History */}
          {status?.history && status.history.length > 0 && (
            <>
              <Typography variant="subtitle2" sx={{ color: '#64748b', mb: 1.5, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Recent History
              </Typography>
              <Box sx={{ maxHeight: '160px', overflowY: 'auto' }}>
                {status.history.map((run) => (
                  <HistoryItem key={run.id} status={run.status}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <StatusIcon status={run.status} size={14} />
                        <Typography variant="caption" sx={{ color: '#1e293b', fontWeight: 500 }}>
                          {formatLocalDateTime(run.started_at)}
                        </Typography>
                      </Box>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>
                        {run.total_transactions} txns
                      </Typography>
                    </Box>
                  </HistoryItem>
                ))}
              </Box>
              <Divider sx={{ my: 2 }} />
            </>
          )}

          {/* Actions */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <ActionButton
              variant="contained"
              size="small"
              startIcon={triggering ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
              onClick={handleTriggerSync}
              disabled={isRunning || triggering}
              sx={{
                backgroundColor: '#3b82f6',
                '&:hover': { backgroundColor: '#2563eb' },
                '&:disabled': { backgroundColor: '#94a3b8' },
              }}
            >
              {triggering ? 'Starting...' : isRunning ? 'Sync Running' : 'Sync Now'}
            </ActionButton>
          </Box>
        </PopoverContent>
      </Popover>
    </>
  );
}
