# WhatsApp Web.js Docker Integration Design

## Overview

This document outlines the design for integrating whatsapp-web.js into the nudlers application, allowing users to send WhatsApp messages directly from the application using their own WhatsApp account instead of Twilio's WhatsApp Business API.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                          Nudlers Frontend                       │
│  ├── Settings Modal (QR Code Scanning + Testing)                │
│  ├── WhatsApp Status Display                                    │
│  └── Test Message Buttons                                       │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ HTTP/REST API
                 │
┌────────────────▼────────────────────────────────────────────────┐
│                      Nudlers Backend (Next.js)                  │
│  ├── API Routes                                                 │
│  │   ├── /api/whatsapp-webjs/status                            │
│  │   ├── /api/whatsapp-webjs/qr                                │
│  │   ├── /api/whatsapp-webjs/send                              │
│  │   ├── /api/whatsapp-webjs/disconnect                        │
│  │   └── /api/whatsapp-webjs/contacts                          │
│  └── Business Logic                                             │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ HTTP (Internal Docker Network)
                 │
┌────────────────▼────────────────────────────────────────────────┐
│              WhatsApp Web.js Service (New Container)            │
│  ├── Express Server (Port 3001)                                │
│  ├── whatsapp-web.js Client                                    │
│  ├── Session Manager                                            │
│  ├── QR Code Generator                                          │
│  └── Message Queue                                              │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ Puppeteer/Chrome
                 │
┌────────────────▼────────────────────────────────────────────────┐
│                      WhatsApp Web (web.whatsapp.com)            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      PostgreSQL Database                        │
│  ├── whatsapp_sessions (new table)                             │
│  ├── whatsapp_contacts (new table)                             │
│  └── app_settings (existing)                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. WhatsApp Web.js Docker Service

**Technology Stack:**
- Node.js 22
- whatsapp-web.js (latest)
- Express.js (API server)
- Puppeteer (bundled with whatsapp-web.js)
- qrcode package (QR code generation)

**Container Specifications:**
- Base Image: `node:22-bookworm-slim`
- Port: 3001
- Capabilities: `SYS_ADMIN` (for Puppeteer)
- Shared Memory: 2GB
- Security: `seccomp:unconfined`
- Volumes:
  - `whatsapp-session-data:/app/.wwebjs_auth` (session persistence)
  - `whatsapp-cache:/app/.wwebjs_cache` (cache)

**Environment Variables:**
- `WHATSAPP_SERVICE_PORT=3001`
- `POSTGRES_HOST=nudlers-db`
- `POSTGRES_PORT=5432`
- `POSTGRES_DB=${NUDLERS_DB_NAME}`
- `POSTGRES_USER=${NUDLERS_DB_USER}`
- `POSTGRES_PASSWORD=${NUDLERS_DB_PASSWORD}`

**Key Features:**
- Automatic session restoration on container restart
- QR code regeneration on session expiry
- Connection health monitoring
- Message queue for reliability
- Event logging (connected, disconnected, message_sent, etc.)

### 2. Backend API Endpoints

#### GET /api/whatsapp-webjs/status
Returns the current WhatsApp connection status.

**Response:**
```json
{
  "connected": true,
  "session_exists": true,
  "phone_number": "+972501234567",
  "last_connected": "2026-01-24T10:30:00Z",
  "qr_required": false
}
```

#### GET /api/whatsapp-webjs/qr
Generates and returns the QR code for authentication.

**Query Parameters:**
- `format`: "base64" | "svg" (default: "base64")

**Response:**
```json
{
  "qr_code": "data:image/png;base64,iVBORw0KGgo...",
  "expires_at": "2026-01-24T10:35:00Z"
}
```

**SSE Alternative:** GET /api/whatsapp-webjs/qr-stream
- Server-Sent Events for real-time QR updates
- Automatically sends new QR when it changes
- Closes stream when authenticated

#### POST /api/whatsapp-webjs/send
Sends a WhatsApp message to a number or group.

**Request Body:**
```json
{
  "to": "+972501234567",  // or "120363XXXXXX@g.us" for groups
  "message": "Your daily summary is ready!",
  "type": "text"  // or "image", "document"
}
```

**Response:**
```json
{
  "success": true,
  "message_id": "true_972501234567@c.us_3EB0XXXXXX",
  "timestamp": "2026-01-24T10:30:00Z"
}
```

