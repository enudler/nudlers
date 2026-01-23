import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Configuration
// In Next.js, we can trust the internal port or use localhost
// Configuration
// In Next.js, we can trust the internal port or use localhost
const PORT = process.env.PORT || "6969";
const API_BASE = process.env.NUDLERS_API_URL || `http://localhost:${PORT}/api`;

// Helper function to make API requests
async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const url = `${API_BASE}${endpoint}`;

    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options.headers,
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<T>;
}

// Helper to format currency
function formatCurrency(amount: number): string {
    return new Intl.NumberFormat("he-IL", {
        style: "currency",
        currency: "ILS",
    }).format(amount);
}

export function createMcpServer() {
    const server = new McpServer({
        name: "nudlers",
        version: "1.0.0",
    });

    // ============================================================================
    // TOOL: Get Monthly Summary
    // ============================================================================
    server.tool(
        "get_monthly_summary",
        "Get a monthly financial summary with expenses grouped by vendor/card. Returns bank income, bank expenses, card expenses, and net balance.",
        {
            billingCycle: z
                .string()
                .optional()
                .describe("Billing cycle in YYYY-MM format (e.g., 2026-01). If not provided, uses current month."),
            startDate: z
                .string()
                .optional()
                .describe("Start date in YYYY-MM-DD format (alternative to billingCycle)"),
            endDate: z
                .string()
                .optional()
                .describe("End date in YYYY-MM-DD format (alternative to billingCycle)"),
            groupBy: z
                .enum(["vendor", "description", "last4digits"])
                .optional()
                .describe("How to group results: 'vendor' (default), 'description', or 'last4digits'"),
        },
        async ({ billingCycle, startDate, endDate, groupBy }) => {
            try {
                const params = new URLSearchParams();

                if (billingCycle) {
                    params.append("billingCycle", billingCycle);
                } else if (startDate && endDate) {
                    params.append("startDate", startDate);
                    params.append("endDate", endDate);
                } else {
                    // Default to current month
                    const now = new Date();
                    const currentCycle = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
                    params.append("billingCycle", currentCycle);
                }

                if (groupBy) {
                    params.append("groupBy", groupBy);
                }

                const response = await apiRequest<{ items: any[] } | any[]>(`/reports/monthly-summary?${params}`);
                let data: any[] = [];

                if (Array.isArray(response)) {
                    data = response;
                } else if (response && Array.isArray(response.items)) {
                    data = response.items;
                }

                if (!data || data.length === 0) {
                    return {
                        content: [{ type: "text", text: "No data found for the specified period." }],
                    };
                }

                // Calculate totals
                let totalCardExpenses = 0;
                let totalBankIncome = 0;
                let totalBankExpenses = 0;

                const lines = data.map((row: any) => {
                    totalCardExpenses += Number(row.card_expenses) || 0;
                    totalBankIncome += Number(row.bank_income) || 0;
                    totalBankExpenses += Number(row.bank_expenses) || 0;

                    if (groupBy === "description") {
                        return `• ${row.description} (${row.category || "Uncategorized"}): ${formatCurrency(row.card_expenses)} (${row.transaction_count} transactions)`;
                    } else if (groupBy === "last4digits") {
                        return `• Card ***${row.last4digits}: ${formatCurrency(row.card_expenses)} (${row.transaction_count} transactions)`;
                    } else {
                        const name = row.vendor_nickname || row.vendor;
                        return `• ${name}: Card ${formatCurrency(row.card_expenses)}, Bank Income ${formatCurrency(row.bank_income)}, Bank Expenses ${formatCurrency(row.bank_expenses)}`;
                    }
                });

                const summary = [
                    `📊 Monthly Summary`,
                    `Period: ${billingCycle || `${startDate} to ${endDate}`}`,
                    "",
                    "--- Breakdown ---",
                    ...lines,
                    "",
                    "--- Totals ---",
                    `💳 Total Card Expenses: ${formatCurrency(totalCardExpenses)}`,
                    `📈 Total Bank Income: ${formatCurrency(totalBankIncome)}`,
                    `📉 Total Bank Expenses: ${formatCurrency(totalBankExpenses)}`,
                    `💰 Net Balance: ${formatCurrency(totalBankIncome - totalBankExpenses - totalCardExpenses)}`,
                ].join("\n");

                return {
                    content: [{ type: "text", text: summary }],
                };
            } catch (error) {
                return {
                    content: [{ type: "text", text: `Error fetching monthly summary: ${error}` }],
                };
            }
        }
    );

    // ============================================================================
    // TOOL: Get Category Expenses
    // ============================================================================
    server.tool(
        "get_category_expenses",
        "Get all transactions for a specific category in a given time period.",
        {
            category: z.string().describe("Category name to filter by (e.g., 'Groceries', 'Dining')"),
            billingCycle: z
                .string()
                .optional()
                .describe("Billing cycle in YYYY-MM format"),
            startDate: z.string().optional().describe("Start date in YYYY-MM-DD format"),
            endDate: z.string().optional().describe("End date in YYYY-MM-DD format"),
        },
        async ({ category, billingCycle, startDate, endDate }) => {
            try {
                const params = new URLSearchParams();
                params.append("category", category);

                if (billingCycle) {
                    params.append("billingCycle", billingCycle);
                } else if (startDate && endDate) {
                    params.append("startDate", startDate);
                    params.append("endDate", endDate);
                } else {
                    const now = new Date();
                    params.append("billingCycle", `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
                }

                const response = await apiRequest<{ items: any[] } | any[]>(`/reports/category-expenses?${params}`);

                let data: any[] = [];
                if (Array.isArray(response)) {
                    data = response;
                } else if (response && Array.isArray(response.items)) {
                    data = response.items;
                }

                if (!data || data.length === 0) {
                    return {
                        content: [{ type: "text", text: `No transactions found for category "${category}".` }],
                    };
                }

                const total = data.reduce((sum, t) => sum + Math.abs(Number(t.price) || 0), 0);

                const transactions = data.slice(0, 20).map((t: any) => {
                    const date = new Date(t.date).toLocaleDateString("he-IL");
                    const installment = t.installments_total > 1
                        ? ` (${t.installments_number}/${t.installments_total})`
                        : "";
                    return `• ${date}: ${t.name} - ${formatCurrency(Math.abs(t.price))}${installment}`;
                });

                const summary = [
                    `📁 Category: ${category}`,
                    `💰 Total: ${formatCurrency(total)} (${data.length} transactions)`,
                    "",
                    "--- Recent Transactions ---",
                    ...transactions,
                    data.length > 20 ? `\n... and ${data.length - 20} more transactions` : "",
                ].join("\n");

                return {
                    content: [{ type: "text", text: summary }],
                };
            } catch (error) {
                return {
                    content: [{ type: "text", text: `Error fetching category expenses: ${error}` }],
                };
            }
        }
    );

    // ============================================================================
    // TOOL: Get All Categories
    // ============================================================================
    server.tool(
        "get_all_categories",
        "List all spending categories that exist in the system.",
        {},
        async () => {
            try {
                const response = await apiRequest<string[] | { items: string[] }>("/categories");
                let data: string[] = [];
                if (Array.isArray(response)) {
                    data = response;
                } else if (response && Array.isArray((response as any).items)) {
                    data = (response as any).items;
                }

                if (!data || data.length === 0) {
                    return {
                        content: [{ type: "text", text: "No categories found." }],
                    };
                }

                const summary = [
                    `📋 All Categories (${data.length} total)`,
                    "",
                    ...data.map((cat: string) => `• ${cat}`),
                ].join("\n");

                return {
                    content: [{ type: "text", text: summary }],
                };
            } catch (error) {
                return {
                    content: [{ type: "text", text: `Error fetching categories: ${error}` }],
                };
            }
        }
    );

    // ============================================================================
    // TOOL: Search Transactions
    // ============================================================================
    server.tool(
        "search_transactions",
        "Search for transactions by description, vendor, category, or identifier.",
        {
            query: z.string().min(2).describe("Search query (minimum 2 characters)"),
            billingCycle: z.string().optional().describe("Filter by billing cycle (YYYY-MM)"),
            startDate: z.string().optional().describe("Filter start date (YYYY-MM-DD)"),
            endDate: z.string().optional().describe("Filter end date (YYYY-MM-DD)"),
        },
        async ({ query, billingCycle, startDate, endDate }) => {
            try {
                const params = new URLSearchParams();
                params.append("q", query);

                if (billingCycle) {
                    params.append("billingCycle", billingCycle);
                } else if (startDate && endDate) {
                    params.append("startDate", startDate);
                    params.append("endDate", endDate);
                }

                const response = await apiRequest<{ items: any[] } | any[]>(`/transactions?${params}`);

                let data: any[] = [];
                if (Array.isArray(response)) {
                    data = response;
                } else if (response && Array.isArray(response.items)) {
                    data = response.items;
                }

                if (!data || data.length === 0) {
                    return {
                        content: [{ type: "text", text: `No transactions found matching "${query}".` }],
                    };
                }

                const total = data.reduce((sum, t) => sum + Math.abs(Number(t.price) || 0), 0);

                const transactions = data.slice(0, 25).map((t: any) => {
                    const date = new Date(t.date).toLocaleDateString("he-IL");
                    const category = t.category || "Uncategorized";
                    const vendor = t.vendor_nickname || t.vendor;
                    return `• ${date}: ${t.name} (${category}) - ${formatCurrency(Math.abs(t.price))} [${vendor}]`;
                });

                const summary = [
                    `🔍 Search Results for "${query}"`,
                    `Found ${data.length} transactions, Total: ${formatCurrency(total)}`,
                    "",
                    ...transactions,
                    data.length > 25 ? `\n... and ${data.length - 25} more results` : "",
                ].join("\n");

                return {
                    content: [{ type: "text", text: summary }],
                };
            } catch (error) {
                return {
                    content: [{ type: "text", text: `Error searching transactions: ${error}` }],
                };
            }
        }
    );

    // ============================================================================
    // TOOL: Get Budgets
    // ============================================================================
    server.tool(
        "get_budgets",
        "Get budget vs actual spending comparison for all categories.",
        {
            billingCycle: z
                .string()
                .optional()
                .describe("Billing cycle in YYYY-MM format. Defaults to current month."),
        },
        async ({ billingCycle }) => {
            try {
                const params = new URLSearchParams();

                if (billingCycle) {
                    params.append("billingCycle", billingCycle);
                } else {
                    const now = new Date();
                    params.append("billingCycle", `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
                }

                const data = await apiRequest<any>(`/reports/budget-vs-actual?${params}`);

                if (!data || !data.categories || data.categories.length === 0) {
                    return {
                        content: [{ type: "text", text: "No budget data found." }],
                    };
                }

                const categories = data.categories.map((cat: any) => {
                    const budget = Number(cat.budget) || 0;
                    const actual = Number(cat.actual) || 0;
                    const remaining = budget - actual;
                    const percentage = budget > 0 ? Math.round((actual / budget) * 100) : 0;

                    let status = "✅";
                    if (percentage > 100) status = "🔴";
                    else if (percentage > 80) status = "🟡";

                    return `${status} ${cat.category}: ${formatCurrency(actual)} / ${formatCurrency(budget)} (${percentage}%) - ${remaining >= 0 ? "Remaining" : "Over"}: ${formatCurrency(Math.abs(remaining))}`;
                });

                const totalBudget = Number(data.totalBudget) || 0;
                const totalActual = Number(data.totalActual) || 0;

                const summary = [
                    `💰 Budget vs Actual - ${billingCycle || "Current Month"}`,
                    "",
                    "--- By Category ---",
                    ...categories,
                    "",
                    "--- Total ---",
                    `Budget: ${formatCurrency(totalBudget)}`,
                    `Actual: ${formatCurrency(totalActual)}`,
                    `Remaining: ${formatCurrency(totalBudget - totalActual)}`,
                ].join("\n");

                return {
                    content: [{ type: "text", text: summary }],
                };
            } catch (error) {
                return {
                    content: [{ type: "text", text: `Error fetching budgets: ${error}` }],
                };
            }
        }
    );

    // ============================================================================
    // TOOL: Get Sync Status
    // ============================================================================
    server.tool(
        "get_sync_status",
        "Get the synchronization status for all connected bank accounts and credit cards.",
        {},
        async () => {
            try {
                const data = await apiRequest<any>("/scrapers/status");

                if (!data || !data.accounts || data.accounts.length === 0) {
                    return {
                        content: [{ type: "text", text: "No accounts configured." }],
                    };
                }

                const accounts = data.accounts.map((acc: any) => {
                    const lastSync = acc.last_scrape_time
                        ? new Date(acc.last_scrape_time).toLocaleString("he-IL")
                        : "Never";
                    const status = acc.last_scrape_status === "success" ? "✅" : acc.last_scrape_status === "failed" ? "❌" : "⏳";
                    const name = acc.nickname || acc.vendor;
                    return `${status} ${name}: Last sync ${lastSync}`;
                });

                const summary = [
                    `🔄 Sync Status`,
                    "",
                    ...accounts,
                    "",
                    data.autoSyncEnabled
                        ? `⚙️ Auto-sync: Enabled (every ${data.syncInterval} hours)`
                        : "⚙️ Auto-sync: Disabled",
                ].join("\n");

                return {
                    content: [{ type: "text", text: summary }],
                };
            } catch (error) {
                return {
                    content: [{ type: "text", text: `Error fetching sync status: ${error}` }],
                };
            }
        }
    );

    // ============================================================================
    // TOOL: Get Recurring Payments
    // ============================================================================
    server.tool(
        "get_recurring_payments",
        "Get a list of recurring payments and installments.",
        {},
        async () => {
            try {
                const data = await apiRequest<any>("/reports/recurring-payments");

                if (!data || !data.payments || data.payments.length === 0) {
                    return {
                        content: [{ type: "text", text: "No recurring payments found." }],
                    };
                }

                const payments = data.payments.slice(0, 20).map((p: any) => {
                    const progress = p.installments_total > 1
                        ? ` (${p.installments_number}/${p.installments_total})`
                        : " (recurring)";
                    return `• ${p.name}: ${formatCurrency(Math.abs(p.price))}${progress}`;
                });

                const summary = [
                    `🔄 Recurring Payments & Installments`,
                    `Total: ${data.payments.length} active`,
                    "",
                    ...payments,
                    data.payments.length > 20 ? `\n... and ${data.payments.length - 20} more` : "",
                ].join("\n");

                return {
                    content: [{ type: "text", text: summary }],
                };
            } catch (error) {
                return {
                    content: [{ type: "text", text: `Error fetching recurring payments: ${error}` }],
                };
            }
        }
    );

    // ============================================================================
    // TOOL: List Accounts
    // ============================================================================
    server.tool(
        "list_accounts",
        "List all configured bank accounts and credit cards.",
        {},
        async () => {
            try {
                const data = await apiRequest<any[]>("/credentials");

                if (!data || data.length === 0) {
                    return {
                        content: [{ type: "text", text: "No accounts configured." }],
                    };
                }

                const accounts = data.map((acc: any) => {
                    const type = acc.vendor_type === "bank" ? "🏦" : "💳";
                    const name = acc.nickname || acc.vendor;
                    return `${type} ${name} (${acc.vendor})`;
                });

                const summary = [
                    `📋 Configured Accounts (${data.length} total)`,
                    "",
                    ...accounts,
                ].join("\n");

                return {
                    content: [{ type: "text", text: summary }],
                };
            } catch (error) {
                return {
                    content: [{ type: "text", text: `Error fetching accounts: ${error}` }],
                };
            }
        }
    );

    // ============================================================================
    // TOOL: Get All Transactions
    // ============================================================================
    server.tool(
        "get_all_transactions",
        "Get all transactions for a specific time period.",
        {
            billingCycle: z.string().optional().describe("Billing cycle in YYYY-MM format"),
            startDate: z.string().optional().describe("Start date in YYYY-MM-DD format"),
            endDate: z.string().optional().describe("End date in YYYY-MM-DD format"),
            limit: z.number().optional().describe("Maximum number of transactions to return (default 50)"),
        },
        async ({ billingCycle, startDate, endDate, limit = 50 }) => {
            try {
                const params = new URLSearchParams();
                params.append("all", "true");

                if (billingCycle) {
                    params.append("billingCycle", billingCycle);
                } else if (startDate && endDate) {
                    params.append("startDate", startDate);
                    params.append("endDate", endDate);
                } else {
                    const now = new Date();
                    params.append("billingCycle", `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
                }

                const response = await apiRequest<{ items: any[] } | any[]>(`/reports/category-expenses?${params}`);

                let data: any[] = [];
                if (Array.isArray(response)) {
                    data = response;
                } else if (response && Array.isArray(response.items)) {
                    data = response.items;
                }

                if (!data || data.length === 0) {
                    return {
                        content: [{ type: "text", text: "No transactions found for the specified period." }],
                    };
                }

                // Sort by date descending
                const sorted = data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                const total = sorted.reduce((sum, t) => sum + Math.abs(Number(t.price) || 0), 0);

                const transactions = sorted.slice(0, limit).map((t: any) => {
                    const date = new Date(t.date).toLocaleDateString("he-IL");
                    const category = t.category || "Uncategorized";
                    return `• ${date}: ${t.name} (${category}) - ${formatCurrency(Math.abs(t.price))}`;
                });

                const summary = [
                    `📜 All Transactions`,
                    `Period: ${billingCycle || `${startDate} to ${endDate}`}`,
                    `Total: ${formatCurrency(total)} (${data.length} transactions)`,
                    "",
                    ...transactions,
                    data.length > limit ? `\n... and ${data.length - limit} more transactions` : "",
                ].join("\n");

                return {
                    content: [{ type: "text", text: summary }],
                };
            } catch (error) {
                return {
                    content: [{ type: "text", text: `Error fetching transactions: ${error}` }],
                };
            }
        }
    );

    return server;
}
