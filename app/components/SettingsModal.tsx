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
import ScreenshotViewer from './ScreenshotViewer';
import ImageIcon from '@mui/icons-material/Image';
import BugReportIcon from '@mui/icons-material/BugReport';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import { msToSeconds, secondsToMs } from '../utils/settings-utils';
import { QRCodeSVG as QRCode } from 'qrcode.react';

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
  gemini_api_key: string;
  gemini_model: string;
  isracard_scrape_categories: boolean;
  whatsapp_enabled: boolean;
  whatsapp_hour: number;
  whatsapp_to: string;
  whatsapp_summary_mode: 'calendar' | 'cycle';

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
    gemini_api_key: '',
    gemini_model: 'gemini-2.5-flash',
    isracard_scrape_categories: true,
    whatsapp_enabled: false,
    whatsapp_hour: 8,
    whatsapp_to: '',
    whatsapp_summary_mode: 'calendar',

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
          gemini_api_key: (data.settings.gemini_api_key || '').replace(/"/g, ''),
          gemini_model: (data.settings.gemini_model || 'gemini-2.5-flash').replace(/"/g, ''),
          isracard_scrape_categories: data.settings.isracard_scrape_categories === undefined
            ? true // Default to true
            : parseBool(data.settings.isracard_scrape_categories),
          whatsapp_enabled: parseBool(data.settings.whatsapp_enabled),
          whatsapp_hour: parseInt(data.settings.whatsapp_hour) || 8,
          whatsapp_to: (data.settings.whatsapp_to || '').replace(/"/g, ''),
          whatsapp_summary_mode: (data.settings.whatsapp_summary_mode || 'calendar').replace(/"/g, '') as 'calendar' | 'cycle',

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
      setResult({ type: 'error', message: 'Failed to auto-save settings' });
    } finally {
      setSaving(false);
    }
  }, [settings]);

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
            App Settings
          </Typography>
          {saving && (
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary, ml: 1, fontStyle: 'italic' }}>
              Saving...
            </Typography>
          )}
          {!saving && originalSettings && JSON.stringify(settings) === JSON.stringify(originalSettings) && (
            <Typography variant="caption" sx={{ color: '#22c55e', ml: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CheckCircleIcon sx={{ fontSize: '14px' }} /> Saved
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

            {/* Sync Settings */}
            <SettingSection>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <SyncIcon sx={{ color: '#22c55e' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Sync Configuration
                </Typography>
              </Box>



              <SettingRow>
                <Box>
                  <Typography variant="body1">Enable Auto Sync</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Automatically sync transactions in the background
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
                  <Typography variant="body1">Sync at Hour</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Hour of the day to trigger background sync (0-23)
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
                  <Typography variant="body1">Days to Sync Back</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Number of days to fetch when syncing
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
                  Display Preferences
                </Typography>
              </Box>



              <SettingRow>
                <Box>
                  <Typography variant="body1">Default Currency</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Currency symbol for transactions
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
                  <Typography variant="body1">Date Format</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    How dates are displayed
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
                  <Typography variant="body1">Billing Cycle Start Day</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Day of month when credit card billing cycle starts
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
                  Scraper Configuration
                </Typography>
              </Box>









              {/* Added: Update Categories on Re-Scrape Setting */}


              <SettingRow>
                <Box>
                  <Typography variant="body1">Update Categories on Re-Scrape</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    If an existing transaction has a new category from the bank, update it.
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
                  <Typography variant="body1">Scrape Failure Retries</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Number of times to retry if scraping fails (default: 3)
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
                  <Typography variant="body1">Scraper Timeout (seconds)</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Maximum duration for scraping operations (default: 90 seconds)
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
                  <Typography variant="body1">Log HTTP Requests</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Output all HTTP requests from the scraper to the console (useful for debugging).
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
                  Vendor Specific Features
                </Typography>
              </Box>

              <SettingRow>
                <Box>
                  <Typography variant="body1">Scrape Isracard Categories</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Fetch categories from Isracard/Amex API (slower, but provides bank categorization).
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
                  Debugging Tools
                </Typography>
              </Box>

              <SettingRow>
                <Box>
                  <Typography variant="body1">Puppeteer Screenshots</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    View captured screenshots from scraper sessions
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<ImageIcon />}
                  onClick={() => setScreenshotViewerOpen(true)}
                  sx={{ borderColor: theme.palette.divider, color: theme.palette.text.primary }}
                >
                  View Screenshots
                </Button>
              </SettingRow>
            </SettingSection>

            {/* AI Configuration */}
            <SettingSection>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <AutoAwesomeIcon sx={{ color: '#ec4899' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  AI Configuration
                </Typography>
              </Box>



              <SettingRow>
                <Box sx={{ flex: 1, mr: 2 }}>
                  <Typography variant="body1">Gemini API Key</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Used for AI Assistant and smart transaction analysis.
                  </Typography>
                </Box>
                <StyledTextField
                  type="password"
                  value={settings.gemini_api_key}
                  onChange={(e) => setSettings({ ...settings, gemini_api_key: e.target.value })}
                  placeholder={settings.gemini_api_key ? '••••••••••••••••' : 'Enter API Key'}
                  size="small"
                  sx={{ width: '250px' }}
                />
              </SettingRow>



              <SettingRow>
                <Box sx={{ flex: 1, mr: 2 }}>
                  <Typography variant="body1">Gemini Model</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    AI model to use for chat and summaries
                  </Typography>
                </Box>
                <StyledSelect
                  value={settings.gemini_model}
                  onChange={(e) => setSettings({ ...settings, gemini_model: e.target.value as string })}
                  size="small"
                  sx={{ width: 250 }}
                >
                  <MenuItem value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended)</MenuItem>
                  <MenuItem value="gemini-3-flash-preview">Gemini 3 Flash (Limited)</MenuItem>
                  <MenuItem value="gemini-3-pro-preview">Gemini 3 Pro (Limited)</MenuItem>
                </StyledSelect>
              </SettingRow>
            </SettingSection>

            {/* WhatsApp Daily Summary */}
            <SettingSection>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <AutoAwesomeIcon sx={{ color: '#10b981' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  WhatsApp Daily Summary
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

              {/* QR Code Section */}
              {whatsappStatus.status === 'QR_READY' && whatsappStatus.qr && (
                <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', p: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)', borderRadius: 2 }}>
                  <Typography variant="body2" sx={{ mb: 2, textAlign: 'center' }}>
                    Scan this QR code with WhatsApp (Settings {'>'} Linked Devices)
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
                    Generate QR Code
                  </Button>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary, textAlign: 'center' }}>
                    Click to start WhatsApp connection and generate QR code
                  </Typography>
                </Box>
              )}

              {/* Initializing - Show loading state */}
              {whatsappStatus.status === 'INITIALIZING' && (
                <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={20} sx={{ color: '#f59e0b' }} />
                    <Typography variant="body2" sx={{ color: '#f59e0b' }}>
                      Generating QR Code...
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Please wait, this may take a few seconds
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
                      Renew QR Code
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => handleWhatsAppAction('disconnect')}
                    >
                      Disconnect Session
                    </Button>
                  </Box>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary, textAlign: 'center' }}>
                    Renew QR to link a different WhatsApp account or fix connection issues
                  </Typography>
                </Box>
              )}

              <SettingRow>
                <Box>
                  <Typography variant="body1">Enable Daily Summary</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Send a daily financial summary via WhatsApp
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
                  <Typography variant="body1">Summary Mode</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Time period to cover in the summary
                  </Typography>
                </Box>
                <StyledSelect
                  value={settings.whatsapp_summary_mode}
                  onChange={(e) => setSettings({ ...settings, whatsapp_summary_mode: e.target.value as 'calendar' | 'cycle' })}
                  size="small"
                  sx={{ width: 220 }}
                >
                  <MenuItem value="calendar">Calendar Month (1st-30th)</MenuItem>
                  <MenuItem value="cycle">Billing Cycle (from {settings.billing_cycle_start_day}th)</MenuItem>
                </StyledSelect>
              </SettingRow>



              <SettingRow>
                <Box>
                  <Typography variant="body1">Send at Hour</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Hour of the day to send summary (0-23)
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
                  <Typography variant="body1">Recipients</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Numbers: 972501234567<br />
                    Groups: 120363024523351234@g.us<br />
                    <span style={{ fontStyle: 'italic', fontSize: '0.75rem', opacity: 0.8 }}>Press Enter or tab to add a recipient</span>
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
                        placeholder={settings.whatsapp_to ? "" : "Enter number or group ID"}
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
                  {testingWhatsApp ? 'Sending...' : 'Test & Send Message'}
                </Button>
                <Typography variant="caption" sx={{ display: 'block', mt: 1, color: theme.palette.text.secondary }}>
                  This will generate a daily summary and send it to your WhatsApp now
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
                      ? '✅ Message sent successfully!'
                      : `❌ Failed: ${whatsappTestResult.error}`}
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
                        📝 Generated Message:
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
                  Danger Zone
                </Typography>
              </Box>



              <SettingRow>
                <Box sx={{ flex: 1, mr: 2 }}>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>Delete All Transactions</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Permanently delete all transactions from the database. This action cannot be undone.
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
                  Delete All
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
          Close
        </Button>
      </DialogActions>

      <DeleteAllTransactionsDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onSuccess={() => {
          setResult({ type: 'success', message: 'All transactions deleted successfully' });
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
