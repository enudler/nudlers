# Nudlers

Personal finance management application for tracking credit card expenses and bank transactions with automatic categorization.

**Stack:** Next.js · PostgreSQL · TypeScript · Material-UI

---

## Features

### 📊 Financial Dashboards
- **Multi-view Analytics**: Summary, Budget, and Category-wise spending perspectives.
- **Automated Sync**: Support for major Israeli banks and cards (**Visa Cal, Max, Isracard, Amex, Hapoalim, Leumi**, etc.).
- **Transaction Management**: Manual entries, installments tracking, and customizable billing cycles.

### 🧠 Smart Categorization
- **3-Phase Logic**: Hybrid scraping + Regex Rules + Smart Cache for high-accuracy auto-labeling.
- **Selective Enrichment**: Targeted API lookups for Isracard/Amex to avoid bot detection.
- **Refinement Tools**: Bulk category merging, renaming, and automatic updates on re-scrape.

### 🤖 AI & Connectivity
- **AI Assistant**: Natural language queries via **Google Gemini** ("What's my grocery budget status?").
- **WhatsApp Summary**: Daily automated reports with trends and alerts via native WhatsApp integration (QR Scan).
- **MCP Integration**: Native Model Context Protocol support for **Claude Desktop** and **Cursor**.

### 🔐 Security & Performance
- **Secure Vault**: AES-256-GCM encryption for all financial credentials.
- **Low Resource Mode**: Optimized for Raspberry Pi/NAS; blocks heavy assets to save CPU/RAM.
- **Collision Protection**: Robust identifier logic to prevent duplicate transactions.

---

## 🤖 MCP Integration (Claude/Cursor)

Connect Nudlers to your AI assistant using the **Model Context Protocol**.

### Quick Setup
Nudlers has native MCP support. No local files are required to connect.

