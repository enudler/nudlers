import React from 'react';
import { useTheme } from '@mui/material/styles';
import PageHeader from '../PageHeader';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import TableChartIcon from '@mui/icons-material/TableChart';
import RefreshIcon from '@mui/icons-material/Refresh';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import DateRangeIcon from '@mui/icons-material/DateRange';
import TuneIcon from '@mui/icons-material/Tune';
import SavingsIcon from '@mui/icons-material/Savings';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { ResponseData, Expense, ModalData } from './types';
import { useCategoryIcons, useCategoryColors } from './utils/categoryUtils';
import Card from './components/Card';
import CategoryRow from './components/CategoryRow';
import ExpensesModal from './components/ExpensesModal';
import TransactionsTable from './components/TransactionsTable';
import { useScreenContext } from '../Layout';
import { useDateSelection, DateRangeMode } from '../../context/DateSelectionContext';
import { logger } from '../../utils/client-logger';
import { isBankTransaction } from '../../utils/transactionUtils';

// Transaction interface for type safety
import { useNotification } from '../NotificationContext';

// Budget info type
interface BudgetInfo {
  budget_limit: number;
  actual_spent: number;
  remaining: number;
  percent_used: number;
  is_over_budget: boolean;
}

// Date range mode type
// Date range mode type imported from context

// Maximum date range in years
// Maximum date range in years
// const MAX_YEARS_RANGE = 5;

// Helper function to calculate date range based on mode
// This will be redefined inside component to access billingStartDay
// getDateRangeBase removed as it's unused
/*
const getDateRangeBase = (year: string, month: string, mode: DateRangeMode, billingStartDay: number = 10): { startDate: string; endDate: string } => {
  ...
};
*/

// getDateRangeBase moved inside component if needed or used via props/context
// formatDateRangeDisplay removed as it's unused

// Common styles






// Helper function to fetch all transactions for a date range
const fetchAllTransactions = async (startDate: string, endDate: string, billingCycle?: string) => {
  const url = new URL("/api/reports/category-expenses", window.location.origin);

  if (billingCycle) {
    // In billing mode, use billingCycle parameter (filters by processed_date)
    url.searchParams.append("billingCycle", billingCycle);
  } else {
    // In calendar mode, use date range
    url.searchParams.append("startDate", startDate);
    url.searchParams.append("endDate", endDate);
  }
  url.searchParams.append("all", "true");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { "Content-Type": "application/json" }
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
};

