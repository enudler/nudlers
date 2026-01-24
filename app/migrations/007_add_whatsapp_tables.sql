-- Migration: Add WhatsApp Web.js tables
-- Description: Add tables for WhatsApp session management and contact storage

-- WhatsApp Sessions Table
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL DEFAULT 'default',
    phone_number VARCHAR(50),
    connected BOOLEAN DEFAULT FALSE,
    last_connected_at TIMESTAMP,
    last_disconnected_at TIMESTAMP,
    session_data TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- WhatsApp Contacts Table
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
    id SERIAL PRIMARY KEY,
    contact_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    phone_number VARCHAR(50),
    is_group BOOLEAN DEFAULT FALSE,
    participant_count INTEGER,
    last_synced_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_type ON whatsapp_contacts(is_group);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_phone ON whatsapp_contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_name ON whatsapp_contacts(name);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_session_id ON whatsapp_sessions(session_id);

-- Insert default session record
INSERT INTO whatsapp_sessions (session_id, connected)
VALUES ('default', FALSE)
ON CONFLICT (session_id) DO NOTHING;

-- Add new settings for WhatsApp Web.js
INSERT INTO app_settings (key, value, description) VALUES
    ('whatsapp_webjs_enabled', 'false', 'Enable WhatsApp Web.js integration'),
    ('whatsapp_webjs_auto_reconnect', 'true', 'Automatically reconnect on disconnect'),
    ('whatsapp_webjs_test_number', '', 'Default test phone number'),
    ('whatsapp_webjs_test_group', '', 'Default test group ID')
ON CONFLICT (key) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE whatsapp_sessions IS 'Stores WhatsApp Web.js session information';
COMMENT ON TABLE whatsapp_contacts IS 'Stores WhatsApp contacts and groups';
COMMENT ON COLUMN whatsapp_sessions.session_id IS 'Unique identifier for the WhatsApp session (default: "default")';
COMMENT ON COLUMN whatsapp_sessions.phone_number IS 'Connected WhatsApp phone number';
COMMENT ON COLUMN whatsapp_sessions.session_data IS 'Encrypted session data (reserved for future use)';
COMMENT ON COLUMN whatsapp_contacts.contact_id IS 'WhatsApp contact ID (e.g., 972501234567@c.us or 120363XXXXXX@g.us)';
COMMENT ON COLUMN whatsapp_contacts.is_group IS 'True if this is a group, false for individual contact';
COMMENT ON COLUMN whatsapp_contacts.participant_count IS 'Number of participants in group (null for contacts)';
