import React, { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { styled, keyframes } from '@mui/material/styles';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useNotification } from './NotificationContext';

interface AccountInfo {
  id: number;
  vendor: string;
  nickname: string;
  lastTransactionDate: string | null;
  syncFromDate: string;
  daysToSync: number;
}

interface SyncResult {
  vendor: string;
  nickname: string;
  transactionCount?: number;
  error?: string;
  status: 'success' | 'failed';
}

interface SyncProgress {
  current: number;
  total: number;
  vendor: string;
  nickname: string;
  message: string;
}

type SyncStatus = 'idle' | 'loading' | 'syncing' | 'done' | 'error';

const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const StatusContainer = styled(Box)(({ theme }) => ({
  position: 'fixed',
  top: '64px', // Below the header (48px header + 16px spacing)
  right: '24px',
  zIndex: 1200,
  maxWidth: '400px',
  backgroundColor: 'rgba(15, 23, 42, 0.95)',
  backdropFilter: 'blur(20px)',
  borderRadius: '16px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  overflow: 'hidden',
}));

const Header = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
});

const Content = styled(Box)({
  padding: '16px',
  maxHeight: '300px',
  overflowY: 'auto',
});

const LogItem = styled(Box)<{ status?: 'success' | 'failed' | 'info' }>(({ status }) => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  padding: '8px 0',
  borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
  '&:last-child': {
    borderBottom: 'none',
  },
  color: status === 'success' ? '#22c55e' : status === 'failed' ? '#ef4444' : '#94a3b8',
}));

const CatchUpButton = styled(Button)({
  color: 'rgba(255, 255, 255, 0.9)',
  textTransform: 'none',
  fontSize: '0.95rem',
  fontWeight: 500,
  padding: '8px 16px',
  borderRadius: '12px',
  margin: '0 4px',
  position: 'relative',
  overflow: 'hidden',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: '-100%',
    width: '100%',
    height: '100%',
    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent)',
    transition: 'left 0.5s ease-in-out',
  },
  '&:hover': {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    transform: 'translateY(-2px)',
    boxShadow: '0 8px 16px rgba(34, 197, 94, 0.3)',
    color: '#fff',
  },
  '&:hover::before': {
    left: '100%',
  },
  '&:active': {
    transform: 'translateY(0)',
  },
  '&:disabled': {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
});

