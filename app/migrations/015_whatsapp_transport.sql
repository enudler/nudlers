-- Migration: WhatsApp transport selector.
-- Two implementations now exist:
--   'web'     — whatsapp-web.js (Puppeteer/Chromium, the legacy default).
--   'baileys' — @whiskeysockets/baileys (direct WebSocket protocol).
--
-- We default to 'web' so existing installs upgrade with zero behaviour
-- change. Switching to 'baileys' requires a one-time fresh QR scan because
-- the auth state format is different — that's surfaced in the settings UI
-- with a confirm dialog, not silently.
--
-- Idempotent: ON CONFLICT DO NOTHING preserves any value the user already
-- set by hand or via the settings UI.

INSERT INTO app_settings (key, value, description)
VALUES (
    'whatsapp_transport',
    '"web"'::jsonb,
    'WhatsApp transport implementation: "web" (whatsapp-web.js, legacy) or "baileys" (recommended — no Chromium, lower memory)'
)
ON CONFLICT (key) DO NOTHING;
