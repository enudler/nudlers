# Implementation Plan: Interactive 2FA (OTP) for Scrapers

## Objective
Enable the application to handle 2FA/OTP challenges during scraping, specifically starting with the `CustomVisaCalScraper`. The system will pause the scraper, prompt the user via the UI, and resume once the code is provided.

## Architecture
We will use the "OneZero Pattern" where an `otpCodeRetriever` function is passed to the scraper. Since the scraper runs on the server and the user checks the UI, we need an asynchronous signaling mechanism.

### Flow
1.  **Scraper**: Detects OTP challenge -> Calls `credentials.otpCodeRetriever()`.
2.  **Server (`otpCodeRetriever`)**: 
    *   Generates a unique `requestId`.
    *   Stores a pending `Promise` in a global map (`PendingOtpRequests`).
    *   Emits an SSE event `OTP_NEEDED` with the `requestId` to the client.
    *   Awaits the Promise.
3.  **Client (UI)**:
    *   Listens for `OTP_NEEDED`.
    *   Displays a modal input to the user.
    *   User enters code -> Client POSTs to `/api/scrapers/submit-otp`.
4.  **Server (API)**:
    *   Receives code and `requestId`.
    *   Finds the pending Promise in `PendingOtpRequests`.
    *   Resolves the Promise with the code.
5.  **Scraper**: Receives the code, enters it into the browser, and continues.

## Step-by-Step Implementation

### Phase 1: Backend Signaling Infrastructure

1.  **Create Global State for Requests**
    *   Create `app/utils/otpState.ts` (or `js`) to export a singleton `Map` and helper functions (`registerRequest`, `resolveRequest`).

2.  **Create API Endpoint**
    *   Create `app/pages/api/scrapers/submit-otp.js`.
    *   This endpoint receives `{ requestId, code }`.
    *   It looks up the request in `otpState` and resolves it.

### Phase 2: Update Scraper Execution (`run-stream.js`)

1.  **Modify `handler` in `run-stream.js`**
    *   Import the `registerRequest` helper.
    *   Define the `otpCodeRetriever` implementation:
        ```javascript
        const otpCodeRetriever = async () => {
             const requestId = uuid();
             sendSSE(res, 'OTP_NEEDED', { requestId, message: 'Please enter the code sent to your phone' });
             // Wait for resolution (e.g., 5 min timeout)
             return await registerAndAwaitForOtp(requestId);
        }
        ```
    *   Pass this function into the `credentials` object before calling `runScraper`.

### Phase 3: Update `CustomVisaCalScraper.js`

1.  **Detect OTP Screen**
    *   Standardize a new `LoginResult` (e.g., `OTP_REQUIRED` or just internal logic).
    *   In `getLoginOptions`, add detection for the OTP input field or specific URL/message indicating 2FA.

2.  **Handle OTP Field**
    *   In `login` or `postAction` (depending on flow):
        *   Check if OTP is needed.
        *   If yes, `await this.credentials.otpCodeRetriever()`.
        *   Type the result into the OTP input selector.
        *   Click submit/verify.

### Phase 4: Frontend (Brief)

1.  **Update `useScraperStream` / `ScrapeReport.tsx`**
    *   Add listener for `OTP_NEEDED`.
    *   Show a Dialog/Prompt.
    *   Call the submit API on confirm.

## Files to Modify
1.  `app/utils/otpState.js` (New)
2.  `app/pages/api/scrapers/submit-otp.js` (New)
3.  `app/pages/api/scrapers/run-stream.js`
4.  `app/scrapers/CustomVisaCalScraper.js`
5.  `app/pages/api/utils/scraperUtils.js` (To allow passing the function through validation if necessary)