export default function CatchUpSyncButton() {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [accountsInfo, setAccountsInfo] = useState<AccountInfo[]>([]);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [logs, setLogs] = useState<{ message: string; status?: 'success' | 'failed' | 'info' }[]>([]);
  const [results, setResults] = useState<SyncResult[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showStatus, setShowStatus] = useState(false);
  const { showNotification } = useNotification();

  // Fetch info about what would be synced
  const fetchCatchUpInfo = useCallback(async () => {
    try {
      setStatus('loading');
      const response = await fetch('/api/catchup_sync');
      const data = await response.json();
      setAccountsInfo(data.accounts || []);
      setStatus('idle');
    } catch (error) {
      console.error('Error fetching catchup info:', error);
      setStatus('idle');
    }
  }, []);

  useEffect(() => {
    fetchCatchUpInfo();
  }, [fetchCatchUpInfo]);

  const startCatchUpSync = async () => {
    setStatus('syncing');
    setShowStatus(true);
    setIsExpanded(true);
    setLogs([]);
    setResults([]);
    setProgress(null);

    try {
      const response = await fetch('/api/catchup_sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok && !response.body) {
        throw new Error('Failed to start sync');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              handleEvent(data);
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (error) {
      console.error('Catch-up sync error:', error);
      setStatus('error');
      addLog('Sync failed: ' + (error instanceof Error ? error.message : 'Unknown error'), 'failed');
      showNotification('Catch-up sync failed', 'error');
    }
  };

  const addLog = (message: string, logStatus?: 'success' | 'failed' | 'info') => {
    setLogs(prev => [...prev, { message, status: logStatus }]);
  };

  const handleEvent = (data: any) => {
    switch (data.type) {
      case 'start':
        addLog(data.message, 'info');
        break;
      case 'progress':
        setProgress({
          current: data.current,
          total: data.total,
          vendor: data.vendor,
          nickname: data.nickname,
          message: data.message,
        });
        addLog(data.message, 'info');
        break;
      case 'delay':
        addLog(data.message, 'info');
        break;
      case 'waiting':
        addLog(data.message, 'info');
        break;
      case 'account_complete':
        setResults(prev => [...prev, {
          vendor: data.vendor,
          nickname: data.nickname,
          transactionCount: data.transactionCount,
          status: 'success',
        }]);
        addLog(data.message, 'success');
        break;
      case 'account_error':
        setResults(prev => [...prev, {
          vendor: data.vendor,
          nickname: data.nickname,
          error: data.error,
          status: 'failed',
        }]);
        addLog(data.message, 'failed');
        break;
      case 'categorizing':
        addLog(data.message, 'info');
        break;
      case 'done':
        if (data.success) {
          setStatus('done');
          addLog(data.message, 'success');
          showNotification(data.message, 'success');
          // Dispatch refresh event
          window.dispatchEvent(new CustomEvent('dataRefresh'));
        } else {
          setStatus('error');
          addLog('Sync completed with errors', 'failed');
        }
        break;
      case 'error':
        setStatus('error');
        addLog(data.message, 'failed');
        break;
    }
  };

  const handleClose = () => {
    setShowStatus(false);
    if (status === 'done' || status === 'error') {
      setStatus('idle');
      fetchCatchUpInfo();
    }
  };

  const isDisabled = status === 'syncing' || status === 'loading' || accountsInfo.length === 0;

  const getButtonText = () => {
    if (status === 'loading') return 'Loading...';
    if (status === 'syncing') return 'Syncing...';
    if (accountsInfo.length === 0) return 'No accounts';
    return 'Catch Up';
  };

  const getTooltipText = () => {
    if (accountsInfo.length === 0) return 'No accounts configured';
    const accountsList = accountsInfo.map(a => 
      `${a.nickname || a.vendor}: ${a.lastTransactionDate ? `from ${a.syncFromDate} (${a.daysToSync} days)` : 'new account (90 days)'}`
    ).join('\n');
    return `Smart sync: Fetch missing transactions for each account from 2 days before their last transaction date.\n\n${accountsList}`;
  };

  return (
    <>
      <Tooltip 
        title={
          <Box sx={{ whiteSpace: 'pre-line', fontSize: '12px' }}>
            {getTooltipText()}
          </Box>
        }
        arrow
        placement="bottom"
      >
        <span>
          <CatchUpButton
            onClick={startCatchUpSync}
            disabled={isDisabled}
            startIcon={
              <AutorenewIcon 
                sx={{ 
                  animation: status === 'syncing' ? `${spin} 1s linear infinite` : 'none' 
                }} 
              />
            }
          >
            {getButtonText()}
          </CatchUpButton>
        </span>
      </Tooltip>

      {showStatus && (
        <StatusContainer>
          <Header>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {status === 'syncing' && (
                <AutorenewIcon 
                  sx={{ 
                    color: '#3b82f6',
                    fontSize: '20px',
                    animation: `${spin} 1s linear infinite` 
                  }} 
                />
              )}
              {status === 'done' && (
                <CheckCircleIcon sx={{ color: '#22c55e', fontSize: '20px' }} />
              )}
              {status === 'error' && (
                <ErrorIcon sx={{ color: '#ef4444', fontSize: '20px' }} />
              )}
              <Typography sx={{ color: '#fff', fontWeight: 600, fontSize: '14px' }}>
                {status === 'syncing' ? 'Catch-Up Sync' : 
                 status === 'done' ? 'Sync Complete' : 
                 status === 'error' ? 'Sync Failed' : 'Sync Status'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <IconButton 
                size="small" 
                onClick={() => setIsExpanded(!isExpanded)}
                sx={{ color: '#94a3b8' }}
              >
                {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
              <IconButton 
                size="small" 
                onClick={handleClose}
                sx={{ color: '#94a3b8' }}
                disabled={status === 'syncing'}
              >
                <CloseIcon />
              </IconButton>
            </Box>
          </Header>

          {progress && status === 'syncing' && (
            <Box sx={{ px: 2, py: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ color: '#94a3b8', fontSize: '12px' }}>
                  {progress.nickname || progress.vendor}
                </Typography>
                <Typography sx={{ color: '#64748b', fontSize: '12px' }}>
                  {progress.current}/{progress.total}
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={(progress.current / progress.total) * 100}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: 'rgba(59, 130, 246, 0.2)',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: '#3b82f6',
                    borderRadius: 3,
                  },
                }}
              />
            </Box>
          )}

          <Collapse in={isExpanded}>
            <Content>
              {logs.length === 0 ? (
                <Typography sx={{ color: '#64748b', fontSize: '13px', textAlign: 'center' }}>
                  Waiting for events...
                </Typography>
              ) : (
                logs.slice(-10).map((log, index) => (
                  <LogItem key={index} status={log.status}>
                    {log.status === 'success' && <CheckCircleIcon sx={{ fontSize: '14px', mt: '2px' }} />}
                    {log.status === 'failed' && <ErrorIcon sx={{ fontSize: '14px', mt: '2px' }} />}
                    <Typography sx={{ fontSize: '12px', lineHeight: 1.4 }}>
                      {log.message}
                    </Typography>
                  </LogItem>
                ))
              )}
            </Content>
          </Collapse>

          {status === 'done' && results.length > 0 && (
            <Box sx={{ 
              px: 2, 
              py: 1.5, 
              borderTop: '1px solid rgba(148, 163, 184, 0.1)',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
            }}>
              <Typography sx={{ color: '#22c55e', fontSize: '13px', fontWeight: 600 }}>
                ✓ {results.filter(r => r.status === 'success').length} accounts synced, {' '}
                {results.reduce((sum, r) => sum + (r.transactionCount || 0), 0)} transactions
              </Typography>
            </Box>
          )}
        </StatusContainer>
      )}
    </>
  );
}
