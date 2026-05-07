import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '../utils/client-logger';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Switch,
  Alert,
  CircularProgress,

  Select,
  MenuItem,
  Chip,
  Autocomplete
} from '@mui/material';
import { styled, useTheme } from '@mui/material/styles';
import SettingsIcon from '@mui/icons-material/Settings';
import packageJson from '../package.json';
import SyncIcon from '@mui/icons-material/Sync';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SendIcon from '@mui/icons-material/Send';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DeleteAllTransactionsDialog from './DeleteAllTransactionsDialog';
import DeleteIcon from '@mui/icons-material/Delete';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import ScreenshotViewer from './ScreenshotViewer';
import ImageIcon from '@mui/icons-material/Image';
import BugReportIcon from '@mui/icons-material/BugReport';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import { msToSeconds, secondsToMs } from '../utils/settings-utils';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import LockIcon from '@mui/icons-material/Lock';
import LanguageIcon from '@mui/icons-material/Language';
import { useStatus } from '../context/StatusContext';
import { useLocale } from '../context/LocaleContext';
import { useTranslation } from 'react-i18next';
import type { Locale } from '../i18n/config';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

interface Settings {
  sync_enabled: boolean;
  sync_hour: number;
  sync_days_back: number;
  default_currency: string;
  date_format: string;
  billing_cycle_start_day: number;
  // fetch_categories_from_scrapers removed - forced to true/smart for capable vendors
  scraper_timeout: number;
  scraper_log_http_requests: boolean;
  update_category_on_rescrape: boolean;

  scrape_retries: number;
  ai_base_url: string;
  ai_api_key: string;
  ai_model: string;
  isracard_scrape_categories: boolean;
  whatsapp_enabled: boolean;
  whatsapp_hour: number;
  whatsapp_to: string;
  whatsapp_summary_mode: 'calendar' | 'cycle';
  whatsapp_notify_on_restart: boolean;
  whatsapp_transport: 'web' | 'baileys';

  telegram_enabled: boolean;
  telegram_bot_token: string;
  telegram_to: string;
  telegram_notify_on_restart: boolean;
}

const StyledDialog = styled(Dialog)(({ theme }) => ({
  '& .MuiDialog-paper': {
    background: theme.palette.mode === 'dark'
      ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)'
      : 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(20px)',
    border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : theme.palette.divider}`,
    borderRadius: '16px',
    color: theme.palette.text.primary,
    minWidth: '500px',
    maxHeight: '90vh',
    boxShadow: theme.palette.mode === 'dark'
      ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      : '0 25px 50px -12px rgba(0, 0, 0, 0.1)',
  }
}));

const SettingSection = styled(Box)(({ theme }) => ({
  padding: '24px',
  borderRadius: '16px',
  border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : theme.palette.divider}`,
  background: theme.palette.mode === 'dark'
    ? 'rgba(30, 41, 59, 0.4)'
    : 'rgba(241, 245, 249, 0.6)',
  marginBottom: '20px',
  transition: 'all 0.2s ease-in-out',
  '&:hover': {
    background: theme.palette.mode === 'dark'
      ? 'rgba(30, 41, 59, 0.5)'
      : 'rgba(241, 245, 249, 0.8)',
    borderColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : theme.palette.divider,
  }
}));

const SettingRow = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 0',
  '&:not(:last-child)': {
    borderBottom: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(148, 163, 184, 0.1)'}`
  }
}));

const StyledTextField = styled(TextField)(({ theme }) => ({
  '& .MuiOutlinedInput-root': {
    color: theme.palette.text.primary,
    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.3)' : 'transparent',
    transition: 'all 0.2s ease-in-out',
    '& fieldset': {
      borderColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : theme.palette.divider,
      transition: 'all 0.2s ease-in-out',
    },
    '&:hover fieldset': {
      borderColor: theme.palette.primary.main,
    },
    '&.Mui-focused': {
      backgroundColor: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.5)' : 'transparent',
    },
    '&.Mui-focused fieldset': {
      borderColor: theme.palette.primary.main,
      borderWidth: '1.5px',
      boxShadow: `0 0 0 4px ${theme.palette.mode === 'dark' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)'}`,
    },
  },
  '& .MuiInputBase-input': {
    padding: '8.5px 14px',
    fontSize: '0.9rem',
  },
  '& .MuiInputLabel-root': {
    color: theme.palette.text.secondary,
    fontSize: '0.9rem',
  },
  '& .MuiInputLabel-root.Mui-focused': {
    color: theme.palette.primary.main,
  },
}));

const StyledAutocomplete = styled(Autocomplete)(({ theme }) => ({
  '& .MuiOutlinedInput-root': {
    padding: '4px 8px',
    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.3)' : 'transparent',
    transition: 'all 0.2s ease-in-out',
    '& fieldset': {
      borderColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : theme.palette.divider,
    },
    '&:hover fieldset': {
      borderColor: theme.palette.primary.main,
    },
    '&.Mui-focused fieldset': {
      borderColor: theme.palette.primary.main,
    },
  },
  '& .MuiChip-root': {
    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.05)',
    color: '#10b981',
    borderRadius: '8px',
    height: '28px',
    fontWeight: 500,
    border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.1)'}`,
    '& .MuiChip-deleteIcon': {
      color: '#10b981',
      fontSize: '16px',
      '&:hover': {
        color: '#059669',
      },
    },
  },
}));

