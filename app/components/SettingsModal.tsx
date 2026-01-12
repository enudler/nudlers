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
  Chip
} from '@mui/material';
import { styled } from '@mui/material/styles';
import SettingsIcon from '@mui/icons-material/Settings';
import packageJson from '../package.json';
import SyncIcon from '@mui/icons-material/Sync';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';

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
  israeli_bank_scrapers_version: string;
}

const StyledDialog = styled(Dialog)(({ theme }) => ({
  '& .MuiDialog-paper': {
    background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(148, 163, 184, 0.1)',
    borderRadius: '16px',
    color: '#fff',
    minWidth: '500px',
    maxHeight: '90vh'
  }
}));

const SettingSection = styled(Box)(({ theme }) => ({
  padding: '20px',
  borderRadius: '12px',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  background: 'rgba(30, 41, 59, 0.5)',
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

const StyledTextField = styled(TextField)({
  '& .MuiOutlinedInput-root': {
    color: '#fff',
    '& fieldset': {
      borderColor: 'rgba(148, 163, 184, 0.3)',
    },
    '&:hover fieldset': {
      borderColor: 'rgba(96, 165, 250, 0.5)',
    },
    '&.Mui-focused fieldset': {
      borderColor: '#60a5fa',
    },
  },
  '& .MuiInputLabel-root': {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  '& .MuiInputLabel-root.Mui-focused': {
    color: '#60a5fa',
  },
});

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
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
    israeli_bank_scrapers_version: 'none'
  });
  const [loading, setLoading] = useState(true);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [originalSettings, setOriginalSettings] = useState<Settings | null>(null);
  const [versionInput, setVersionInput] = useState<string>('');

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
          israeli_bank_scrapers_version: (data.settings.israeli_bank_scrapers_version || 'none').replace(/"/g, '')
        };
        setSettings(newSettings);
        setVersionInput(newSettings.israeli_bank_scrapers_version);
        setOriginalSettings(newSettings);
        setCurrentVersion(data.settings.current_scrapers_version || 'unknown');
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

  const [updateState, setUpdateState] = useState<'idle' | 'validating' | 'installing' | 'restarting'>('idle');
  const [countdown, setCountdown] = useState(30);

  const handleUpdateLibrary = async () => {
    if (!window.confirm('This will install the selected version. The new version will be used for the next scrape. Proceed?')) {
      return;
    }

    setUpdateState('validating');
    setResult(null);

    try {
      // Step 1: Validate
      const valResponse = await fetch('/api/settings/update-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: versionInput,
          validateOnly: true
        })
      });

      let valData: any = {};
      try {
        valData = await valResponse.json();
      } catch (e) {
        console.error('Failed to parse validation response', e);
      }

      if (!valResponse.ok) {
        setResult({ type: 'error', message: `Update failed: ${valData.error || `Validation failed (Status: ${valResponse.status})`}` });
        setUpdateState('idle');
        return;
      }

      // Step 2: Install
      setUpdateState('installing');
      const response = await fetch('/api/settings/update-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: versionInput })
      });

      let data: any = {};
      try {
        data = await response.json();
      } catch (e) {
        console.error('Failed to parse install response', e);
      }

      if (response.ok) {
        setUpdateState('restarting'); // We use this state to show 'Reloading...'
        setResult({ type: 'success', message: 'Library updated! Reloading UI to apply changes...' });

        // Short delay before reload just to show the message
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setResult({ type: 'error', message: `Update failed: ${data.error || `Installation failed (Status: ${response.status})`}` });
        setUpdateState('idle');
        return;
      }
    } catch (error: any) {
      console.error('Update error:', error);
      setResult({ type: 'error', message: `Update failed: ${error.message}` });
      setUpdateState('idle');
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
        borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
        pb: 2
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <SettingsIcon sx={{ color: '#60a5fa' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            App Settings
          </Typography>
          {saving && (
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', ml: 1, fontStyle: 'italic' }}>
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
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
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
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
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
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
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
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
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
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
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
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
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
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
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
                  <Typography variant="body1">Fetch Categories from Scrapers</Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    Fetch transaction categories from card providers (Isracard, Cal, Max). Disable this if you're experiencing rate limiting or API errors. Your local category cache will still be used.
                  </Typography>
                </Box>
                <Switch
                  checked={settings.fetch_categories_from_scrapers}
                  onChange={(e) => setSettings({ ...settings, fetch_categories_from_scrapers: e.target.checked })}
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
                  <Typography variant="body1">Standard Timeout (ms)</Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
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
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
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

              <SettingRow>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body1">
                    Library Version
                    {currentVersion && currentVersion !== 'unknown' && (
                      <Chip
                        label={`Current: ${currentVersion}`}
                        size="small"
                        sx={{ ml: 1, height: '20px', fontSize: '11px', background: 'rgba(96, 165, 250, 0.2)', color: '#60a5fa' }}
                      />
                    )}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    Specify version/branch for <code style={{ color: '#60a5fa' }}>israeli-bank-scrapers</code> (e.g., "latest", "master", "6.6.0").
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <StyledTextField
                    value={versionInput}
                    onChange={(e) => setVersionInput(e.target.value.trim())}
                    size="small"
                    sx={{ width: '150px' }}
                    placeholder="none"
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleUpdateLibrary}
                    disabled={updateState !== 'idle' || versionInput === 'none' || versionInput === currentVersion}
                    sx={{
                      borderColor: 'rgba(96, 165, 250, 0.5)',
                      color: '#60a5fa',
                      minWidth: '150px',
                      '&:hover': {
                        borderColor: '#60a5fa',
                        background: 'rgba(96, 165, 250, 0.1)',
                      },
                    }}
                  >
                    {updateState === 'validating' ? 'Checking...' :
                      updateState === 'installing' ? 'Installing...' :
                        updateState === 'restarting' ? 'Reloading...' :
                          'Update Library'}
                  </Button>
                </Box>
              </SettingRow>
            </SettingSection>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{
        borderTop: '1px solid rgba(148, 163, 184, 0.1)',
        p: 2,
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>
          v{packageJson.version}
        </Typography>
        <Button
          onClick={handleClose}
          variant="outlined"
          sx={{ borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)' }}
        >
          Close
        </Button>
      </DialogActions>
    </StyledDialog>
  );
};

export default SettingsModal;
