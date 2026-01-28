# CLAUDE.md - AI Assistant Guidelines for Nudlers

This document provides comprehensive guidance for AI assistants working with the Nudlers codebase.

## Project Overview

Nudlers is a personal finance management application built with Next.js that aggregates transactions from Israeli banks and credit card companies. It provides expense tracking, budgeting, categorization, and reporting features.

### Core Features
- **Transaction Scraping**: Automated fetching from Israeli banks (Hapoalim, Leumi, Discount, etc.) and credit card providers (Visa Cal, Max, Isracard, Amex)
- **Category Management**: Auto-categorization with rules and manual override
- **Budget Tracking**: Monthly budgets with category-level tracking
- **WhatsApp Notifications**: Daily/weekly summary reports via WhatsApp
- **AI Assistant**: Gemini-powered chat for financial insights
- **MCP Integration**: Model Context Protocol support for AI tools

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16+ (Pages Router) |
| Language | TypeScript / JavaScript |
| Database | PostgreSQL |
| UI Framework | Material-UI (MUI) v6 |
| Styling | CSS Variables + MUI ThemeProvider |
| Testing | Vitest |
| Component Dev | Storybook 10 |
| Scraping | israeli-bank-scrapers + Puppeteer |
| Logging | Pino |
| Runtime | Node.js 22+ |

## Directory Structure

```
nudlers/
├── app/                          # Main application directory
│   ├── components/               # React components
│   │   ├── CategoryDashboard/    # Main dashboard with sub-components
│   │   ├── Layout.tsx            # App layout with view switching
│   │   └── *.tsx                 # Feature components
│   ├── config/                   # Configuration modules
│   │   └── resource-config.js    # Resource mode settings (normal/low/ultra-low)
│   ├── context/                  # React contexts
│   │   ├── ThemeContext.tsx      # Light/dark theme management
│   │   ├── StatusContext.tsx     # App status (DB connection, etc.)
│   │   └── DateSelectionContext.tsx
│   ├── pages/                    # Next.js pages
│   │   ├── api/                  # API routes
│   │   │   ├── transactions/     # Transaction CRUD
│   │   │   ├── categories/       # Category management
│   │   │   ├── scrapers/         # Scraper control
│   │   │   ├── reports/          # Financial reports
│   │   │   ├── credentials/      # Encrypted bank credentials
│   │   │   ├── settings/         # App settings
│   │   │   └── db.js             # Database connection pool
│   │   └── index.tsx             # Main page entry
│   ├── scrapers/                 # Bank scraper logic
│   │   ├── core.js               # Shared scraper utilities
│   │   └── CustomVisaCalScraper.js
│   ├── styles/                   # Styling
│   │   ├── design-tokens.css     # CSS custom properties
│   │   ├── theme.ts              # MUI theme configuration
│   │   └── globals.css
│   ├── stories/                  # Storybook stories
│   ├── tests/                    # Test files
│   └── utils/                    # Shared utilities
│       ├── constants.js          # App constants and vendor lists
│       ├── logger.js             # Pino logger instance
│       ├── whatsapp.js           # WhatsApp integration
│       └── transaction_logic.js  # Business logic for transactions
└── .gitignore
```

## Development Commands

All commands should be run from the `app/` directory:

```bash
# Development
npm run dev          # Start dev server on port 6969

# Build & Production
npm run build        # Build for production
npm start            # Start production server

# Testing
npm run test         # Run Vitest tests

# Linting
npm run lint         # Run ESLint

# Storybook
npm run storybook    # Start Storybook on port 6006
```

## API Standards & OpenAPI Specification

### OpenAPI 3 Specification

The API is fully documented in **`app/public/openapi.yaml`**. This is the source of truth for all API endpoints.

**IMPORTANT:** When adding or modifying API endpoints:
1. Always update `app/public/openapi.yaml` to reflect changes
2. Follow the existing RESTful patterns documented in the spec
3. Ensure request/response schemas match the implementation

### RESTful API Design Principles

All APIs must follow these RESTful conventions:

#### Collection Endpoints (`/api/resources`)
- **GET** - List all resources (supports pagination via `limit`/`offset`)
- **POST** - Create a new resource

