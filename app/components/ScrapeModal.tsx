import { useState, useEffect, useRef } from 'react';
import { logger } from '../utils/client-logger';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import Fade from '@mui/material/Fade';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import BugReportIcon from '@mui/icons-material/BugReport';
import { useNotification } from './NotificationContext';
import ModalHeader from './ModalHeader';
import { useTheme } from '@mui/material/styles';
import { BEINLEUMI_GROUP_VENDORS, STANDARD_BANK_VENDORS } from '../utils/constants';
import ScrapeReport from './ScrapeReport';

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
    userCode?: string;
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
  phase?: string;
  success?: boolean | null;
  completedSteps?: string[];
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
  savedTransactions?: number;
  duplicateTransactions?: number;
  updatedTransactions?: number;
  cachedCategories?: number;
}

export default function ScrapeModal({ isOpen, onClose, onSuccess, initialConfig }: ScrapeModalProps) {
  const theme = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const [stepHistory, setStepHistory] = useState<Array<{ step: string, message: string, success: boolean | null, phase?: string }>>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { showNotification } = useNotification();
  const todayStr = new Date().toISOString().split('T')[0];
  const clampDateString = (value: string) => (value > todayStr ? todayStr : value);
  const defaultConfig: ScraperConfig = {
    options: {
      companyId: 'isracard',
      startDate: new Date(),
      combineInstallments: false,
      showBrowser: false,
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
  const [sessionReport, setSessionReport] = useState<any[]>([]);

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
      setSessionReport([]);
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
      logger.error('Failed to fetch last transaction date', err as Error);
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
    setSessionReport([]);
    setStepHistory([]);

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
              const progressData = {
                step: data.step,
                message: data.message,
                percent: data.percent,
                phase: data.phase,
                success: data.success,
                completedSteps: data.completedSteps,
                details: data.details
              };
              setProgress(progressData);

              // Track step history for display
              if (data.success !== null || data.message.includes('✓') || data.message.includes('✗')) {
                setStepHistory(prev => {
                  const newStep = {
                    step: data.step,
                    message: data.message,
                    success: data.success !== null ? data.success : (data.message.includes('✓') ? true : data.message.includes('✗') ? false : null),
                    phase: data.phase
                  };
                  // Avoid duplicates
                  if (prev.length === 0 || prev[prev.length - 1].step !== newStep.step) {
                    return [...prev, newStep];
                  }
                  return prev;
                });
              }
            } else if (currentEvent === 'complete') {
              setProgress({
                step: 'complete',
                message: data.message,
                percent: 100
              });
              setScrapeResult(data.summary);
              if (data.summary && data.summary.processedTransactions) {
                setSessionReport(data.summary.processedTransactions);
              } else {
                setSessionReport([]);
              }
              showNotification('Scraping completed successfully!', 'success');
            } else if (currentEvent === 'error') {
              const errorWithHint = data.hint ? `${data.message}\n\n💡 Hint: ${data.hint}` : data.message;
              throw new Error(errorWithHint);
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
      ) : config.options.companyId === 'hapoalim' ? (
        <>
          <TextField
            label="User Code"
            value={config.credentials.userCode || config.credentials.username || config.credentials.id || ''}
            onChange={(e) => {
              // Store as userCode, but also update username/id for backward compatibility
              handleConfigChange('credentials.userCode', e.target.value);
              handleConfigChange('credentials.username', e.target.value);
            }}
            fullWidth
            helperText="Your Bank Hapoalim user code for online banking (found in your online banking profile)"
            required
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

      <Tooltip title="Shows the browser window for debugging or entering 2FA codes. Only works when running locally (not in Docker).">
        <FormControlLabel
          control={
            <Switch
              checked={config.options.showBrowser}
              onChange={(e) => handleConfigChange('options.showBrowser', e.target.checked)}
              color="primary"
            />
          }
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <BugReportIcon sx={{ fontSize: 18, color: config.options.showBrowser ? '#3b82f6' : '#9ca3af' }} />
              <span>Debug Mode (Show Browser)</span>
            </Box>
          }
        />
      </Tooltip>
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
      {config.options.companyId === 'hapoalim' && (config.credentials.userCode || config.credentials.username || config.credentials.id) && (
        <TextField
          label="User Code"
          value={config.credentials.userCode || config.credentials.username || config.credentials.id || ''}
          disabled
          fullWidth
        />
      )}
      {config.options.companyId !== 'hapoalim' && config.credentials.username && (
        <TextField
          label="Username"
          value={config.credentials.username}
          disabled
          fullWidth
        />
      )}
      {config.options.companyId !== 'hapoalim' && config.credentials.id && (
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

      <Tooltip title="Shows the browser window for debugging or entering 2FA codes. Only works when running locally (not in Docker).">
        <FormControlLabel
          control={
            <Switch
              checked={config.options.showBrowser}
              onChange={(e) => handleConfigChange('options.showBrowser', e.target.checked)}
              color="primary"
            />
          }
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <BugReportIcon sx={{ fontSize: 18, color: config.options.showBrowser ? '#3b82f6' : '#9ca3af' }} />
              <span>Debug Mode (Show Browser)</span>
            </Box>
          }
        />
      </Tooltip>
    </>
  );

  const getPhaseLabel = (phase?: string) => {
    const phases: Record<string, string> = {
      'initialization': 'Initialization',
      'authentication': 'Authentication',
      'data_fetching': 'Fetching Data',
      'processing': 'Processing',
      'saving': 'Saving'
    };
    return phases[phase || ''] || 'Processing';
  };

  const renderProgress = () => {
    return (
      <Box sx={{ width: '100%', mt: 2 }}>
        {/* Current Step */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          {progress?.step === 'complete' ? (
            <CheckCircleIcon sx={{ color: '#22c55e', mr: 1 }} />
          ) : progress?.success === false ? (
            <ErrorIcon sx={{ color: '#ef4444', mr: 1 }} />
          ) : progress?.success === true ? (
            <CheckCircleIcon sx={{ color: '#22c55e', mr: 1, fontSize: 20 }} />
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
          <Box sx={{ flex: 1 }}>
            {progress?.phase && (
              <Typography variant="caption" sx={{ color: theme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                {getPhaseLabel(progress.phase)}
              </Typography>
            )}
            <Typography variant="body1" sx={{ fontWeight: 500, color: theme.palette.text.primary }}>
              {progress?.message || 'Processing...'}
            </Typography>
          </Box>
        </Box>

        <LinearProgress
          variant="determinate"
          value={progress?.percent || 0}
          sx={{
            height: 8,
            borderRadius: 4,
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : '#e5e7eb',
            mb: 1,
            '& .MuiLinearProgress-bar': {
              borderRadius: 4,
              backgroundColor: progress?.step === 'complete' ? '#22c55e' : progress?.success === false ? '#ef4444' : '#3b82f6',
              transition: 'transform 0.3s ease'
            }
          }}
        />

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: stepHistory.length > 0 ? 2 : 0 }}>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
            {Math.round(progress?.percent || 0)}%
          </Typography>
          {progress?.phase && (
            <Typography variant="caption" sx={{ color: theme.palette.text.disabled }}>
              Step {stepHistory.length + 1}
            </Typography>
          )}
        </Box>

        {/* Step History (Collapsible or scrollable) */}
        {stepHistory.length > 0 && !scrapeResult && (
          <Box sx={{
            mt: 2,
            p: 2,
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.2)' : '#f9fafb',
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
            maxHeight: 150,
            overflowY: 'auto'
          }}>
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600, display: 'block', mb: 1 }}>
              Running Log:
            </Typography>
            {stepHistory.slice().reverse().map((step, idx) => (
              <Box key={idx} sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                {step.success === true ? (
                  <CheckCircleIcon sx={{ color: '#22c55e', fontSize: 16, mr: 1 }} />
                ) : step.success === false ? (
                  <ErrorIcon sx={{ color: '#ef4444', fontSize: 16, mr: 1 }} />
                ) : (
                  <Box sx={{ width: 16, height: 16, mr: 1 }} />
                )}
                <Typography variant="body2" sx={{ color: theme.palette.text.primary, fontSize: '0.75rem' }}>
                  {step.message.replace(/^[✓✗⏭]\s*/, '')}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        {scrapeResult && (
          <Fade in={true}>
            <Box sx={{ mt: 3 }}>
              <ScrapeReport
                report={sessionReport}
                summary={scrapeResult}
              />
            </Box>
          </Fade>
        )}
      </Box>
    );
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        style: {
          background: 'var(--modal-backdrop)',
          backdropFilter: 'blur(20px)',
          borderRadius: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          border: `1px solid ${theme.palette.divider}`
        }
      }}
    >
      <ModalHeader title="Scrape" onClose={handleClose} />
      <DialogContent style={{ padding: '0 24px 24px' }}>
        {error && (
          <div style={{
            backgroundColor: 'var(--error-bg)',
            border: `1px solid var(--error-border)`,
            color: 'var(--error-text)',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '16px'
          }}>
            <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>
              {error}
            </Typography>

            {retryState?.canRetry && (
              <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="body2" sx={{ color: theme.palette.mode === 'dark' ? '#b91c1c' : '#991b1b', mb: 1 }}>
                  Would you like to retry?
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleRetry(false)}
                    sx={{
                      borderColor: 'var(--status-error)',
                      color: 'var(--status-error)',
                      '&:hover': {
                        borderColor: 'var(--status-error)',
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
                        backgroundColor: 'var(--status-success)',
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
            <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
              Scraping <strong>{config.options.companyId}</strong>
              {config.credentials.nickname && ` (${config.credentials.nickname})`}
            </Typography>

            {config.options.showBrowser && isLoading && (
              <Box sx={{
                p: 2,
                backgroundColor: 'var(--info-bg)',
                borderRadius: 2,
                border: `1px solid var(--info-border)`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.5
              }}>
                <BugReportIcon sx={{ color: 'var(--status-info)', mt: 0.3 }} />
                <Box>
                  <Typography variant="subtitle2" sx={{ color: 'var(--info-text)', fontWeight: 600 }}>
                    Debug Mode Active
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'var(--info-text)', mt: 0.5 }}>
                    A browser window should have opened. You can interact with it to complete 2FA or debug issues.
                  </Typography>
                  <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? '#60a5fa' : '#3b82f6' }}>
                      <strong>🖥️ Local:</strong> Look for a Chrome window on your desktop
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#3b82f6' }}>
                      <strong>🐳 Docker:</strong>{' '}
                      <a
                        href="/vnc"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#2563eb', textDecoration: 'underline' }}
                      >
                        Open Browser Viewer
                      </a>
                      {' '}(requires ENABLE_VNC=true)
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}

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
          <Button onClick={handleClose} style={{ color: theme.palette.text.secondary }}>
            Close
          </Button>
        ) : (
          <>
            <Button onClick={handleClose} style={{ color: theme.palette.text.secondary }}>
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