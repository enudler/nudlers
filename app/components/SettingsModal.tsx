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
  Chip,
  Select,
  MenuItem
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
  show_browser: boolean;
  fetch_categories_from_scrapers: boolean;
  scraper_timeout_standard: number;
  scraper_timeout_rate_limited: number;
  fallback_no_category_on_error: boolean;
  update_category_on_rescrape: boolean;
  scrape_retries: number;
  gemini_api_key: string;
  gemini_model: string;
  whatsapp_enabled: boolean;
  whatsapp_hour: number;
  whatsapp_twilio_sid: string;
  whatsapp_twilio_auth_token: string;
  whatsapp_twilio_from: string;
  whatsapp_to: string;
  whatsapp_summary_mode: 'calendar' | 'cycle';
}

const StyledDialog = styled(Dialog)(({ theme }) => ({
  '& .MuiDialog-paper': {
    background: theme.palette.mode === 'dark'
      ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)'
      : 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(20px)',
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: '16px',
    color: theme.palette.text.primary,
    minWidth: '500px',
    maxHeight: '90vh'
  }
}));

const SettingSection = styled(Box)(({ theme }) => ({
  padding: '20px',
  borderRadius: '12px',
  border: `1px solid ${theme.palette.divider}`,
  background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.5)' : 'rgba(241, 245, 249, 0.6)',
  marginBottom: '16px'
}));

const SettingRow = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 0',
  '&:not(:last-child)': {
    borderBottom: '1px solid rgba(148, 163, 184, 0.1)'
  }
}));

