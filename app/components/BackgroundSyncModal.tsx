import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import { styled } from '@mui/material/styles';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import SyncIcon from '@mui/icons-material/Sync';
import ModalHeader from './ModalHeader';
import { useNotification } from './NotificationContext';

interface SyncResult {
  date: string;
  vendor: string;
  nickname: string;
  transactionCount?: number;
  accountsCount?: number;
  error?: string;
  status: 'success' | 'failed';
}

interface SyncSummary {
  totalDays: number;
  totalAccounts: number;
  totalTransactions: number;
  successfulScrapes: number;
  failedScrapes: number;
}

interface SyncResponse {
  message: string;
  summary: SyncSummary;
  results: SyncResult[];
  errors: SyncResult[];
}

interface BackgroundSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const ResultsContainer = styled(Box)({
  maxHeight: '300px',
  overflowY: 'auto',
  marginTop: '16px',
  padding: '12px',
  backgroundColor: 'rgba(248, 250, 252, 0.5)',
  borderRadius: '12px',
  border: '1px solid rgba(148, 163, 184, 0.2)',
});

const ResultItem = styled(Box)<{ status: 'success' | 'failed' }>(({ status }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  marginBottom: '8px',
  borderRadius: '8px',
  backgroundColor: status === 'success' 
    ? 'rgba(34, 197, 94, 0.1)' 
    : 'rgba(239, 68, 68, 0.1)',
  border: `1px solid ${status === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
  '&:last-child': {
    marginBottom: 0,
  },
}));

const SummaryCard = styled(Box)({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '16px',
  padding: '16px',
  backgroundColor: 'rgba(59, 130, 246, 0.05)',
  borderRadius: '12px',
  border: '1px solid rgba(59, 130, 246, 0.2)',
  marginBottom: '16px',
});

const SummaryItem = styled(Box)({
  textAlign: 'center',
  '& .value': {
    fontSize: '24px',
    fontWeight: 700,
    color: '#1e293b',
  },
  '& .label': {
    fontSize: '12px',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
});

export default function BackgroundSyncModal({ isOpen, onClose, onSuccess }: BackgroundSyncModalProps) {
  const [days, setDays] = useState(30);
  const [delaySeconds, setDelaySeconds] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResponse, setSyncResponse] = useState<SyncResponse | null>(null);
  const { showNotification } = useNotification();

  const handleClose = () => {
    if (!isLoading) {
      setError(null);
      setSyncResponse(null);
      onClose();
    }
  };

  const handleSync = async () => {
    setIsLoading(true);
    setError(null);
    setSyncResponse(null);

    try {
      const response = await fetch('/api/background_sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ days, delaySeconds }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Background sync failed');
      }

      setSyncResponse(data);
      showNotification(
        `Background sync completed! ${data.summary.totalTransactions} transactions fetched.`,
        'success'
      );
      onSuccess?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      showNotification(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const estimatedTime = () => {
    // Rough estimate: ~60 seconds per account per day + delay between each
    // This is just an estimate for user expectation
    const accountsEstimate = 2; // Assume average 2 accounts
    const scrapeTimePerAccount = 60; // seconds
    const totalTime = days * accountsEstimate * (scrapeTimePerAccount + delaySeconds);
    const minutes = Math.ceil(totalTime / 60);
    if (minutes < 60) {
      return `~${minutes} minutes`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `~${hours}h ${remainingMinutes}m`;
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        style: {
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        },
      }}
    >
      <ModalHeader title="Background Sync" onClose={handleClose} />
      <DialogContent style={{ padding: '0 24px 24px' }}>
        {error && (
          <Alert 
            severity="error" 
            sx={{ 
              marginBottom: 2,
              borderRadius: '12px',
            }}
          >
            {error}
          </Alert>
        )}

        {!syncResponse && (
          <>
            <Typography 
              variant="body2" 
              sx={{ 
                color: '#64748b', 
                marginBottom: 3,
                lineHeight: 1.6,
              }}
            >
              Fetch transactions from all configured accounts for the last X days. 
              The system will wait Y seconds between each scraping operation to avoid 
              rate limiting.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <TextField
                label="Number of Days"
                type="number"
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 1)))}
                inputProps={{ min: 1, max: 365 }}
                fullWidth
                disabled={isLoading}
                helperText="How many days back to fetch (1-365)"
              />

              <TextField
                label="Delay Between Scrapes (seconds)"
                type="number"
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Math.max(0, Math.min(300, parseInt(e.target.value) || 0)))}
                inputProps={{ min: 0, max: 300 }}
                fullWidth
                disabled={isLoading}
                helperText="Wait time between each scraping operation (0-300)"
              />

              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1,
                padding: '12px 16px',
                backgroundColor: 'rgba(251, 191, 36, 0.1)',
                borderRadius: '12px',
                border: '1px solid rgba(251, 191, 36, 0.3)',
              }}>
                <Typography variant="body2" sx={{ color: '#92400e' }}>
                  ⏱️ Estimated time: <strong>{estimatedTime()}</strong>
                </Typography>
              </Box>
            </Box>
          </>
        )}

        {isLoading && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <SyncIcon 
                sx={{ 
                  color: '#3b82f6',
                  animation: 'spin 1s linear infinite',
                  '@keyframes spin': {
                    '0%': { transform: 'rotate(0deg)' },
                    '100%': { transform: 'rotate(360deg)' },
                  },
                }} 
              />
              <Typography variant="body1" sx={{ color: '#1e293b' }}>
                Syncing... This may take a while.
              </Typography>
            </Box>
            <LinearProgress 
              sx={{ 
                borderRadius: '4px',
                height: '8px',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: '#3b82f6',
                },
              }} 
            />
            <Typography 
              variant="caption" 
              sx={{ 
                display: 'block', 
                textAlign: 'center', 
                mt: 1,
                color: '#64748b',
              }}
            >
              Please keep this window open
            </Typography>
          </Box>
        )}

        {syncResponse && (
          <>
            <SummaryCard>
              <SummaryItem>
                <div className="value">{syncResponse.summary.totalTransactions}</div>
                <div className="label">Transactions</div>
              </SummaryItem>
              <SummaryItem>
                <div className="value" style={{ color: '#22c55e' }}>
                  {syncResponse.summary.successfulScrapes}
                </div>
                <div className="label">Successful</div>
              </SummaryItem>
              <SummaryItem>
                <div className="value" style={{ color: syncResponse.summary.failedScrapes > 0 ? '#ef4444' : '#22c55e' }}>
                  {syncResponse.summary.failedScrapes}
                </div>
                <div className="label">Failed</div>
              </SummaryItem>
            </SummaryCard>

            {syncResponse.results.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ color: '#1e293b', mb: 1 }}>
                  Results ({syncResponse.results.length + syncResponse.errors.length} operations)
                </Typography>
                <ResultsContainer>
                  {[...syncResponse.results, ...syncResponse.errors].map((result, index) => (
                    <ResultItem key={index} status={result.status}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {result.status === 'success' ? (
                          <CheckCircleIcon sx={{ color: '#22c55e', fontSize: '18px' }} />
                        ) : (
                          <ErrorIcon sx={{ color: '#ef4444', fontSize: '18px' }} />
                        )}
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500, color: '#1e293b' }}>
                            {result.nickname || result.vendor}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#64748b' }}>
                            {result.date} • {result.vendor}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        {result.status === 'success' ? (
                          <Chip 
                            label={`${result.transactionCount} txns`}
                            size="small"
                            sx={{ 
                              backgroundColor: 'rgba(34, 197, 94, 0.2)',
                              color: '#166534',
                            }}
                          />
                        ) : (
                          <Typography variant="caption" sx={{ color: '#ef4444' }}>
                            {result.error?.substring(0, 30)}...
                          </Typography>
                        )}
                      </Box>
                    </ResultItem>
                  ))}
                </ResultsContainer>
              </>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions style={{ padding: '16px 24px' }}>
        <Button onClick={handleClose} style={{ color: '#666' }} disabled={isLoading}>
          {syncResponse ? 'Close' : 'Cancel'}
        </Button>
        {!syncResponse && (
          <Button
            onClick={handleSync}
            variant="contained"
            disabled={isLoading}
            startIcon={<SyncIcon />}
            style={{
              backgroundColor: '#3b82f6',
              color: '#fff',
              padding: '8px 24px',
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 500,
            }}
          >
            {isLoading ? 'Syncing...' : 'Start Sync'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
