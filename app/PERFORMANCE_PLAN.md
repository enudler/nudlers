# Performance Optimization Plan for Low-Resource Machines

This plan outlines the steps required to optimize Nudlers for performance and efficiency, specifically targeting machines with limited RAM and CPU usage.

## 1. Browser Automation (Puppeteer) Optimizations 🚀
### Goal: Minimize RAM and CPU spikes during scraping.

- [ ] **Activate/Force Low Resource Mode**: 
    - Ensure `LOW_RESOURCES_MODE=true` is set in the environment.
    - Add aggressive Chromium flags to `scrapers/core.js`:
        - `--no-zygote`: Reduces process overhead.
        - `--disable-canvas-aa`: Disables antialiasing on 2d canvas.
        - `--disable-2d-canvas-clip-aa`: Disables antialiasing on 2d canvas clips.
        - `--disable-gl-drawing-for-tests`: Skips actual GL drawing.
        - `--disable-breakpad`: Disables crash reporting.
- [ ] **Resource Interception**:
    - Enhance `getPreparePage` to block non-essential scripts (analytics, trackers) that consume CPU cycles during page execution.

## 2. Backend & Database Efficiency 💾
### Goal: Reduce I/O overhead and database lock contention.

- [ ] **SQL Transaction Batching**:
    - Modify `processScrapedAccounts` in `scraperUtils.js` to utilize a single database transaction (`BEGIN` / `COMMIT`) for saving all transactions in a batch.
- [ ] **Warm Cache Optimization**:
    - Further refine the "Warm Cache" logic to ensure we don't hit the DB for duplicate checks on every single record if we can verify them in-memory first. (Partially implemented, but can be improved).
- [ ] **Concurrent Process Limiting**:
    - Ensure strict enforcement of one-scraper-at-a-time (already exists, but could be made more robust with a queuing system if needed).

## 3. Frontend / UI Responsiveness 🖼️
### Goal: Ensure the UI remains buttery smooth even with thousands of transactions.

- [ ] **Table Virtualization**:
    - Implement `react-virtuoso` or `react-window` in `ScrapeReport.tsx` to handle large transaction lists without bloating the DOM.
- [ ] **Polling Backoff Strategy**:
    - Implement intelligent polling in `SyncStatusModal.tsx`:
        - Poll every 2-3s during active syncing.
        - Poll every 30-60s or stop entirely when the app is idle/backgrounded.
- [ ] **Dynamic Component Loading**:
    - Use `next/dynamic` with `ssr: false` for heavy modals and reports to reduce initial JS execution time.

## 4. Monitoring & Infrastructure 🛠️
### Goal: Identifying bottlenecks in real-time.

- [ ] **Performance Logging**:
    - Add execution time tracking to main API routes (scrape, sync status).
- [ ] **Memory Limit Monitoring**:
    - Add a warning or safe-stop if the Node.js process approaches memory limits.

---

## Implementation Priority
1. **Low Resource Mode & Browser Flags** (Core efficiency)
2. **SQL Transaction Batching** (Database speed)
3. **Table Virtualization** (UI responsiveness)
4. **Smart Polling** (Redundant network/CPU usage)
