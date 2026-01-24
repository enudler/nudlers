import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsModal from '../../components/SettingsModal';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Mock components that aren't needed for these tests
vi.mock('../../components/DeleteAllTransactionsDialog', () => ({
  default: () => <div data-testid="delete-dialog">Delete Dialog</div>
}));

vi.mock('../../components/ScreenshotViewer', () => ({
  default: () => <div data-testid="screenshot-viewer">Screenshot Viewer</div>
}));

// Mock logger
vi.mock('../../utils/client-logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}));

const theme = createTheme();

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('SettingsModal - WhatsApp Web.js Integration', () => {
  let mockFetch: typeof global.fetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  describe('WhatsApp Web.js Section', () => {
    it('should show WhatsApp Web.js section when enabled', async () => {
      // Mock settings fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          settings: {
            whatsapp_webjs_enabled: 'true',
            whatsapp_webjs_auto_reconnect: 'true',
            whatsapp_webjs_test_number: '+972501234567',
            whatsapp_webjs_test_group: '',
            // Other required settings
            sync_enabled: 'false',
            sync_hour: '3',
            sync_days_back: '30',
            default_currency: 'ILS',
            date_format: 'DD/MM/YYYY',
            billing_cycle_start_day: '10',
            scraper_timeout: '90000',
            scraper_log_http_requests: 'false',
            update_category_on_rescrape: 'false',
            scrape_retries: '3',
            gemini_api_key: '',
            gemini_model: 'gemini-2.5-flash',
            isracard_scrape_categories: 'true',
            whatsapp_enabled: 'false',
            whatsapp_hour: '8',
            whatsapp_twilio_sid: '',
            whatsapp_twilio_auth_token: '',
            whatsapp_twilio_from: '',
            whatsapp_to: '',
            whatsapp_summary_mode: 'calendar'
          }
        })
      });

      // Mock status check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          connected: false,
          session_exists: false,
          phone_number: null,
          last_connected: null,
          qr_required: false
        })
      });

      renderWithTheme(<SettingsModal open={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('WhatsApp Web.js Integration')).toBeInTheDocument();
      });
    });

    it('should display connection status badge', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          settings: {
            whatsapp_webjs_enabled: 'true',
            whatsapp_webjs_auto_reconnect: 'true',
            whatsapp_webjs_test_number: '',
            whatsapp_webjs_test_group: '',
            sync_enabled: 'false',
            sync_hour: '3',
            sync_days_back: '30',
            default_currency: 'ILS',
            date_format: 'DD/MM/YYYY',
            billing_cycle_start_day: '10',
            scraper_timeout: '90000',
            scraper_log_http_requests: 'false',
            update_category_on_rescrape: 'false',
            scrape_retries: '3',
            gemini_api_key: '',
            gemini_model: 'gemini-2.5-flash',
            isracard_scrape_categories: 'true',
            whatsapp_enabled: 'false',
            whatsapp_hour: '8',
            whatsapp_twilio_sid: '',
            whatsapp_twilio_auth_token: '',
            whatsapp_twilio_from: '',
            whatsapp_to: '',
            whatsapp_summary_mode: 'calendar'
          }
        })
      });

      // Mock connected status
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          connected: true,
          session_exists: true,
          phone_number: '972501234567',
          last_connected: '2026-01-24T10:00:00Z',
          qr_required: false
        })
      });

      renderWithTheme(<SettingsModal open={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('✓ Connected')).toBeInTheDocument();
        expect(screen.getByText(/Phone: \+972501234567/)).toBeInTheDocument();
      });
    });

    it('should show QR code generation button when disconnected', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          settings: {
            whatsapp_webjs_enabled: 'true',
            whatsapp_webjs_auto_reconnect: 'true',
            whatsapp_webjs_test_number: '',
            whatsapp_webjs_test_group: '',
            sync_enabled: 'false',
            sync_hour: '3',
            sync_days_back: '30',
            default_currency: 'ILS',
            date_format: 'DD/MM/YYYY',
            billing_cycle_start_day: '10',
            scraper_timeout: '90000',
            scraper_log_http_requests: 'false',
            update_category_on_rescrape: 'false',
            scrape_retries: '3',
            gemini_api_key: '',
            gemini_model: 'gemini-2.5-flash',
            isracard_scrape_categories: 'true',
            whatsapp_enabled: 'false',
            whatsapp_hour: '8',
            whatsapp_twilio_sid: '',
            whatsapp_twilio_auth_token: '',
            whatsapp_twilio_from: '',
            whatsapp_to: '',
            whatsapp_summary_mode: 'calendar'
          }
        })
      });

      // Mock disconnected status
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          connected: false,
          session_exists: false,
          phone_number: null,
          last_connected: null,
          qr_required: false
        })
      });

      renderWithTheme(<SettingsModal open={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('○ Disconnected')).toBeInTheDocument();
        expect(screen.getByText('Generate QR Code')).toBeInTheDocument();
      });
    });

    it('should fetch QR code when button is clicked', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          settings: {
            whatsapp_webjs_enabled: 'true',
            whatsapp_webjs_auto_reconnect: 'true',
            whatsapp_webjs_test_number: '',
            whatsapp_webjs_test_group: '',
            sync_enabled: 'false',
            sync_hour: '3',
            sync_days_back: '30',
            default_currency: 'ILS',
            date_format: 'DD/MM/YYYY',
            billing_cycle_start_day: '10',
            scraper_timeout: '90000',
            scraper_log_http_requests: 'false',
            update_category_on_rescrape: 'false',
            scrape_retries: '3',
            gemini_api_key: '',
            gemini_model: 'gemini-2.5-flash',
            isracard_scrape_categories: 'true',
            whatsapp_enabled: 'false',
            whatsapp_hour: '8',
            whatsapp_twilio_sid: '',
            whatsapp_twilio_auth_token: '',
            whatsapp_twilio_from: '',
            whatsapp_to: '',
            whatsapp_summary_mode: 'calendar'
          }
        })
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ connected: false, session_exists: false })
      });

      renderWithTheme(<SettingsModal open={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Generate QR Code')).toBeInTheDocument();
      });

      // Mock QR fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          qr_code: 'data:image/png;base64,mockqrcode',
          expires_at: new Date().toISOString()
        })
      });

      const generateButton = screen.getByText('Generate QR Code');
      await user.click(generateButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/whatsapp-webjs/qr')
        );
      });
    });

    it('should send test message when form is filled', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          settings: {
            whatsapp_webjs_enabled: 'true',
            whatsapp_webjs_auto_reconnect: 'true',
            whatsapp_webjs_test_number: '+972501234567',
            whatsapp_webjs_test_group: '',
            sync_enabled: 'false',
            sync_hour: '3',
            sync_days_back: '30',
            default_currency: 'ILS',
            date_format: 'DD/MM/YYYY',
            billing_cycle_start_day: '10',
            scraper_timeout: '90000',
            scraper_log_http_requests: 'false',
            update_category_on_rescrape: 'false',
            scrape_retries: '3',
            gemini_api_key: '',
            gemini_model: 'gemini-2.5-flash',
            isracard_scrape_categories: 'true',
            whatsapp_enabled: 'false',
            whatsapp_hour: '8',
            whatsapp_twilio_sid: '',
            whatsapp_twilio_auth_token: '',
            whatsapp_twilio_from: '',
            whatsapp_to: '',
            whatsapp_summary_mode: 'calendar'
          }
        })
      });

      // Mock connected status
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          connected: true,
          session_exists: true,
          phone_number: '972501234567',
          last_connected: '2026-01-24T10:00:00Z',
          qr_required: false
        })
      });

      renderWithTheme(<SettingsModal open={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Send Test Message')).toBeInTheDocument();
      });

      // Mock send message
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          message_id: 'msg-123',
          timestamp: new Date().toISOString()
        })
      });

      const sendButton = screen.getByText('Send Test Message');
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/whatsapp-webjs/send'),
          expect.objectContaining({
            method: 'POST'
          })
        );
      });
    });
  });
});