const formatNumber = (num: number) => {
  return new Intl.NumberFormat('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
};

const CategoryDashboard: React.FC = () => {
  const theme = useTheme();
  const {
    selectedYear, setSelectedYear,
    selectedMonth, setSelectedMonth,
    dateRangeMode, setDateRangeMode,
    customStartDate, setCustomStartDate,
    customEndDate, setCustomEndDate,
    uniqueYears,
    uniqueMonths,
    startDate, endDate, billingCycle
  } = useDateSelection();

  const [sumPerCategory, setSumPerCategory] = React.useState<ResponseData[]>([]);
  // Local UI State
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);
  const [bankTransactions, setBankTransactions] = React.useState({ income: 0, expenses: 0 });
  const [creditCardTransactions, setCreditCardTransactions] = React.useState(0);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [loadingCategory, setLoadingCategory] = React.useState<string | null>(null);
  const [loadingBankTransactions, setLoadingBankTransactions] = React.useState(false);
  const [modalData, setModalData] = React.useState<ModalData>();
  const [transactions, setTransactions] = React.useState<Expense[]>([]);
  const [loadingTransactions, setLoadingTransactions] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<string>('date');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');
  const pageRef = React.useRef(0);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const PAGE_SIZE = 50;

  const categoryIcons = useCategoryIcons();
  const categoryColors = useCategoryColors();
  const { setScreenContext } = useScreenContext();

  // Budget data state
  const [budgetMap, setBudgetMap] = React.useState<Map<string, BudgetInfo>>(new Map());

  // Date range error (local validation)
  const [dateRangeError] = React.useState<string>('');

  // Budget modal state
  const [isBudgetModalOpen, setIsBudgetModalOpen] = React.useState(false);
  const [budgetModalCategory, setBudgetModalCategory] = React.useState<string>('');
  const [budgetModalLimit, setBudgetModalLimit] = React.useState<string>('');
  const [isEditingBudget, setIsEditingBudget] = React.useState(false);
  const [savingBudget, setSavingBudget] = React.useState(false);

  const { showNotification } = useNotification();

  // Use refs to store current values for the event listener
  const currentYearRef = React.useRef(selectedYear);
  const currentMonthRef = React.useRef(selectedMonth);
  const currentDateRangeModeRef = React.useRef(dateRangeMode);
  const currentCustomStartDateRef = React.useRef(customStartDate);
  const currentCustomEndDateRef = React.useRef(customEndDate);

  // Update refs when values change
  React.useEffect(() => {
    currentYearRef.current = selectedYear;
    currentMonthRef.current = selectedMonth;
    currentDateRangeModeRef.current = dateRangeMode;
    currentCustomStartDateRef.current = customStartDate;
    currentCustomEndDateRef.current = customEndDate;
  }, [selectedYear, selectedMonth, dateRangeMode, customStartDate, customEndDate]);

  // validateDateRange removed as it's unused

  // Fetch budget data
  const fetchBudgetData = React.useCallback(async (startDate: string, endDate: string, billingCycle?: string) => {
    try {
      const url = new URL("/api/reports/budget-vs-actual", window.location.origin);

      if (billingCycle) {
        url.searchParams.append("billingCycle", billingCycle);
      } else {
        url.searchParams.append("startDate", startDate);
        url.searchParams.append("endDate", endDate);
      }

      const response = await fetch(url.toString());
      if (!response.ok) return;

      const data = await response.json();

      // Create a map of budget info per category
      const newBudgetMap = new Map<string, BudgetInfo>();
      for (const cat of data.categories) {
        if (cat.has_budget) {
          newBudgetMap.set(cat.category, {
            budget_limit: cat.budget_limit,
            actual_spent: cat.actual_spent,
            remaining: cat.remaining,
            percent_used: cat.percent_used,
            is_over_budget: cat.is_over_budget
          });
        }
      }
      setBudgetMap(newBudgetMap);
    } catch (error) {
      logger.error('Error fetching budget data', error, {
        year: selectedYear,
        month: selectedMonth
      });
    }
  }, [selectedYear, selectedMonth]);

  // Helper moved up
  const fetchTransactionsWithRange = React.useCallback(async (startDate: string, endDate: string, billingCycle?: string, isLoadMore: boolean = false) => {
    if (!isLoadMore) {
      setLoadingTransactions(true);
      pageRef.current = 0;
      setTransactions([]);
    } else {
      setLoadingMore(true);
    }

    try {
      const currentPage = isLoadMore ? pageRef.current + 1 : 0;
      const url = new URL("/api/reports/category-expenses", window.location.origin);

      if (billingCycle) {
        url.searchParams.append("billingCycle", billingCycle);
      } else {
        url.searchParams.append("startDate", startDate);
        url.searchParams.append("endDate", endDate);
      }
      url.searchParams.append("all", "true");
      url.searchParams.append("sortBy", sortBy);
      url.searchParams.append("sortOrder", sortOrder);
      url.searchParams.append("limit", PAGE_SIZE.toString());
      url.searchParams.append("offset", (currentPage * PAGE_SIZE).toString());

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const transactionsData = await response.json();
      const mappedTransactions = transactionsData.map((t: any) => ({
        ...t,
        category: t.category || 'Unassigned',
        identifier: t.identifier || 'unknown',
        vendor: t.vendor || 'unknown'
      }));

      if (isLoadMore) {
        setTransactions(prev => [...prev, ...mappedTransactions]);
        pageRef.current = currentPage;
      } else {
        setTransactions(mappedTransactions);
      }
      setHasMore(transactionsData.length === PAGE_SIZE);
    } catch (error) {
      logger.error('Error fetching transactions data', error, {
        year: selectedYear,
        month: selectedMonth
      });
    } finally {
      if (!isLoadMore) {
        setLoadingTransactions(false);
      } else {
        setLoadingMore(false);
      }
    }
  }, [selectedYear, selectedMonth, sortBy, sortOrder]);

  // fetchTransactions removed as it's unused

  const fetchData = React.useCallback(async (startDate: string, endDate: string, billingCycle?: string) => {
    try {
      const url = new URL("/api/reports/month-by-categories", window.location.origin);

      if (billingCycle) {
        url.searchParams.append("billingCycle", billingCycle);
      } else {
        url.searchParams.append("startDate", startDate);
        url.searchParams.append("endDate", endDate);
      }

      const response = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setSumPerCategory(data);

      // Fetch budget data in parallel
      fetchBudgetData(startDate, endDate, billingCycle);

      // Fetch summary stats efficiently using the summary API
      // Optimized: Avoid fetching all transactions just to sum them up
      const fetchSummary = async (start: string, end: string, cycle?: string) => {
        const url = new URL("/api/reports/monthly-summary", window.location.origin);
        if (cycle) url.searchParams.append("billingCycle", cycle);
        else {
          url.searchParams.append("startDate", start);
          url.searchParams.append("endDate", end);
        }
        url.searchParams.append("limit", "500");
        const res = await fetch(url.toString());
        if (!res.ok) return { items: [] };
        return res.json();
      };

      let totalBankIncome = 0;
      let totalBankExpenses = 0;
      let totalCardExpenses = 0;

      if (billingCycle) {
        // In billing mode, we need cards for the cycle but bank for the date range
        const [cycleSum, rangeSum] = await Promise.all([
          fetchSummary(startDate, endDate, billingCycle),
          fetchSummary(startDate, endDate, undefined)
        ]);

        cycleSum.items?.forEach((item: any) => {
          totalCardExpenses += Number(item.card_expenses || 0);
        });
        rangeSum.items?.forEach((item: any) => {
          totalBankIncome += Number(item.bank_income || 0);
          totalBankExpenses += Number(item.bank_expenses || 0);
        });
      } else {
        const summary = await fetchSummary(startDate, endDate, undefined);
        summary.items?.forEach((item: any) => {
          totalBankIncome += Number(item.bank_income || 0);
          totalBankExpenses += Number(item.bank_expenses || 0);
          totalCardExpenses += Number(item.card_expenses || 0);
        });
      }

      setBankTransactions({ income: totalBankIncome, expenses: totalBankExpenses });
      setCreditCardTransactions(totalCardExpenses);
    } catch (error) {
      logger.error('Error fetching data', error, {
        year: selectedYear,
        month: selectedMonth,
        mode: dateRangeMode
      });
      setSumPerCategory([]);
      setBankTransactions({ income: 0, expenses: 0 });
      setCreditCardTransactions(0);
    }
  }, [fetchBudgetData, selectedYear, selectedMonth, dateRangeMode]);

  // Theme-aware styles
  // Theme-aware styles
  const selectStyle: React.CSSProperties = {
    padding: '14px 40px 14px 14px', // Extra right padding for arrow
    borderRadius: '16px',
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.8)' : 'rgba(255, 255, 255, 0.8)',
    backdropFilter: 'blur(10px)',
    color: theme.palette.text.primary,
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    outline: 'none',
    textAlign: 'left' as const,
    direction: 'ltr' as const,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    backgroundImage: theme.palette.mode === 'dark'
      ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`
      : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 14px center',
    backgroundSize: '16px'
  };

  // buttonStyle removed as it's unused


  const handleRefreshClick = () => {
    if (searchQuery.trim()) {
      handleSearch();
    } else if (startDate && endDate) {
      fetchData(startDate, endDate, billingCycle);
      fetchTransactionsWithRange(startDate, endDate, billingCycle);
    }
  };

  const handleSearch = React.useCallback(async (e?: React.FormEvent, isLoadMore: boolean = false) => {
    e?.preventDefault();
    if (!searchQuery.trim()) {
      // If search is cleared, fetch regular data
      if (startDate && endDate) {
        fetchTransactionsWithRange(startDate, endDate, billingCycle, isLoadMore);
      }
      return;
    }

    if (!isLoadMore) {
      setLoadingTransactions(true);
      pageRef.current = 0;
      setTransactions([]);
    } else {
      setLoadingMore(true);
    }

    setIsSearching(true);
    try {
      const currentPage = isLoadMore ? pageRef.current + 1 : 0;
      let queryParams = `q=${encodeURIComponent(searchQuery)}`;
      if (dateRangeMode === 'custom' && customStartDate && customEndDate) {
        queryParams += `&startDate=${customStartDate}&endDate=${customEndDate}`;
      } else if (dateRangeMode === 'billing' && selectedYear && selectedMonth) {
        queryParams += `&billingCycle=${selectedYear}-${selectedMonth}`;
      } else if (startDate && endDate) {
        queryParams += `&startDate=${startDate}&endDate=${endDate}`;
      }

      queryParams += `&sortBy=${sortBy}&sortOrder=${sortOrder}`;
      queryParams += `&limit=${PAGE_SIZE}&offset=${currentPage * PAGE_SIZE}`;

      const response = await fetch(`/api/transactions?${queryParams}`);
      if (response.ok) {
        const results = await response.json();
        if (isLoadMore) {
          setTransactions(prev => [...prev, ...results]);
          pageRef.current = currentPage;
        } else {
          setTransactions(results);
        }
        setHasMore(results.length === PAGE_SIZE);
      }
    } catch (error) {
      logger.error('Search error', error, { query: searchQuery });
      showNotification('Search failed', 'error');
    } finally {
      if (!isLoadMore) {
        setLoadingTransactions(false);
      } else {
        setLoadingMore(false);
      }
      setIsSearching(false);
    }
  }, [
    searchQuery,
    startDate,
    endDate,
    billingCycle,
    fetchTransactionsWithRange,
    dateRangeMode,
    customStartDate,
    customEndDate,
    selectedYear,
    selectedMonth,
    sortBy,
    sortOrder,
    showNotification
  ]);

  const handleSort = (field: string) => {
    const isAsc = sortBy === field && sortOrder === 'asc';
    setSortOrder(isAsc ? 'desc' : 'asc');
    setSortBy(field);
    pageRef.current = 0; // Reset page on sort change
  };

  const handleLoadMore = () => {
    if (!loadingTransactions && !loadingMore && hasMore) {
      if (searchQuery.trim()) {
        handleSearch(undefined, true);
      } else if (startDate && endDate) {
        fetchTransactionsWithRange(startDate, endDate, billingCycle, true);
      }
    }
  };

  // Initial data fetch and Refresh listener
  React.useEffect(() => {
    if (startDate && endDate) {
      if (searchQuery.trim()) {
        handleSearch();
      } else {
        fetchData(startDate, endDate, billingCycle);
        fetchTransactionsWithRange(startDate, endDate, billingCycle);
      }
    }

    const handleRefresh = () => {
      if (startDate && endDate) {
        if (searchQuery.trim()) {
          handleSearch();
        } else {
          fetchData(startDate, endDate, billingCycle);
          fetchTransactionsWithRange(startDate, endDate, billingCycle);
        }
      }
    };
    window.addEventListener('dataRefresh', handleRefresh);
    return () => window.removeEventListener('dataRefresh', handleRefresh);
  }, [startDate, endDate, billingCycle, fetchData, fetchTransactionsWithRange, searchQuery, handleSearch]);

  const handleYearChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedYear(event.target.value);
  };

  const handleMonthChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedMonth(event.target.value);
  };

  const handleDateRangeModeChange = (mode: DateRangeMode) => {
    setDateRangeMode(mode);
  };






  const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
    if (type === 'start') {
      setCustomStartDate(value);
    } else {
      setCustomEndDate(value);
    }
  };

  // fetchData moved up


  // Sort categories by value (biggest to smallest) and add budget info
  const categories = React.useMemo(() => {
    return sumPerCategory
      .map((item) => ({
        name: item.name,
        value: item.value,
        color: categoryColors[item.name] || '#94a3b8',
        icon: categoryIcons[item.name] || MonetizationOnIcon,
        budget: budgetMap.get(item.name)
      }))
      .sort((a, b) => {
        const aHasBudget = !!a.budget;
        const bHasBudget = !!b.budget;

        if (aHasBudget && !bHasBudget) return -1;
        if (!aHasBudget && bHasBudget) return 1;

        return b.value - a.value; // Sort by value descending (biggest first)
      });
  }, [sumPerCategory, categoryColors, categoryIcons, budgetMap]);

  // Update AI Assistant screen context when data changes
  React.useEffect(() => {
    setScreenContext({
      view: 'transactions',
      dateRange: {
        startDate,
        endDate,
        mode: dateRangeMode
      },
      summary: {
        totalIncome: bankTransactions.income,
        totalExpenses: bankTransactions.expenses,
        creditCardExpenses: creditCardTransactions,
        categories: categories.map(c => ({ name: c.name, value: c.value }))
      },
      transactions: transactions.slice(0, 50).map(t => ({
        name: t.name,
        amount: t.price,
        category: t.category || 'Unassigned',
        date: t.date
      }))
    });
  }, [
    bankTransactions,
    creditCardTransactions,
    categories,
    dateRangeMode,
    startDate,
    endDate,
    transactions,
    setScreenContext
  ]);

  const handleBankTransactionsClick = async () => {
    setLoadingBankTransactions(true);
    try {
      if (!startDate || !endDate) return;

      // For Bank Transactions, we ALWAYS use the calculated Date Range (e.g. 10th-10th),
      // even if we are in Billing Cycle mode. Bank items don't have 'billing cycles'.
      // Passing undefined for billingCycle forces fetchAllTransactions to use startDate/endDate.
      const allTransactions = await fetchAllTransactions(startDate, endDate, undefined);

      // Filter for Bank transactions (both positive and negative)
      const bankTransactionsData = allTransactions.filter((transaction: {
        card6_digits?: string;
        account_number?: string | number;
        installments_total?: number;
        vendor?: string;
        category?: string;
      }) =>
        isBankTransaction(transaction)
      );

      // Format the data correctly - include identifier and vendor for editing/deleting
      setModalData({
        type: "Bank Transactions",
        data: bankTransactionsData.map((transaction: {
          name: string;
          price: number;
          date: string;
          category: string;
          identifier: string;
          vendor: string;
        }) => ({
          name: transaction.name,
          price: transaction.price,
          date: transaction.date,
          category: transaction.category,
          identifier: transaction.identifier,
          vendor: transaction.vendor
        }))
      });

      setIsModalOpen(true);
    } catch (error) {
      logger.error('Error fetching bank transactions data', error, {
        year: selectedYear,
        month: selectedMonth
      });
    } finally {
      setLoadingBankTransactions(false);
    }
  };

  const handleTotalCreditCardExpensesClick = async () => {
    setLoadingBankTransactions(true);
    try {
      if (!startDate || !endDate) return;

      const allExpensesData = await fetchAllTransactions(startDate, endDate, billingCycle);

      // Filter for Credit Card transactions (not Bank)
      const creditCardData = allExpensesData.filter((transaction: {
        card6_digits?: string;
        account_number?: string | number;
        installments_total?: number;
        vendor?: string;
        category?: string;
      }) =>
        !isBankTransaction(transaction)
      );

      // Format the data correctly - include identifier and vendor for editing/deleting
      setModalData({
        type: "Credit Card Expenses",
        data: creditCardData.map((transaction: {
          name: string;
          price: number;
          date: string;
          category: string;
          identifier: string;
          vendor: string;
        }) => ({
          name: transaction.name,
          price: transaction.price,
          date: transaction.date,
          category: transaction.category,
          identifier: transaction.identifier,
          vendor: transaction.vendor
        }))
      });

      setIsModalOpen(true);
    } catch (error) {
      logger.error('Error fetching credit card expenses data', error, {
        year: selectedYear,
        month: selectedMonth
      });
    } finally {
      setLoadingBankTransactions(false);
    }
  };

  const handleCategoryClick = async (category: string) => {
    try {
      setLoadingCategory(category);
      const url = new URL("/api/reports/category-expenses", window.location.origin);

      if (dateRangeMode === 'billing') {
        // In billing mode, use billingCycle parameter (filters by processed_date)
        url.searchParams.append("billingCycle", `${selectedYear}-${selectedMonth}`);
      } else {
        // In calendar mode, use date range
        url.searchParams.append("startDate", startDate);
        url.searchParams.append("endDate", endDate);
      }
      url.searchParams.append("category", category);

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      setModalData({
        type: category,
        data: data,
      });

      setIsModalOpen(true);
    } catch (error) {
      logger.error('Error fetching category expenses', error, {
        category,
        year: selectedYear,
        month: selectedMonth
      });
    } finally {
      setLoadingCategory(null);
    }
  };



  // Moved up


  const handleDeleteTransaction = async (transaction: Expense) => {
    try {
      const response = await fetch(`/api/transactions/${transaction.identifier}|${transaction.vendor}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Remove the transaction from the local state
        setTransactions(transactions.filter(t =>
          t.identifier !== transaction.identifier || t.vendor !== transaction.vendor
        ));
        // Refresh the data to update the metrics
        if (startDate && endDate) {
          fetchData(startDate, endDate, billingCycle);
        }
      } else {
        throw new Error('Failed to delete transaction');
      }
    } catch (error) {
      logger.error('Error deleting transaction', error, {
        transactionId: transaction.identifier,
        vendor: transaction.vendor
      });
    }
  };

  const handleUpdateTransaction = async (transaction: Expense, newPrice: number, newCategory?: string) => {
    try {
      const updateData: Partial<Expense> = { price: newPrice };
      if (newCategory !== undefined) {
        updateData.category = newCategory;
      }

      const response = await fetch(`/api/transactions/${transaction.identifier}|${transaction.vendor}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        // Update the transaction in the local state
        setTransactions(transactions.map(t =>
          t.identifier === transaction.identifier && t.vendor === transaction.vendor
            ? { ...t, price: newPrice, ...(newCategory !== undefined && { category: newCategory }) }
            : t
        ));
        // Refresh the data to update the metrics
        if (startDate && endDate) {
          fetchData(startDate, endDate, billingCycle);
        }
      } else {
        throw new Error('Failed to update transaction');
      }
    } catch (error) {
      logger.error('Error updating transaction', error, {
        transactionId: transaction.identifier,
        vendor: transaction.vendor
      });
    }
  };

  // Budget modal handlers
  const handleSetBudget = (category: string) => {
    setBudgetModalCategory(category);
    setBudgetModalLimit('');
    setIsEditingBudget(false);
    setIsBudgetModalOpen(true);
  };

  const handleEditBudget = (category: string, currentLimit: number) => {
    setBudgetModalCategory(category);
    setBudgetModalLimit(currentLimit.toString());
    setIsEditingBudget(true);
    setIsBudgetModalOpen(true);
  };

  const handleCloseBudgetModal = () => {
    setIsBudgetModalOpen(false);
    setBudgetModalCategory('');
    setBudgetModalLimit('');
    setIsEditingBudget(false);
  };

  const handleSaveBudget = async () => {
    if (!budgetModalLimit || parseFloat(budgetModalLimit) <= 0) {
      showNotification('Please enter a valid budget limit', 'error');
      return;
    }

    setSavingBudget(true);
    try {
      const response = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: budgetModalCategory,
          budget_limit: parseFloat(budgetModalLimit)
        })
      });

      if (!response.ok) throw new Error('Failed to save budget');

      showNotification(
        isEditingBudget ? 'Budget updated successfully' : 'Budget created successfully',
        'success'
      );
      handleCloseBudgetModal();

      // Refresh budget data
      if (startDate && endDate) {
        fetchBudgetData(startDate, endDate, billingCycle);
      }
    } catch (error) {
      logger.error('Error saving budget', error, { category: budgetModalCategory });
      showNotification('Failed to save budget', 'error');
    } finally {
      setSavingBudget(false);
    }
  };

  return (
    <Box sx={{
      minHeight: '100vh',
      position: 'relative',
      background: 'transparent',
      overflow: 'hidden'
    }}>
      {/* Background elements removed - handled by Layout.tsx */}


      {/* Main content container */}
      <Box sx={{
        padding: { xs: '12px 8px', sm: '16px 12px', md: '24px 16px' },
        maxWidth: '1440px',
        margin: '0 auto',
        position: 'relative',
        zIndex: 1
      }}>

        <PageHeader
          title="Transactions"
          description="View and manage all your bank and credit card transactions"
          icon={<TableChartIcon sx={{ fontSize: '32px', color: '#ffffff' }} />}
          showDateSelectors={true}
          dateRangeMode={dateRangeMode}
          onDateRangeModeChange={handleDateRangeModeChange}
          selectedYear={selectedYear}
          onYearChange={handleYearChange}
          selectedMonth={selectedMonth}
          onMonthChange={handleMonthChange}
          uniqueYears={uniqueYears}
          uniqueMonths={uniqueMonths}
          customStartDate={customStartDate}
          onCustomStartDateChange={(val) => handleCustomDateChange('start', val)}
          customEndDate={customEndDate}
          onCustomEndDateChange={(val) => handleCustomDateChange('end', val)}
          onRefresh={handleRefreshClick}
          showSearch={true}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onSearchSubmit={handleSearch}
          isSearching={isSearching}
          startDate={startDate}
          endDate={endDate}
        />



        {/* Summary Header - Horizontal & Minimal */}
        {/* Unified Financial Snapshot Hero */}
        <Box
          onScroll={(e) => {
            const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
            if (scrollHeight - scrollTop <= clientHeight + 100) {
              handleLoadMore();
            }
          }}
          sx={{
            background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            borderRadius: { xs: '20px', md: '32px' },
            padding: { xs: '12px', md: '32px' },
            marginTop: '24px',
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
            overflowX: 'auto',
            maxHeight: '80vh',
            overflowY: 'auto',
            '&::-webkit-scrollbar': { width: '8px' },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
            '&::-webkit-scrollbar-thumb': {
              background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
              borderRadius: '10px',
              border: '2px solid transparent',
              backgroundClip: 'content-box'
            },
            '&:hover::-webkit-scrollbar-thumb': {
              background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
              backgroundClip: 'content-box'
            }
          }}>
          <TransactionsTable
            transactions={transactions}
            isLoading={loadingTransactions}
            onDelete={handleDeleteTransaction}
            onUpdate={handleUpdateTransaction}
            groupByDate={sortBy === 'date' && sortOrder === 'desc'}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
          {(loadingMore || loadingTransactions) && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress size={32} thickness={4} />
            </Box>
          )}
          {!hasMore && transactions.length > 0 && (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                That's all for this period ✨
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {
        modalData && (
          <ExpensesModal
            open={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            data={modalData}
            color={categoryColors[modalData?.type || 'expense'] || '#94a3b8'}
            setModalData={setModalData}
            currentMonth={`${selectedYear}-${selectedMonth}`}
          />
        )
      }

      {/* Budget Modal */}
      <Dialog
        open={isBudgetModalOpen}
        onClose={handleCloseBudgetModal}
        PaperProps={{
          style: {
            borderRadius: '24px',
            padding: '8px',
            minWidth: '400px',
            maxWidth: '90vw'
          }
        }}
      >
        <DialogTitle style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontWeight: 700
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <SavingsIcon style={{ color: '#fff', fontSize: '24px' }} />
          </div>
          {isEditingBudget ? 'Edit Budget' : 'Set Budget'}
        </DialogTitle>
        <DialogContent>
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <TextField
              label="Category"
              value={budgetModalCategory}
              disabled
              fullWidth
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '12px'
                }
              }}
            />
            <TextField
              label="Monthly Budget Limit"
              type="number"
              value={budgetModalLimit}
              onChange={(e) => setBudgetModalLimit(e.target.value)}
              fullWidth
              autoFocus
              InputProps={{
                startAdornment: <span style={{ color: '#64748b', marginRight: '8px' }}>₪</span>
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '12px'
                }
              }}
            />
            <div style={{
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(168, 85, 247, 0.05) 100%)',
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid rgba(139, 92, 246, 0.2)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <SavingsIcon style={{ color: '#8b5cf6', fontSize: '20px' }} />
                <span style={{ fontWeight: 600, color: '#7c3aed' }}>Budget Info</span>
              </div>
              <ul style={{
                margin: 0,
                paddingLeft: '20px',
                color: '#64748b',
                fontSize: '13px',
                lineHeight: '1.6'
              }}>
                <li>This budget applies to <strong>every month</strong></li>
                <li>Track your spending progress on the category card</li>
                <li>View all budgets in the Budget screen</li>
              </ul>
            </div>
          </div>
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px' }}>
          <Button
            onClick={handleCloseBudgetModal}
            startIcon={<CloseIcon />}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveBudget}
            variant="contained"
            disabled={savingBudget}
            startIcon={savingBudget ? <CircularProgress size={16} /> : <SaveIcon />}
            sx={{
              background: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
              borderRadius: '12px',
              fontWeight: 600,
              textTransform: 'none',
              '&:hover': {
                background: 'linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)'
              }
            }}
          >
            {savingBudget ? 'Saving...' : 'Save Budget'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CategoryDashboard;