#### POST /api/whatsapp-webjs/disconnect
Disconnects and clears the WhatsApp session.

**Response:**
```json
{
  "success": true,
  "message": "WhatsApp session disconnected"
}
```

#### GET /api/whatsapp-webjs/contacts
Returns list of contacts and groups.

**Query Parameters:**
- `type`: "contacts" | "groups" | "all" (default: "all")

**Response:**
```json
{
  "contacts": [
    {
      "id": "972501234567@c.us",
      "name": "John Doe",
      "number": "+972501234567",
      "is_group": false
    }
  ],
  "groups": [
    {
      "id": "120363XXXXXX@g.us",
      "name": "Family Group",
      "is_group": true,
      "participant_count": 5
    }
  ]
}
```

### 3. Database Schema

#### New Table: whatsapp_sessions
```sql
CREATE TABLE whatsapp_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL DEFAULT 'default',
    phone_number VARCHAR(50),
    connected BOOLEAN DEFAULT FALSE,
    last_connected_at TIMESTAMP,
    last_disconnected_at TIMESTAMP,
    session_data TEXT,  -- Encrypted session data
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### New Table: whatsapp_contacts
```sql
CREATE TABLE whatsapp_contacts (
    id SERIAL PRIMARY KEY,
    contact_id VARCHAR(255) UNIQUE NOT NULL,  -- e.g., "972501234567@c.us"
    name VARCHAR(255),
    phone_number VARCHAR(50),
    is_group BOOLEAN DEFAULT FALSE,
    participant_count INTEGER,
    last_synced_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_contacts_type ON whatsapp_contacts(is_group);
CREATE INDEX idx_whatsapp_contacts_phone ON whatsapp_contacts(phone_number);
```

#### Settings Extension (app_settings)
New settings to add:
```javascript
{
  whatsapp_webjs_enabled: false,         // Enable WhatsApp Web.js
  whatsapp_webjs_auto_reconnect: true,   // Auto-reconnect on disconnect
  whatsapp_webjs_test_number: '',        // Default test number
  whatsapp_webjs_test_group: '',         // Default test group
}
```

### 4. Frontend Implementation (Settings Modal)

#### New Section: "WhatsApp Web.js Integration"

**Location:** SettingsModal.tsx (after existing WhatsApp/Twilio section)

**UI Components:**

1. **Connection Status Card**
   - Status badge (Connected/Disconnected/Connecting)
   - Phone number display (when connected)
   - Last connected timestamp
   - Disconnect button

2. **QR Code Scanner Section**
   - QR code display (auto-refreshing)
   - Instructions: "Scan this QR code with WhatsApp on your phone"
   - Steps:
     1. Open WhatsApp on your phone
     2. Tap Menu (⋮) > Linked Devices
     3. Tap "Link a Device"
     4. Scan this QR code
   - Auto-hide when connected
   - Refresh button (manual QR regeneration)

3. **Test Message Section**
   - Input: Test number/group selector (autocomplete from contacts)
   - Input: Test message text
   - Button: "Send Test Message"
   - Result display (success/error)

4. **Contact & Group Browser**
   - Tabs: Contacts | Groups
   - Search bar
   - List view with:
     - Contact/Group name
     - Phone number (for contacts)
     - Participant count (for groups)
     - "Select" button (for testing)

5. **Settings**
   - Toggle: Enable WhatsApp Web.js
   - Toggle: Auto-reconnect on disconnect
   - Input: Default test number
   - Input: Default test group

**State Management:**
```typescript
interface WhatsAppWebJSState {
  status: {
    connected: boolean;
    phoneNumber: string | null;
    lastConnected: string | null;
    qrRequired: boolean;
  };
  qrCode: string | null;
  contacts: Contact[];
  groups: Group[];
  testNumber: string;
  testMessage: string;
  sending: boolean;
  error: string | null;
}
```

**Event Handling:**
- Auto-refresh QR code every 30 seconds (if not connected)
- Auto-refresh status every 10 seconds
- Real-time QR updates via SSE
- Toast notifications for connection events

### 5. WhatsApp Web.js Service Implementation

#### File Structure
```
whatsapp-service/
├── package.json
├── Dockerfile
├── src/
│   ├── index.js           # Express server entry point
│   ├── whatsapp.js        # WhatsApp client initialization
│   ├── qr-handler.js      # QR code generation
│   ├── message-queue.js   # Message queue management
│   ├── db.js              # PostgreSQL connection
│   └── routes/
│       ├── status.js
│       ├── qr.js
│       ├── send.js
│       ├── disconnect.js
│       └── contacts.js
└── .dockerignore
```

#### Key Service Logic

**Session Persistence:**
```javascript
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "nudlers-whatsapp",
        dataPath: "./.wwebjs_auth"
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});
```

**QR Code Event:**
```javascript
client.on('qr', async (qr) => {
    const qrCode = await QRCode.toDataURL(qr);
    // Store in memory for API access
    currentQR = qrCode;
    qrExpiry = new Date(Date.now() + 60000); // 1 minute

    // Broadcast to SSE clients
    broadcastQR(qrCode);
});
```

**Connection Events:**
```javascript
client.on('ready', async () => {
    const info = client.info;
    await db.query(
        'UPDATE whatsapp_sessions SET connected = TRUE, phone_number = $1, last_connected_at = NOW()',
        [info.wid.user]
    );
    console.log('WhatsApp connected:', info.wid.user);
});