#### Resource Endpoints (`/api/resources/{id}`)
- **GET** - Retrieve a single resource
- **PUT** - Full update of a resource
- **PATCH** - Partial update of a resource
- **DELETE** - Remove a resource

#### Key Rules

1. **Use path parameters for resource identification, NOT request body:**
   ```javascript
   // CORRECT - RESTful
   DELETE /api/categories/rules/123

   // INCORRECT - Non-RESTful
   DELETE /api/categories/rules  (body: { id: 123 })
   ```

2. **HTTP Status Codes:**
   - `200` - Success (GET, PUT, PATCH, DELETE)
   - `201` - Created (POST)
   - `400` - Bad Request (validation error)
   - `404` - Not Found
   - `405` - Method Not Allowed
   - `409` - Conflict (e.g., resource already exists)
   - `500` - Internal Server Error

3. **Response Format:**
   - Success: Return the resource or `{ success: true }`
   - Error: Return `{ error: "message" }` or `{ error: "message", details: "..." }`

4. **Action Endpoints** (for operations that don't fit CRUD):
   - Use POST with descriptive paths: `/api/categories/apply-rules`, `/api/scrapers/run`
   - These are acceptable for command/action operations

### API Directory Structure

```
pages/api/
├── [resource]/
│   ├── index.js          # Collection: GET (list), POST (create)
│   └── [id].js           # Resource: GET, PUT, PATCH, DELETE
├── [resource]/
│   ├── index.js
│   ├── [id].js
│   └── [subresource]/    # Nested resources
│       ├── index.js
│       └── [id].js
```

### Example: Proper RESTful API Structure

```javascript
// pages/api/categories/rules/index.js - Collection endpoint
import { createApiHandler } from "../../utils/apiHandler";

const handler = createApiHandler({
  validate: (req) => {
    if (!['GET', 'POST'].includes(req.method)) {
      return "Only GET and POST methods are allowed. Use /api/categories/rules/{id} for PUT/DELETE";
    }
    // POST validation...
  },
  query: async (req) => {
    if (req.method === 'GET') {
      return { sql: 'SELECT * FROM rules ORDER BY created_at DESC', params: [] };
    }
    if (req.method === 'POST') {
      const { name_pattern, target_category } = req.body;
      return {
        sql: 'INSERT INTO rules (name_pattern, target_category) VALUES ($1, $2) RETURNING *',
        params: [name_pattern, target_category]
      };
    }
  },
  transform: (result, req) => req.method === 'GET' ? result.rows : result.rows[0]
});

export default handler;
```

```javascript
// pages/api/categories/rules/[id].js - Resource endpoint
import { createApiHandler } from "../../utils/apiHandler";

const handler = createApiHandler({
  validate: (req) => {
    if (!['GET', 'PUT', 'DELETE'].includes(req.method)) {
      return "Only GET, PUT, and DELETE methods are allowed";
    }
    if (!req.query.id) return "ID parameter is required";
  },
  query: async (req) => {
    const { id } = req.query;

    if (req.method === 'GET') {
      return { sql: 'SELECT * FROM rules WHERE id = $1', params: [id] };
    }
    if (req.method === 'PUT') {
      const { name_pattern, target_category } = req.body;
      return {
        sql: 'UPDATE rules SET name_pattern = $2, target_category = $3 WHERE id = $1 RETURNING *',
        params: [id, name_pattern, target_category]
      };
    }
    if (req.method === 'DELETE') {
      return { sql: 'DELETE FROM rules WHERE id = $1 RETURNING id', params: [id] };
    }
  },
  transform: (result, req) => {
    if (result.rows.length === 0) return { error: 'Not found', status: 404 };
    if (req.method === 'DELETE') return { success: true };
    return result.rows[0];
  }
});

export default handler;
```

## Code Conventions

### API Routes

API routes follow a consistent pattern using `createApiHandler`:

```javascript
// pages/api/example/index.js
import { createApiHandler } from "../utils/apiHandler";
import { getDB } from "../db";

const handler = async (req, res) => {
    if (req.method === 'GET') {
        return getHandler(req, res);
    } else if (req.method === 'POST') {
        return postHandler(req, res);
    }
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
};

const getHandler = createApiHandler({
    validate: (req) => {
        // Return error string if invalid, undefined if valid
        if (!req.query.required) return "required is required";
    },
    query: async (req) => ({
        sql: 'SELECT * FROM table WHERE column = $1',
        params: [req.query.param]
    }),
    transform: (result) => result.rows
});

export default handler;
```

### Database Queries

Always use parameterized queries and release clients:

```javascript
import { getDB } from "../db";

const client = await getDB();
try {
    const result = await client.query('SELECT * FROM table WHERE id = $1', [id]);
    // Handle result
} finally {
    client.release();
}
```

### React Components

Components use TypeScript with MUI styling:

```tsx
import React from 'react';
import { Box, Typography } from '@mui/material';

interface ComponentProps {
    title: string;
    onAction?: () => void;
}

const MyComponent: React.FC<ComponentProps> = ({ title, onAction }) => {
    return (
        <Box sx={{
            p: 2,
            backgroundColor: 'var(--n-bg-surface)',
            borderRadius: 'var(--n-radius-lg)'
        }}>
            <Typography variant="h6" color="var(--n-text-primary)">
                {title}
            </Typography>
        </Box>
    );
};

export default MyComponent;
```

### Testing

Tests use Vitest with mocks for database and external services:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../pages/api/db', () => ({
    getDB: vi.fn()
}));

