# WhatsApp Web.js Integration - Testing Guide

This guide provides step-by-step instructions for testing the WhatsApp Web.js integration.

## Prerequisites

- Docker and Docker Compose installed
- `.env` file configured with database credentials
- Phone with WhatsApp installed
- Internet connection

## Test Plan

### Phase 1: Container Startup Tests

#### 1.1 Build WhatsApp Service Container

```bash
cd nudlers
docker-compose build whatsapp-service
```

**Expected Result:**
- Build completes without errors
- Image size ~500-700MB
- All dependencies installed

#### 1.2 Start All Services

```bash
docker-compose up -d
```

**Expected Result:**
```
✓ nudlers-db started
✓ nudlers-app started
✓ whatsapp-service started
```

#### 1.3 Check Service Health

```bash
# Check if all containers are running
docker-compose ps

# Check WhatsApp service health
curl http://localhost:3001/health

# Check service logs
docker-compose logs whatsapp-service
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-24T...",
  "whatsapp": {
    "connected": false,
    "session_exists": false
  },
  "database": {
    "connected": true
  }
}
```

#### 1.4 Verify Database Migration

```bash
# Connect to database
docker-compose exec nudlers-db psql -U nudlers -d nudlers

# Check if tables exist
\dt whatsapp*

# Check settings
SELECT * FROM app_settings WHERE key LIKE 'whatsapp_webjs%';

# Exit
\q
```

**Expected Result:**
- `whatsapp_sessions` table exists
- `whatsapp_contacts` table exists
- 4 new settings: `whatsapp_webjs_enabled`, `whatsapp_webjs_auto_reconnect`, `whatsapp_webjs_test_number`, `whatsapp_webjs_test_group`

### Phase 2: API Endpoint Tests

#### 2.1 Test Status Endpoint

```bash
curl http://localhost:3001/status
```

**Expected Response:**
```json
{
  "connected": false,
  "session_exists": false,
  "phone_number": null,
  "last_connected": null,
  "qr_required": false
}
```

#### 2.2 Test QR Endpoint (Should Return 404 Initially)

```bash
curl http://localhost:3001/qr
```

**Expected Response:**
```json
{
  "error": "QR code not available",
  "message": "QR code not generated yet. Please wait a moment and try again."
}
```

**Note:** QR code is generated automatically when the client initializes. Wait ~10-30 seconds and try again.

#### 2.3 Test Send Endpoint (Should Fail - Not Connected)

```bash
curl -X POST http://localhost:3001/send \
  -H "Content-Type: application/json" \
  -d '{"to": "+972501234567", "message": "Test"}'
```

**Expected Response:**
```json
{
  "error": "WhatsApp not connected",
  "message": "Please connect WhatsApp first by scanning the QR code"
}
```

### Phase 3: Frontend Integration Tests

#### 3.1 Open Settings Modal

1. Open Nudlers app: `http://localhost:3000`
2. Click Settings icon (gear icon in navigation)
3. Scroll to "WhatsApp Web.js Integration" section

**Expected UI:**
- Section appears with WhatsApp icon
- "Enable WhatsApp Web.js" toggle
- Description text visible

#### 3.2 Enable WhatsApp Web.js

1. Toggle "Enable WhatsApp Web.js" to ON
2. Check auto-save indicator

**Expected Result:**
- Toggle turns green
- Section expands to show connection status
- Connection status shows "Disconnected" (red badge)

#### 3.3 Generate QR Code

1. Click "Generate QR Code" button
2. Wait for QR code to appear

**Expected Result:**
- Button shows loading spinner
- QR code image appears (black and white square)
- Instructions are displayed above QR code
- "Refresh QR Code" button appears

**If QR doesn't appear:**
```bash
# Check service logs for errors
docker-compose logs whatsapp-service | tail -20

# Check browser console for errors (F12)
```

#### 3.4 Scan QR Code

1. Open WhatsApp on your phone
2. Tap Menu (⋮) → Linked Devices
3. Tap "Link a Device"
4. Scan the QR code from Settings

**Expected Result:**
- Phone shows "Linking..." then "Connected"
- Settings UI shows:
  - Connection status changes to "Connected" (green badge)
  - Phone number appears
  - QR code section disappears
  - Test messaging section appears
  - Disconnect button appears

### Phase 4: Messaging Tests

#### 4.1 Test Individual Message

1. Enter your phone number in "Test Phone Number" field (e.g., `+972501234567`)
2. Type a test message in the message box
3. Click "Send Test Message"

