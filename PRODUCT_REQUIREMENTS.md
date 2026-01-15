# Product Requirements Document (BDD Style)
# Nudlers - Personal Finance Management Application

**Version:** 1.0  
**Last Updated:** January 14, 2026  
**Document Type:** Behavior-Driven Development Requirements

---

## Table of Contents
1. [Overview](#overview)
2. [System Features](#system-features)
3. [Feature Specifications (BDD Scenarios)](#feature-specifications-bdd-scenarios)

---

## Overview

### Purpose
Nudlers is a personal finance management application designed to help users track credit card expenses and bank transactions with automatic categorization capabilities for Israeli financial institutions.

### Tech Stack
- **Frontend:** Next.js, TypeScript, Material-UI
- **Backend:** Next.js API Routes
- **Database:** PostgreSQL 16+
- **Scraping:** Puppeteer with israeli-bank-scrapers
- **AI:** Google Gemini (optional)

### Key Objectives
- Provide comprehensive financial tracking across multiple accounts
- Automate transaction retrieval through web scraping
- Enable smart categorization with custom rules
- Support budget tracking and spending analytics
- Ensure data security with encrypted credentials

---

## System Features

### Core Features
1. Account Management (Bank Accounts & Credit Cards)
2. Transaction Management (Automatic & Manual)
3. Category Management & Auto-categorization Rules
4. Budget Tracking & Analytics
5. Automatic Sync & Scraping
6. AI-Powered Insights
7. Database Management & Backup
8. Theme & Preferences
9. Recurring Payments Tracking
10. Audit Logs & Reports

---

## Feature Specifications (BDD Scenarios)

## 1. Authentication & Security

### Feature: User Authentication
**As a** user  
**I want to** securely access the application  
**So that** my financial data is protected

#### Scenario: Successful login with correct password
```gherkin
Given the application is running
And I have a configured NUDLERS_AUTH_PASSWORD
When I navigate to the application URL
And I enter the correct password
Then I should be logged into the application
And I should see the main dashboard
```

#### Scenario: Failed login with incorrect password
```gherkin
Given the application is running
When I navigate to the application URL
And I enter an incorrect password
Then I should see an error message
And I should remain on the login page
```

### Feature: Credential Encryption
**As a** user  
**I want to** have my bank credentials encrypted  
**So that** they are securely stored

#### Scenario: Storing encrypted credentials
```gherkin
Given I have a valid encryption key (NUDLERS_ENCRYPTION_KEY)
When I add new bank or credit card credentials
Then the credentials should be encrypted using AES-256-GCM
And they should be stored in the database encrypted
And they should only be decrypted when needed for scraping
```

---

## 2. Account Management

### Feature: Add New Account
**As a** user  
**I want to** add bank accounts and credit cards  
**So that** I can track all my financial accounts

#### Scenario: Add a new credit card account
```gherkin
Given I am logged into the application
When I open the "Accounts" modal
And I click "Add New Account"
And I select vendor type "Credit Card"
And I choose a supported vendor (Visa Cal, Max, Isracard, or Amex Israel)
And I enter valid credentials (username, password, card number)
And I optionally enter an account nickname
And I select the card owner
And I save the account
Then the new account should appear in my accounts list
And the credentials should be stored encrypted
```

#### Scenario: Add a new bank account
```gherkin
Given I am logged into the application
When I open the "Accounts" modal
And I click "Add New Account"
And I select vendor type "Bank"
And I choose a supported bank (Hapoalim, Leumi, Mizrahi, Discount, etc.)
And I enter valid credentials
And I optionally enter an account nickname
And I save the account
Then the new account should appear in my accounts list
And the account should be ready for transaction syncing
```

#### Scenario: Validation error on missing required fields
```gherkin
Given I am adding a new account
When I leave required fields empty (vendor, credentials)
And I attempt to save
Then I should see validation error messages
And the account should not be saved
```

### Feature: Edit Account
**As a** user  
**I want to** edit existing account details  
**So that** I can update nicknames or credentials

#### Scenario: Update account nickname
```gherkin
Given I have an existing account
When I open the "Accounts" modal
And I select an account to edit
And I change the nickname
And I save the changes
Then the account nickname should be updated
And the new nickname should appear throughout the application
```

#### Scenario: Update account credentials
```gherkin
Given I have an existing account
When I edit the account credentials
And I save the changes
Then the new credentials should be encrypted and stored
And the next sync should use the updated credentials
```

### Feature: Delete Account
**As a** user  
**I want to** remove accounts I no longer use  
**So that** my account list stays clean

#### Scenario: Delete account with confirmation
```gherkin
Given I have an existing account
When I open the "Accounts" modal
And I click delete on an account
And I confirm the deletion
Then the account should be removed from the database
And all associated credentials should be deleted
And transactions from this account should remain but show as orphaned
```

### Feature: Card Ownership Management
**As a** user with multiple family members  
**I want to** assign card ownership  
**So that** I can track who made which purchases

#### Scenario: Assign card to owner
```gherkin
Given I have multiple card owners configured
And I have a credit card account
When I open the "Card Vendors" modal
And I select a card
And I assign it to a specific owner
Then all transactions from that card should show the assigned owner
And financial reports should be filterable by owner
```

---

## 3. Transaction Syncing & Scraping

### Feature: Manual Account Sync
**As a** user  
**I want to** manually trigger syncing for an account  
**So that** I can get the latest transactions on demand

#### Scenario: Successful manual sync for credit card
```gherkin
Given I have a configured credit card account
When I open the "Sync Status" modal
And I click "Sync Now" for the account
Then the scraping process should start
And I should see real-time progress updates
And new transactions should be retrieved and stored
And I should see a sync report with results
And the last sync time should be updated
```

#### Scenario: Sync with real-time progress (SSE)
```gherkin
Given I initiate a manual sync
When the scraping is in progress
Then I should see real-time status updates
And progress information should stream via Server-Sent Events
And I should see which account is being processed
And I should see the number of transactions found
```

#### Scenario: Failed sync due to incorrect credentials
```gherkin
Given I have an account with incorrect credentials
When I attempt to sync
Then the sync should fail with an authentication error
And I should see an error message indicating credential issues
And I should be prompted to update the credentials
```

#### Scenario: Sync blocked by bot detection
```gherkin
Given I am syncing an Isracard/Amex/Max account
And the vendor detects automation
When the sync process encounters "Block Automation" error
Then the sync should fail gracefully
And I should see a message explaining the block
And I should see recommendations (wait 24-48 hours, reduce date range)
And the error should be logged in the audit trail
```

### Feature: Automatic Background Sync
**As a** user  
**I want to** have accounts automatically sync at intervals  
**So that** my transactions are always up to date

#### Scenario: Enable automatic sync
```gherkin
Given I have configured accounts
When I open Settings
And I enable "Automatic Sync"
And I set sync interval to "24 hours"
And I save settings
Then the system should automatically sync all enabled accounts every 24 hours
And the background scheduler should run continuously
```

#### Scenario: Automatic sync execution
```gherkin
Given automatic sync is enabled with 12-hour interval
And 12 hours have passed since the last sync
When the scheduled time arrives
Then the system should automatically sync all accounts
And sync results should be logged
And sync status should be updated for each account
And I should be able to view the sync report
```

### Feature: Catch-up Sync
**As a** user  
**I want to** sync from the last transaction date  
**So that** I don't have to manually specify date ranges

#### Scenario: Catch-up sync from last transaction
```gherkin
Given I have an account with existing transactions
And the last transaction date is January 1, 2026
When I perform a catch-up sync on January 14, 2026
Then the system should retrieve transactions from January 2, 2026 onwards
And only new transactions should be added
And duplicate transactions should be prevented
```

#### Scenario: First-time sync with configured history
```gherkin
Given I have a newly added account with no transactions
And settings specify "Days to Sync Back" = 90
When I perform the first sync
Then the system should retrieve transactions from the last 90 days
And all transactions should be stored
```

### Feature: Sync Configuration
**As a** user  
**I want to** configure sync behavior  
**So that** syncing works according to my preferences

#### Scenario: Configure days to sync back
```gherkin
Given I open the Settings modal
When I set "Days to Sync Back" to 60
And I save settings
Then future first-time syncs should retrieve 60 days of history
```

#### Scenario: Configure sync retry attempts
```gherkin
Given I open the Settings modal
When I set "Number of Retries" to 3
And I save settings
Then failed sync attempts should retry up to 3 times
And each retry should be logged
```

#### Scenario: Configure category update on re-scrape
```gherkin
Given I have existing transactions with categories
And I have a new categorization rule
When I enable "Update Category on Re-scrape" in Settings
And I perform a re-scrape
Then existing transaction categories should be updated
And the category update should be logged in audit trail
```

---

## 4. Transaction Management

### Feature: View Transactions
**As a** user  
**I want to** view all my transactions  
**So that** I can monitor my spending

#### Scenario: View transactions in monthly summary
```gherkin
Given I have transactions for January 2026
When I navigate to the main dashboard
And I select "January 2026" month
Then I should see all credit card transactions for that billing cycle
And transactions should be grouped by category
And each category should show total spending
```

#### Scenario: View transactions by category
```gherkin
Given I have transactions in multiple categories
When I click on a category (e.g., "Groceries")
Then I should see all transactions in that category
And I should see the transaction details (date, description, amount, account)
And I should see a timeline graph of spending over time
```

#### Scenario: View transaction details
```gherkin
Given I have a transaction
When I view the transaction in the table
Then I should see:
  - Transaction date
  - Processed date (billing cycle date)
  - Description
  - Amount
  - Category
  - Account name/nickname (with last 4 digits for credit cards)
  - Installment information (if applicable)
  - Transaction source (scraper vs manual)
```

### Feature: Manual Transaction Entry
**As a** user  
**I want to** manually add transactions  
**So that** I can track cash purchases and income

#### Scenario: Add manual expense transaction
```gherkin
Given I open the "Manual Transaction" modal
When I select transaction type "Expense"
And I enter description "Coffee Shop"
And I enter amount "45.50"
And I select category "Dining"
And I select account (optional)
And I select date "January 14, 2026"
And I save the transaction
Then the transaction should appear in my transaction list
And it should be marked as manually entered
And it should be included in category totals
```

#### Scenario: Add manual income transaction
```gherkin
Given I open the "Manual Transaction" modal
When I select transaction type "Income"
And I enter description "Freelance Payment"
And I enter amount "5000"
And I select date "January 14, 2026"
And I save the transaction
Then the income should be recorded
And it should appear in the appropriate views
```

#### Scenario: Add installment transaction
```gherkin
Given I am adding a manual transaction
When I check "Is Installment"
And I enter total installments "12"
And I enter current installment "3"
And I save the transaction
Then the transaction should show "3/12" installment info
And it should be tracked in recurring payments
```

### Feature: Edit Transaction
**As a** user  
**I want to** edit transaction details  
**So that** I can correct mistakes or update categories

#### Scenario: Change transaction category
```gherkin
Given I have a transaction categorized as "Shopping"
When I click edit on the transaction
And I change the category to "Clothing"
And I save the changes
Then the transaction should move to the "Clothing" category
And category totals should be recalculated
```

#### Scenario: Edit transaction description
```gherkin
Given I have a transaction
When I edit the description to be more specific
And I save the changes
Then the updated description should be displayed
```

### Feature: Delete Transaction
**As a** user  
**I want to** delete erroneous transactions  
**So that** my records are accurate

#### Scenario: Delete transaction with confirmation
```gherkin
Given I have a transaction I want to delete
When I click the delete button
Then I should see a confirmation dialog
And the dialog should show transaction details
When I confirm deletion
Then the transaction should be permanently removed
And category totals should be recalculated
```

#### Scenario: Cancel transaction deletion
```gherkin
Given I initiate a transaction deletion
When I see the confirmation dialog
And I click "Cancel"
Then the transaction should not be deleted
And the dialog should close
```

### Feature: Transaction Search and Filtering
**As a** user  
**I want to** search and filter transactions  
**So that** I can find specific transactions quickly

#### Scenario: Search transactions by description
```gherkin
Given I have multiple transactions
When I enter "Supermarket" in the search box
Then I should see only transactions containing "Supermarket" in the description
```

#### Scenario: Filter transactions by date range
```gherkin
Given I have transactions spanning multiple months
When I select date range "January 1 - January 15, 2026"
Then I should see only transactions within that range
```

#### Scenario: Filter transactions by account
```gherkin
Given I have transactions from multiple accounts
When I filter by a specific account (e.g., "Visa Cal - 1234")
Then I should see only transactions from that account
```

---

## 5. Category Management

### Feature: View Categories
**As a** user  
**I want to** see all my spending categories  
**So that** I understand where my money goes

#### Scenario: View category summary
```gherkin
Given I have transactions in various categories
When I view the monthly summary
Then I should see categories sorted by total spending (highest to lowest)
And each category should show:
  - Category name
  - Total amount spent
  - Number of transactions
  - Percentage of total spending
```

#### Scenario: View category expense details
```gherkin
Given I click on a category
When the category modal opens
Then I should see all transactions in that category
And I should see a timeline graph showing spending over time
And I should be able to edit or delete transactions
```

### Feature: Rename Category
**As a** user  
**I want to** rename categories  
**So that** they better reflect my spending habits

#### Scenario: Rename an existing category
```gherkin
Given I have a category named "Food"
When I open the "Quick Categories" modal
And I select the "Food" category
And I rename it to "Groceries"
And I save the change
Then all transactions in "Food" should now be in "Groceries"
And the category should appear as "Groceries" everywhere
```

### Feature: Merge Categories
**As a** user  
**I want to** merge similar categories  
**So that** I can consolidate my spending tracking

#### Scenario: Merge two categories
```gherkin
Given I have categories "Restaurants" and "Dining"
When I open the "Quick Categories" modal
And I select "Merge Categories"
And I choose "Restaurants" as source
And I choose "Dining" as target
And I confirm the merge
Then all transactions from "Restaurants" should move to "Dining"
And the "Restaurants" category should be removed
And totals for "Dining" should include both categories' transactions
```

### Feature: Delete Category
**As a** user  
**I want to** delete unused categories  
**So that** my category list stays organized

#### Scenario: Delete empty category
```gherkin
Given I have a category with no transactions
When I delete the category
Then the category should be removed from the system
```

#### Scenario: Attempt to delete category with transactions
```gherkin
Given I have a category with existing transactions
When I attempt to delete the category
Then I should see a warning message
And I should be prompted to either:
  - Move transactions to another category first
  - Or merge the category instead
```

---

## 6. Categorization Rules

### Feature: Create Categorization Rule
**As a** user  
**I want to** create automatic categorization rules  
**So that** transactions are categorized without manual intervention

#### Scenario: Create pattern-based rule
```gherkin
Given I open the Settings modal
And I navigate to "Categorization Rules"
When I click "Add New Rule"
And I enter pattern "SUPER*" (matches "SUPER", "SUPERMARKET", etc.)
And I select category "Groceries"
And I save the rule
Then future transactions matching this pattern should be auto-categorized as "Groceries"
```

#### Scenario: Create exact match rule
```gherkin
Given I am creating a categorization rule
When I enter pattern "STARBUCKS" (exact match)
And I select category "Coffee"
And I save the rule
Then only transactions with description exactly "STARBUCKS" should be categorized as "Coffee"
```

### Feature: Apply Categorization Rules
**As a** user  
**I want to** apply rules to existing transactions  
**So that** my historical data is also categorized

#### Scenario: Apply all rules to uncategorized transactions
```gherkin
Given I have uncategorized transactions
And I have defined categorization rules
When I click "Apply Rules" in the Quick Categories modal
And I select "Apply to uncategorized only"
And I confirm the action
Then all matching uncategorized transactions should be categorized
And I should see a summary of how many transactions were categorized
```

#### Scenario: Apply rules to all transactions (re-categorize)
```gherkin
Given I have transactions with existing categories
And I have updated categorization rules
When I click "Apply Rules"
And I select "Apply to all transactions"
And I confirm the action
Then all transactions matching rules should be re-categorized
And the changes should be logged in the audit trail
```

### Feature: Manage Categorization Rules
**As a** user  
**I want to** edit and delete rules  
**So that** I can keep my rules up to date

#### Scenario: Edit existing rule
```gherkin
Given I have a categorization rule
When I edit the rule pattern or category
And I save the changes
Then the updated rule should be used for future categorizations
```

#### Scenario: Delete categorization rule
```gherkin
Given I have a categorization rule
When I delete the rule
Then the rule should be removed
And it should no longer be applied to new transactions
And existing categorized transactions should remain unchanged
```

#### Scenario: Rule priority and conflict resolution
```gherkin
Given I have multiple rules that could match a transaction
When a new transaction arrives
Then the first matching rule (by order) should be applied
And only one category should be assigned
```

---

## 7. Budget Management

### Feature: Set Category Budget
**As a** user  
**I want to** set budgets for spending categories  
**So that** I can control my expenses

#### Scenario: Set budget for a category
```gherkin
Given I am viewing the Budget Dashboard
When I select a category "Groceries"
And I set a monthly budget of "2000"
And I save the budget
Then the category should show budget of 2000
And I should see budget vs actual spending comparison
```

#### Scenario: View budget performance
```gherkin
Given I have set a budget of 2000 for "Groceries"
And I have spent 1500 in "Groceries" this month
When I view the Budget Dashboard
Then I should see:
  - Budget: 2000
  - Spent: 1500
  - Remaining: 500
  - Percentage used: 75%
  - Visual indicator (green/yellow/red based on usage)
```

#### Scenario: Budget exceeded warning
```gherkin
Given I have a budget of 1000 for "Dining"
When my spending in "Dining" reaches 1100
Then the category should display in red
And I should see "-100" remaining
And I should see "110%" usage indicator
```

### Feature: Total Budget Management
**As a** user  
**I want to** set an overall spending budget  
**So that** I can control total credit card expenses

#### Scenario: Set total monthly budget
```gherkin
Given I open the Budget Dashboard
When I set "Total Budget" to 10000
And I save
Then I should see total budget vs total actual spending
And I should see how much budget is remaining across all categories
```

### Feature: Budget vs Actual Reports
**As a** user  
**I want to** view budget performance reports  
**So that** I can analyze my spending patterns

#### Scenario: View monthly budget report
```gherkin
Given I have set budgets for multiple categories
When I view the Budget Dashboard for January 2026
Then I should see a comparison for each budgeted category
And categories should be sorted by overspending/underspending
And I should see visual indicators for budget health
```

---

## 8. Billing Cycles

### Feature: Configure Billing Cycle
**As a** user  
**I want to** set my billing cycle start day  
**So that** transactions are grouped correctly by month

#### Scenario: Set billing cycle start day
```gherkin
Given I open Settings
When I set "Billing Cycle Start Day" to 10
And I save settings
Then transactions should be grouped by cycles starting on the 10th of each month
And a transaction on January 12, 2026 should appear in the "January" cycle
And a transaction on January 5, 2026 should appear in the "December" cycle
```

#### Scenario: View transactions by billing cycle
```gherkin
Given my billing cycle starts on day 15
When I view the monthly summary for "January"
Then I should see transactions from December 15, 2025 to January 14, 2026
And the next cycle should include January 15 to February 14, 2026
```

---

## 9. Recurring Payments & Installments

### Feature: Track Recurring Payments
**As a** user  
**I want to** identify recurring payments  
**So that** I can monitor subscriptions and installments

#### Scenario: View recurring payments
```gherkin
Given I have transactions with installment information
When I open "Recurring Payments" modal
Then I should see all installment-based transactions grouped by description
And each group should show:
  - Description
  - Current installment / Total installments
  - Amount per installment
  - Progress bar
```

#### Scenario: Identify subscription-like patterns
```gherkin
Given I have multiple transactions with the same description and amount
And they occur monthly
When I view Recurring Payments
Then the system should group them as potential recurring payments
And I should be able to see the payment history
```

---

## 10. AI Assistant

### Feature: AI-Powered Financial Insights
**As a** user  
**I want to** get AI-powered insights about my spending  
**So that** I can make better financial decisions

#### Scenario: Ask AI about spending patterns
```gherkin
Given GEMINI_API_KEY is configured
When I open the AI Assistant
And I ask "What are my top spending categories this month?"
Then the AI should analyze my transactions
And provide a detailed breakdown of top spending categories
And offer insights and recommendations
```

#### Scenario: Get AI budget recommendations
```gherkin
Given I have transaction history
When I ask the AI "Should I adjust my dining budget?"
Then the AI should analyze my dining spending trends
And compare against current budget
And provide data-driven recommendations
```

#### Scenario: AI chat with streaming responses
```gherkin
Given I am chatting with the AI assistant
When I send a message
Then I should receive a streaming response (SSE)
And the response should appear in real-time as it's generated
```

#### Scenario: AI without API key configured
```gherkin
Given GEMINI_API_KEY is not configured
When I try to open the AI Assistant
Then the feature should be disabled or show a configuration message
```

---

## 11. Sync Status & Monitoring

### Feature: View Sync Status
**As a** user  
**I want to** see the sync status of all accounts  
**So that** I know which accounts are up to date

#### Scenario: View all account sync statuses
```gherkin
Given I have multiple configured accounts
When I open the "Sync Status" modal
Then I should see each account with:
  - Account name/nickname
  - Last sync timestamp
  - Sync status (Success, Failed, In Progress, Unknown)
  - Color-coded status indicator
```

#### Scenario: Unknown status shows last sync time
```gherkin
Given an account has status "Unknown"
When I view the sync status
Then instead of showing "Unknown"
The system should display "Last synced: [timestamp]"
```

### Feature: Sync History
**As a** user  
**I want to** view sync history  
**So that** I can track when syncs occurred

#### Scenario: View recent sync activity
```gherkin
Given I have performed multiple syncs
When I open "Sync Status" modal
And I view "Recent Activity"
Then I should see a chronological list of sync events
And each event should show:
  - Timestamp
  - Account name
  - Result (success/failure)
  - Number of transactions retrieved
```

#### Scenario: Click to view detailed sync report
```gherkin
Given I have a sync event in recent activity
When I click on the event
Then I should see a detailed sync report showing:
  - Transactions found
  - Transactions added/updated
  - Categories assigned
  - Rules applied
  - Any errors encountered
```

---

## 12. Scrape Audit & Reporting

### Feature: Scrape Audit Log
**As a** user  
**I want to** view detailed logs of scraping operations  
**So that** I can troubleshoot issues and verify sync accuracy

#### Scenario: View scrape audit log
```gherkin
Given I have performed scraping operations
When I open "Scrape Audit" modal
Then I should see a log of all scrape events including:
  - Timestamp
  - Account
  - Action (new transaction, updated category, etc.)
  - Details
```

#### Scenario: Audit log shows category updates
```gherkin
Given I re-scraped transactions
And categories were updated due to new rules
When I view the scrape audit log
Then I should see entries specifically mentioning "Category updated from X to Y"
```

### Feature: Scrape Report
**As a** user  
**I want to** see detailed reports after each scrape  
**So that** I understand what was retrieved

#### Scenario: View scrape report after sync
```gherkin
Given I completed a manual sync
When the sync finishes
Then I should see a scrape report displaying:
  - Total transactions found
  - New transactions added
  - Duplicate transactions skipped
  - Categories assigned
  - Rules applied
  - Accounts processed
  - Time taken
```

#### Scenario: Scrape report visible from account settings
```gherkin
Given I initiate a sync from the Accounts modal
When the sync completes
Then the scrape report should be displayed
And I should be able to review the results before closing
```

---

## 13. Database Management

### Feature: Database Backup
**As a** user  
**I want to** backup my financial data  
**So that** I don't lose important information

#### Scenario: Export database backup
```gherkin
Given I have financial data in the system
When I open "Database Backup" modal
And I click "Export Database"
Then a backup file should be downloaded
And the backup should include:
  - All transactions
  - All categories
  - All rules
  - All accounts (credentials excluded)
  - Settings
```

#### Scenario: Backup file format
```gherkin
Given I export a database backup
Then the backup should be in JSON format
And it should be timestamped
And it should be named "nudlers_backup_YYYY-MM-DD_HH-MM.json"
```

### Feature: Database Restore
**As a** user  
**I want to** restore data from a backup  
**So that** I can recover from data loss or migrate to a new system

#### Scenario: Import database backup
```gherkin
Given I have a valid backup file
When I open "Database Backup" modal
And I click "Import Database"
And I select the backup file
And I confirm the import
Then all data from the backup should be restored
And existing data should be merged/replaced as appropriate
And I should see a confirmation message
```

#### Scenario: Invalid backup file error
```gherkin
Given I attempt to import an invalid backup file
When the system validates the file
Then I should see an error message
And the import should be cancelled
```

### Feature: Database Error Handling
**As a** user  
**I want to** see clear messages if database connection fails  
**So that** I can troubleshoot the issue

#### Scenario: Database connection failure
```gherkin
Given the PostgreSQL database is not accessible
When I try to access the application
Then I should see a "Database Error" screen
And the error message should explain the connection failed
And the application should not crash
```

---

## 14. Settings & Preferences

### Feature: Sync Settings
**As a** user  
**I want to** configure sync behavior  
**So that** syncing works according to my needs

#### Scenario: Configure all sync settings
```gherkin
Given I open Settings modal
When I configure the following:
  - Enable Automatic Sync: ON
  - Sync Interval Hours: 24
  - Days to Sync Back: 90
  - Number of Retries: 3
  - Update Category on Re-scrape: ON
And I save settings
Then all these preferences should be persisted
And they should be applied to subsequent sync operations
```

### Feature: Display Settings
**As a** user  
**I want to** customize display preferences  
**So that** the app looks the way I prefer

#### Scenario: Set billing cycle start day
```gherkin
Given I open Settings
When I set "Billing Cycle Start Day" to 1
And I save
Then monthly summaries should use the 1st as cycle start
```

#### Scenario: Set default currency
```gherkin
Given I open Settings
When I set "Default Currency" to "ILS"
And I save
Then all amounts should display with "₪" symbol
```

#### Scenario: Set date format
```gherkin
Given I open Settings
When I choose date format "DD/MM/YYYY"
And I save
Then all dates should display in DD/MM/YYYY format
```

### Feature: Theme Selection
**As a** user  
**I want to** switch between dark and light themes  
**So that** the app is comfortable to use in different lighting conditions

#### Scenario: Switch to dark theme
```gherkin
Given the app is in light theme
When I toggle the theme switch to dark mode
Then all components should use dark theme colors
And the preference should be saved
And the theme should persist after page reload
```

#### Scenario: Theme applies globally
```gherkin
Given I enable dark mode
When I navigate to any modal or component
Then all UI elements should respect the dark theme
And there should be no hardcoded light backgrounds
```

---

## 15. Card Vendors Management

### Feature: Manage Card Last 4 Digits
**As a** user  
**I want to** configure last 4 digits for cards  
**So that** transactions show which specific card was used

#### Scenario: Set last 4 digits for card
```gherkin
Given I have a credit card account without last 4 digits set
When I open "Card Vendors" modal
And I select the card
And I enter the last 4 digits "1234"
And I save
Then all transactions from this card should display "****1234"
```

#### Scenario: View transactions by card last 4
```gherkin
Given I have multiple cards with last 4 digits configured
When I filter transactions by "****1234"
Then I should see only transactions from that specific card
```

---

## 16. Notifications & Feedback

### Feature: User Notifications
**As a** user  
**I want to** receive feedback for my actions  
**So that** I know if operations succeeded or failed

#### Scenario: Success notification
```gherkin
Given I complete an action (save settings, add transaction, etc.)
When the operation succeeds
Then I should see a success notification/toast
And it should auto-dismiss after a few seconds
```

#### Scenario: Error notification
```gherkin
Given I attempt an action that fails
When an error occurs
Then I should see an error notification with details
And the notification should remain until I dismiss it
```

---

## 17. Transaction Source Tracking

### Feature: Identify Transaction Source
**As a** user  
**I want to** know if a transaction was scraped or manually entered  
**So that** I can trust the data accuracy

#### Scenario: View transaction source
```gherkin
Given I have both scraped and manual transactions
When I view the transactions table
Then each transaction should indicate its source
And scraped transactions should show "Scraper"
And manual transactions should show "Manual"
```

#### Scenario: Category source attribution
```gherkin
Given a transaction was categorized
When I view transaction details
Then I should see how the category was assigned:
  - "From Scraper" (category came from bank)
  - "From Rule" (category matched a rule)
  - "Manual" (user assigned category)
```

---

## 18. Duplicate Prevention

### Feature: Prevent Duplicate Transactions
**As a** system  
**I want to** detect and prevent duplicate transactions  
**So that** spending totals are accurate

#### Scenario: Skip duplicate during sync
```gherkin
Given I have a transaction from January 1, 2026 for 100 ILS at "SUPERMARKET"
When I re-scrape the same period
And the same transaction is found again
Then the duplicate should be detected
And it should not be inserted again
And the scrape report should note "X duplicates skipped"
```

#### Scenario: Duplicate detection criteria
```gherkin
Given two transactions are considered duplicates if:
  - Same date
  - Same amount
  - Same description  
  - Same account
When any of these differ
Then they should be treated as separate transactions
```

---

## 19. Performance & Scalability

### Feature: Handle Large Transaction Volumes
**As a** system  
**I want to** efficiently handle thousands of transactions  
**So that** the application remains responsive

#### Scenario: Load large transaction dataset
```gherkin
Given I have 10,000+ transactions in the database
When I view the monthly summary
Then the page should load within 3 seconds
And category calculations should be accurate
```

#### Scenario: Pagination for large result sets
```gherkin
Given I have hundreds of transactions in a category
When I view the category details
Then transactions should be paginated
And I should be able to navigate through pages
```

---

## 20. Data Integrity & Migration

### Feature: Database Migrations
**As a** system  
**I want to** automatically apply schema changes  
**So that** updates don't break existing installations

#### Scenario: Automatic migration on startup
```gherkin
Given the application is updated with new database schema
When the application starts
Then migrations should run automatically
And the database should be updated to the latest version
And existing data should be preserved
```

#### Scenario: Migration adds new settings
```gherkin
Given a new feature requires a new setting
When the migration runs
Then the new setting should be added with a default value
And existing settings should remain unchanged
```

---

## 21. Error Handling & Resilience

### Feature: Graceful Error Handling
**As a** system  
**I want to** handle errors gracefully  
**So that** users have a good experience even when things go wrong

#### Scenario: Network timeout during sync
```gherkin
Given I am syncing an account
When a network timeout occurs
And retries are configured
Then the system should retry the operation
And if all retries fail, show a clear error message
And the error should be logged
```

#### Scenario: Invalid data from scraper
```gherkin
Given the scraper returns invalid/malformed data
When processing the scraped data
Then the system should validate the data
And skip invalid entries
And log the validation errors
And continue processing valid entries
```

---

## 22. Multi-Account Workflows

### Feature: Sync All Accounts
**As a** user with multiple accounts  
**I want to** sync all accounts at once  
**So that** I don't have to sync each one individually

#### Scenario: Sync all accounts
```gherkin
Given I have 5 configured accounts (3 credit cards, 2 banks)
When I click "Sync All" in the Sync Status modal
Then all 5 accounts should be synced sequentially
And I should see progress for each account
And the final report should summarize results for all accounts
```

#### Scenario: One account fails during sync all
```gherkin
Given I am syncing all accounts
When one account fails (e.g., credential error)
Then the sync should continue with remaining accounts
And the failed account should be marked as failed
And successful accounts should complete normally
```

---

## 23. Financial Analytics

### Feature: Spending Trends
**As a** user  
**I want to** see spending trends over time  
**So that** I can understand my financial patterns

#### Scenario: View category spending over time
```gherkin
Given I have transaction history spanning 6 months
When I view a category's expense modal
Then I should see a timeline graph
And the graph should show spending per day/month
And I should be able to identify trends (increasing/decreasing)
```

#### Scenario: Compare month-over-month spending
```gherkin
Given I have data for multiple months
When I view monthly summaries
Then I should be able to compare spending across months
And identify which categories increased or decreased
```

### Feature: Box Panel Dashboard Data
**As a** user  
**I want to** see key financial metrics at a glance  
**So that** I quickly understand my financial status

#### Scenario: View dashboard summary boxes
```gherkin
Given I am viewing the main dashboard
Then I should see summary boxes showing:
  - Total spending this month
  - Budget remaining
  - Top spending category
  - Number of transactions
  - Comparison to previous month
```

---

## 24. VNC/Remote Access (if applicable)

### Feature: Remote Access to Scraping Browser
**As a** system administrator  
**I want to** remotely view the browser during scraping  
**So that** I can debug scraping issues

#### Scenario: Access VNC viewer
```gherkin
Given VNC is enabled in the system
When I navigate to /vnc endpoint
Then I should see a VNC viewer
And I should be able to see the browser automation in real-time
```

---

## Non-Functional Requirements

### Security
```gherkin
Scenario: Credentials are encrypted at rest
  Given user credentials are stored
  Then they must be encrypted with AES-256-GCM
  And the encryption key must be stored securely
  And credentials must only be decrypted during scraping operations
```

### Performance
```gherkin
Scenario: Page load times
  Given the application is running
  When I navigate to any page
  Then the page should load within 3 seconds on a standard connection
```

### Reliability
```gherkin
Scenario: Application uptime
  Given the application is deployed
  Then it should maintain 99%+ uptime
  And gracefully handle database disconnections
```

### Compatibility
```gherkin
Scenario: Browser compatibility
  Given the application is web-based
  Then it should work on:
    - Chrome (latest)
    - Firefox (latest)
    - Safari (latest)
    - Edge (latest)
```

### Responsive Design
```gherkin
Scenario: Mobile responsiveness
  Given I access the application on a mobile device
  Then all components should be responsive
  And I should be able to perform all operations
  And the UI should adapt to screen size
```

---

## Edge Cases & Error Scenarios

### Edge Case: First-time User
```gherkin
Scenario: New user with empty database
  Given I am a first-time user with no data
  When I log in
  Then I should see an empty dashboard
  And I should be guided to add my first account
  And the application should not error due to missing data
```

### Edge Case: Account with No Transactions
```gherkin
Scenario: Account returns zero transactions
  Given I sync an account
  When the scraper finds no transactions in the date range
  Then the sync should complete successfully
  And the report should indicate "0 transactions found"
  And no error should be shown
```

### Edge Case: Very Large Transaction Amount
```gherkin
Scenario: Transaction with large amount
  Given a transaction has amount 1,000,000 ILS
  When I view the transaction
  Then the amount should display correctly formatted
  And it should not cause UI layout issues
```

### Edge Case: Special Characters in Description
```gherkin
Scenario: Transaction description with special characters
  Given a transaction has description "Coffee & Tea - 'Espresso' (50% off)"
  When the transaction is stored and displayed
  Then special characters should be properly escaped
  And the description should display correctly
```

---

## Testing Acceptance Criteria

### For Each Feature:
1. **All positive scenarios** must pass
2. **All negative scenarios** must show appropriate errors
3. **Edge cases** must be handled gracefully
4. **Data integrity** must be maintained
5. **Performance** must meet specified thresholds
6. **Security** requirements must be enforced
7. **UI/UX** must be consistent across all screens

### Test Coverage Requirements:
- **Unit Tests:** Critical business logic (categorization, calculations, encryption)
- **Integration Tests:** API endpoints, database operations
- **E2E Tests:** Complete user workflows (add account → sync → view transactions)
- **Browser Tests:** UI components and user interactions
- **Performance Tests:** Large data sets, concurrent operations
- **Security Tests:** Credential encryption, authentication, SQL injection prevention

---

## Appendix: Gherkin Syntax Reference

### Structure:
- **Feature:** High-level capability
- **Scenario:** Specific test case
- **Given:** Initial context/preconditions
- **When:** Action/event
- **Then:** Expected outcome
- **And/But:** Additional conditions or outcomes

### Example:
```gherkin
Feature: [Name]
  As a [role]
  I want to [capability]
  So that [benefit]

  Scenario: [Description]
    Given [precondition]
    And [another precondition]
    When [action]
    Then [expected result]
    And [another expected result]
```

---

**End of Product Requirements Document**

*This document should be used as a foundation for implementing comprehensive BDD-style tests using frameworks like Cucumber, Behave, or Jest with BDD syntax.*
