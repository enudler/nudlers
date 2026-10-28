import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import Fade from '@mui/material/Fade';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import BugReportIcon from '@mui/icons-material/BugReport';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import TimerIcon from '@mui/icons-material/Timer';
import ImageIcon from '@mui/icons-material/Image';
import CloseIcon from '@mui/icons-material/Close';
import LockIcon from '@mui/icons-material/Lock';
import SendIcon from '@mui/icons-material/Send';
import { useNotification } from './NotificationContext';
import ModalHeader from './ModalHeader';
import { useTheme } from '@mui/material/styles';
import { useStatus } from '../context/StatusContext';
import { BEINLEUMI_GROUP_VENDORS, STANDARD_BANK_VENDORS } from '../utils/constants';
import { formatISODate, getTodayISODate } from '../utils/dateUtils';
import dynamic from 'next/dynamic';
import { ScrapeReportTransaction } from './ScrapeReport';
const ScrapeReport = dynamic(() => import('./ScrapeReport'), { ssr: false });

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
    nationalID?: string;
    userCode?: string;
    bankAccountNumber?: string;
    nickname?: string;
  };
  credentialId?: number;
}

interface ScrapeModalProps {
  open: boolean;
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
  details?: unknown;
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

interface NetworkLogEntry {
  type: 'httpRequest' | 'httpResponse' | 'rateLimitWait' | 'retryWait' | 'rateLimitFinished';
  method?: string;
  url?: string;
  status?: number;
  timestamp: string;
  message?: string;
  seconds?: number;
}

interface RateLimitState {
  isWaiting: boolean;
  message: string;
  totalSeconds: number;
  startTime: number;
}

export default function ScrapeModal({ open, onClose, onSuccess, initialConfig }: ScrapeModalProps) {
  const { t } = useTranslation('scrape');
  const theme = useTheme();
  const { setIsVaultModalOpen } = useStatus();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const [stepHistory, setStepHistory] = useState<Array<{ step: string, message: string, success: boolean | null, phase?: string }>>([]);
  const [networkLogs, setNetworkLogs] = useState<NetworkLogEntry[]>([]);
  const [rateLimitState, setRateLimitState] = useState<RateLimitState | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [isKilling, setIsKilling] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { showNotification } = useNotification();
  const [latestScreenshot, setLatestScreenshot] = useState<{ url: string, filename: string, stepName: string, timestamp: string } | null>(null);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  // 2FA/OTP state
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      const startTime = Date.now();
      interval = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoading]);
  const todayStr = getTodayISODate();
  const clampDateString = (value: string) => (value > todayStr ? todayStr : value);
  const defaultConfig: ScraperConfig = React.useMemo(() => ({
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
      nationalID: '',
      userCode: '',
      nickname: '',
      bankAccountNumber: ''
    }
  }), []);
  const [config, setConfig] = useState<ScraperConfig>(initialConfig || defaultConfig);
  const [sessionReport, setSessionReport] = useState<ScrapeReportTransaction[]>([]);

  useEffect(() => {
    if (!initialConfig) return;
    queueMicrotask(() => setConfig(initialConfig));
  }, [initialConfig]);

  useEffect(() => {
    if (open) return;
    queueMicrotask(() => {
      setConfig(initialConfig || defaultConfig);
      setError(null);
      setIsLoading(false);
      setProgress(null);
      setScrapeResult(null);
      setRetryState(null);
      setSessionReport([]);
      setNetworkLogs([]);
      setRateLimitState(null);
      setErrorType(null);
      setIsKilling(false);
      setLatestScreenshot(null);
      setSelectedScreenshot(null);
      setIsCapturing(false);
      // Reset OTP state
      setOtpRequired(false);
      setOtpCode('');
      setOtpSubmitting(false);
      setOtpError(null);
    });
    // Abort any ongoing scrape when modal closes
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, [open, initialConfig, defaultConfig]);

  const handleConfigChange = (field: string, value: unknown) => {
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
      const response = await fetch(`/api/scrapers/last-transaction-date?vendor=${encodeURIComponent(vendor)}`);
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
    let startDate: Date;
    if (continueFromLastDate && retryState.lastTransactionDate) {
      // Start from the day after the last transaction to avoid re-fetching it
      const nextDay = new Date(retryState.lastTransactionDate);
      nextDay.setDate(nextDay.getDate() + 1);
      startDate = nextDay;
    } else {
      // Retry from the original start date
      startDate = retryState.originalStartDate;
    }

    const updatedConfig: ScraperConfig = {
      ...config,
      options: { ...config.options, startDate }
    };
    setConfig(updatedConfig);

    // Clear retry state and error, then start scraping with the updated config
    setRetryState(null);
    setError(null);
    handleScrape(updatedConfig);
  };

  const handleKillScrapers = async () => {
    setIsKilling(true);
    try {
      const response = await fetch('/api/scrapers/stop', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        showNotification(t('errors.stoppedSuccess'), 'success');
        setError(null);
        setErrorType(null);
        setRetryState(null);
      } else {
        showNotification(data.message || t('errors.stopFailed'), 'error');
      }
    } catch {
      showNotification(t('errors.stopFailed'), 'error');
    } finally {
      setIsKilling(false);
    }
  };

  const handleScrape = async (configOverride?: ScraperConfig) => {
    const activeConfig = configOverride || config;
    setIsLoading(true);
    setError(null);
    setElapsedSeconds(0);
    setProgress({ step: 'init', message: t('progress.starting'), percent: 0 });
    setScrapeResult(null);
    setSessionReport([]);
    setStepHistory([]);
    setNetworkLogs([]);
    setRateLimitState(null);
    setLatestScreenshot(null);
    // Dispatch refresh event so global indicators (like header/sidebar) know it started
    window.dispatchEvent(new CustomEvent('dataRefresh'));

    // Create abort controller for this scrape
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/scrapers/run-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(activeConfig),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        let errorMsg = t('errors.failedToStart');
        try {
          const errorData = await response.json();
          errorMsg = errorData.message || errorMsg;
          if (errorData.type === 'CONCURRENCY_ERROR') {
            setErrorType('CONCURRENCY_ERROR');
          } else if (errorData.type === 'VAULT_LOCKED') {
            setIsVaultModalOpen(true);
            onClose();
            return;
          }
        } catch {
          // not json, stick with default
        }
        throw new Error(errorMsg);
      }

      // Read the SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error(t('errors.noResponseStream'));
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
            let data;
            try {
              data = JSON.parse(line.slice(6));
            } catch (e) {
              logger.error('Failed to parse SSE data', e as Error);
              continue;
            }

            if (currentEvent === 'network') {
              const logEntry: NetworkLogEntry = data;

              // Update network logs (keep last 50) - skip internal events
              if (logEntry.type !== 'rateLimitFinished') {
                setNetworkLogs(prev => {
                  const newLogs = [logEntry, ...prev].slice(0, 50);
                  return newLogs;
                });
              }

              // Handle rate limit state
              if (logEntry.type === 'rateLimitWait' && logEntry.seconds) {
                setRateLimitState({
                  isWaiting: true,
                  message: logEntry.message || t('progress.rateLimitDefault'),
                  totalSeconds: logEntry.seconds,
                  startTime: Date.now()
                });
              } else if (logEntry.type === 'retryWait' && logEntry.seconds) {
                setRateLimitState({
                  isWaiting: true,
                  message: logEntry.message || t('progress.retryingDefault'),
                  totalSeconds: logEntry.seconds,
                  startTime: Date.now()
                });
              } else if (logEntry.type === 'httpRequest' || logEntry.type === 'rateLimitFinished') {
                // Clear waiting state on new request or explicit finish
                setRateLimitState(null);
              }
            } else if (currentEvent === 'progress') {
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

              // Handle OTP events
              if (data.step === 'otpRequired') {
                setOtpRequired(true);
                setOtpError(null);
                // Auto-focus OTP input after render
                setTimeout(() => otpInputRef.current?.focus(), 100);
              } else if (data.step === 'otpSuccess') {
                setOtpRequired(false);
                setOtpSubmitting(false);
                setOtpCode('');
              } else if (data.step === 'otpFailed') {
                setOtpSubmitting(false);
                setOtpError(data.message || t('otp.verificationFailed'));
                // Allow retry
                setOtpCode('');
                setTimeout(() => otpInputRef.current?.focus(), 100);
              }

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
            } else if (currentEvent === 'screenshot') {
              setLatestScreenshot({
                url: data.url,
                filename: data.filename,
                stepName: data.stepName,
                timestamp: data.timestamp
              });
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
              showNotification(t('notifications.completed'), 'success');
            } else if (currentEvent === 'error') {
              if (data.type === 'CONCURRENCY_ERROR') {
                setErrorType('CONCURRENCY_ERROR');
              } else if (data.type === 'VAULT_LOCKED') {
                setIsVaultModalOpen(true);
                onClose();
                return;
              }
              const errorWithHint = data.hint ? `${data.message}\n\n💡 ${t('errors.hintLabel')}: ${data.hint}` : data.message;
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
      const errorMessage = err instanceof Error ? err.message : t('errors.default');
      setError(errorMessage);
      setProgress(null);

      // Set up retry state - fetch last transaction date for this vendor
      const lastDate = await fetchLastTransactionDate(activeConfig.options.companyId);
      setRetryState({
        canRetry: true,
        lastTransactionDate: lastDate,
        originalStartDate: activeConfig.options.startDate
      });
    } finally {
      setIsLoading(false);
      setOtpRequired(false);
      setOtpSubmitting(false);
      abortControllerRef.current = null;
    }
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
        throw new Error(data.message || t('otp.submitFailedDetailed'));
      }

      // Code submitted — the scraper will continue automatically.
      // Don't clear otpRequired yet — wait for otpSuccess/otpFailed events.
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : t('otp.submitFailed'));
      setOtpSubmitting(false);
    }
  };

  const handleTakeManualScreenshot = async () => {
    setIsCapturing(true);
    try {
      const response = await fetch('/api/debug/take_screenshot', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Failed to take screenshot');
      }
      showNotification(t('debug.screenshotSent'), 'success');
    } catch (err) {
      logger.error('Failed to take manual screenshot', err as Error);
      showNotification(t('debug.screenshotFailed'), 'error');
    } finally {
      setIsCapturing(false);
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
        <InputLabel>{t('form.vendorLabel')}</InputLabel>
        <Select
          value={config.options.companyId}
          label={t('form.vendorLabel')}
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
            label={t('form.idUsernameLabel')}
            value={config.credentials.id}
            onChange={(e) => handleConfigChange('credentials.id', e.target.value)}
            fullWidth
            helperText={t('form.idUsernameHelper')}
          />
        </>
      ) : config.options.companyId === 'hapoalim' ? (
        <>
          <TextField
            label={t('form.userCodeLabel')}
            value={config.credentials.userCode || config.credentials.username || config.credentials.id || ''}
            onChange={(e) => {
              // Store as userCode, but also update username/id for backward compatibility
              handleConfigChange('credentials.userCode', e.target.value);
              handleConfigChange('credentials.username', e.target.value);
            }}
            fullWidth
            helperText={t('form.userCodeHelper')}
            required
          />
        </>
      ) : config.options.companyId === 'yahav' ? (
        <>
          <TextField
            label={t('form.usernameLabel')}
            value={config.credentials.username || ''}
            onChange={(e) => handleConfigChange('credentials.username', e.target.value)}
            fullWidth
            required
          />
          <TextField
            label={t('form.idLabel')}
            value={config.credentials.nationalID || ''}
            onChange={(e) => handleConfigChange('credentials.nationalID', e.target.value)}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            fullWidth
            required
          />
        </>
      ) : STANDARD_BANK_VENDORS.includes(config.options.companyId) ? (
        <>
          <TextField
            label={t('form.idLabel')}
            value={config.credentials.id}
            onChange={(e) => handleConfigChange('credentials.id', e.target.value)}
            fullWidth
          />
          <TextField
            label={t('form.bankAccountNumberLabel')}
            value={config.credentials.bankAccountNumber}
            onChange={(e) => handleConfigChange('credentials.bankAccountNumber', e.target.value)}
            fullWidth
          />
        </>
      ) : config.options.companyId === 'visaCal' || config.options.companyId === 'max' ? (
        <TextField
          label={t('form.usernameLabel')}
          value={config.credentials.username}
          onChange={(e) => handleConfigChange('credentials.username', e.target.value)}
          fullWidth
        />
      ) : (
        <>
          <TextField
            label={t('form.idLabel')}
            value={config.credentials.id}
            onChange={(e) => handleConfigChange('credentials.id', e.target.value)}
            fullWidth
          />
          <TextField
            label={t('form.card6DigitsLabel')}
            value={config.credentials.card6Digits}
            onChange={(e) => handleConfigChange('credentials.card6Digits', e.target.value)}
            fullWidth
          />
        </>
      )}

      <TextField
        label={t('form.passwordLabel')}
        type="password"
        value={config.credentials.password}
        onChange={(e) => handleConfigChange('credentials.password', e.target.value)}
        fullWidth
      />

      <TextField
        label={t('form.startDateLabel')}
        type="date"
        value={formatISODate(config.options.startDate)}
        onChange={(e) => {
          const v = clampDateString(e.target.value);
          if (v) {
            handleConfigChange('options.startDate', new Date(v));
          }
        }}
        slotProps={{
          htmlInput: { max: todayStr },

          inputLabel: {
            shrink: true,
          }
        }} />

      <Tooltip title={t('form.debugModeTooltip')}>
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
              <BugReportIcon sx={{ fontSize: 18, color: config.options.showBrowser ? 'var(--n-info)' : '#9ca3af' }} />
              <span>{t('form.debugModeLabel')}</span>
            </Box>
          }
        />
      </Tooltip>
    </>
  );

  const renderExistingAccountForm = () => (
    <>
      <TextField
        label={t('form.accountNicknameLabel')}
        value={config.credentials.nickname}
        disabled
        fullWidth
      />
      {config.options.companyId === 'hapoalim' && (config.credentials.userCode || config.credentials.username || config.credentials.id) && (
        <TextField
          label={t('form.userCodeLabel')}
          value={config.credentials.userCode || config.credentials.username || config.credentials.id || ''}
          disabled
          fullWidth
        />
      )}
      {config.options.companyId !== 'hapoalim' && config.credentials.username && (
        <TextField
          label={t('form.usernameLabel')}
          value={config.credentials.username}
          disabled
          fullWidth
        />
      )}
      {config.options.companyId !== 'hapoalim' && config.credentials.id && (
        <TextField
          label={t('form.idLabel')}
          value={config.credentials.id}
          disabled
          fullWidth
        />
      )}
      {config.credentials.card6Digits && (
        <TextField
          label={t('form.card6DigitsLabel')}
          value={config.credentials.card6Digits}
          disabled
          fullWidth
        />
      )}
      {config.credentials.bankAccountNumber && (
        <TextField
          label={t('form.bankAccountNumberLabel')}
          value={config.credentials.bankAccountNumber}
          disabled
          fullWidth
        />
      )}

      <TextField
        label={t('form.startDateLabel')}
        type="date"
        value={formatISODate(config.options.startDate)}
        onChange={(e) => {
          const v = clampDateString(e.target.value);
          if (v) {
            handleConfigChange('options.startDate', new Date(v));
          }
        }}
        slotProps={{
          htmlInput: { max: todayStr },

          inputLabel: {
            shrink: true,
          }
        }} />

      <Tooltip title={t('form.debugModeTooltip')}>
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
              <BugReportIcon sx={{ fontSize: 18, color: config.options.showBrowser ? 'var(--n-info)' : '#9ca3af' }} />
              <span>{t('form.debugModeLabel')}</span>
            </Box>
          }
        />
      </Tooltip>
    </>
  );

  const getPhaseLabel = (phase?: string) => {
    const key = phase && ['initialization', 'authentication', 'data_fetching', 'processing', 'saving'].includes(phase)
      ? phase
      : 'default';
    return t(`progress.phase.${key}`);
  };

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const renderProgress = () => {
    return (
      <Box sx={{ width: '100%', mt: 2 }}>
        {/* Current Step */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          {progress?.step === 'complete' ? (
            <CheckCircleIcon sx={{ color: '#22c55e', mr: 1 }} />
          ) : progress?.success === false ? (
            <ErrorIcon sx={{ color: 'var(--n-error)', mr: 1 }} />
          ) : progress?.success === true ? (
            <CheckCircleIcon sx={{ color: '#22c55e', mr: 1, fontSize: 20 }} />
          ) : error ? (
            <ErrorIcon sx={{ color: 'var(--n-error)', mr: 1 }} />
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
              {progress?.message || t('progress.processing')}
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
              backgroundColor: progress?.step === 'complete' ? '#22c55e' : progress?.success === false ? 'var(--n-error)' : 'var(--n-info)',
              transition: 'transform 0.3s ease'
            }
          }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: stepHistory.length > 0 ? 2 : 0 }}>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
            {Math.round(progress?.percent || 0)}%
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TimerIcon sx={{ fontSize: 14, color: theme.palette.text.secondary }} />
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
              {formatTime(elapsedSeconds)}
            </Typography>
          </Box>
          {progress?.phase && (
            <Typography variant="caption" sx={{ color: theme.palette.text.disabled }}>
              {t('progress.step', { number: stepHistory.length + 1 })}
            </Typography>
          )}
        </Box>
        {/* Rate Limit / Retry Warning */}
        {rateLimitState && !scrapeResult && (
          <Fade in={true}>
            <Box sx={{
              mb: 2,
              p: 1.5,
              borderRadius: 2,
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5
            }}>
              <TimerIcon sx={{ color: 'var(--n-warning)', fontSize: 20 }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ color: '#d97706', fontWeight: 600 }}>
                  {rateLimitState.message}
                </Typography>
                <Box sx={{ width: '100%', height: 4, bgcolor: 'rgba(245, 158, 11, 0.2)', borderRadius: 2, mt: 0.5, overflow: 'hidden' }}>
                  <Box sx={{
                    width: '100%',
                    height: '100%',
                    bgcolor: 'var(--n-warning)',
                    animation: `progress-shrink ${rateLimitState.totalSeconds}s linear forwards`,
                    transformOrigin: 'left',
                    '@keyframes progress-shrink': {
                      '0%': { transform: 'scaleX(1)' },
                      '100%': { transform: 'scaleX(0)' }
                    }
                  }} />
                </Box>
              </Box>
            </Box>
          </Fade>
        )}
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
              {t('progress.runningLog')}
            </Typography>
            {stepHistory.slice().reverse().map((step, idx) => (
              <Box key={idx} sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                {step.success === true ? (
                  <CheckCircleIcon sx={{ color: '#22c55e', fontSize: 16, mr: 1 }} />
                ) : step.success === false ? (
                  <ErrorIcon sx={{ color: 'var(--n-error)', fontSize: 16, mr: 1 }} />
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
        {/* 2FA / OTP Input */}
        {otpRequired && (
          <Fade in={otpRequired}>
            <Box sx={{
              mt: 2,
              p: 2.5,
              background: theme.palette.mode === 'dark'
                ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%)'
                : 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%)',
              borderRadius: 2,
              border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.2)'}`,
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <LockIcon sx={{ color: 'var(--n-info)', fontSize: 22 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: theme.palette.text.primary }}>
                  {t('otp.title')}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mb: 2, fontSize: '0.8rem' }}>
                {t('otp.description')}
              </Typography>

              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <TextField
                  inputRef={otpInputRef}
                  value={otpCode}
                  onChange={(e) => {
                    // Only allow digits
                    const val = e.target.value.replace(/\D/g, '');
                    setOtpCode(val);
                    setOtpError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && otpCode.trim()) {
                      handleOtpSubmit();
                    }
                  }}
                  placeholder={t('otp.placeholder')}
                  variant="outlined"
                  size="small"
                  disabled={otpSubmitting}
                  error={!!otpError}
                  helperText={otpError}
                  sx={{
                    flex: 1,
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : '#fff',
                    }
                  }}
                  slotProps={{
                    htmlInput: {
                      maxLength: 8,
                      style: {
                        textAlign: 'center',
                        fontSize: '1.3rem',
                        fontWeight: 700,
                        letterSpacing: '0.3em',
                        fontFamily: 'monospace',
                      }
                    }
                  }}
                />
                <Button
                  variant="contained"
                  onClick={handleOtpSubmit}
                  disabled={!otpCode.trim() || otpSubmitting}
                  sx={{
                    minWidth: 48,
                    height: 40,
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    '&:hover': { background: 'linear-gradient(135deg, #2563eb, #7c3aed)' },
                    '&:disabled': { opacity: 0.5 }
                  }}
                >
                  {otpSubmitting ? (
                    <CircularProgress size={20} sx={{ color: '#fff' }} />
                  ) : (
                    <SendIcon sx={{ fontSize: 20 }} />
                  )}
                </Button>
              </Box>

              {otpSubmitting && (
                <Typography variant="caption" sx={{ color: 'var(--n-info)', mt: 1, display: 'block' }}>
                  {t('otp.submitting')}
                </Typography>
              )}
            </Box>
          </Fade>
        )}
        {/* Network Logs */}
        {networkLogs.length > 0 && !scrapeResult && (
          <Box sx={{
            mt: 2,
            p: 2,
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.4)' : '#1e293b',
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
            maxHeight: 150,
            overflowY: 'auto',
            fontFamily: 'monospace'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <SwapVertIcon sx={{ fontSize: 14, color: theme.palette.text.secondary }} />
              <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600 }}>
                {t('debug.networkActivity')}
              </Typography>
            </Box>
            {networkLogs.slice(0, 5).map((log, idx) => (
              <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, opacity: idx === 0 ? 1 : 0.7 }}>
                <Typography variant="caption" sx={{
                  color: log.type === 'httpRequest' ? '#60a5fa' :
                    log.type === 'httpResponse' ? (log.status && log.status >= 400 ? 'var(--n-error)' : '#22c55e') : 'var(--n-warning)',
                  fontWeight: 'bold',
                  fontSize: '0.7rem',
                  minWidth: 35
                }}>
                  {log.type === 'httpRequest' ? t('debug.logRequest') :
                    log.type === 'httpResponse' ? `${t('debug.logResponse')} ${log.status || ''}` : t('debug.logWait')}
                </Typography>
                <Typography variant="caption" sx={{
                  color: theme.palette.mode === 'dark' ? '#cbd5e1' : '#475569',
                  fontSize: '0.7rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  flex: 1
                }}>
                  {log.message || `${log.method || ''} ${log.url ? new URL(log.url).pathname : ''}`}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
        {/* Screenshot Debug Tools */}
        {isLoading && !scrapeResult && (
          <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'center' }}>
            <Button
              size="small"
              variant="outlined"
              onClick={handleTakeManualScreenshot}
              disabled={isCapturing}
              startIcon={isCapturing ? <CircularProgress size={16} color="inherit" /> : <ImageIcon />}
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
              {isCapturing ? t('debug.capturing') : t('debug.takeScreenshot')}
            </Button>

            {latestScreenshot && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<ImageIcon />}
                onClick={() => setSelectedScreenshot(latestScreenshot.url)}
                sx={{
                  fontSize: '10px',
                  py: 0.5,
                  borderColor: 'rgba(34, 197, 94, 0.3)',
                  color: '#22c55e',
                  '&:hover': {
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)'
                  }
                }}
              >
                {t('debug.viewLatestScreenshot')}
              </Button>
            )}
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
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          style: {
            background: 'var(--modal-backdrop)',
            backdropFilter: 'blur(20px)',
            borderRadius: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
            border: `1px solid ${theme.palette.divider}`
          }
        }
      }}
    >
      <ModalHeader title={t('modal.title')} onClose={handleClose} />
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

            {retryState?.canRetry && !errorType && (
              <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="body2" sx={{ color: theme.palette.mode === 'dark' ? '#b91c1c' : '#991b1b', mb: 1 }}>
                  {t('errors.wouldYouLikeRetry')}
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
                    {t('errors.retryFromLabel', { date: config.options.startDate.toLocaleDateString() })}
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
                      {t('errors.continueFromLabel', { date: retryState.lastTransactionDate.toLocaleDateString() })}
                    </Button>
                  )}
                </Box>
                {retryState.lastTransactionDate && (
                  <Typography variant="caption" sx={{ color: '#6b7280', mt: 0.5 }}>
                    {t('errors.continueHint')}
                  </Typography>
                )}
              </Box>
            )}

            {errorType === 'CONCURRENCY_ERROR' && (
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  color="error"
                  fullWidth
                  onClick={handleKillScrapers}
                  disabled={isKilling}
                  startIcon={<BugReportIcon />}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: '8px'
                  }}
                >
                  {isKilling ? t('errors.stoppingScrapers') : t('errors.forceStopAll')}
                </Button>
                <Typography variant="caption" sx={{ display: 'block', mt: 1, textAlign: 'center', opacity: 0.8 }}>
                  {t('errors.forceStopHint')}
                </Typography>
              </Box>
            )}
          </div>
        )}

        {isLoading || scrapeResult ? (
          // Show progress view when scraping or after completion
          (<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
              {config.credentials.nickname
                ? t('modal.scrapingVendorWithNickname', { vendor: config.options.companyId, nickname: config.credentials.nickname })
                : t('modal.scrapingVendor', { vendor: config.options.companyId })}
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
                    {t('debug.modeActiveTitle')}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'var(--info-text)', mt: 0.5 }}>
                    {t('debug.modeActiveDesc')}
                  </Typography>
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? '#60a5fa' : 'var(--n-info)' }}>
                      <strong>🖥️ {t('debug.tipLabel')}</strong> {t('debug.tipText')}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}
            {renderProgress()}
          </Box>)
        ) : (
          // Show form when not scraping
          (<Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
            {initialConfig ? renderExistingAccountForm() : renderNewScrapeForm()}
          </Box>)
        )}
      </DialogContent>
      <DialogActions style={{ padding: '16px 24px' }}>
        {scrapeResult ? (
          // Show done button after successful scrape
          (<Button
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
            {t('actions.done')}
          </Button>)
        ) : retryState?.canRetry ? (
          // Show only close button when in retry mode (retry options are in the error box)
          (<Button onClick={handleClose} style={{ color: theme.palette.text.secondary }}>
            {t('actions.close')}
          </Button>)
        ) : (
          <>
            <Button onClick={handleClose} style={{ color: theme.palette.text.secondary }}>
              {isLoading ? t('actions.cancelScrape') : t('actions.cancel')}
            </Button>
            {!isLoading && (
              <Button
                onClick={() => handleScrape()}
                variant="contained"
                disabled={isLoading}
                style={{
                  backgroundColor: 'var(--n-info)',
                  color: '#fff',
                  padding: '8px 24px',
                  borderRadius: '8px',
                  textTransform: 'none',
                  fontWeight: 500
                }}
              >
                {t('actions.scrape')}
              </Button>
            )}
          </>
        )}
      </DialogActions>
      {/* Manual Screenshot Viewer Dialog */}
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
    </Dialog>
  );
}