client.on('disconnected', async (reason) => {
    await db.query(
        'UPDATE whatsapp_sessions SET connected = FALSE, last_disconnected_at = NOW()',
    );
    console.log('WhatsApp disconnected:', reason);
});
```

**Message Sending:**
```javascript
async function sendMessage({ to, message }) {
    try {
        // Format number: +972501234567 -> 972501234567@c.us
        const chatId = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@c.us`;

        const result = await client.sendMessage(chatId, message);

        // Log to database
        await db.query(
            'INSERT INTO whatsapp_message_log (to_number, message, status) VALUES ($1, $2, $3)',
            [to, message, 'sent']
        );

        return { success: true, messageId: result.id.id };
    } catch (error) {
        console.error('Send message error:', error);
        return { success: false, error: error.message };
    }
}
```

## Docker Compose Configuration

### Updated docker-compose.yaml

```yaml
version: '3.8'

services:
  nudlers-db:
    # ... existing configuration ...

  nudlers-app:
    # ... existing configuration ...

  whatsapp-service:
    build:
      context: ./whatsapp-service
      dockerfile: Dockerfile
    container_name: nudlers-whatsapp-service
    ports:
      - "3001:3001"
    environment:
      - WHATSAPP_SERVICE_PORT=3001
      - POSTGRES_HOST=nudlers-db
      - POSTGRES_PORT=5432
      - POSTGRES_DB=${NUDLERS_DB_NAME}
      - POSTGRES_USER=${NUDLERS_DB_USER}
      - POSTGRES_PASSWORD=${NUDLERS_DB_PASSWORD}
    cap_add:
      - SYS_ADMIN
    security_opt:
      - seccomp:unconfined
    shm_size: 2gb
    volumes:
      - whatsapp-session-data:/app/.wwebjs_auth
      - whatsapp-cache:/app/.wwebjs_cache
    depends_on:
      nudlers-db:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - nudlers-network

volumes:
  db-data:
  whatsapp-session-data:
  whatsapp-cache:

networks:
  nudlers-network:
    driver: bridge
```

## Security Considerations

1. **Session Data Encryption:**
   - WhatsApp session data should be encrypted at rest
   - Use NUDLERS_ENCRYPTION_KEY for encryption

2. **API Authentication:**
   - All WhatsApp API endpoints should require authentication
   - Consider adding API key or session-based auth

3. **Rate Limiting:**
   - Implement rate limiting for message sending
   - Prevent abuse and spam

4. **Input Validation:**
   - Validate phone numbers (E.164 format)
   - Sanitize message content
   - Validate group IDs

5. **Network Isolation:**
   - WhatsApp service accessible only via internal Docker network
   - No direct external access to port 3001

6. **Credential Storage:**
   - Never log sensitive data (messages, phone numbers)
   - Use encrypted storage for session data

## Migration Path

### Phase 1: Infrastructure Setup
1. Create WhatsApp service Docker container
2. Add database migrations
3. Update docker-compose files
4. Test container startup and health

### Phase 2: Backend Implementation
1. Implement API endpoints
2. Create service communication layer
3. Add error handling and logging
4. Write unit tests

### Phase 3: Frontend Integration
1. Add Settings UI section
2. Implement QR code display
3. Add test message functionality
4. Implement contact/group browser

### Phase 4: Testing & Deployment
1. End-to-end testing
2. Security audit
3. Documentation
4. Production deployment

## Testing Strategy

### Unit Tests
- WhatsApp service API endpoints
- Message formatting and validation
- Session management logic

### Integration Tests
- Docker container communication
- Database operations
- QR code generation flow

### E2E Tests
1. **QR Code Authentication:**
   - Generate QR code
   - Display in UI
   - Successful authentication

2. **Message Sending:**
   - Send to individual contact
   - Send to group
   - Handle failures

3. **Session Persistence:**
   - Restart container
   - Session restored
   - Auto-reconnect

### Manual Testing Checklist
- [ ] QR code displays correctly in settings
- [ ] QR code refreshes when expired
- [ ] WhatsApp connection succeeds
- [ ] Status updates in real-time
- [ ] Test message sends successfully
- [ ] Contact list loads correctly
- [ ] Group list loads correctly
- [ ] Disconnect works properly
- [ ] Session persists after container restart
- [ ] Error messages are clear and actionable

## Monitoring & Logging

### Metrics to Track
- Connection uptime percentage
- Messages sent (success/failure)
- QR code generation requests
- Session restoration events
- API response times

### Logs to Capture
- Connection events (connected, disconnected, auth_failure)
- Message send events (with anonymized metadata)
- Error events (with stack traces)
- API request logs

### Health Checks
```javascript
app.get('/health', (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        whatsapp: {
            connected: client.info ? true : false,
            session_exists: fs.existsSync('./.wwebjs_auth')
        },
        database: {
            connected: db.pool.totalCount > 0
        }
    };

    const statusCode = health.whatsapp.connected ? 200 : 503;
    res.status(statusCode).json(health);
});
```

## Future Enhancements

1. **Multi-Session Support:**
   - Support multiple WhatsApp accounts
   - Session switching in UI

2. **Rich Media:**
   - Send images, videos, documents
   - Voice messages
   - Location sharing

3. **Message Templates:**
   - Pre-defined message templates
   - Variable interpolation
   - Template management UI

4. **Scheduled Messages:**
   - Schedule messages for future delivery
   - Recurring messages

5. **Webhook Integration:**
   - Receive incoming messages
   - Process commands
   - Auto-reply functionality

6. **Analytics:**
   - Message delivery rates
   - Response times
   - Usage statistics dashboard

## Implementation Estimates

| Component | Complexity | Priority |
|-----------|-----------|----------|
| WhatsApp Service Container | Medium | High |
| Database Migrations | Low | High |
| Backend API Endpoints | Medium | High |
| Settings UI (QR Code) | Medium | High |
| Settings UI (Testing) | Low | High |
| Contact/Group Browser | Medium | Medium |
| Session Encryption | Medium | High |
| Error Handling | Low | High |
| Logging & Monitoring | Low | Medium |
| Documentation | Low | Medium |

## Success Criteria

1. ✅ User can scan QR code from Settings modal
2. ✅ WhatsApp connection status visible in real-time
3. ✅ User can send test message to number or group
4. ✅ Contact and group lists populate automatically
5. ✅ Session persists across container restarts
6. ✅ Clear error messages for all failure scenarios
7. ✅ No regression in existing WhatsApp/Twilio functionality
8. ✅ Docker compose up/down works smoothly
9. ✅ Documentation complete and accurate
10. ✅ Security audit passed

## References

- [whatsapp-web.js Documentation](https://docs.wwebjs.dev/)
- [WhatsApp Web Protocol](https://github.com/sigalor/whatsapp-web-reveng)
- [Puppeteer Docker Best Practices](https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md#running-puppeteer-in-docker)
- [Existing Nudlers WhatsApp Implementation](app/utils/whatsapp.js)

## Notes

- This design maintains backward compatibility with existing Twilio WhatsApp integration
- Both systems can coexist (Twilio for business notifications, Web.js for personal use)
- Consider adding a toggle to choose between Twilio and Web.js
- QR code authentication requires user interaction (cannot be fully automated)
- WhatsApp may block accounts that violate their Terms of Service
- Recommend clear warnings about usage limits and compliance
