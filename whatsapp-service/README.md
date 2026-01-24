# Nudlers WhatsApp Service

A standalone microservice that integrates WhatsApp Web.js with the Nudlers financial tracking application, allowing users to send WhatsApp messages from their personal account.

## Features

- 📱 **Personal WhatsApp Integration** - Use your own WhatsApp account (no Twilio required)
- 🔐 **QR Code Authentication** - Simple and secure authentication via QR code
- 💾 **Session Persistence** - Sessions persist across container restarts
- 📞 **Contact & Group Support** - Send messages to individuals or groups
- 🔄 **Auto-Reconnect** - Automatic reconnection on disconnect
- 🏥 **Health Monitoring** - Built-in health check endpoint
- 📊 **Real-time Status** - Live connection status updates

## Architecture

```
┌─────────────────┐
│  Nudlers App    │
│  (Port 3000)    │
└────────┬────────┘
         │ HTTP
         ▼
┌─────────────────┐
│ WhatsApp Service│
│  (Port 3001)    │
├─────────────────┤
│ • Express API   │
│ • whatsapp-web  │
│ • Puppeteer     │
│ • PostgreSQL    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  WhatsApp Web   │
│ (web.whatsapp)  │
└─────────────────┘
```

## API Endpoints

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-24T10:30:00Z",
  "whatsapp": {
    "connected": true,
    "session_exists": true
  },
  "database": {
    "connected": true
  }
}
```

### GET /status
Get current WhatsApp connection status.

**Response:**
```json
{
  "connected": true,
  "session_exists": true,
  "phone_number": "972501234567",
  "last_connected": "2026-01-24T10:30:00Z",
  "qr_required": false
}
```

### GET /qr
Get QR code for authentication.

**Response:**
```json
{
  "qr_code": "data:image/png;base64,iVBORw0KGgo...",
  "expires_at": "2026-01-24T10:35:00Z"
}
```

### GET /qr/stream
Server-Sent Events stream for real-time QR code updates.

**Events:**
- `qr` - New QR code generated
- `connected` - Successfully authenticated

### POST /send
Send a WhatsApp message.

**Request:**
```json
{
  "to": "+972501234567",  // or "120363XXXXXX@g.us" for groups
  "message": "Hello from Nudlers!"
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

### POST /disconnect
Disconnect and clear the WhatsApp session.

**Response:**
```json
{
  "success": true,
  "message": "WhatsApp session disconnected"
}
```

### GET /contacts
Get contacts and groups.

**Query Parameters:**
- `type` - Filter by type: `all`, `contacts`, `groups` (default: `all`)
- `refresh` - Fetch fresh data from WhatsApp: `true`, `false` (default: `false`)

**Response:**
```json
{
  "contacts": [
    {
      "id": "972501234567@c.us",
      "name": "John Doe",
      "phone_number": "+972501234567",
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

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WHATSAPP_SERVICE_PORT` | Service port | `3001` |
| `POSTGRES_HOST` | PostgreSQL host | `localhost` |
| `POSTGRES_PORT` | PostgreSQL port | `5432` |
| `POSTGRES_DB` | Database name | `nudlers` |
| `POSTGRES_USER` | Database user | `nudlers` |
| `POSTGRES_PASSWORD` | Database password | - |
| `PUPPETEER_EXECUTABLE_PATH` | Custom Chrome path | Auto-detect |

## Docker Configuration

### Development

```yaml
whatsapp-service:
  build:
    context: ./whatsapp-service
    dockerfile: Dockerfile
  ports:
    - "3001:3001"
  environment:
    - POSTGRES_HOST=nudlers-db
    - POSTGRES_DB=nudlers
    - POSTGRES_USER=nudlers
    - POSTGRES_PASSWORD=yourpassword
  cap_add:
    - SYS_ADMIN
  security_opt:
    - seccomp=unconfined
  shm_size: '2gb'
  volumes:
    - whatsapp-session-data:/app/.wwebjs_auth
    - whatsapp-cache:/app/.wwebjs_cache
```

### Production

```bash
docker-compose -f docker-compose.prod.yaml up -d whatsapp-service
```

## Database Schema

### whatsapp_sessions

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `session_id` | VARCHAR(255) | Session identifier (default: 'default') |
| `phone_number` | VARCHAR(50) | Connected phone number |
| `connected` | BOOLEAN | Connection status |
| `last_connected_at` | TIMESTAMP | Last connection time |
| `last_disconnected_at` | TIMESTAMP | Last disconnection time |
| `session_data` | TEXT | Encrypted session data |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

### whatsapp_contacts

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `contact_id` | VARCHAR(255) | WhatsApp contact ID (unique) |
| `name` | VARCHAR(255) | Contact/group name |
| `phone_number` | VARCHAR(50) | Phone number (for contacts) |
| `is_group` | BOOLEAN | True if group, false if contact |
| `participant_count` | INTEGER | Number of participants (groups only) |
| `last_synced_at` | TIMESTAMP | Last sync timestamp |
| `created_at` | TIMESTAMP | Creation timestamp |

## Usage from Nudlers App

### 1. Enable WhatsApp Web.js

Open Settings and enable "WhatsApp Web.js Integration".

### 2. Scan QR Code

1. Click "Generate QR Code"
2. Open WhatsApp on your phone
3. Go to Menu (⋮) → Linked Devices
4. Tap "Link a Device"
5. Scan the QR code displayed in Settings

### 3. Send Test Message

1. Enter a test phone number (e.g., `+972501234567`)
2. Or enter a group ID (e.g., `120363XXXXXX@g.us`)
3. Type a test message
4. Click "Send Test Message"

### 4. Load Contacts

Click "Load Contacts" to fetch your WhatsApp contacts and groups.

## Development

### Install Dependencies

```bash
cd whatsapp-service
npm install
```

### Run Locally

```bash
export POSTGRES_HOST=localhost
export POSTGRES_DB=nudlers
export POSTGRES_USER=nudlers
export POSTGRES_PASSWORD=yourpassword

npm start
```

### Run with Nodemon (Auto-reload)

```bash
npm run dev
```

### Build Docker Image

```bash
docker build -t nudlers-whatsapp:latest .
```

### Run Docker Container

```bash
docker run -d \
  -p 3001:3001 \
  -e POSTGRES_HOST=host.docker.internal \
  -e POSTGRES_DB=nudlers \
  -e POSTGRES_USER=nudlers \
  -e POSTGRES_PASSWORD=yourpassword \
  --cap-add=SYS_ADMIN \
  --security-opt seccomp=unconfined \
  --shm-size=2gb \
  -v whatsapp-session:/app/.wwebjs_auth \
  nudlers-whatsapp:latest
```

## Troubleshooting

### QR Code Not Appearing

**Issue:** QR code not generating after clicking "Generate QR Code"

**Solution:**
1. Check service logs: `docker-compose logs whatsapp-service`
2. Ensure service is healthy: `curl http://localhost:3001/health`
3. Restart service: `docker-compose restart whatsapp-service`

### Session Not Persisting

**Issue:** Need to scan QR code after every restart

**Solution:**
1. Check volume is mounted: `docker volume ls | grep whatsapp-session`
2. Verify permissions on volume directory
3. Check logs for session restoration errors

### Connection Keeps Dropping

**Issue:** WhatsApp disconnects frequently

**Solution:**
1. Enable auto-reconnect in Settings
2. Check network stability
3. Ensure phone stays connected to internet
4. Check WhatsApp phone app settings

### Puppeteer/Chrome Errors

**Issue:** `Failed to launch chrome` or browser-related errors

**Solution:**
1. Ensure Docker has `SYS_ADMIN` capability
2. Set `seccomp=unconfined` security option
3. Allocate sufficient shared memory (2GB recommended)
4. Check Chromium installation in container

### Database Connection Errors

**Issue:** Service can't connect to PostgreSQL

**Solution:**
1. Verify database is running: `docker-compose ps nudlers-db`
2. Check environment variables are set correctly
3. Ensure database network is configured
4. Run migrations: Migrations run automatically on app startup

## Security Considerations

### Session Data

- Session data is stored in Docker volumes
- Consider encrypting volumes in production
- Regularly backup session data

### Network Security

- Service runs on internal Docker network by default
- External access to port 3001 should be restricted
- Use reverse proxy with SSL in production

### Rate Limiting

- Implement rate limiting for message sending
- Monitor usage to prevent abuse
- Set reasonable quotas per user/session

## Performance

### Resource Usage

- **Memory**: ~500MB (including Chrome)
- **CPU**: Low (idle), Medium (during scraping)
- **Disk**: ~200MB (base image) + session data

### Optimization

- Set `LOW_RESOURCES_MODE=true` for lower memory usage
- Use persistent volumes to avoid re-authentication
- Implement connection pooling for database

## Monitoring

### Health Check

```bash
curl http://localhost:3001/health
```

### Connection Status

```bash
curl http://localhost:3001/status
```

### Logs

```bash
docker-compose logs -f whatsapp-service
```

## License

This service is part of the Nudlers project and follows the same license.

## Support

For issues or questions:
- Open an issue on GitHub
- Check existing documentation
- Review logs for error messages

## Changelog

### v1.0.0 (2026-01-24)

- Initial release
- QR code authentication
- Session persistence
- Message sending (individual & groups)
- Contact/group syncing
- Health monitoring
- Docker integration
- PostgreSQL storage
