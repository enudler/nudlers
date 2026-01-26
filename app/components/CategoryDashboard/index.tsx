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
import { ResponseData, Expense, ModalData } from './types';
import { useCategoryIcons, useCategoryColors } from './utils/categoryUtils';
import Card from './components/Card';
import ExpensesModal from './components/ExpensesModal';
import TransactionsTable from './components/TransactionsTable';
import { useScreenContext } from '../Layout';
import { useDateSelection, DateRangeMode } from '../../context/DateSelectionContext';
import { logger } from '../../utils/client-logger';
import { CREDIT_CARD_VENDORS, BANK_VENDORS as IMPORTED_BANK_VENDORS } from '../../utils/constants';

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

// Known Israeli bank vendors (to distinguish from credit cards)
const BANK_VENDORS = IMPORTED_BANK_VENDORS;
const isBankTransaction = (transaction: {
  card6_digits?: string;
  account_number?: string | number;
  installments_total?: number;
  vendor?: string;
  category?: string;
}) => {
  // 1. Check for Credit Card signals FIRST (Priority over category)
  // If it has card signals, it is a Card transaction, regardless of category (e.g. 'Bank' fees on card)
  const hasCardSignals =
    Boolean(transaction.card6_digits) ||
    (transaction.account_number && String(transaction.account_number).length === 4) ||
    (transaction.installments_total && transaction.installments_total > 0);

  if (hasCardSignals) return false;

  // 2. Check vendor source against known CC vendors
  if (transaction.vendor) {
    const vendorLower = transaction.vendor.toLowerCase();
    if (CREDIT_CARD_VENDORS.some(v => vendorLower.includes(v.toLowerCase()))) {
      return false;
    }
  }

  // 3. Explicit Categories (that are definitely Bank-side if not Card)
  if (transaction.category === 'Bank' || transaction.category === 'Income' || transaction.category === 'Salary') return true;

  // 4. Check vendor source against known Bank vendors
  if (transaction.vendor) {
    const vendorLower = transaction.vendor.toLowerCase();
    if (BANK_VENDORS.some(v => vendorLower.includes(v))) {
      return true;
    }
  }
  return false;
};

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
  const [bankTransactions, setBankTransactions] = React.useState({ income: 0, expenses: 0 });
  const [creditCardTransactions, setCreditCardTransactions] = React.useState(0);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [loadingCategory, setLoadingCategory] = React.useState<string | null>(null);
  const [loadingBankTransactions, setLoadingBankTransactions] = React.useState(false);
  const [modalData, setModalData] = React.useState<ModalData>();
  const [showTransactionsTable, setShowTransactionsTable] = React.useState(false);
  const [transactions, setTransactions] = React.useState<Expense[]>([]);
  const [loadingTransactions, setLoadingTransactions] = React.useState(false);

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
  const fetchTransactionsWithRange = React.useCallback(async (startDate: string, endDate: string, billingCycle?: string) => {
    setLoadingTransactions(true);
    try {
      const transactionsData = await fetchAllTransactions(startDate, endDate, billingCycle);
      // Map and sort transactions by date descending (newest first)
      const sortedTransactions = transactionsData
        .map((t: { category?: string; identifier?: string; vendor?: string;[key: string]: unknown }) => ({
          ...t,
          category: t.category || 'Unassigned',
          identifier: t.identifier || 'unknown',
          vendor: t.vendor || 'unknown'
        }))
        .sort((a: Expense, b: Expense) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
        );
      setTransactions(sortedTransactions);
    } catch (error) {
      logger.error('Error fetching transactions data', error, {
        year: selectedYear,
        month: selectedMonth
      });
    } finally {
      setLoadingTransactions(false);
    }
  }, [selectedYear, selectedMonth]);

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

      // Fetch transactions:
      // If in Billing Cycle mode, we need distinct handling:
      // - Credit Cards: Use billingCycle (processed_date) to match the statement.
      // - Bank: Use the calculated Date Range (e.g. 10th-10th) because Bank items don't have 'billing cycles'.

      let bankData: { price: number; vendor?: string; category?: string; card6_digits?: string; account_number?: string | number; installments_total?: number; }[] = [];
      let cardData: { price: number; vendor?: string; category?: string; card6_digits?: string; account_number?: string | number; installments_total?: number; }[] = [];

      if (billingCycle) {
        // Parallel fetch for speed
        const [cycleResponse, rangeResponse] = await Promise.all([
          fetchAllTransactions(startDate, endDate, billingCycle), // For Cards
          fetchAllTransactions(startDate, endDate, undefined)     // For Bank (Force date range)
        ]);
        cardData = cycleResponse;
        bankData = rangeResponse;
      } else {
        // Standard mode (Calendar/Custom): Use date range for both
        const data = await fetchAllTransactions(startDate, endDate, undefined);
        bankData = data;
        cardData = data;
      }

      const totalIncome = bankData
        .filter((transaction) =>
          isBankTransaction(transaction) && transaction.price > 0
        )
        .reduce((acc: number, transaction) => acc + transaction.price, 0);

      const totalExpenses = bankData
        .filter((transaction) => isBankTransaction(transaction) && transaction.price < 0)
        .reduce((acc: number, transaction) => acc + Math.abs(transaction.price), 0);

      // Calculate net expenses for credit cards using cardData (Cycle based)
      const creditCardNetSum = cardData
        .filter((transaction) => !isBankTransaction(transaction))
        .reduce((acc: number, transaction) => acc + transaction.price, 0);

      const creditCardExpenses = Math.abs(creditCardNetSum);

      setBankTransactions({ income: totalIncome, expenses: totalExpenses });
      setCreditCardTransactions(creditCardExpenses);
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
    if (startDate && endDate) {
      fetchData(startDate, endDate, billingCycle);
      if (showTransactionsTable) {
        fetchTransactionsWithRange(startDate, endDate, billingCycle);
      }
    }
  };

  // Initial data fetch and Refresh listener
  React.useEffect(() => {
    if (startDate && endDate) {
      fetchData(startDate, endDate, billingCycle);
    }

    const handleRefresh = () => {
      if (startDate && endDate) {
        fetchData(startDate, endDate, billingCycle);
      }
    };
    window.addEventListener('dataRefresh', handleRefresh);
    return () => window.removeEventListener('dataRefresh', handleRefresh);
  }, [startDate, endDate, billingCycle, fetchData]);

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
      view: 'dashboard',
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
      transactions: showTransactionsTable ? transactions.slice(0, 50).map(t => ({
        name: t.name,
        amount: t.price,
        category: t.category || 'Unassigned',
        date: t.date
      })) : undefined
    });
  }, [
    bankTransactions,
    creditCardTransactions,
    categories,
    dateRangeMode,
    startDate,
    endDate,
    showTransactionsTable,
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

  const handleTransactionsTableClick = async () => {
    const newShowTransactionsTable = !showTransactionsTable;
    setShowTransactionsTable(newShowTransactionsTable);
    if (!newShowTransactionsTable) {
      return;
    }

    if (startDate && endDate) {
      fetchTransactionsWithRange(startDate, endDate, billingCycle);
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
      {/* Animated background elements - hidden on mobile */}
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <div style={{
          position: 'absolute',
          top: '-10%',
          right: '-5%',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(96, 165, 250, 0.08) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(60px)',
          animation: 'float 20s ease-in-out infinite',
          zIndex: 0
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-10%',
          left: '-5%',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(167, 139, 250, 0.06) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(60px)',
          animation: 'float 25s ease-in-out infinite reverse',
          zIndex: 0
        }} />
        <div style={{
          position: 'absolute',
          top: '40%',
          right: '20%',
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(236, 72, 153, 0.05) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(60px)',
          animation: 'float 30s ease-in-out infinite',
          zIndex: 0
        }} />
      </Box>

      {/* Main content container */}
      <Box sx={{
        padding: { xs: '12px 8px', sm: '16px 12px', md: '24px 16px' },
        maxWidth: '1440px',
        margin: '0 auto',
        position: 'relative',
        zIndex: 1
      }}>

        <PageHeader
          title="Budgets"
          description="Track spending by category and manage budgets"
          icon={<SavingsIcon sx={{ fontSize: '32px', color: '#ffffff' }} />}
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
          extraControls={
            <IconButton
              onClick={handleTransactionsTableClick}
              sx={{
                background: showTransactionsTable
                  ? (theme.palette.mode === 'dark' ? 'rgba(96, 165, 250, 0.2)' : 'rgba(96, 165, 250, 0.15)')
                  : (theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.8)'),
                backdropFilter: 'blur(10px)',
                padding: '10px',
                borderRadius: '12px',
                border: showTransactionsTable
                  ? `1px solid ${theme.palette.primary.main}`
                  : `1px solid ${theme.palette.divider}`,
                color: showTransactionsTable ? 'primary.main' : 'text.secondary',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 8px 24px rgba(96, 165, 250, 0.3)',
                  color: 'primary.main'
                }
              }}
            >
              <TableChartIcon fontSize="medium" />
            </IconButton>
          }
          startDate={startDate}
          endDate={endDate}
        />



        {/* Summary Cards Section */}
        <Box sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: { xs: '16px', md: '32px' },
          marginTop: { xs: '24px', md: '48px' },
          marginBottom: { xs: '24px', md: '40px' }
        }}>
          <Card
            title="Bank Transactions"
            value={bankTransactions.income}
            color="#4ADE80"
            icon={MonetizationOnIcon}
            onClick={handleBankTransactionsClick}
            isLoading={loadingBankTransactions}
            size="medium"
            secondaryValue={bankTransactions.expenses}
            secondaryColor="#F87171"
          />
          <Card
            title="Credit Card Transactions"
            value={creditCardTransactions}
            color="#3B82F6"
            icon={CreditCardIcon}
            onClick={handleTotalCreditCardExpensesClick}
            isLoading={loadingBankTransactions}
            size="medium"
          />
        </Box>

        {showTransactionsTable ? (
          <Box sx={{
            background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            borderRadius: { xs: '20px', md: '32px' },
            padding: { xs: '12px', md: '32px' },
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
            overflowX: 'auto'
          }}>
            <TransactionsTable
              transactions={transactions}
              isLoading={loadingTransactions}
              onDelete={handleDeleteTransaction}
              onUpdate={handleUpdateTransaction}
              groupByDate={true}
            />
          </Box>
        ) : (
          <>
            {/* Categories Section Header */}
            <Box sx={{
              marginBottom: { xs: '16px', md: '32px' },
              display: 'flex',
              alignItems: 'center',
              gap: { xs: '8px', md: '16px' }
            }}>
              <Box sx={{
                height: '2px',
                flex: 1,
                background: 'linear-gradient(90deg, transparent 0%, rgba(96, 165, 250, 0.3) 50%, transparent 100%)',
                borderRadius: '2px',
                display: { xs: 'none', sm: 'block' }
              }} />
              <Box component="h2" sx={{
                fontSize: { xs: '12px', md: '14px' },
                fontWeight: 700,
                margin: 0,
                color: '#475569',
                letterSpacing: { xs: '1px', md: '2px' },
                textTransform: 'uppercase',
                textAlign: 'center',
                flex: { xs: 1, sm: 'none' }
              }}>Expense Categories</Box>
              <Box sx={{
                height: '2px',
                flex: 1,
                background: 'linear-gradient(90deg, transparent 0%, rgba(96, 165, 250, 0.3) 50%, transparent 100%)',
                borderRadius: '2px',
                display: { xs: 'none', sm: 'block' }
              }} />
            </Box>
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(auto-fill, minmax(280px, 1fr))'
              },
              gap: { xs: '12px', sm: '16px', md: '32px' },
              width: '100%',
              boxSizing: 'border-box'
            }}>
              {categories.length > 0 ? (
                categories.map((category, index) => (
                  <Card
                    key={"category-" + index}
                    title={category.name}
                    value={category.value}
                    color={category.color}
                    icon={category.icon}
                    onClick={() => handleCategoryClick(category.name)}
                    isLoading={loadingCategory === category.name}
                    size="medium"
                    budget={category.budget}
                    onSetBudget={handleSetBudget}
                    onEditBudget={handleEditBudget}
                  />
                ))
              ) : (
                <div style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: '64px',
                  background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.95)',
                  borderRadius: '24px',
                  border: `1px solid ${theme.palette.divider}`,
                  backdropFilter: 'blur(20px)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)'
                }}>
                  <div style={{
                    fontSize: '48px',
                    marginBottom: '16px',
                    opacity: 0.6
                  }}>📊</div>
                  <div style={{
                    color: '#475569',
                    fontSize: '18px',
                    fontWeight: 600
                  }}>
                    {dateRangeMode === 'custom'
                      ? `No transactions found for ${customStartDate && customEndDate ? `${new Date(customStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${new Date(customEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'selected date range'}`
                      : `No transactions found for ${new Date(`2024-${selectedMonth}-01`).toLocaleDateString('default', { month: 'long' })} ${selectedYear}`
                    }
                  </div>
                </div>
              )}
            </Box>
          </>
        )}
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