const StyledTextField = styled(TextField)(({ theme }) => ({
  '& .MuiOutlinedInput-root': {
    color: theme.palette.text.primary,
    '& fieldset': {
      borderColor: theme.palette.divider,
    },
    '&:hover fieldset': {
      borderColor: theme.palette.primary.main,
    },
    '&.Mui-focused fieldset': {
      borderColor: theme.palette.primary.main,
    },
  },
  '& .MuiInputLabel-root': {
    color: theme.palette.text.secondary,
  },
  '& .MuiInputLabel-root.Mui-focused': {
    color: theme.palette.primary.main,
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
    show_browser: false,
    fetch_categories_from_scrapers: true,
    scraper_timeout_standard: 60000,
    scraper_timeout_rate_limited: 120000,
    fallback_no_category_on_error: false,
    update_category_on_rescrape: false,
    scrape_retries: 3,
    gemini_api_key: '',
    gemini_model: 'gemini-2.5-flash',
    whatsapp_enabled: false,
    whatsapp_hour: 8,
    whatsapp_twilio_sid: '',
    whatsapp_twilio_auth_token: '',
    whatsapp_twilio_from: '',
    whatsapp_to: '',
    whatsapp_summary_mode: 'calendar'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [originalSettings, setOriginalSettings] = useState<Settings | null>(null);

  // WhatsApp test state
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [whatsappTestResult, setWhatsappTestResult] = useState<{
    success: boolean;
    message: string | null;
    error: string | null;
  } | null>(null);

  // Delete all transactions dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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
          show_browser: parseBool(data.settings.show_browser),
          fetch_categories_from_scrapers: data.settings.fetch_categories_from_scrapers === undefined
            ? true  // Default to true if not set
            : parseBool(data.settings.fetch_categories_from_scrapers),
          scraper_timeout_standard: parseInt(data.settings.scraper_timeout_standard) || 60000,
          scraper_timeout_rate_limited: parseInt(data.settings.scraper_timeout_rate_limited) || 120000,
          fallback_no_category_on_error: parseBool(data.settings.fallback_no_category_on_error),
          update_category_on_rescrape: parseBool(data.settings.update_category_on_rescrape),
          scrape_retries: parseInt(data.settings.scrape_retries) || 3,
          gemini_api_key: (data.settings.gemini_api_key || '').replace(/"/g, ''),
          gemini_model: (data.settings.gemini_model || 'gemini-2.5-flash').replace(/"/g, ''),
          whatsapp_enabled: parseBool(data.settings.whatsapp_enabled),
          whatsapp_hour: parseInt(data.settings.whatsapp_hour) || 8,
          whatsapp_twilio_sid: (data.settings.whatsapp_twilio_sid || '').replace(/"/g, ''),
          whatsapp_twilio_auth_token: (data.settings.whatsapp_twilio_auth_token || '').replace(/"/g, ''),
          whatsapp_twilio_from: (data.settings.whatsapp_twilio_from || '').replace(/"/g, ''),
          whatsapp_to: (data.settings.whatsapp_to || '').replace(/"/g, ''),
          whatsapp_summary_mode: (data.settings.whatsapp_summary_mode || 'calendar').replace(/"/g, '') as 'calendar' | 'cycle'
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

  // Auto-save effect
  useEffect(() => {
    if (!hasInitialLoad || !originalSettings) return;

    const changed = JSON.stringify(settings) !== JSON.stringify(originalSettings);
    if (!changed) return;

    const handler = setTimeout(() => {
      handleSave();
    }, 1000); // 1s debounce

    return () => clearTimeout(handler);
  }, [settings, originalSettings, hasInitialLoad]);

  const handleSave = async () => {
    setSaving(true);
    // Silent save, only show errors if they happen
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings })
      });

      if (response.ok) {
        setOriginalSettings(settings);
      }
    } catch (error) {
      logger.error('Auto-save error', error as Error);
      setResult({ type: 'error', message: 'Failed to auto-save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  const handleTestWhatsApp = async () => {
    setTestingWhatsApp(true);
    setWhatsappTestResult(null);

    try {
      const response = await fetch('/api/whatsapp_test', {
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
        borderBottom: `1px solid ${theme.palette.divider}`,
        pb: 2
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

              <SettingRow>
                <Box>
                  <Typography variant="body1">Show Browser Window</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Display browser window during scraping (useful for debugging or entering 2FA codes). Only works when running locally, not in Docker.
                  </Typography>
                </Box>
                <Switch
                  checked={settings.show_browser}
                  onChange={(e) => setSettings({ ...settings, show_browser: e.target.checked })}
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
                  <Typography variant="body1">Category Fetching Mode</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Control how the scraper handles transaction categories.
                  </Typography>
                </Box>
                <Select
                  value={
                    !settings.fetch_categories_from_scrapers ? 'never' :
                      settings.fallback_no_category_on_error ? 'smart' : 'always'
                  }
                  onChange={(e) => {
                    const mode = e.target.value;
                    const newSettings = { ...settings };
                    if (mode === 'never') {
                      newSettings.fetch_categories_from_scrapers = false;
                      newSettings.fallback_no_category_on_error = false;
                    } else if (mode === 'smart') {
                      newSettings.fetch_categories_from_scrapers = true;
                      newSettings.fallback_no_category_on_error = true;
                    } else { // always
                      newSettings.fetch_categories_from_scrapers = true;
                      newSettings.fallback_no_category_on_error = false;
                    }
                    setSettings(newSettings);
                  }}
                  size="small"
                  sx={{ width: 200, color: theme.palette.text.primary, '.MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.divider } }}
                >
                  <MenuItem value="always">Always Fetch</MenuItem>
                  <MenuItem value="smart">Smart Fetch (Fallback on Error)</MenuItem>
                  <MenuItem value="never">Never Fetch</MenuItem>
                </Select>
              </SettingRow>

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
                  <Typography variant="body1">Standard Timeout (ms)</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Timeout for standard vendors (default: 60000ms)
                  </Typography>
                </Box>
                <StyledTextField
                  type="number"
                  value={settings.scraper_timeout_standard}
                  onChange={(e) => setSettings({ ...settings, scraper_timeout_standard: parseInt(e.target.value) || 60000 })}
                  size="small"
                  sx={{ width: '120px' }}
                  inputProps={{ min: 1000, step: 1000 }}
                />
              </SettingRow>

              <SettingRow>
                <Box>
                  <Typography variant="body1">Rate-Limited Timeout (ms)</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Timeout for rate-limited vendors (Isracard, Amex) (default: 120000ms)
                  </Typography>
                </Box>
                <StyledTextField
                  type="number"
                  value={settings.scraper_timeout_rate_limited}
                  onChange={(e) => setSettings({ ...settings, scraper_timeout_rate_limited: parseInt(e.target.value) || 120000 })}
                  size="small"
                  sx={{ width: '120px' }}
                  inputProps={{ min: 1000, step: 1000 }}
                />
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
                <Select
                  value={settings.gemini_model}
                  onChange={(e) => setSettings({ ...settings, gemini_model: e.target.value })}
                  size="small"
                  sx={{ width: 250, color: theme.palette.text.primary, '.MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.divider } }}
                >
                  <MenuItem value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended)</MenuItem>
                  <MenuItem value="gemini-3-flash-preview">Gemini 3 Flash (Limited)</MenuItem>
                  <MenuItem value="gemini-3-pro-preview">Gemini 3 Pro (Limited)</MenuItem>
                </Select>
              </SettingRow>
            </SettingSection>

            {/* WhatsApp Daily Summary */}
            <SettingSection>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <AutoAwesomeIcon sx={{ color: '#10b981' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  WhatsApp Daily Summary
                </Typography>
              </Box>

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
                <Select
                  value={settings.whatsapp_summary_mode}
                  onChange={(e) => setSettings({ ...settings, whatsapp_summary_mode: e.target.value as 'calendar' | 'cycle' })}
                  size="small"
                  sx={{ width: 220, color: theme.palette.text.primary, '.MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.divider } }}
                >
                  <MenuItem value="calendar">Calendar Month (1st-30th)</MenuItem>
                  <MenuItem value="cycle">Billing Cycle (from {settings.billing_cycle_start_day}th)</MenuItem>
                </Select>
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

              <SettingRow>
                <Box sx={{ flex: 1, mr: 2 }}>
                  <Typography variant="body1">Twilio Account SID</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Your Twilio Account SID
                  </Typography>
                </Box>
                <StyledTextField
                  type="password"
                  value={settings.whatsapp_twilio_sid}
                  onChange={(e) => setSettings({ ...settings, whatsapp_twilio_sid: e.target.value })}
                  placeholder={settings.whatsapp_twilio_sid ? '••••••••••••••••' : 'Enter SID'}
                  size="small"
                  sx={{ width: '250px' }}
                />
              </SettingRow>

              <SettingRow>
                <Box sx={{ flex: 1, mr: 2 }}>
                  <Typography variant="body1">Twilio Auth Token</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Your Twilio Auth Token
                  </Typography>
                </Box>
                <StyledTextField
                  type="password"
                  value={settings.whatsapp_twilio_auth_token}
                  onChange={(e) => setSettings({ ...settings, whatsapp_twilio_auth_token: e.target.value })}
                  placeholder={settings.whatsapp_twilio_auth_token ? '••••••••••••••••' : 'Enter Token'}
                  size="small"
                  sx={{ width: '250px' }}
                />
              </SettingRow>

              <SettingRow>
                <Box sx={{ flex: 1, mr: 2 }}>
                  <Typography variant="body1">From Number</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Twilio WhatsApp number (e.g., whatsapp:+14155238886)
                  </Typography>
                </Box>
                <StyledTextField
                  value={settings.whatsapp_twilio_from}
                  onChange={(e) => setSettings({ ...settings, whatsapp_twilio_from: e.target.value })}
                  placeholder="whatsapp:+14155238886"
                  size="small"
                  sx={{ width: '250px' }}
                />
              </SettingRow>

              <SettingRow>
                <Box sx={{ flex: 1, mr: 2 }}>
                  <Typography variant="body1">To Number</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Your WhatsApp number (e.g., whatsapp:+972501234567)
                  </Typography>
                </Box>
                <StyledTextField
                  value={settings.whatsapp_to}
                  onChange={(e) => setSettings({ ...settings, whatsapp_to: e.target.value })}
                  placeholder="whatsapp:+972501234567"
                  size="small"
                  sx={{ width: '250px' }}
                />
              </SettingRow>

              {/* Test Message Button */}
              <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid rgba(148, 163, 184, 0.2)' }}>
                <Button
                  variant="contained"
                  startIcon={testingWhatsApp ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
                  onClick={handleTestWhatsApp}
                  disabled={testingWhatsApp || !settings.whatsapp_twilio_sid || !settings.whatsapp_twilio_auth_token || !settings.whatsapp_twilio_from || !settings.whatsapp_to}
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
        borderTop: `1px solid ${theme.palette.divider}`,
        p: 2,
        justifyContent: 'space-between',
        alignItems: 'center'
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
    </StyledDialog>
  );
};

export default SettingsModal;