vi.mock('../utils/logger.js', () => ({
    default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}));

describe('Feature', () => {
    let mockClient;

    beforeEach(() => {
        vi.clearAllMocks();
        mockClient = {
            query: vi.fn(),
            release: vi.fn()
        };
        (getDB as any).mockResolvedValue(mockClient);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should do something', async () => {
        mockClient.query.mockResolvedValue({ rows: [] });
        // Test logic
    });
});
```

## Styling System

### Design Tokens

The app uses CSS custom properties for theming (see `styles/design-tokens.css`):

```css
/* Usage in components */
.element {
    background: var(--n-bg-surface);
    color: var(--n-text-primary);
    border: 1px solid var(--n-border);
    border-radius: var(--n-radius-lg);
    box-shadow: var(--n-shadow-md);
}
```

Key token prefixes:
- `--n-bg-*`: Background colors
- `--n-text-*`: Text colors
- `--n-border*`: Border colors
- `--n-primary-*`: Primary/accent colors
- `--n-space-*`: Spacing values
- `--n-radius-*`: Border radius
- `--n-shadow-*`: Box shadows

### Theme Switching

Themes are controlled via `data-theme` attribute on `<html>`:
- `[data-theme='light']` - Light theme tokens
- `[data-theme='dark']` - Dark theme tokens (default)

## Key Concepts

### Vendors

Vendors are categorized into:
- **Credit Card**: `visaCal`, `max`, `isracard`, `amex`
- **Standard Banks**: `hapoalim`, `leumi`, `mizrahi`, `discount`, etc.
- **Beinleumi Group**: `otsarHahayal`, `beinleumi`, `massad`, `pagi`

### Billing Cycle

Transactions are grouped by billing cycle (configurable start day, default: 10th) rather than calendar month for credit card charges.

### Resource Modes

The app supports different resource configurations via `RESOURCE_MODE` environment variable:
- `normal`: Standard servers (2GB+ RAM)
- `low`: NAS devices (Synology, QNAP)
- `ultra-low`: Raspberry Pi, minimal RAM devices

## Environment Variables

```bash
# Database
NUDLERS_DB_USER=
NUDLERS_DB_HOST=
NUDLERS_DB_NAME=
NUDLERS_DB_PASSWORD=
NUDLERS_DB_PORT=5432

# Encryption
ENCRYPTION_KEY=   # 32-byte hex for credential encryption

# Resource Mode
RESOURCE_MODE=normal  # normal | low | ultra-low