const StyledSelect = styled(Select)(({ theme }) => ({
  color: theme.palette.text.primary,
  backgroundColor: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.3)' : 'transparent',
  transition: 'all 0.2s ease-in-out',
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : theme.palette.divider,
    transition: 'all 0.2s ease-in-out',
  },
  '&:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: theme.palette.primary.main,
  },
  '&.Mui-focused': {
    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.5)' : 'transparent',
  },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: theme.palette.primary.main,
    borderWidth: '1.5px',
    boxShadow: `0 0 0 4px ${theme.palette.mode === 'dark' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)'}`,
  },
  '& .MuiSelect-select': {
    padding: '8.5px 14px',
    fontSize: '0.9rem',
  },
}));

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const { t } = useTranslation(['settings', 'common']);
  const { locale, setLocale } = useLocale();
  const { isVaultLocked, startPasskeyRegistration, clearPasskeys, deletePasskey, fetchPasskeys, changePassphrase, hasPasskeys, passkeysCount, supportsWebAuthn } = useStatus();
  const [settings, setSettings] = useState<Settings>({
    sync_enabled: false,
    sync_hour: 3,
    sync_days_back: 30,
    default_currency: 'ILS',
    date_format: 'DD/MM/YYYY',
    billing_cycle_start_day: 10,
    // fetch_categories_from_scrapers removed
    scraper_timeout: 90000,
    scraper_log_http_requests: false,
    update_category_on_rescrape: false,
    scrape_retries: 3,
    ai_base_url: 'https://openrouter.ai/api/v1',
    ai_api_key: '',
    ai_model: 'google/gemini-2.5-flash',
    isracard_scrape_categories: true,
    whatsapp_enabled: false,
    whatsapp_hour: 8,
    whatsapp_to: '',
    whatsapp_summary_mode: 'calendar',
    whatsapp_notify_on_restart: false,
    whatsapp_transport: 'web',

    telegram_enabled: false,
    telegram_bot_token: '',
    telegram_to: '',
    telegram_notify_on_restart: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [originalSettings, setOriginalSettings] = useState<Settings | null>(null);

  // WhatsApp test state
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState<{ status: string, qr: string | null }>({ status: 'DISCONNECTED', qr: null });

  // Fetch WhatsApp status once when modal opens (no continuous polling)
  useEffect(() => {
    if (open) {
      const checkStatus = async () => {
        try {
          const res = await fetch('/api/whatsapp/status');
          if (res.ok) {
            const data = await res.json();
            setWhatsappStatus(data);
          }
        } catch (e) {
          console.error('Failed to fetch WhatsApp status', e);
        }
      };
      checkStatus();
    }
  }, [open]);

  // Poll only when actively waiting for QR code (INITIALIZING or QR_READY)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const shouldPoll = whatsappStatus.status === 'INITIALIZING' || whatsappStatus.status === 'QR_READY';

    if (open && shouldPoll) {
      const checkStatus = async () => {
        try {
          const res = await fetch('/api/whatsapp/status');
          if (res.ok) {
            const data = await res.json();
            setWhatsappStatus(data);
          }
        } catch (e) {
          console.error('Failed to fetch WhatsApp status', e);
        }
      };
      interval = setInterval(checkStatus, 2000);
    }

    return () => clearInterval(interval);
  }, [open, whatsappStatus.status]);

  const handleTransportChange = async (next: 'web' | 'baileys') => {
    if (next === settings.whatsapp_transport) return;
    const ok = window.confirm(
      t('settings:whatsapp.transportConfirm')
    );
    if (!ok) return;
    try {
      const res = await fetch('/api/whatsapp/transport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transport: next }),
      });
      if (!res.ok) {
        logger.error('Transport switch failed', new Error(`HTTP ${res.status}`));
        return;
      }
      setSettings({ ...settings, whatsapp_transport: next });
      // The status indicator should refresh — reset it so the next poll
      // picks up the new transport's state.
      setWhatsappStatus({ status: 'INITIALIZING', qr: null });
    } catch (e) {
      logger.error('Transport switch network error', e as Error);
    }
  };

  const handleWhatsAppAction = async (action: 'connect' | 'restart' | 'disconnect' | 'renewQr') => {
    try {
      // Optimistic update
      if (action === 'connect' || action === 'restart' || action === 'renewQr') {
        setWhatsappStatus(prev => ({ ...prev, status: 'INITIALIZING', qr: null }));
      }

      await fetch('/api/whatsapp/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });

      // Force a status check after action
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        setWhatsappStatus(data);
      }
    } catch (e) {
      console.error(`Failed to ${action} WhatsApp client`, e);
    }
  };

  const [whatsappTestResult, setWhatsappTestResult] = useState<{
    success: boolean;
    message: string | null;
    error: string | null;
  } | null>(null);

  // Delete all transactions dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [screenshotViewerOpen, setScreenshotViewerOpen] = useState(false);

  // Security settings state
  const [clearingPasskeys, setClearingPasskeys] = useState(false);
  const [clearPasskeyConfirm, setClearPasskeyConfirm] = useState(false);
  const [passkeyList, setPasskeyList] = useState<Array<{ id: number; credentialId: string; createdAt: string }>>([]);
  const [loadingPasskeys, setLoadingPasskeys] = useState(false);
  const [deletingPasskeyId, setDeletingPasskeyId] = useState<number | null>(null);
  const [changingPassphrase, setChangingPassphrase] = useState(false);
  const [showChangePassphrase, setShowChangePassphrase] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmNewPass, setConfirmNewPass] = useState('');
  const [securityResult, setSecurityResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showPasskeyRegister, setShowPasskeyRegister] = useState(false);
  const [passkeyRegPass, setPasskeyRegPass] = useState('');
  const [registeringPasskey, setRegisteringPasskey] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        const parseBool = (val: unknown) => val === true || val === 'true' || val === '"true"';
        const newSettings = {
          sync_enabled: parseBool(data.settings.sync_enabled),
          sync_hour: parseInt(data.settings.sync_hour) || 3,
          sync_days_back: parseInt(data.settings.sync_days_back) || 30,
          default_currency: (data.settings.default_currency || 'ILS').replace(/"/g, ''),
          date_format: (data.settings.date_format || 'DD/MM/YYYY').replace(/"/g, ''),
          billing_cycle_start_day: parseInt(data.settings.billing_cycle_start_day) || 10,
          // fetch_categories_from_scrapers removed
          scraper_timeout: msToSeconds(data.settings.scraper_timeout || data.settings.scraper_timeout_standard || 90000),
          scraper_log_http_requests: data.settings.scraper_log_http_requests === undefined
            ? false // Default to false if not set (matches backend behavior)
            : parseBool(data.settings.scraper_log_http_requests),
          update_category_on_rescrape: parseBool(data.settings.update_category_on_rescrape),
          scrape_retries: parseInt(data.settings.scrape_retries) || 3,
          ai_base_url: (data.settings.ai_base_url || 'https://openrouter.ai/api/v1').replace(/"/g, ''),
          ai_api_key: (data.settings.ai_api_key || data.settings.gemini_api_key || '').replace(/"/g, ''),
          ai_model: (data.settings.ai_model || 'google/gemini-2.5-flash').replace(/"/g, ''),
          isracard_scrape_categories: data.settings.isracard_scrape_categories === undefined
            ? true // Default to true
            : parseBool(data.settings.isracard_scrape_categories),
          whatsapp_enabled: parseBool(data.settings.whatsapp_enabled),
          whatsapp_hour: parseInt(data.settings.whatsapp_hour) || 8,
          whatsapp_to: (data.settings.whatsapp_to || '').replace(/"/g, ''),
          whatsapp_summary_mode: (data.settings.whatsapp_summary_mode || 'calendar').replace(/"/g, '') as 'calendar' | 'cycle',
          whatsapp_notify_on_restart: parseBool(data.settings.whatsapp_notify_on_restart),
          whatsapp_transport: ((data.settings.whatsapp_transport || '').replace(/^"(.*)"$/, '$1') === 'baileys' ? 'baileys' : 'web') as 'web' | 'baileys',

          telegram_enabled: parseBool(data.settings.telegram_enabled),
          telegram_bot_token: (data.settings.telegram_bot_token || '').replace(/^"(.*)"$/, '$1'),
          telegram_to: (data.settings.telegram_to || '').replace(/^"(.*)"$/, '$1'),
          telegram_notify_on_restart: parseBool(data.settings.telegram_notify_on_restart),
        };
        setSettings(newSettings);
        setOriginalSettings(newSettings);
        setHasInitialLoad(true);
      }
    } catch (error) {
      logger.error('Failed to fetch settings', error as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchSettings();
    }
  }, [open, fetchSettings]);

  const [hasInitialLoad, setHasInitialLoad] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    // Silent save, only show errors if they happen
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            ...settings,
            scraper_timeout: secondsToMs(settings.scraper_timeout)
          }
        })
      });

      if (response.ok) {
        setOriginalSettings(settings); // This might need care if settings changed during save, but for auto-save it's okay-ish
      }
    } catch (error) {
      logger.error('Auto-save error', error as Error);
      setResult({ type: 'error', message: t('settings:errors.autoSaveFailed') });
    } finally {
      setSaving(false);
    }
  }, [settings, t]);

  // Auto-save effect
  useEffect(() => {
    if (!hasInitialLoad || !originalSettings) return;

    const changed = JSON.stringify(settings) !== JSON.stringify(originalSettings);
    if (!changed) return;

    const handler = setTimeout(() => {
      handleSave();
    }, 1000); // 1s debounce

    return () => clearTimeout(handler);
  }, [settings, originalSettings, hasInitialLoad, handleSave]);



  const handleClose = () => {
    onClose();
  };

  const handleTestWhatsApp = async () => {
    setTestingWhatsApp(true);
    setWhatsappTestResult(null);

    try {
      const response = await fetch('/api/whatsapp-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();
      setWhatsappTestResult({
        success: data.success,
        message: data.message,
        error: data.error
      });
    } catch (error) {
      setWhatsappTestResult({
        success: false,
        message: null,
        error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setTestingWhatsApp(false);
    }
  };

  // Telegram test state
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState<{
    success: boolean;
    error: string | null;
    info: string | null;
  } | null>(null);

  const handleTestTelegram = async (mode: 'verify' | 'send') => {
    setTestingTelegram(true);
    setTelegramTestResult(null);
    try {
      const response = await fetch('/api/telegram-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      const data = await response.json();
      let info: string | null = null;
      if (data.success && mode === 'verify' && data.bot) {
        info = `@${data.bot.username} (${data.bot.firstName || data.bot.id})`;
      } else if (data.success && mode === 'send') {
        info = 'Message delivered';
      }
      setTelegramTestResult({
        success: !!data.success,
        error: data.error || null,
        info,
      });
    } catch (error) {
      setTelegramTestResult({
        success: false,
        info: null,
        error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setTestingTelegram(false);
    }
  };

  return (
    <StyledDialog open={open} onClose={handleClose} maxWidth="md">
      <DialogTitle sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : theme.palette.divider}`,
        px: 3,
        py: 2.5
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <SettingsIcon sx={{ color: '#60a5fa' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {t('settings:title')}
          </Typography>
          {saving && (
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary, ml: 1, fontStyle: 'italic' }}>
              {t('common:status.saving')}
            </Typography>
          )}
          {!saving && originalSettings && JSON.stringify(settings) === JSON.stringify(originalSettings) && (
            <Typography variant="caption" sx={{ color: '#22c55e', ml: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CheckCircleIcon sx={{ fontSize: '14px' }} /> {t('common:status.saved')}
            </Typography>
          )}
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress sx={{ color: '#60a5fa' }} />
          </Box>
        ) : (
          <>
            {result && result.type === 'error' && (
              <Alert
                severity="error"
                sx={{ mb: 3 }}
                icon={<ErrorIcon />}
              >
                {result.message}
              </Alert>
            )}

            {/* Language & Region */}
            <SettingSection>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <LanguageIcon sx={{ color: '#a78bfa' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {t('settings:language.section')}
                </Typography>
              </Box>

              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:language.label')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:language.desc')}
                  </Typography>
                </Box>
                <StyledSelect
                  value={locale}
                  onChange={(e) => setLocale(e.target.value as Locale)}
                  size="small"
                  sx={{ width: 180 }}
                >
                  <MenuItem value="en">{t('settings:language.english')}</MenuItem>
                  <MenuItem value="he">{t('settings:language.hebrew')}</MenuItem>
                </StyledSelect>
              </SettingRow>
            </SettingSection>

            {/* Sync Settings */}
            <SettingSection>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <SyncIcon sx={{ color: '#22c55e' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {t('settings:sync.section')}
                </Typography>
              </Box>



              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:sync.enableLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:sync.enableDesc')}
                  </Typography>
                </Box>
                <Switch
                  checked={settings.sync_enabled}
                  onChange={(e) => setSettings({ ...settings, sync_enabled: e.target.checked })}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': {
                      color: '#22c55e',
                    },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                      backgroundColor: '#22c55e',
                    },
                  }}
                />
              </SettingRow>



              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:sync.hourLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:sync.hourDesc')}
                  </Typography>
                </Box>
                <StyledTextField
                  type="number"
                  value={settings.sync_hour}
                  onChange={(e) => setSettings({ ...settings, sync_hour: parseInt(e.target.value) || 0 })}
                  size="small"
                  sx={{ width: '100px' }}
                  inputProps={{ min: 0, max: 23 }}
                />
              </SettingRow>



              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:sync.daysBackLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:sync.daysBackDesc')}
                  </Typography>
                </Box>
                <StyledTextField
                  type="number"
                  value={settings.sync_days_back}
                  onChange={(e) => setSettings({ ...settings, sync_days_back: parseInt(e.target.value) || 30 })}
                  size="small"
                  sx={{ width: '100px' }}
                  inputProps={{ min: 1, max: 365 }}
                />
              </SettingRow>
            </SettingSection>

            {/* Date & Currency Settings */}
            <SettingSection>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <CalendarTodayIcon sx={{ color: '#a78bfa' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {t('settings:display.section')}
                </Typography>
              </Box>



              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:display.currencyLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:display.currencyDesc')}
                  </Typography>
                </Box>
                <StyledTextField
                  value={settings.default_currency}
                  onChange={(e) => setSettings({ ...settings, default_currency: e.target.value.toUpperCase() })}
                  size="small"
                  sx={{ width: '100px' }}
                  inputProps={{ maxLength: 3 }}
                />
              </SettingRow>



              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:display.dateFormatLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:display.dateFormatDesc')}
                  </Typography>
                </Box>
                <StyledTextField
                  value={settings.date_format}
                  onChange={(e) => setSettings({ ...settings, date_format: e.target.value })}
                  size="small"
                  sx={{ width: '150px' }}
                />
              </SettingRow>



              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:display.billingCycleLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:display.billingCycleDesc')}
                  </Typography>
                </Box>
                <StyledTextField
                  type="number"
                  value={settings.billing_cycle_start_day}
                  onChange={(e) => setSettings({ ...settings, billing_cycle_start_day: parseInt(e.target.value) || 10 })}
                  size="small"
                  sx={{ width: '100px' }}
                  inputProps={{ min: 1, max: 28 }}
                />
              </SettingRow>
            </SettingSection>

            {/* Scraper Settings */}
            <SettingSection>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <SyncIcon sx={{ color: '#60a5fa' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {t('settings:scraper.section')}
                </Typography>
              </Box>









              {/* Added: Update Categories on Re-Scrape Setting */}


              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:scraper.updateCategoriesLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:scraper.updateCategoriesDesc')}
                  </Typography>
                </Box>
                <Switch
                  checked={settings.update_category_on_rescrape}
                  onChange={(e) => setSettings({ ...settings, update_category_on_rescrape: e.target.checked })}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': {
                      color: '#60a5fa',
                    },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                      backgroundColor: '#60a5fa',
                    },
                  }}
                />
              </SettingRow>



              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:scraper.retriesLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:scraper.retriesDesc')}
                  </Typography>
                </Box>
                <StyledTextField
                  type="number"
                  value={settings.scrape_retries}
                  onChange={(e) => setSettings({ ...settings, scrape_retries: parseInt(e.target.value) || 0 })}
                  size="small"
                  sx={{ width: '100px' }}
                  inputProps={{ min: 0, max: 10 }}
                />
              </SettingRow>



              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:scraper.timeoutLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:scraper.timeoutDesc')}
                  </Typography>
                </Box>
                <StyledTextField
                  type="number"
                  value={settings.scraper_timeout}
                  onChange={(e) => setSettings({ ...settings, scraper_timeout: parseInt(e.target.value) || 90 })}
                  size="small"
                  sx={{ width: '120px' }}
                  inputProps={{ min: 1, step: 1 }}
                />
              </SettingRow>

              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:scraper.logHttpLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:scraper.logHttpDesc')}
                  </Typography>
                </Box>
                <Switch
                  checked={settings.scraper_log_http_requests}
                  onChange={(e) => setSettings({ ...settings, scraper_log_http_requests: e.target.checked })}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': {
                      color: '#60a5fa',
                    },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                      backgroundColor: '#60a5fa',
                    },
                  }}
                />
              </SettingRow>

              <Box sx={{ mt: 3, mb: 2, pt: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {t('settings:scraper.vendorSpecific')}
                </Typography>
              </Box>

              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:scraper.isracardLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:scraper.isracardDesc')}
                  </Typography>
                </Box>
                <Switch
                  checked={settings.isracard_scrape_categories}
                  onChange={(e) => setSettings({ ...settings, isracard_scrape_categories: e.target.checked })}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': {
                      color: '#f59e0b',
                    },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                      backgroundColor: '#f59e0b',
                    },
                  }}
                />
              </SettingRow>
            </SettingSection>

            {/* Debug Settings */}
            <SettingSection>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <BugReportIcon sx={{ color: '#f43f5e' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {t('settings:debug.section')}
                </Typography>
              </Box>

              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:debug.screenshotsLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:debug.screenshotsDesc')}
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<ImageIcon />}
                  onClick={() => setScreenshotViewerOpen(true)}
                  sx={{ borderColor: theme.palette.divider, color: theme.palette.text.primary }}
                >
                  {t('settings:debug.viewScreenshots')}
                </Button>
              </SettingRow>
            </SettingSection>

            {/* AI Provider */}
            <SettingSection>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <AutoAwesomeIcon sx={{ color: '#ec4899' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {t('settings:ai.section')}
                </Typography>
              </Box>

              <Typography variant="caption" sx={{ display: 'block', color: theme.palette.text.secondary, mb: 1 }}>
                {t('settings:ai.blurb')}
              </Typography>

              <SettingRow>
                <Box sx={{ flex: 1, mr: 2 }}>
                  <Typography variant="body1">{t('settings:ai.presetLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:ai.presetDesc')}
                  </Typography>
                </Box>
                <StyledSelect
                  value={(() => {
                    const presets: Record<string, string> = {
                      'https://openrouter.ai/api/v1': 'openrouter',
                      'https://api.openai.com/v1': 'openai',
                      'https://api.groq.com/openai/v1': 'groq',
                      'https://api.together.xyz/v1': 'together',
                      'https://generativelanguage.googleapis.com/v1beta/openai': 'gemini',
                    };
                    return presets[settings.ai_base_url] || 'custom';
                  })()}
                  onChange={(e) => {
                    const preset = e.target.value as string;
                    const urls: Record<string, string> = {
                      openrouter: 'https://openrouter.ai/api/v1',
                      openai: 'https://api.openai.com/v1',
                      groq: 'https://api.groq.com/openai/v1',
                      together: 'https://api.together.xyz/v1',
                      gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
                    };
                    if (preset !== 'custom' && urls[preset]) {
                      setSettings({ ...settings, ai_base_url: urls[preset] });
                    }
                  }}
                  size="small"
                  sx={{ width: 250 }}
                >
                  <MenuItem value="openrouter">{t('settings:ai.presetOpenrouter')}</MenuItem>
                  <MenuItem value="openai">{t('settings:ai.presetOpenai')}</MenuItem>
                  <MenuItem value="groq">{t('settings:ai.presetGroq')}</MenuItem>
                  <MenuItem value="together">{t('settings:ai.presetTogether')}</MenuItem>
                  <MenuItem value="gemini">{t('settings:ai.presetGemini')}</MenuItem>
                  <MenuItem value="custom">{t('settings:ai.presetCustom')}</MenuItem>
                </StyledSelect>
              </SettingRow>

              <SettingRow>
                <Box sx={{ flex: 1, mr: 2 }}>
                  <Typography variant="body1">{t('settings:ai.baseUrlLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:ai.baseUrlDesc')}
                  </Typography>
                </Box>
                <StyledTextField
                  value={settings.ai_base_url}
                  onChange={(e) => setSettings({ ...settings, ai_base_url: e.target.value })}
                  placeholder="https://openrouter.ai/api/v1"
                  size="small"
                  sx={{ width: '350px' }}
                />
              </SettingRow>

              <SettingRow>
                <Box sx={{ flex: 1, mr: 2 }}>
                  <Typography variant="body1">{t('settings:ai.apiKeyLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:ai.apiKeyDesc')}
                  </Typography>
                </Box>
                <StyledTextField
                  type="password"
                  value={settings.ai_api_key}
                  onChange={(e) => setSettings({ ...settings, ai_api_key: e.target.value })}
                  placeholder={settings.ai_api_key ? '••••••••••••••••' : t('settings:ai.apiKeyPlaceholder')}
                  size="small"
                  sx={{ width: '350px' }}
                />
              </SettingRow>

              <SettingRow>
                <Box sx={{ flex: 1, mr: 2 }}>
                  <Typography variant="body1">{t('settings:ai.modelLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:ai.modelDescPrefix')} <code>google/gemini-2.5-flash</code>,{' '}
                    <code>openai/gpt-4o-mini</code>, <code>anthropic/claude-3.5-sonnet</code>
                  </Typography>
                </Box>
                <StyledTextField
                  value={settings.ai_model}
                  onChange={(e) => setSettings({ ...settings, ai_model: e.target.value })}
                  placeholder="google/gemini-2.5-flash"
                  size="small"
                  sx={{ width: '350px' }}
                />
              </SettingRow>
            </SettingSection>

            {/* WhatsApp Daily Summary */}
            <SettingSection>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <AutoAwesomeIcon sx={{ color: '#10b981' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {t('settings:whatsapp.section')}
                </Typography>

                {/* Status Indicator */}
                {whatsappStatus.status && (
                  <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: whatsappStatus.status === 'READY' || whatsappStatus.status === 'AUTHENTICATED' ? '#10b981' :
                        whatsappStatus.status === 'DISCONNECTED' ? '#ef4444' : '#f59e0b',
                      boxShadow: `0 0 8px ${whatsappStatus.status === 'READY' || whatsappStatus.status === 'AUTHENTICATED' ? '#10b981' :
                        whatsappStatus.status === 'DISCONNECTED' ? '#ef4444' : '#f59e0b'}`
                    }} />
                    <Typography variant="caption" sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>
                      {whatsappStatus.status}
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* Transport selector — pick legacy whatsapp-web.js or Baileys */}
              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:whatsapp.transportLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:whatsapp.transportDesc')}
                  </Typography>
                </Box>
                <StyledSelect
                  value={settings.whatsapp_transport}
                  onChange={(e) => handleTransportChange(e.target.value as 'web' | 'baileys')}
                  size="small"
                  sx={{ width: 220 }}
                >
                  <MenuItem value="web">{t('settings:whatsapp.transportWeb')}</MenuItem>
                  <MenuItem value="baileys">{t('settings:whatsapp.transportBaileys')}</MenuItem>
                </StyledSelect>
              </SettingRow>

              {/* QR Code Section */}
              {whatsappStatus.status === 'QR_READY' && whatsappStatus.qr && (
                <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', p: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)', borderRadius: 2 }}>
                  <Typography variant="body2" sx={{ mb: 2, textAlign: 'center' }}>
                    {t('settings:whatsapp.scanInstruction')}
                  </Typography>
                  <Box sx={{ p: 2, bgcolor: 'white', borderRadius: 2 }}>
                    <QRCode value={whatsappStatus.qr} size={200} />
                  </Box>
                </Box>
              )}

              {/* Disconnected - Show Generate QR Code button */}
              {whatsappStatus.status === 'DISCONNECTED' && (
                <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => handleWhatsAppAction('connect')}
                    startIcon={<SyncIcon />}
                    sx={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                      },
                    }}
                  >
                    {t('settings:whatsapp.generateQr')}
                  </Button>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary, textAlign: 'center' }}>
                    {t('settings:whatsapp.generateQrHelp')}
                  </Typography>
                </Box>
              )}

              {/* Initializing - Show loading state */}
              {whatsappStatus.status === 'INITIALIZING' && (
                <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={20} sx={{ color: '#f59e0b' }} />
                    <Typography variant="body2" sx={{ color: '#f59e0b' }}>
                      {t('settings:whatsapp.generatingQr')}
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:whatsapp.generatingQrHelp')}
                  </Typography>
                </Box>
              )}

              {/* Connected Controls */}
              {(whatsappStatus.status === 'READY' || whatsappStatus.status === 'AUTHENTICATED') && (
                <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleWhatsAppAction('renewQr')}
                      startIcon={<SyncIcon />}
                      sx={{
                        borderColor: '#f59e0b',
                        color: '#f59e0b',
                        '&:hover': {
                          borderColor: '#d97706',
                          backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        },
                      }}
                    >
                      {t('settings:whatsapp.renewQr')}
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => handleWhatsAppAction('disconnect')}
                    >
                      {t('settings:whatsapp.disconnect')}
                    </Button>
                  </Box>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary, textAlign: 'center' }}>
                    {t('settings:whatsapp.renewHelp')}
                  </Typography>
                </Box>
              )}

              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:whatsapp.enableLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:whatsapp.enableDesc')}
                  </Typography>
                </Box>
                <Switch
                  checked={settings.whatsapp_enabled}
                  onChange={(e) => setSettings({ ...settings, whatsapp_enabled: e.target.checked })}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': {
                      color: '#10b981',
                    },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                      backgroundColor: '#10b981',
                    },
                  }}
                />
              </SettingRow>

              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:whatsapp.notifyRestartLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:whatsapp.notifyRestartDesc')}
                  </Typography>
                </Box>
                <Switch
                  checked={settings.whatsapp_notify_on_restart}
                  onChange={(e) => setSettings({ ...settings, whatsapp_notify_on_restart: e.target.checked })}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': {
                      color: '#10b981',
                    },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                      backgroundColor: '#10b981',
                    },
                  }}
                />
              </SettingRow>


              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:whatsapp.modeLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:whatsapp.modeDesc')}
                  </Typography>
                </Box>
                <StyledSelect
                  value={settings.whatsapp_summary_mode}
                  onChange={(e) => setSettings({ ...settings, whatsapp_summary_mode: e.target.value as 'calendar' | 'cycle' })}
                  size="small"
                  sx={{ width: 220 }}
                >
                  <MenuItem value="calendar">{t('settings:whatsapp.modeCalendar')}</MenuItem>
                  <MenuItem value="cycle">{t('settings:whatsapp.modeCycle', { day: settings.billing_cycle_start_day })}</MenuItem>
                </StyledSelect>
              </SettingRow>



              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:whatsapp.hourLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:whatsapp.hourDesc')}
                  </Typography>
                </Box>
                <StyledTextField
                  type="number"
                  value={settings.whatsapp_hour}
                  onChange={(e) => setSettings({ ...settings, whatsapp_hour: parseInt(e.target.value) || 8 })}
                  size="small"
                  sx={{ width: '100px' }}
                  inputProps={{ min: 0, max: 23 }}
                />
              </SettingRow>







              <SettingRow sx={{ alignItems: 'flex-start' }}>
                <Box sx={{ flex: 1, mr: 2, pt: 1 }}>
                  <Typography variant="body1">{t('settings:whatsapp.recipientsLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:whatsapp.recipientsDescNumbers')}<br />
                    {t('settings:whatsapp.recipientsDescGroups')}<br />
                    <span style={{ fontStyle: 'italic', fontSize: '0.75rem', opacity: 0.8 }}>{t('settings:whatsapp.recipientsDescHint')}</span>
                  </Typography>
                </Box>
                <Box sx={{ width: '450px' }}>
                  <StyledAutocomplete
                    multiple
                    freeSolo
                    options={[]} // No pre-defined options
                    value={(settings.whatsapp_to || '').split(',').map(s => s.trim()).filter(Boolean)}
                    onChange={(_, newValue) => {
                      const tags = newValue as string[];
                      setSettings({ ...settings, whatsapp_to: tags.join(',') });
                    }}
                    renderTags={(value: unknown[], getTagProps) =>
                      (value as string[]).map((option: string, index: number) => {
                        const { key, ...tagProps } = getTagProps({ index });
                        return (
                          <Chip
                            key={key}
                            label={option}
                            {...tagProps}
                            deleteIcon={<CloseIcon />}
                          />
                        );
                      })
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder={settings.whatsapp_to ? "" : t('settings:whatsapp.recipientsPlaceholder')}
                        size="small"
                      />
                    )}
                  />
                </Box>
              </SettingRow>



              {/* Test Message Button */}
              <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid rgba(148, 163, 184, 0.2)' }}>
                <Button
                  variant="contained"
                  startIcon={testingWhatsApp ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
                  onClick={handleTestWhatsApp}
                  disabled={testingWhatsApp || !settings.whatsapp_to}
                  sx={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                    },
                    '&:disabled': {
                      background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                      color: theme.palette.text.disabled
                    }
                  }}
                >
                  {testingWhatsApp ? t('common:status.sending') : t('settings:whatsapp.test')}
                </Button>
                <Typography variant="caption" sx={{ display: 'block', mt: 1, color: theme.palette.text.secondary }}>
                  {t('settings:whatsapp.testHelp')}
                </Typography>
              </Box>

              {/* Test Result Display */}
              {whatsappTestResult && (
                <Box sx={{ mt: 2 }}>
                  <Alert
                    severity={whatsappTestResult.success ? 'success' : 'error'}
                    icon={whatsappTestResult.success ? <CheckCircleIcon /> : <ErrorIcon />}
                    sx={{ mb: 2 }}
                  >
                    {whatsappTestResult.success
                      ? t('settings:whatsapp.testSuccess')
                      : `${t('settings:whatsapp.testFailedPrefix')} ${whatsappTestResult.error}`}
                  </Alert>

                  {whatsappTestResult.message && (
                    <Box sx={{
                      p: 2,
                      borderRadius: '8px',
                      background: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)',
                      border: `1px solid ${theme.palette.divider}`,
                      maxHeight: '300px',
                      overflow: 'auto'
                    }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: '#10b981' }}>
                        {t('settings:whatsapp.generatedMessage')}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          color: theme.palette.text.secondary
                        }}
                      >
                        {whatsappTestResult.message}
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
            </SettingSection>

            {/* Telegram */}
            <SettingSection>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <SendIcon sx={{ color: '#0088cc' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {t('settings:telegram.section')}
                </Typography>
              </Box>

              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:telegram.enableLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:telegram.enableDesc')}
                  </Typography>
                </Box>
                <Switch
                  checked={settings.telegram_enabled}
                  onChange={(e) => setSettings({ ...settings, telegram_enabled: e.target.checked })}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': { color: '#0088cc' },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#0088cc' },
                  }}
                />
              </SettingRow>

              <SettingRow>
                <Box>
                  <Typography variant="body1">{t('settings:telegram.notifyRestartLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:telegram.notifyRestartDesc')}
                  </Typography>
                </Box>
                <Switch
                  checked={settings.telegram_notify_on_restart}
                  onChange={(e) => setSettings({ ...settings, telegram_notify_on_restart: e.target.checked })}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': { color: '#0088cc' },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#0088cc' },
                  }}
                />
              </SettingRow>

              <SettingRow sx={{ alignItems: 'flex-start' }}>
                <Box sx={{ flex: 1, mr: 2, pt: 1 }}>
                  <Typography variant="body1">{t('settings:telegram.tokenLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:telegram.tokenDesc')}
                  </Typography>
                </Box>
                <Box sx={{ width: '450px' }}>
                  <StyledTextField
                    fullWidth
                    type="password"
                    autoComplete="new-password"
                    value={settings.telegram_bot_token}
                    onChange={(e) => setSettings({ ...settings, telegram_bot_token: e.target.value })}
                    placeholder={t('settings:telegram.tokenPlaceholder')}
                    size="small"
                  />
                </Box>
              </SettingRow>

              <SettingRow sx={{ alignItems: 'flex-start' }}>
                <Box sx={{ flex: 1, mr: 2, pt: 1 }}>
                  <Typography variant="body1">{t('settings:telegram.recipientsLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:telegram.recipientsDesc')}<br />
                    <span style={{ fontStyle: 'italic', fontSize: '0.75rem', opacity: 0.8 }}>
                      {t('settings:telegram.recipientsHint')}
                    </span>
                  </Typography>
                </Box>
                <Box sx={{ width: '450px' }}>
                  <StyledAutocomplete
                    multiple
                    freeSolo
                    options={[]}
                    value={(settings.telegram_to || '').split(',').map(s => s.trim()).filter(Boolean)}
                    onChange={(_, newValue) => {
                      const tags = newValue as string[];
                      setSettings({ ...settings, telegram_to: tags.join(',') });
                    }}
                    renderTags={(value: unknown[], getTagProps) =>
                      (value as string[]).map((option: string, index: number) => {
                        const { key, ...tagProps } = getTagProps({ index });
                        return (
                          <Chip key={key} label={option} {...tagProps} deleteIcon={<CloseIcon />} />
                        );
                      })
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder={settings.telegram_to ? '' : t('settings:telegram.recipientsPlaceholder')}
                        size="small"
                      />
                    )}
                  />
                </Box>
              </SettingRow>

              <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid rgba(148, 163, 184, 0.2)', display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  onClick={() => handleTestTelegram('verify')}
                  disabled={testingTelegram || !settings.telegram_bot_token}
                  startIcon={testingTelegram ? <CircularProgress size={20} /> : null}
                  sx={{ borderColor: '#0088cc', color: '#0088cc' }}
                >
                  {t('settings:telegram.verifyToken')}
                </Button>
                <Button
                  variant="contained"
                  startIcon={testingTelegram ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
                  onClick={() => handleTestTelegram('send')}
                  disabled={testingTelegram || !settings.telegram_bot_token || !settings.telegram_to}
                  sx={{
                    background: 'linear-gradient(135deg, #0088cc 0%, #0066aa 100%)',
                    '&:hover': { background: 'linear-gradient(135deg, #0066aa 0%, #004488 100%)' },
                  }}
                >
                  {t('settings:telegram.sendTest')}
                </Button>
              </Box>
              <Typography variant="caption" sx={{ display: 'block', mt: 1, color: theme.palette.text.secondary }}>
                {t('settings:telegram.testHelp')}
              </Typography>

              {telegramTestResult && (
                <Box sx={{ mt: 2 }}>
                  <Alert
                    severity={telegramTestResult.success ? 'success' : 'error'}
                    icon={telegramTestResult.success ? <CheckCircleIcon /> : <ErrorIcon />}
                  >
                    {telegramTestResult.success
                      ? telegramTestResult.info || t('settings:telegram.testSuccess')
                      : `${t('settings:telegram.testFailedPrefix')} ${telegramTestResult.error}`}
                  </Alert>
                </Box>
              )}
            </SettingSection>

            {/* Vault Settings */}
            <SettingSection>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <LockIcon sx={{ color: '#818cf8' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {t('settings:vault.section')}
                </Typography>
              </Box>

              {securityResult && (
                <Alert
                  severity={securityResult.type}
                  sx={{ mb: 2 }}
                  onClose={() => setSecurityResult(null)}
                >
                  {securityResult.message}
                </Alert>
              )}

              <SettingRow sx={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="body1">{t('settings:vault.passkeyLabel')}</Typography>
                    <Typography variant="caption" sx={{ color: 'var(--n-text-secondary)' }}>
                      {supportsWebAuthn
                        ? t('settings:vault.passkeySupported')
                        : t('settings:vault.passkeyUnsupported')}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {isVaultLocked ? (
                      <Typography variant="caption" sx={{ color: 'var(--n-error)', fontWeight: 600 }}>
                        {t('settings:vault.unlockToManage')}
                      </Typography>
                    ) : !supportsWebAuthn ? (
                      <Typography variant="caption" sx={{ color: 'var(--n-text-tertiary)', fontWeight: 600 }}>
                        {t('settings:vault.notAvailable')}
                      </Typography>
                    ) : !showPasskeyRegister ? (
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<FingerprintIcon />}
                        onClick={() => setShowPasskeyRegister(true)}
                        sx={{
                          background: 'linear-gradient(135deg, var(--n-primary-500) 0%, var(--n-primary-600) 100%)',
                          '&:hover': {
                            background: 'linear-gradient(135deg, var(--n-primary-600) 0%, var(--n-primary-700) 100%)',
                          },
                        }}
                      >
                        {t('settings:vault.registerPasskey')}
                      </Button>
                    ) : null}
                  </Box>
                </Box>
                {showPasskeyRegister && !isVaultLocked && (
                  <Box sx={{ display: 'flex', gap: 1, mt: 2, alignItems: 'center' }}>
                    <StyledTextField
                      type="password"
                      label={t('settings:vault.vaultPassphrase')}
                      placeholder={t('settings:vault.passphrasePlaceholder')}
                      value={passkeyRegPass}
                      onChange={(e) => setPasskeyRegPass(e.target.value)}
                      size="small"
                      disabled={registeringPasskey}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && passkeyRegPass) {
                          e.preventDefault();
                          (e.target as HTMLInputElement).closest('form')?.requestSubmit();
                        }
                      }}
                      sx={{ flex: 1 }}
                    />
                    <Button
                      variant="contained"
                      size="small"
                      disabled={!passkeyRegPass || registeringPasskey}
                      onClick={async () => {
                        setRegisteringPasskey(true);
                        setSecurityResult(null);
                        const result = await startPasskeyRegistration(passkeyRegPass);
                        if (result.success) {
                          setSecurityResult({ type: 'success', message: t('settings:vault.passkeyRegisteredOk') });
                          const passkeys = await fetchPasskeys();
                          setPasskeyList(passkeys);
                          setShowPasskeyRegister(false);
                          setPasskeyRegPass('');
                        } else {
                          setSecurityResult({ type: 'error', message: t('settings:vault.passkeyRegisterFail', { error: result.error || '' }) });
                        }
                        setRegisteringPasskey(false);
                      }}
                      sx={{
                        background: 'linear-gradient(135deg, var(--n-primary-500) 0%, var(--n-primary-600) 100%)',
                        '&:hover': {
                          background: 'linear-gradient(135deg, var(--n-primary-600) 0%, var(--n-primary-700) 100%)',
                        },
                        minWidth: 'auto',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {registeringPasskey ? <CircularProgress size={20} color="inherit" /> : t('common:actions.confirm')}
                    </Button>
                    <Button
                      variant="text"
                      size="small"
                      disabled={registeringPasskey}
                      onClick={() => { setShowPasskeyRegister(false); setPasskeyRegPass(''); }}
                      sx={{ color: 'var(--n-text-secondary)', minWidth: 'auto' }}
                    >
                      {t('common:actions.cancel')}
                    </Button>
                  </Box>
                )}
              </SettingRow>

              {/* Registered Passkeys List */}
              <SettingRow sx={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Box>
                    <Typography variant="body1">{t('settings:vault.registeredPasskeys', { count: passkeysCount })}</Typography>
                    <Typography variant="caption" sx={{ color: 'var(--n-text-secondary)' }}>
                      {t('settings:vault.registeredPasskeysDesc')}
                    </Typography>
                  </Box>
                  {!isVaultLocked && passkeyList.length === 0 && !loadingPasskeys && (
                    <Button
                      variant="text"
                      size="small"
                      onClick={async () => {
                        setLoadingPasskeys(true);
                        const passkeys = await fetchPasskeys();
                        setPasskeyList(passkeys);
                        setLoadingPasskeys(false);
                      }}
                    >
                      {t('common:actions.load')}
                    </Button>
                  )}
                </Box>

                {loadingPasskeys && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size={24} />
                  </Box>
                )}

                {passkeyList.length > 0 && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {passkeyList.map((pk) => (
                      <Box
                        key={pk.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          p: 1.5,
                          borderRadius: 'var(--n-radius-md)',
                          border: '1px solid var(--n-border)',
                          backgroundColor: 'var(--n-bg-surface-alt)',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <FingerprintIcon sx={{ color: 'var(--n-primary-500)', fontSize: 20 }} />
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {t('settings:vault.passkeyItem', { id: pk.id })}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'var(--n-text-secondary)' }}>
                              {t('settings:vault.registeredOn', { date: new Date(pk.createdAt).toLocaleDateString(locale === 'he' ? 'he-IL' : undefined) })}
                            </Typography>
                          </Box>
                        </Box>
                        <Button
                          variant="outlined"
                          size="small"
                          color="error"
                          disabled={deletingPasskeyId === pk.id || isVaultLocked}
                          onClick={async () => {
                            setDeletingPasskeyId(pk.id);
                            const result = await deletePasskey(pk.id);
                            if (result.success) {
                              setPasskeyList(prev => prev.filter(p => p.id !== pk.id));
                              setSecurityResult({ type: 'success', message: t('settings:vault.passkeyDeletedOk') });
                            } else {
                              setSecurityResult({ type: 'error', message: result.error || t('settings:vault.passkeyDeleteFail') });
                            }
                            setDeletingPasskeyId(null);
                          }}
                          sx={{ minWidth: 'auto', px: 1.5 }}
                        >
                          {deletingPasskeyId === pk.id ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon fontSize="small" />}
                        </Button>
                      </Box>
                    ))}

                    {/* Clear All button below the list */}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
                      {!clearPasskeyConfirm ? (
                        <Button
                          variant="text"
                          size="small"
                          color="error"
                          startIcon={<DeleteIcon />}
                          onClick={() => setClearPasskeyConfirm(true)}
                          disabled={clearingPasskeys || isVaultLocked}
                        >
                          {t('common:actions.clearAll')}
                        </Button>
                      ) : (
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button
                            variant="contained"
                            size="small"
                            color="error"
                            disabled={clearingPasskeys}
                            onClick={async () => {
                              setClearingPasskeys(true);
                              const result = await clearPasskeys();
                              if (result.success) {
                                setPasskeyList([]);
                                setSecurityResult({ type: 'success', message: t('settings:vault.passkeysClearedOk', { count: result.cleared || 0 }) });
                              } else {
                                setSecurityResult({ type: 'error', message: result.error || t('settings:vault.passkeysClearFail') });
                              }
                              setClearingPasskeys(false);
                              setClearPasskeyConfirm(false);
                            }}
                          >
                            {clearingPasskeys ? <CircularProgress size={20} color="inherit" /> : t('settings:vault.confirmClearAll')}
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => setClearPasskeyConfirm(false)}
                            disabled={clearingPasskeys}
                          >
                            {t('common:actions.cancel')}
                          </Button>
                        </Box>
                      )}
                    </Box>
                  </Box>
                )}

                {!isVaultLocked && passkeyList.length === 0 && !loadingPasskeys && passkeysCount === 0 && supportsWebAuthn && (
                  <Typography variant="caption" sx={{ color: 'var(--n-text-muted)', fontStyle: 'italic' }}>
                    {t('settings:vault.noPasskeys')}
                  </Typography>
                )}
              </SettingRow>

              {/* Change Passphrase */}
              <SettingRow sx={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <Box>
                    <Typography variant="body1">{t('settings:vault.changePassphrase')}</Typography>
                    <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                      {t('settings:vault.changePassphraseDesc')}
                    </Typography>
                  </Box>
                  <Box>
                    {!isVaultLocked ? (
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<VpnKeyIcon />}
                        onClick={() => {
                          setShowChangePassphrase(!showChangePassphrase);
                          setCurrentPass('');
                          setNewPass('');
                          setConfirmNewPass('');
                        }}
                        sx={{
                          borderColor: '#818cf8',
                          color: '#818cf8',
                          '&:hover': {
                            borderColor: '#6366f1',
                            backgroundColor: 'rgba(99, 102, 241, 0.1)',
                          },
                        }}
                      >
                        {showChangePassphrase ? t('common:actions.cancel') : t('settings:vault.change')}
                      </Button>
                    ) : (
                      <Typography variant="caption" sx={{ color: '#f87171', fontWeight: 600 }}>
                        {t('settings:vault.unlockFirst')}
                      </Typography>
                    )}
                  </Box>
                </Box>
                {showChangePassphrase && (
                  <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <StyledTextField
                      type="password"
                      label={t('settings:vault.currentPassphrase')}
                      value={currentPass}
                      onChange={(e) => setCurrentPass(e.target.value)}
                      size="small"
                      fullWidth
                      disabled={changingPassphrase}
                    />
                    <StyledTextField
                      type="password"
                      label={t('settings:vault.newPassphrase')}
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      size="small"
                      fullWidth
                      disabled={changingPassphrase}
                      helperText={t('settings:vault.newPassphraseHelp')}
                    />
                    <StyledTextField
                      type="password"
                      label={t('settings:vault.confirmNewPassphrase')}
                      value={confirmNewPass}
                      onChange={(e) => setConfirmNewPass(e.target.value)}
                      size="small"
                      fullWidth
                      disabled={changingPassphrase}
                    />
                    <Button
                      variant="contained"
                      disabled={changingPassphrase || !currentPass || !newPass || !confirmNewPass || newPass !== confirmNewPass || newPass.length < 8}
                      onClick={async () => {
                        if (newPass !== confirmNewPass) {
                          setSecurityResult({ type: 'error', message: t('settings:vault.passphrasesMismatch') });
                          return;
                        }
                        setChangingPassphrase(true);
                        const result = await changePassphrase(currentPass, newPass);
                        if (result.success) {
                          setSecurityResult({
                            type: 'success',
                            message: result.passkeysCleared
                              ? t('settings:vault.passphraseChangedWithCleared', { count: result.passkeysCleared })
                              : t('settings:vault.passphraseChangedOk'),
                          });
                          setShowChangePassphrase(false);
                          setCurrentPass('');
                          setNewPass('');
                          setConfirmNewPass('');
                        } else {
                          setSecurityResult({ type: 'error', message: result.error || t('settings:vault.passphraseChangeFail') });
                        }
                        setChangingPassphrase(false);
                      }}
                      sx={{
                        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                        },
                        alignSelf: 'flex-start',
                      }}
                    >
                      {changingPassphrase ? <CircularProgress size={20} color="inherit" /> : t('settings:vault.updatePassphrase')}
                    </Button>
                  </Box>
                )}
              </SettingRow>
            </SettingSection>

            {/* Danger Zone */}
            <SettingSection sx={{
              borderColor: theme.palette.error.main,
              background: theme.palette.mode === 'dark'
                ? 'rgba(239, 68, 68, 0.1)'
                : 'rgba(239, 68, 68, 0.05)'
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <WarningAmberIcon sx={{ color: theme.palette.error.main }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.palette.error.main }}>
                  {t('settings:danger.section')}
                </Typography>
              </Box>



              <SettingRow>
                <Box sx={{ flex: 1, mr: 2 }}>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>{t('settings:danger.deleteAllLabel')}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t('settings:danger.deleteAllDesc')}
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  onClick={() => setDeleteDialogOpen(true)}
                  sx={{
                    borderColor: theme.palette.error.main,
                    color: theme.palette.error.main,
                    '&:hover': {
                      borderColor: theme.palette.error.dark,
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    },
                  }}
                >
                  {t('common:actions.deleteAll')}
                </Button>
              </SettingRow>
            </SettingSection>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{
        borderTop: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : theme.palette.divider}`,
        p: 2.5,
        px: 3,
        justifyContent: 'space-between',
        alignItems: 'center',
        background: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.2)' : 'transparent'
      }}>
        <Typography variant="caption" sx={{ color: theme.palette.text.disabled, fontSize: '11px' }}>
          v{packageJson.version}
        </Typography>
        <Button
          onClick={handleClose}
          variant="outlined"
          sx={{ borderColor: theme.palette.divider, color: theme.palette.text.secondary }}
        >
          {t('common:actions.close')}
        </Button>
      </DialogActions>

      <DeleteAllTransactionsDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onSuccess={() => {
          setResult({ type: 'success', message: t('settings:danger.deletedOk') });
          window.dispatchEvent(new CustomEvent('dataRefresh'));
        }}
      />

      <ScreenshotViewer
        open={screenshotViewerOpen}
        onClose={() => setScreenshotViewerOpen(false)}
      />
    </StyledDialog>
  );
};

export default SettingsModal;
