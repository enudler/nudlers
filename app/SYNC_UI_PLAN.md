# Sync UI Improvement Plan

## Objective
Improve the "Sync Status" modal to remove confusing zero-value statistics and provide a better visual indication of multi-account scrape progress.

## 1. Remove "Syncs" Statistic Box
**Issue:** The "Syncs" box consistently displays `0` and provides little value to the user in its current form.
**Action:** Remove the UI element entirely.

**Implementation Details:**
- **File:** `app/components/SyncStatusModal.tsx`
- **Target:** Locating the `Box` containing the "Syncs" label (approx. lines 1196-1210).
- **Change:** Delete the code block responsible for rendering this statistic card.

## 2. Implement Cumulative Scrape Progress
**Issue:** When running "Sync All", the progress view resets for each account. The user only sees the *current* scraper's status, losing context of what has already completed during the current session.

**Proposed Solution:**
Introduce a "Session Progress" view that lists all accounts in the queue, showing their status (Pending, Syncing, Completed, Failed).

**Implementation Steps:**

### A. State Management
1.  **New State Variable:** Add `syncQueueStatus` to track the state of all accounts in the current batch.
    ```typescript
    interface QueueItem {
        accountName: string;
        vendor: string;
        status: 'pending' | 'active' | 'completed' | 'failed';
        error?: string;
    }
    const [syncQueue, setSyncQueue] = useState<QueueItem[]>([]);
    ```
2.  **Initialization:** When `handleSyncAll` starts:
    -   Fetch accounts.
    -   Initialize `syncQueue` with all accounts set to `'pending'`.

### B. Logic Updates (`handleSyncAll`)
1.  **Before Loop:** Populate `syncQueue`.
2.  **Start of Loop (per account):**
    -   Update the specific account in `syncQueue` to `'active'`.
3.  **On Failure/Success:**
    -   Update the specific account in `syncQueue` to `'completed'` or `'failed'`.

### C. UI Updates
1.  **Progress Section:**
    -   Instead of just showing the *current* single progress bar, render the `syncQueue` list.
    -   **Active Item:** Show the detailed progress bar and step description (existing UI) *under* the active item in the list.
    -   **Completed Items:** Show a green checkmark or simple "Done" status.
    -   **Pending Items:** Show distinct "Waiting" state.

**Mockup Concept:**
```
[✔] Leumi (Completed)
[⟳] Hapoalim (Syncing...)
    [====================] 45%
    Fetching transactions...
[ ] Isracard (Pending)
```

## 3. Execution Strategy
1.  **Step 1:** Apply quick fix to remove the "Syncs" box (Low risk).
2.  **Step 2:** Refactor `handleSyncAll` to populate and maintain the `syncQueue` state.
3.  **Step 3:** Update the JSX to render the queue list, integrating the existing single-scraper progress bar as a child of the active list item.