# Optional
GEMINI_API_KEY=       # For AI assistant
LOG_LEVEL=info        # Logging level
```

## Important Files to Know

| File | Purpose |
|------|---------|
| `app/public/openapi.yaml` | **OpenAPI 3 specification - source of truth for all APIs** |
| `app/pages/api/db.js` | PostgreSQL connection pool |
| `app/pages/api/utils/apiHandler.js` | Reusable API handler wrapper |
| `app/config/resource-config.js` | Resource optimization settings |
| `app/utils/constants.js` | Vendor lists, settings keys, timeouts |
| `app/scrapers/core.js` | Shared scraper utilities and anti-detection |
| `app/components/Layout.tsx` | Main app layout with view routing |
| `app/context/ThemeContext.tsx` | Theme provider |
| `app/styles/design-tokens.css` | CSS custom properties |
| `app/styles/theme.ts` | MUI theme configuration |

## Common Tasks

### Adding a New API Endpoint

1. **Plan the RESTful structure:**
   - Collection endpoint: `app/pages/api/[feature]/index.js` (GET list, POST create)
   - Resource endpoint: `app/pages/api/[feature]/[id].js` (GET, PUT, DELETE by ID)

2. **Create the API files:**
   - Use `createApiHandler` pattern for database operations
   - Add validation, query, and transform functions
   - Use path parameters (`req.query.id`) for resource identification
   - Never use request body for DELETE operations to identify resources

3. **Follow RESTful conventions:**
   - Return proper HTTP status codes (200, 201, 400, 404, 500)
   - Use consistent response format (`{ success: true }` or `{ error: "..." }`)

4. **Update the OpenAPI specification:**
   - Edit `app/public/openapi.yaml`
   - Add the new endpoint path with all methods
   - Document all query parameters, request body schemas, and response schemas
   - Add any new component schemas if needed

5. **Test the endpoint:**
   - Verify all HTTP methods work correctly
   - Test error cases (invalid input, not found, etc.)

### Adding a New Component

1. Create in `app/components/[ComponentName].tsx`
2. Use TypeScript interfaces for props
3. Use MUI components and CSS variables for styling
4. Add to relevant view in `Layout.tsx` if it's a main view

### Adding Tests

1. Create `app/tests/[feature].test.ts`
2. Mock `getDB`, `logger`, and external services
3. Use `beforeEach`/`afterEach` for setup/teardown
4. Test both success and error paths

### Modifying Scraper Behavior

1. Check `app/scrapers/core.js` for shared options
2. Rate-limited vendors need special handling (delays, longer timeouts)
3. Test changes with `npm run scrape` before committing

## Gotchas and Tips

1. **Database connections**: Always call `client.release()` in a `finally` block
2. **Encryption**: Credentials are encrypted at rest; use `encrypt()`/`decrypt()` from `utils/encryption.js`
3. **Scraper timeouts**: Default 90s, configurable via settings or resource mode
4. **Theme colors**: Always use CSS variables (`var(--n-*)`) for theme compatibility
5. **Date handling**: Use `date-fns` for date manipulation
6. **Logging**: Use the `logger` from `utils/logger.js`, not `console.log`
7. **Tests**: Database tests should mock `getDB`, not use real connections
8. **API Design**: Always use path parameters for resource IDs; never use request body for DELETE identification
9. **OpenAPI Spec**: Keep `app/public/openapi.yaml` in sync with API changes - it's the source of truth

## Storybook

Stories are located in `app/stories/`. Run with `npm run storybook`.

Component stories should follow this pattern:
```tsx
// ComponentName.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import ComponentName from '../components/ComponentName';

const meta: Meta<typeof ComponentName> = {
    title: 'Components/ComponentName',
    component: ComponentName,
};

export default meta;
type Story = StoryObj<typeof ComponentName>;

export const Default: Story = {
    args: {
        // Default props
    },
};
```

## Contributing Guidelines

1. Run `npm run lint` before committing
2. Add tests for new features
3. Use TypeScript for new files when possible
4. Follow existing patterns for consistency
5. Update this CLAUDE.md if adding significant new patterns or conventions
6. **Update `app/public/openapi.yaml` when adding or modifying API endpoints**
7. Follow RESTful API conventions (see "API Standards & OpenAPI Specification" section)
