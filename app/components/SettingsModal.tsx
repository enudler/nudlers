import React, { useState, useEffect, useCallback } from 'react';
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

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

interface Settings {
  sync_enabled: boolean;
  sync_interval_hours: number;
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
    sync_interval_hours: 24,
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
    gemini_api_key: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [originalSettings, setOriginalSettings] = useState<Settings | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        const parseBool = (val: unknown) => val === true || val === 'true' || val === '"true"';
        const newSettings = {
          sync_enabled: parseBool(data.settings.sync_enabled),
          sync_interval_hours: parseInt(data.settings.sync_interval_hours) || 24,
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
          gemini_api_key: (data.settings.gemini_api_key || '').replace(/"/g, '')
        };
        setSettings(newSettings);
        setOriginalSettings(newSettings);
        setHasInitialLoad(true);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
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
      console.error('Auto-save error:', error);
      setResult({ type: 'error', message: 'Failed to auto-save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    onClose();
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
                  <Typography variant="body1">Sync Interval (hours)</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    How often to check for new transactions
                  </Typography>
                </Box>
                <StyledTextField
                  type="number"
                  value={settings.sync_interval_hours}
                  onChange={(e) => setSettings({ ...settings, sync_interval_hours: parseInt(e.target.value) || 24 })}
                  size="small"
                  sx={{ width: '100px' }}
                  inputProps={{ min: 1, max: 168 }}
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
    </StyledDialog>
  );
};

export default SettingsModal;
