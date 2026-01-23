# Security and Data Protection

This application handles sensitive financial credentials. Protecting these credentials is our top priority.

## Security Model

1.  **Encryption at Rest**: All sensitive credentials (passwords, usernames, IDs) are encrypted in the database using AES-256-GCM.
2.  **Key Management**: The encryption key is stored in the `NUDLERS_ENCRYPTION_KEY` environment variable. Never hardcode this key.
3.  **Minimal Exposure**: Credentials are only decrypted at the last possible moment before being passed to the scraper.
4.  **No Decrypted Data in Logs**:
    *   The application uses a **Redacting Logger** (Pino) that automatically scrubs fields like `password`, `username`, `id_number`, etc.
    *   ESLint is configured with `no-restricted-syntax` to prevent passing sensitive identifiers directly to logger functions.
5.  **Audit Logs**: Scrape events are logged in the `scrape_events` table for auditing, but they **must never** contain decrypted credentials.

## Rules for Developers

### 1. Handling Credentials
Always treat any object containing credentials as "tainted".
- **Do not** pass these objects to `logger.info`, `console.log`, or any external API.
- **Do not** store decrypted credentials in any table other than the temporary memory during scraping.

### 2. Logging
If you must log something about an account, log its `nickname` or `vendor`, never its `username` or `password`.
```javascript
// BAD
logger.info(account, 'Processing account'); 

// GOOD
logger.info({ id: account.id, vendor: account.vendor }, 'Processing account');
```

### 3. Automated Checks
- **Pre-commit Hooks**: Husky runs `npm run lint` and `npm run test` before every commit.
- **ESLint**: Custom rules catch common exposure patterns.
- **CI/CD**: Gitleaks and other scanners run on every PR.