1. **Ensure Nudlers is running**: Make sure your app is accessible (e.g., http://localhost:6969).
2. **Configure**: Add the following to your Claude/Cursor MCP settings:
```json
{
  "mcpServers": {
    "nudlers": {
      "command": "npx",
      "args": [
        "-y",
        "supergateway@latest",
        "--sse",
        "http://localhost:6969/api/mcp"
      ]
    }
  }
}
```
*Note: Replace `localhost:6969` with your actual server URL if running on a NAS or VPS.*

### Use Cases
- "What was my total grocery spend in January?"
- "Search for transactions from Aroma"
- "Add manual expense: Coffee, 20 ILS"





---

## Quick Start

### Prerequisites

- Node.js 22+
- PostgreSQL 16+
- Google Chrome (for scraping)

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/enudler/nudlers.git
cd nudlers

# Copy and configure environment variables
cp .env_example .env
# Edit .env with your values

# Start the application
docker-compose up -d
```

Open http://localhost:3000

### 📱 WhatsApp Support Migration (for Docker users)
If you are upgrading an existing Docker installation to support the new WhatsApp integration, you must update your `docker-compose.yaml`.

1. **Add Persistence Volume**: The WhatsApp session must be stored to avoid scanning the QR code on every restart.
   ```yaml
   services:
     nudlers-app:
       volumes:
         - whatsapp-data:/app/.wwebjs_auth
   volumes:
     whatsapp-data:
   ```

2. **Add Browser Capabilities**: Native WhatsApp integration uses a headless browser.
   ```yaml
   services:
     nudlers-app:
       cap_add:
         - SYS_ADMIN
       security_opt:
         - seccomp=unconfined
       shm_size: '2gb' # Recommended for stable browser execution
   ```

3. **Update Image**:
   ```bash
   docker-compose pull && docker-compose up -d
   ```

---

### Option 2: NAS / Server Deployment (Pre-built Image)

For NAS or server deployment, use the pre-built Docker image from GitHub Container Registry:

```bash
# Create a directory for the deployment
mkdir nudlers && cd nudlers

# Download the production docker-compose and env template
curl -O https://raw.githubusercontent.com/enudler/nudlers/main/docker-compose.prod.yaml
curl -O https://raw.githubusercontent.com/enudler/nudlers/main/.env_example

# Configure environment variables
cp .env_example .env
# Edit .env with your values (REQUIRED: NUDLERS_DB_PASSWORD, NUDLERS_ENCRYPTION_KEY)

# Start the application
docker-compose -f docker-compose.prod.yaml up -d
```

**To update to the latest version:**
```bash
docker-compose -f docker-compose.prod.yaml pull
docker-compose -f docker-compose.prod.yaml up -d
```

The database schema is automatically created and migrated on app startup - no manual initialization required!

The image supports both `linux/amd64` and `linux/arm64` architectures.


### Option 3: Manual Setup

1. **Clone and install dependencies**
   ```bash
   git clone https://github.com/enudler/nudlers.git
   cd nudlers/app
   npm install
   ```

2. **Configure environment variables**
   
   Create `.env` in the root directory:
   ```env
   NUDLERS_DB_USER=myuser
   NUDLERS_DB_HOST=localhost
   NUDLERS_DB_NAME=nudlers
   NUDLERS_DB_PASSWORD=mypassword
   NUDLERS_DB_PORT=5432
   NUDLERS_ENCRYPTION_KEY=<64-char-hex>
   NUDLERS_AUTH_PASSWORD=<your-password>
   ```
   
   Generate encryption key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **Initialize the database**
   ```bash
   psql -U myuser -d nudlers -f db-init/init.sql
   ```

4. **Run the application**
   ```bash
   npm run dev
   ```
   
   Open http://localhost:3000

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NUDLERS_DB_USER` | PostgreSQL username |
| `NUDLERS_DB_HOST` | Database host (use `nudlers-db` for Docker) |
| `NUDLERS_DB_NAME` | Database name |
| `NUDLERS_DB_PASSWORD` | Database password |
| `NUDLERS_DB_PORT` | Database port (default: 5432) |
| `NUDLERS_ENCRYPTION_KEY` | 64-character hex key for credential encryption |
| `NUDLERS_AUTH_PASSWORD` | Application login password |
| `GEMINI_API_KEY` | (Optional) Google Gemini API key for AI Chat and WhatsApp summaries |

> **Note:** The Gemini API key can also be configured in the application settings UI.

---

## Application Settings

All settings can be configured through the Settings UI (accessible via the gear icon in the top navigation). Settings are stored in the database and persist across restarts.

### Sync Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `sync_enabled` | Enable or disable the daily background transaction synchronization | `false` |
| `sync_hour` | The hour (0-23) when the daily background sync should run | `3` |
| `sync_days_back` | Number of past days to fetch during each account sync | `30` |

### Display Preferences

| Setting | Description | Default |
|---------|-------------|---------|
| `default_currency` | The default currency symbol used for display (e.g., ILS, USD) | `ILS` |
| `date_format` | The visual format used for displaying dates | `DD/MM/YYYY` |
| `billing_cycle_start_day` | The day of the month when your credit card billing cycle begins | `10` |

### Scraper Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `show_browser` | (Local only) Display browser window during scraping for debugging/2FA | `false` |
| `fetch_categories_from_scrapers` | Automatically adopt categories provided by the bank/card scraper | `true` |
| `update_category_on_rescrape` | If a transaction is re-scraped, update it if the bank provides a new category | `false` |
| `scraper_timeout` | Maximum time (ms) allowed for each scraper to run | `60000` |
| `scraper_log_http_requests` | Log detailed HTTP requests for scraper debugging | `false` |

### AI Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `gemini_api_key` | Google Gemini API key for AI Chat and smart summaries | *(empty)* |
| `gemini_model` | The specific Google Gemini AI model version to use | `gemini-2.5-flash` |

### WhatsApp Daily Summary (Native)

Nudlers now features a native WhatsApp integration that doesn't require third-party services like Twilio. It works by emulating a WhatsApp Web session.

To set up:
1. Go to **Settings** > **WhatsApp Daily Summary**.
2. Click **Start WhatsApp Service**.
3. Scan the generated **QR Code** with your WhatsApp mobile app (Linked Devices).

| Setting | Description | Default |
|---------|-------------|---------|
| `whatsapp_enabled` | Send a financial summary via WhatsApp daily | `false` |
| `whatsapp_hour` | The hour (0-23) when the daily WhatsApp summary is sent | `8` |
| `whatsapp_summary_mode` | Time period for the summary: `calendar` (monthly) or `cycle` (billing) | `calendar` |
| `whatsapp_to` | Comma-separated list of phone numbers (e.g., `972501234567`) or Group IDs (e.g., `120363...`@`g.us`) | *(empty)* |

> **Note:** The WhatsApp service runs a headless browser. If running on low-resource hardware, ensure `LOW_RESOURCES_MODE=true` is set.

> **Note:** Settings marked as "Internal" (`sync_last_run_at`, `whatsapp_last_sent_date`) are automatically managed by the system and should not be manually modified.

---

## 🏦 Supported Institutions

| Category | Institutions |
|----------|--------------|
| **Banks** | Hapoalim, Leumi, Mizrahi Tefahot, Discount, Yahav, FIBI, Otsar Hahayal, Massad, Pagi |
| **Cards** | Visa Cal, Max (Leumi Card), Isracard, American Express (Israel) |

---

## Architecture

```
nudlers/
├── .github/workflows/      # CI/CD pipelines
│   └── docker-build.yml    # Build & push Docker image
├── app/                    # Next.js application
│   ├── components/         # React components
│   ├── pages/
│   │   ├── api/           # API routes
│   │   │   ├── utils/     # Shared utilities
│   │   │   └── ...        # API endpoints
│   │   └── index.tsx      # Main page
│   └── public/            # Static assets
├── db-init/               # Database initialization scripts
├── docker-compose.yaml    # Docker config (local development)
├── docker-compose.prod.yaml # Docker config (production/NAS)
└── .env_example           # Environment template
```

---

## API Endpoints

### Scraping
- `POST /api/scrape` - Scrape a single account
- `POST /api/scrape_stream` - Scrape with real-time progress updates (SSE)
- `POST /api/catchup_sync` - Smart sync from last transaction date

### Transactions
- `GET /api/month_by_categories` - Get spending by category for a month
- `GET /api/category_expenses` - Get expenses for a specific category
- `GET /api/monthly_summary` - Get monthly financial summary
- `POST /api/manual_transaction` - Add a manual transaction

### Categories
- `GET /api/get_all_categories` - List all categories
- `POST /api/rename_category` - Rename a category
- `POST /api/merge_categories` - Merge categories
- `POST /api/apply_categorization_rules` - Apply auto-categorization rules

### Credentials
- `GET /api/credentials` - List saved credentials
- `POST /api/credentials` - Add new credentials
- `DELETE /api/credentials/[id]` - Remove credentials

---

## 💡 Smart Categorization (3-Phase Flow)

To ensure maximum reliability and speed while avoiding bot detection (especially with **Isracard**, **Amex**, and **Max**), Nudlers uses a unique 3-phase categorization strategy:

1.  **Phase 1: Hybrid Scrape**
    *   The browser fetches raw transaction data without requesting categories. This mimics human behavior and avoids the heavy "Additional Information" requests that often trigger "Block Automation" errors.
2.  **Phase 2: Local Matching (Instant)**
    *   **Rules First**: Matches transactions against your custom regex-based patterns.
    *   **Smart Cache**: If no rule matches, it looks at your history. If you previously categorized "Aroma Coffee" as "Dining", it will automatically apply that category.
3.  **Phase 3: Selective Enrichment (Targeted)**
    *   Only for vendors that support it (Isracard/Amex), the app performs low-frequency, targeted API calls for *only* the transactions that still lack a category. This ensures 100% coverage without risking account lockouts.

---

## 🚀 Low Resource Mode

Running Nudlers on a Raspberry Pi, a low-end Synology NAS, or a $5 VPS? Enable **Low Resource Mode** to significantly reduce CPU and RAM usage during scraping.

### Features:
- **Headless Optimization**: Strips all non-essential browser components (GPU, Audio, Sync, etc.).
- **Asset Blocking**: Automatically blocks heavy network requests (Images, Video, Fonts) during scraping.
- **IO Reduction**: Disables disk caching and minimizes database writes through batching.

### How to Enable:
Set the following environment variable in your `.env` or Docker configuration:
```env
LOW_RESOURCES_MODE=true
```

---

## 🛠️ Troubleshooting

### Isracard/Amex/Max "Block Automation" Error

These vendors have aggressive bot detection. Nudlers is built to handle this:

- **Use the 3-Phase Flow**: Ensure "Fetch categories from scrapers" is enabled in settings; the app will handle the rest.
- **Low Resource Mode**: Often helps evade detection by reducing the "footprint" of the browser.
- **Rate Limiting**: The app automatically adds 3-10 second random delays between navigation steps.

**If you are still getting blocked:**
1. Log in to the vendor's website manually once to "clear" any pending notices.
2. Reduce your `sync_days_back` to 7 or 14 days.
3. Wait 24 hours before trying again to let the rate limit expire.

### Chrome/Chromium Not Found
The scraper bundles "Chrome for Testing" by default. If you use a custom environment, set:
```env
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
```

---

## Development

```bash
# Install dependencies
cd app && npm install

# Run in development mode
npm run dev

# Build for production
npm run build
npm start
```

---

## License

**Polyform Noncommercial License 1.0.0**

This project is free for personal, non-commercial use. For commercial use (business environments, revenue generation, commercial products, or paid services), please contact the author to obtain a commercial license.

See [LICENSE](LICENSE) for full terms.

---

## Credits

- Bank scraping: [`israeli-bank-scrapers`](https://github.com/eshaham/israeli-bank-scrapers)
- UI Framework: [Material-UI](https://mui.com/)
