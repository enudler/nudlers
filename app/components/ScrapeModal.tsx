import { useState, useEffect, useRef } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { useNotification } from './NotificationContext';
import ModalHeader from './ModalHeader';
import { BEINLEUMI_GROUP_VENDORS, STANDARD_BANK_VENDORS } from '../utils/constants';

interface ScraperConfig {
  options: {
    companyId: string;
    startDate: Date;
    combineInstallments: boolean;
    showBrowser: boolean;
    additionalTransactionInformation: boolean;
  };
  credentials: {
    id?: string;
    card6Digits?: string;
    password?: string;
    username?: string;
    bankAccountNumber?: string;
    nickname?: string;
  };
  credentialId?: number;
}

interface ScrapeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialConfig?: ScraperConfig;
}

interface ProgressState {
  step: string;
  message: string;
  percent: number;
  details?: any;
}

interface RetryState {
  canRetry: boolean;
  lastTransactionDate: Date | null;
  originalStartDate: Date;
}

interface ScrapeResult {
  accounts: number;
  transactions: number;
  bankTransactions: number;
  rulesApplied: number;
  transactionsCategorized: number;
}

export default function ScrapeModal({ isOpen, onClose, onSuccess, initialConfig }: ScrapeModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { showNotification } = useNotification();
  const todayStr = new Date().toISOString().split('T')[0];
  const clampDateString = (value: string) => (value > todayStr ? todayStr : value);
  const defaultConfig: ScraperConfig = {
    options: {
      companyId: 'isracard',
      startDate: new Date(),
      combineInstallments: false,
      showBrowser: true,
      additionalTransactionInformation: true
    },
    credentials: {
      id: '',
      card6Digits: '',
      password: '',
      username: '',
      nickname: '',
      bankAccountNumber: ''
    }
  };
  const [config, setConfig] = useState<ScraperConfig>(initialConfig || defaultConfig);

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
    }
  }, [initialConfig]);

  useEffect(() => {
    if (!isOpen) {
      setConfig(initialConfig || defaultConfig);
      setError(null);
      setIsLoading(false);
      setProgress(null);
      setScrapeResult(null);
      setRetryState(null);
      // Abort any ongoing scrape when modal closes
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  }, [isOpen, initialConfig]);

  const handleConfigChange = (field: string, value: any) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      setConfig(prev => {
        const parentValue = prev[parent as keyof ScraperConfig];
        if (typeof parentValue === 'object' && parentValue !== null) {
          return {
            ...prev,
            [parent]: {
              ...parentValue,
              [child]: value
            }
          };
        }
        return prev;
      });
    } else {
      setConfig(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

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
      console.error('Failed to fetch last transaction date:', err);
    }
    return null;
  };

  const handleRetry = async (continueFromLastDate: boolean) => {
    if (!retryState) return;
    
    // If user wants to continue from where it stopped, use the last transaction date
    if (continueFromLastDate && retryState.lastTransactionDate) {
      // Start from the day after the last transaction to avoid re-fetching it
      const nextDay = new Date(retryState.lastTransactionDate);
      nextDay.setDate(nextDay.getDate() + 1);
      handleConfigChange('options.startDate', nextDay);
    } else {
      // Retry from the original start date
      handleConfigChange('options.startDate', retryState.originalStartDate);
    }
    
    // Clear retry state and error, then start scraping
    setRetryState(null);
    setError(null);
    
    // Small delay to allow state to update before starting scrape
    setTimeout(() => {
      handleScrape();
    }, 100);
  };

  const handleScrape = async () => {
    setIsLoading(true);
    setError(null);
    setProgress({ step: 'init', message: 'Starting...', percent: 0 });
    setScrapeResult(null);

    // Create abort controller for this scrape
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/scrape_stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error('Failed to start scraping');
      }

      // Read the SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response stream available');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            
            if (currentEvent === 'progress') {
              setProgress({
                step: data.step,
                message: data.message,
                percent: data.percent,
                details: data.details
              });
            } else if (currentEvent === 'complete') {
              setProgress({
                step: 'complete',
                message: data.message,
                percent: 100
              });
              setScrapeResult(data.summary);
              showNotification('Scraping completed successfully!', 'success');
            } else if (currentEvent === 'error') {
              throw new Error(data.message);
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled, don't show error
        return;
      }
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      setProgress(null);
      
      // Set up retry state - fetch last transaction date for this vendor
      const lastDate = await fetchLastTransactionDate(config.options.companyId);
      setRetryState({
        canRetry: true,
        lastTransactionDate: lastDate,
        originalStartDate: config.options.startDate
      });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleClose = () => {
    if (isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onClose();
    if (scrapeResult) {
      onSuccess?.();
    }
  };

  const renderNewScrapeForm = () => (
    <>
      <FormControl fullWidth>
        <InputLabel>Vendor</InputLabel>
        <Select
          value={config.options.companyId}
          label="Vendor"
          onChange={(e) => handleConfigChange('options.companyId', e.target.value)}
        >
          <MenuItem value="isracard">Isracard</MenuItem>
          <MenuItem value="visaCal">VisaCal</MenuItem>
          <MenuItem value="amex">American Express</MenuItem>
          <MenuItem value="max">Max</MenuItem>
          <MenuItem value="discount">Discount Bank</MenuItem>
          <MenuItem value="hapoalim">Bank Hapoalim</MenuItem>
          <MenuItem value="leumi">Bank Leumi</MenuItem>
          <MenuItem value="otsarHahayal">Otsar Hahayal</MenuItem>
          <MenuItem value="mizrahi">Mizrahi Bank</MenuItem>
          <MenuItem value="beinleumi">Beinleumi Bank</MenuItem>
          <MenuItem value="massad">Massad Bank</MenuItem>
          <MenuItem value="pagi">Pagi Bank</MenuItem>
          <MenuItem value="yahav">Yahav Bank</MenuItem>
          <MenuItem value="union">Union Bank</MenuItem>
        </Select>
      </FormControl>

      {BEINLEUMI_GROUP_VENDORS.includes(config.options.companyId) ? (
        <>
          <TextField
            label="ID / Username"
            value={config.credentials.id}
            onChange={(e) => handleConfigChange('credentials.id', e.target.value)}
            fullWidth
            helperText="Your ID number (no account number needed for this bank)"
          />
        </>
      ) : STANDARD_BANK_VENDORS.includes(config.options.companyId) ? (
        <>
          <TextField
            label="ID"
            value={config.credentials.id}
            onChange={(e) => handleConfigChange('credentials.id', e.target.value)}
            fullWidth
          />
          <TextField
            label="Bank Account Number"
            value={config.credentials.bankAccountNumber}
            onChange={(e) => handleConfigChange('credentials.bankAccountNumber', e.target.value)}
            fullWidth
          />
        </>
      ) : config.options.companyId === 'visaCal' || config.options.companyId === 'max' ? (
        <TextField
          label="Username"
          value={config.credentials.username}
          onChange={(e) => handleConfigChange('credentials.username', e.target.value)}
          fullWidth
        />
      ) : (
        <>
          <TextField
            label="ID"
            value={config.credentials.id}
            onChange={(e) => handleConfigChange('credentials.id', e.target.value)}
            fullWidth
          />
          <TextField
            label="Card 6 Digits"
            value={config.credentials.card6Digits}
            onChange={(e) => handleConfigChange('credentials.card6Digits', e.target.value)}
            fullWidth
          />
        </>
      )}

      <TextField
        label="Password"
        type="password"
        value={config.credentials.password}
        onChange={(e) => handleConfigChange('credentials.password', e.target.value)}
        fullWidth
      />

      <TextField
        label="Start Date"
        type="date"
        value={config.options.startDate.toISOString().split('T')[0]}
        onChange={(e) => {
          const v = clampDateString(e.target.value);
          handleConfigChange('options.startDate', new Date(v));
        }}
        InputLabelProps={{
          shrink: true,
        }}
        inputProps={{ max: todayStr }}
      />
    </>
  );

  const renderExistingAccountForm = () => (
    <>
      <TextField
        label="Account Nickname"
        value={config.credentials.nickname}
        disabled
        fullWidth
      />
      {config.credentials.username && (
        <TextField
          label="Username"
          value={config.credentials.username}
          disabled
          fullWidth
        />
      )}
      {config.credentials.id && (
        <TextField
          label="ID"
          value={config.credentials.id}
          disabled
          fullWidth
        />
      )}
      {config.credentials.card6Digits && (
        <TextField
          label="Card 6 Digits"
          value={config.credentials.card6Digits}
          disabled
          fullWidth
        />
      )}
      {config.credentials.bankAccountNumber && (
        <TextField
          label="Bank Account Number"
          value={config.credentials.bankAccountNumber}
          disabled
          fullWidth
        />
      )}

      <TextField
        label="Start Date"
        type="date"
        value={config.options.startDate.toISOString().split('T')[0]}
        onChange={(e) => {
          const v = clampDateString(e.target.value);
          handleConfigChange('options.startDate', new Date(v));
        }}
        InputLabelProps={{
          shrink: true,
        }}
        inputProps={{ max: todayStr }}
      />
    </>
  );

  const renderProgress = () => (
    <Box sx={{ width: '100%', mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        {progress?.step === 'complete' ? (
          <CheckCircleIcon sx={{ color: '#22c55e', mr: 1 }} />
        ) : error ? (
          <ErrorIcon sx={{ color: '#ef4444', mr: 1 }} />
        ) : (
          <Box
            sx={{
              width: 20,
              height: 20,
              mr: 1,
              border: '2px solid #3b82f6',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              '@keyframes spin': {
                '0%': { transform: 'rotate(0deg)' },
                '100%': { transform: 'rotate(360deg)' }
              }
            }}
          />
        )}
        <Typography variant="body1" sx={{ fontWeight: 500, color: '#374151' }}>
          {progress?.message || 'Processing...'}
        </Typography>
      </Box>
      
      <LinearProgress 
        variant="determinate" 
        value={progress?.percent || 0}
        sx={{
          height: 8,
          borderRadius: 4,
          backgroundColor: '#e5e7eb',
          '& .MuiLinearProgress-bar': {
            borderRadius: 4,
            backgroundColor: progress?.step === 'complete' ? '#22c55e' : '#3b82f6',
            transition: 'transform 0.3s ease'
          }
        }}
      />
      
      <Typography variant="body2" sx={{ color: '#6b7280', mt: 1, textAlign: 'right' }}>
        {progress?.percent || 0}%
      </Typography>

      {scrapeResult && (
        <Box sx={{ 
          mt: 3, 
          p: 2, 
          backgroundColor: '#f0fdf4', 
          borderRadius: 2,
          border: '1px solid #bbf7d0'
        }}>
          <Typography variant="subtitle2" sx={{ color: '#15803d', fontWeight: 600, mb: 1 }}>
            Scrape Summary
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            <Typography variant="body2" sx={{ color: '#166534' }}>
              Accounts: <strong>{scrapeResult.accounts}</strong>
            </Typography>
            <Typography variant="body2" sx={{ color: '#166534' }}>
              Transactions: <strong>{scrapeResult.transactions}</strong>
            </Typography>
            <Typography variant="body2" sx={{ color: '#166534' }}>
              Rules Applied: <strong>{scrapeResult.rulesApplied}</strong>
            </Typography>
            <Typography variant="body2" sx={{ color: '#166534' }}>
              Auto-categorized: <strong>{scrapeResult.transactionsCategorized}</strong>
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );

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
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
        }
      }}
    >
      <ModalHeader title="Scrape" onClose={handleClose} />
      <DialogContent style={{ padding: '0 24px 24px' }}>
        {error && (
          <div style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '16px'
          }}>
            <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>
              {error}
            </Typography>
            
            {retryState?.canRetry && (
              <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="body2" sx={{ color: '#991b1b', mb: 1 }}>
                  Would you like to retry?
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleRetry(false)}
                    sx={{
                      borderColor: '#dc2626',
                      color: '#dc2626',
                      '&:hover': {
                        borderColor: '#b91c1c',
                        backgroundColor: 'rgba(220, 38, 38, 0.05)'
                      }
                    }}
                  >
                    Retry from {config.options.startDate.toLocaleDateString()}
                  </Button>
                  
                  {retryState.lastTransactionDate && (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => handleRetry(true)}
                      sx={{
                        backgroundColor: '#22c55e',
                        '&:hover': {
                          backgroundColor: '#16a34a'
                        }
                      }}
                    >
                      Continue from {retryState.lastTransactionDate.toLocaleDateString()}
                    </Button>
                  )}
                </Box>
                {retryState.lastTransactionDate && (
                  <Typography variant="caption" sx={{ color: '#6b7280', mt: 0.5 }}>
                    "Continue" will start from the day after the last saved transaction, skipping already synced data.
                  </Typography>
                )}
              </Box>
            )}
          </div>
        )}

        {isLoading || scrapeResult ? (
          // Show progress view when scraping or after completion
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>
              Scraping <strong>{config.options.companyId}</strong>
              {config.credentials.nickname && ` (${config.credentials.nickname})`}
            </Typography>
            {renderProgress()}
          </Box>
        ) : (
          // Show form when not scraping
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
            {initialConfig ? renderExistingAccountForm() : renderNewScrapeForm()}
          </Box>
        )}
      </DialogContent>
      <DialogActions style={{ padding: '16px 24px' }}>
        {scrapeResult ? (
          // Show done button after successful scrape
          <Button
            onClick={() => {
              onClose();
              onSuccess?.();
            }}
            variant="contained"
            style={{
              backgroundColor: '#22c55e',
              color: '#fff',
              padding: '8px 24px',
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 500
            }}
          >
            Done
          </Button>
        ) : retryState?.canRetry ? (
          // Show only close button when in retry mode (retry options are in the error box)
          <Button onClick={handleClose} style={{ color: '#666' }}>
            Close
          </Button>
        ) : (
          <>
            <Button onClick={handleClose} style={{ color: '#666' }}>
              {isLoading ? 'Cancel Scrape' : 'Cancel'}
            </Button>
            {!isLoading && (
              <Button
                onClick={handleScrape}
                variant="contained"
                disabled={isLoading}
                style={{
                  backgroundColor: '#3b82f6',
                  color: '#fff',
                  padding: '8px 24px',
                  borderRadius: '8px',
                  textTransform: 'none',
                  fontWeight: 500
                }}
              >
                SCRAPE
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
} 