**Expected Result:**
- Button shows "Sending..." with spinner
- Success alert appears: "✓ Test message sent successfully!"
- Message received on your WhatsApp

#### 4.2 Load Contacts

1. Click "Load Contacts" button
2. Wait for contacts to load

**Expected Result:**
- Button shows "Loading..." with spinner
- Text appears: "X contacts, Y groups loaded"
- Contacts are stored in database

**Verify in Database:**
```bash
docker-compose exec nudlers-db psql -U nudlers -d nudlers -c "SELECT COUNT(*) FROM whatsapp_contacts WHERE is_group = false;"
docker-compose exec nudlers-db psql -U nudlers -d nudlers -c "SELECT COUNT(*) FROM whatsapp_contacts WHERE is_group = true;"
```

#### 4.3 Test Group Message

1. Get a group ID from your WhatsApp:
   - Method 1: Check database after loading contacts
   - Method 2: Use WhatsApp group invite link (extract ID)
2. Enter group ID in "Test Group ID" field (e.g., `120363XXXXXX@g.us`)
3. Type a test message
4. Click "Send Test Message"

**Expected Result:**
- Success alert appears
- Message appears in the WhatsApp group

### Phase 5: Session Persistence Tests

#### 5.1 Restart Container

```bash
# Restart WhatsApp service
docker-compose restart whatsapp-service

# Wait 10 seconds
sleep 10

# Check status
curl http://localhost:3001/status
```

**Expected Result:**
```json
{
  "connected": true,
  "session_exists": true,
  "phone_number": "972501234567",
  "last_connected": "2026-01-24T...",
  "qr_required": false
}
```

**In Settings UI:**
- Connection status shows "Connected" immediately after refresh
- No QR code scan required

#### 5.2 Test Auto-Reconnect

1. In Settings, ensure "Auto-reconnect" is enabled
2. Force disconnect WhatsApp from phone:
   - Open WhatsApp on phone
   - Go to Linked Devices
   - Click on "Nudlers WhatsApp" device
   - Click "Log Out"
3. Watch connection status in Settings

**Expected Result:**
- Status changes to "Disconnected"
- After a few seconds, QR code appears for re-authentication

### Phase 6: Disconnect Tests

#### 6.1 Manual Disconnect

1. In Settings, click "Disconnect" button
2. Confirm action

**Expected Result:**
- Connection status changes to "Disconnected"
- QR code section appears
- Test messaging section disappears
- Phone shows device is no longer linked

#### 6.2 Verify Session Cleared

```bash
curl http://localhost:3001/status
```

**Expected Response:**
```json
{
  "connected": false,
  "session_exists": false,
  "phone_number": null,
  "qr_required": false
}
```

### Phase 7: Error Handling Tests

#### 7.1 Invalid Phone Number

1. Enter invalid phone number: `123`
2. Try to send message

**Expected Result:**
- Error alert with descriptive message

#### 7.2 Empty Message

1. Clear message field
2. Try to send

**Expected Result:**
- Send button disabled OR error message

#### 7.3 Service Down

```bash
# Stop WhatsApp service
docker-compose stop whatsapp-service

# Try to get status from UI
```

**Expected Result:**
- Error message in UI
- Graceful error handling (no crash)

```bash
# Start service again
docker-compose start whatsapp-service
```

### Phase 8: Performance Tests

#### 8.1 Check Resource Usage

```bash
docker stats whatsapp-service --no-stream
```

**Expected Result:**
- Memory: < 1GB
- CPU: < 10% (idle)

#### 8.2 Load Test (Contact Fetching)

```bash
# Time how long it takes to fetch contacts
time curl http://localhost:3001/contacts?refresh=true
```

**Expected Result:**
- Response time: < 30 seconds (depends on number of contacts)

#### 8.3 Concurrent Messages

Send multiple test messages rapidly from UI.

**Expected Result:**
- All messages sent successfully
- No errors or crashes
- Messages appear in correct order

## Test Results Template

Use this template to record your test results:

```markdown
## WhatsApp Web.js Test Results

**Date:** YYYY-MM-DD
**Tester:** Your Name
**Environment:** Development/Production

### Phase 1: Container Startup
- [ ] Container builds successfully
- [ ] All services start without errors
- [ ] Health check passes
- [ ] Database migration successful

### Phase 2: API Endpoints
- [ ] Status endpoint works
- [ ] QR endpoint generates QR code
- [ ] Send endpoint validates connection

### Phase 3: Frontend Integration
- [ ] Settings section appears
- [ ] Enable toggle works
- [ ] QR code displays correctly
- [ ] UI updates on connection change

### Phase 4: Messaging
- [ ] Individual message sends successfully
- [ ] Group message sends successfully
- [ ] Contacts load successfully
- [ ] Test message received on phone

### Phase 5: Session Persistence
- [ ] Session persists after container restart
- [ ] Auto-reconnect works
- [ ] No re-authentication required

### Phase 6: Disconnect
- [ ] Manual disconnect works
- [ ] Session cleared from database
- [ ] UI updates correctly

### Phase 7: Error Handling
- [ ] Invalid inputs handled gracefully
- [ ] Service downtime handled
- [ ] Error messages are clear

### Phase 8: Performance
- [ ] Resource usage acceptable
- [ ] Contact loading performance good
- [ ] Concurrent messages work

### Issues Found
1.
2.
3.

### Notes
-
```

## Debugging Tips

### Check Service Logs

```bash
# Real-time logs
docker-compose logs -f whatsapp-service

# Last 50 lines
docker-compose logs --tail=50 whatsapp-service

# Search for errors
docker-compose logs whatsapp-service | grep -i error
```

### Check Browser Console

1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for errors related to WhatsApp API calls

### Check Database

```bash
# Connect to database
docker-compose exec nudlers-db psql -U nudlers -d nudlers

# Check session status
SELECT * FROM whatsapp_sessions;

# Check contacts
SELECT COUNT(*), is_group FROM whatsapp_contacts GROUP BY is_group;

# Check settings
SELECT key, value FROM app_settings WHERE key LIKE 'whatsapp%';
```

### Restart Everything

If things get stuck:

```bash
# Stop all services
docker-compose down

# Remove volumes (WARNING: deletes session)
docker volume rm nudlers_whatsapp-session-data nudlers_whatsapp-cache

# Start fresh
docker-compose up -d

# Watch logs
docker-compose logs -f
```

## Common Issues

### 1. QR Code Expired

**Symptom:** QR code doesn't work when scanned

**Solution:** Click "Refresh QR Code" button. QR codes expire after 60 seconds.

### 2. Chrome/Puppeteer Errors

**Symptom:** `Failed to launch chrome` errors in logs

**Solution:**
- Ensure `SYS_ADMIN` capability is set
- Check `shm_size` is set to `2gb`
- Verify `seccomp=unconfined` is set

### 3. Session Not Saving

**Symptom:** Need to scan QR after every restart

**Solution:**
- Check Docker volume exists: `docker volume ls | grep whatsapp`
- Verify volume is mounted: `docker-compose config | grep -A 5 volumes`
- Check file permissions in volume

### 4. Database Connection Failed

**Symptom:** `ECONNREFUSED` errors in logs

**Solution:**
- Ensure database is running: `docker-compose ps nudlers-db`
- Check environment variables: `docker-compose exec whatsapp-service env | grep POSTGRES`
- Verify network configuration

## Success Criteria

All tests should pass with the following criteria:

✅ **Container Startup:** All services start without errors within 30 seconds
✅ **QR Code:** Generates within 10 seconds and works when scanned
✅ **Connection:** Establishes within 5 seconds after QR scan
✅ **Messaging:** Individual and group messages send successfully
✅ **Contacts:** Loads all contacts and groups within 30 seconds
✅ **Persistence:** Session survives container restart
✅ **Auto-reconnect:** Reconnects automatically when enabled
✅ **Disconnect:** Clears session completely
✅ **Error Handling:** All errors handled gracefully with clear messages
✅ **Performance:** Memory < 1GB, CPU < 10% idle
✅ **UI:** All features accessible and functional
✅ **Database:** All data persisted correctly

## Reporting Issues

When reporting issues, include:

1. **Steps to reproduce**
2. **Expected behavior**
3. **Actual behavior**
4. **Service logs** (`docker-compose logs whatsapp-service`)
5. **Browser console errors** (if UI issue)
6. **Environment details** (Docker version, OS, etc.)

## Next Steps After Testing

Once all tests pass:

1. ✅ Document any configuration changes needed
2. ✅ Update user documentation
3. ✅ Create backup/restore procedures
4. ✅ Set up monitoring and alerts
5. ✅ Plan production deployment
6. ✅ Train users on new feature

Good luck with testing! 🚀
