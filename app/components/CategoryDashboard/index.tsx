import React from 'react';
import { useTheme } from '@mui/material/styles';
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
import { logger } from '../../utils/client-logger';

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
type DateRangeMode = 'calendar' | 'billing' | 'custom';

// Maximum date range in years
const MAX_YEARS_RANGE = 5;

// Helper function to calculate date range based on mode
// This will be redefined inside component to access billingStartDay
const getDateRangeBase = (year: string, month: string, mode: DateRangeMode, billingStartDay: number = 10): { startDate: string; endDate: string } => {
  const y = parseInt(year);
  const m = parseInt(month);

  if (mode === 'calendar') {
    // Full calendar month: 1st to last day of month
    const startDate = `${year}-${month}-01`;
    const lastDay = new Date(y, m, 0).getDate(); // Get last day of month
    const endDate = `${year}-${month}-${lastDay.toString().padStart(2, '0')}`;
    return { startDate, endDate };
  } else {
    // Billing cycle: (Start Day + 1) of previous month to (Start Day) of selected month
    // Example: Start Day = 10. Range: 11th Prev to 10th Curr.
    // This matches MonthlySummary logic
    let prevMonth = m - 1;
    let prevYear = y;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = y - 1;
    }

    const startDayVal = billingStartDay + 1;
    const endDayVal = billingStartDay;

    const startDate = `${prevYear}-${prevMonth.toString().padStart(2, '0')}-${startDayVal.toString().padStart(2, '0')}`;
    const endDate = `${year}-${month}-${endDayVal.toString().padStart(2, '0')}`;
    return { startDate, endDate };
  }
};

// Helper to format date range for display
const formatDateRangeDisplay = (year: string, month: string, mode: DateRangeMode): string => {
  const { startDate, endDate } = getDateRangeBase(year, month, mode);
  const start = new Date(startDate);
  const end = new Date(endDate);
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startStr} - ${endStr}`;
};

// Common styles
const BUTTON_STYLE = {
  background: 'rgba(255, 255, 255, 0.8)',
  backdropFilter: 'blur(10px)',
  padding: '14px',
  borderRadius: '16px',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  color: '#475569',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)'
};

const HOVER_BUTTON_STYLE = {
  transform: 'translateY(-2px) scale(1.05)',
  boxShadow: '0 8px 24px rgba(96, 165, 250, 0.3)',
  background: 'rgba(96, 165, 250, 0.15)',
  color: '#3b82f6'
};

const SELECT_STYLE = {
  padding: '14px 28px',
  borderRadius: '16px',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  background: 'rgba(255, 255, 255, 0.8)',
  backdropFilter: 'blur(10px)',
  color: '#1e293b',
  fontSize: '15px',
  fontWeight: '600',
  cursor: 'pointer',
  outline: 'none',
  textAlign: 'right' as const,
  direction: 'rtl' as const,
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
};

// Helper function to fetch all transactions for a date range
const fetchAllTransactions = async (startDate: string, endDate: string, billingCycle?: string) => {
  const url = new URL("/api/category_expenses", window.location.origin);

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
  const [sumPerCategory, setSumPerCategory] = React.useState<ResponseData[]>([]);
  const [selectedYear, setSelectedYear] = React.useState<string>("");
  const [selectedMonth, setSelectedMonth] = React.useState<string>("");
  const [uniqueYears, setUniqueYears] = React.useState<string[]>([]);
  const [uniqueMonths, setUniqueMonths] = React.useState<string[]>([]);
  const [bankTransactions, setBankTransactions] = React.useState({ income: 0, expenses: 0 });
  const [creditCardTransactions, setCreditCardTransactions] = React.useState(0);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [loadingCategory, setLoadingCategory] = React.useState<string | null>(null);
  const [loadingBankTransactions, setLoadingBankTransactions] = React.useState(false);
  const [modalData, setModalData] = React.useState<ModalData>();
  const [showTransactionsTable, setShowTransactionsTable] = React.useState(false);
  const [transactions, setTransactions] = React.useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = React.useState(false);
  const [dateRangeMode, setDateRangeMode] = React.useState<DateRangeMode>('billing');
  const [billingStartDay, setBillingStartDay] = React.useState<number>(10);
  const categoryIcons = useCategoryIcons();
  const categoryColors = useCategoryColors();
  const [allAvailableDates, setAllAvailableDates] = React.useState<string[]>([]);
  const { setScreenContext } = useScreenContext();

  // Helper function to calculate date range based on mode (uses component's billingStartDay)
  const getDateRange = React.useCallback((year: string, month: string, mode: DateRangeMode): { startDate: string; endDate: string } => {
    return getDateRangeBase(year, month, mode, billingStartDay);
  }, [billingStartDay]);

  // Budget data state
  const [budgetMap, setBudgetMap] = React.useState<Map<string, BudgetInfo>>(new Map());

  // Custom date range state
  const [customStartDate, setCustomStartDate] = React.useState<string>('');
  const [customEndDate, setCustomEndDate] = React.useState<string>('');
  const [dateRangeError, setDateRangeError] = React.useState<string>('');

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

  // Validate date range (max 5 years)
  const validateDateRange = (start: string, end: string): boolean => {
    if (!start || !end) return false;

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (startDate > endDate) {
      setDateRangeError('Start date must be before end date');
      return false;
    }

    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365);

    if (diffYears > MAX_YEARS_RANGE) {
      setDateRangeError(`Date range cannot exceed ${MAX_YEARS_RANGE} years`);
      return false;
    }

    setDateRangeError('');
    return true;
  };

  // Fetch budget data
  const fetchBudgetData = React.useCallback(async (startDate: string, endDate: string, billingCycle?: string) => {
    try {
      const url = new URL("/api/budget_vs_actual", window.location.origin);

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
  }, []);

  const handleDataRefresh = React.useCallback(() => {
    if (currentDateRangeModeRef.current === 'custom') {
      if (currentCustomStartDateRef.current && currentCustomEndDateRef.current) {
        setTimeout(() => {
          fetchData(currentCustomStartDateRef.current, currentCustomEndDateRef.current, undefined);
        }, 0);
      }
    } else if (currentYearRef.current && currentMonthRef.current) {
      setTimeout(() => {
        const { startDate, endDate } = getDateRange(
          currentYearRef.current,
          currentMonthRef.current,
          currentDateRangeModeRef.current as 'calendar' | 'billing'
        );
        const billingCycle = currentDateRangeModeRef.current === 'billing'
          ? `${currentYearRef.current}-${currentMonthRef.current}`
          : undefined;
        fetchData(startDate, endDate, billingCycle);
      }, 0);
    }
  }, []);

  React.useEffect(() => {
    // Load persisted date range mode from localStorage to sync with MonthlySummary
    const persistedMode = localStorage.getItem('monthlySummary_mode') as DateRangeMode | null;
    if (persistedMode && ['billing', 'calendar', 'custom'].includes(persistedMode)) {
      setDateRangeMode(persistedMode);
    }

    getAvailableMonths();

    // Add event listener for data refresh
    window.addEventListener('dataRefresh', handleDataRefresh);

    // Cleanup
    return () => {
      window.removeEventListener('dataRefresh', handleDataRefresh);
    };
  }, []);

  React.useEffect(() => {
    if (showTransactionsTable) {
      fetchTransactions();
    }
  }, [selectedYear, selectedMonth]);

  const getAvailableMonths = async () => {
    try {
      // Fetch billing start day setting
      let startDay = 10;
      try {
        const settingsResponse = await fetch('/api/settings');
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json();
          startDay = parseInt(settingsData.settings.billing_cycle_start_day) || 10;
          setBillingStartDay(startDay);
        }
      } catch (e) {
        logger.error('Error fetching settings, using default start day', e);
      }

      const response = await fetch("/api/available_months");
      const transactionsData = await response.json();
      setAllAvailableDates(transactionsData);

      // Sort dates in descending order to get the most recent first
      const sortedDates = transactionsData.sort((a: string, b: string) => b.localeCompare(a));

      // Try to sync with MonthlySummary selection from localStorage
      const persistedYear = localStorage.getItem('monthlySummary_year');
      const persistedMonth = localStorage.getItem('monthlySummary_month');

      let defaultYear: string;
      let defaultMonth: string;

      // If we have persisted values and they're available, use them
      if (persistedYear && persistedMonth && sortedDates.includes(`${persistedYear}-${persistedMonth}`)) {
        defaultYear = persistedYear;
        defaultMonth = persistedMonth;
      } else {
        // Default to current month/year (the current billing cycle)
        // If today is past the billing start day, we are in the cycle ending next month
        const now = new Date();
        let currentYear = now.getFullYear();
        let currentMonth = now.getMonth() + 1;

        if (now.getDate() > startDay) {
          currentMonth += 1;
          if (currentMonth > 12) {
            currentMonth = 1;
            currentYear += 1;
          }
        }

        const currentYearStr = currentYear.toString();
        const currentMonthStr = String(currentMonth).padStart(2, '0');
        const currentYearMonth = `${currentYearStr}-${currentMonthStr}`;

        // Use current month if available, otherwise fall back to most recent
        const defaultDate = sortedDates.includes(currentYearMonth) ? currentYearMonth : sortedDates[0];
        defaultYear = defaultDate.substring(0, 4);
        defaultMonth = defaultDate.substring(5, 7);
      }

      const years = Array.from(new Set(transactionsData.map((date: string) => date.substring(0, 4)))) as string[];

      setUniqueYears(years);
      setSelectedYear(defaultYear);
      localStorage.setItem('monthlySummary_year', defaultYear);

      // Get months for the default year
      const monthsForYear = transactionsData
        .filter((date: string) => date.startsWith(defaultYear))
        .map((date: string) => date.substring(5, 7));

      const months = Array.from(new Set(monthsForYear)) as string[];

      setUniqueMonths(months);
      setSelectedMonth(defaultMonth);
      localStorage.setItem('monthlySummary_month', defaultMonth);

      // Fetch data for initial selection with current date range mode
      const { startDate, endDate } = getDateRange(defaultYear, defaultMonth, dateRangeMode);
      const billingCycle = dateRangeMode === 'billing' ? `${defaultYear}-${defaultMonth}` : undefined;
      fetchData(startDate, endDate, billingCycle);
    } catch (error) {
      logger.error('Error in handleRefresh', error);
    }
  };

  const handleYearChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newYear = event.target.value;
    setSelectedYear(newYear);
    localStorage.setItem('monthlySummary_year', newYear);

    // Update available months for the selected year
    const monthsForYear = allAvailableDates
      .filter((date: string) => date.startsWith(newYear))
      .map((date: string) => date.substring(5, 7));

    const uniqueMonthsForYear = Array.from(new Set(monthsForYear)) as string[];
    setUniqueMonths(uniqueMonthsForYear);

    // If current month is not available in new year, select the first available month
    const monthToUse = uniqueMonthsForYear.includes(selectedMonth) ? selectedMonth : uniqueMonthsForYear[0];
    if (!uniqueMonthsForYear.includes(selectedMonth)) {
      setSelectedMonth(monthToUse);
      localStorage.setItem('monthlySummary_month', monthToUse);
    }
    const { startDate, endDate } = getDateRange(newYear, monthToUse, dateRangeMode);
    const billingCycle = dateRangeMode === 'billing' ? `${newYear}-${monthToUse}` : undefined;
    fetchData(startDate, endDate, billingCycle);
  };

  const handleMonthChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = event.target.value;
    setSelectedMonth(newMonth);
    localStorage.setItem('monthlySummary_month', newMonth);
    const { startDate, endDate } = getDateRange(selectedYear, newMonth, dateRangeMode);
    const billingCycle = dateRangeMode === 'billing' ? `${selectedYear}-${newMonth}` : undefined;
    fetchData(startDate, endDate, billingCycle);
  };

  const handleDateRangeModeChange = (mode: DateRangeMode) => {
    setDateRangeMode(mode);
    localStorage.setItem('monthlySummary_mode', mode);
    setDateRangeError('');

    if (mode === 'custom') {
      // Initialize custom dates if not set
      if (!customStartDate || !customEndDate) {
        // Default to last 3 months from today
        const today = new Date();
        const threeMonthsAgo = new Date(today);
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const formatDate = (d: Date) => d.toISOString().split('T')[0];
        setCustomStartDate(formatDate(threeMonthsAgo));
        setCustomEndDate(formatDate(today));

        fetchData(formatDate(threeMonthsAgo), formatDate(today), undefined);
        if (showTransactionsTable) {
          fetchTransactionsWithRange(formatDate(threeMonthsAgo), formatDate(today), undefined);
        }
      } else if (validateDateRange(customStartDate, customEndDate)) {
        fetchData(customStartDate, customEndDate, undefined);
        if (showTransactionsTable) {
          fetchTransactionsWithRange(customStartDate, customEndDate, undefined);
        }
      }
    } else if (selectedYear && selectedMonth) {
      const { startDate, endDate } = getDateRange(selectedYear, selectedMonth, mode as 'calendar' | 'billing');
      const billingCycle = mode === 'billing' ? `${selectedYear}-${selectedMonth}` : undefined;
      fetchData(startDate, endDate, billingCycle);
      if (showTransactionsTable) {
        fetchTransactionsWithRange(startDate, endDate, billingCycle);
      }
    }
  };

  const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
    if (type === 'start') {
      setCustomStartDate(value);
      if (customEndDate && validateDateRange(value, customEndDate)) {
        fetchData(value, customEndDate, undefined);
        if (showTransactionsTable) {
          fetchTransactionsWithRange(value, customEndDate, undefined);
        }
      }
    } else {
      setCustomEndDate(value);
      if (customStartDate && validateDateRange(customStartDate, value)) {
        fetchData(customStartDate, value, undefined);
        if (showTransactionsTable) {
          fetchTransactionsWithRange(customStartDate, value, undefined);
        }
      }
    }
  };

  const handleRefreshClick = () => {
    if (dateRangeMode === 'custom') {
      if (customStartDate && customEndDate && validateDateRange(customStartDate, customEndDate)) {
        fetchData(customStartDate, customEndDate, undefined);
        if (showTransactionsTable) {
          fetchTransactionsWithRange(customStartDate, customEndDate, undefined);
        }
      }
    } else if (selectedYear && selectedMonth) {
      const { startDate, endDate } = getDateRange(selectedYear, selectedMonth, dateRangeMode as 'calendar' | 'billing');
      const billingCycle = dateRangeMode === 'billing' ? `${selectedYear}-${selectedMonth}` : undefined;
      fetchData(startDate, endDate, billingCycle);
      if (showTransactionsTable) {
        fetchTransactionsWithRange(startDate, endDate, billingCycle);
      }
    }
  };

  const fetchData = async (startDate: string, endDate: string, billingCycle?: string) => {
    try {
      const url = new URL("/api/month_by_categories", window.location.origin);

      if (billingCycle) {
        // In billing mode, use billingCycle parameter (filters by processed_date)
        url.searchParams.append("billingCycle", billingCycle);
      } else {
        // In calendar mode, use date range
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

      // Fetch all transactions to calculate income and expenses properly
      const allTransactions = await fetchAllTransactions(startDate, endDate, billingCycle);

      // Helper to get the monthly amount
      // Note: price is already the per-installment amount (combineInstallments: false)
      const getMonthlyAmount = (transaction: any) => {
        return Math.abs(transaction.price);
      };

      // Calculate total income: Bank category with positive values
      const totalIncome = allTransactions
        .filter((transaction: any) => transaction.category === 'Bank' && transaction.price > 0)
        .reduce((acc: number, transaction: any) => acc + transaction.price, 0);

      // Calculate total expenses: All negative values
      const totalExpenses = allTransactions
        .filter((transaction: any) => transaction.category === 'Bank' && transaction.price < 0)
        .reduce((acc: number, transaction: any) => acc + Math.abs(transaction.price), 0);

      // Calculate credit card expenses: All transactions excluding Bank and Income categories (with installment adjustment)
      const creditCardExpenses = allTransactions
        .filter((transaction: any) => transaction.category !== 'Bank' && transaction.category !== 'Income')
        .reduce((acc: number, transaction: any) => acc + getMonthlyAmount(transaction), 0);

      setBankTransactions({ income: totalIncome, expenses: totalExpenses });
      setCreditCardTransactions(creditCardExpenses);
    } catch (error) {
      logger.error('Error fetching data', error, {
        year: selectedYear,
        month: selectedMonth,
        mode: dateRangeMode
      });
      // Reset states in case of error
      setSumPerCategory([]);
      setBankTransactions({ income: 0, expenses: 0 });
      setCreditCardTransactions(0);
    }
  };

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
      .sort((a, b) => b.value - a.value); // Sort by value descending (biggest first)
  }, [sumPerCategory, categoryColors, categoryIcons, budgetMap]);

  // Update AI Assistant screen context when data changes
  React.useEffect(() => {
    const getDateRangeForContext = () => {
      if (dateRangeMode === 'custom') {
        return {
          startDate: customStartDate,
          endDate: customEndDate,
          mode: 'custom'
        };
      } else if (selectedYear && selectedMonth) {
        const { startDate, endDate } = getDateRange(selectedYear, selectedMonth, dateRangeMode as 'calendar' | 'billing');
        return {
          startDate,
          endDate,
          mode: dateRangeMode
        };
      }
      return undefined;
    };

    setScreenContext({
      view: 'dashboard',
      dateRange: getDateRangeForContext(),
      summary: {
        totalIncome: bankTransactions.income,
        totalExpenses: bankTransactions.expenses,
        creditCardExpenses: creditCardTransactions,
        categories: categories.map(c => ({ name: c.name, value: c.value }))
      },
      transactions: showTransactionsTable ? transactions.slice(0, 50).map(t => ({
        name: t.name,
        amount: t.price,
        category: t.category,
        date: t.date
      })) : undefined
    });
  }, [
    bankTransactions,
    creditCardTransactions,
    categories,
    dateRangeMode,
    selectedYear,
    selectedMonth,
    customStartDate,
    customEndDate,
    showTransactionsTable,
    transactions,
    setScreenContext
  ]);

  const handleBankTransactionsClick = async () => {
    setLoadingBankTransactions(true);
    try {
      let startDate: string, endDate: string, billingCycle: string | undefined;

      if (dateRangeMode === 'custom') {
        startDate = customStartDate;
        endDate = customEndDate;
        billingCycle = undefined;
      } else {
        const range = getDateRange(selectedYear, selectedMonth, dateRangeMode as 'calendar' | 'billing');
        startDate = range.startDate;
        endDate = range.endDate;
        billingCycle = dateRangeMode === 'billing' ? `${selectedYear}-${selectedMonth}` : undefined;
      }
      const allTransactions = await fetchAllTransactions(startDate, endDate, billingCycle);

      // Filter for Bank category transactions (both positive and negative)
      const bankTransactionsData = allTransactions.filter((transaction: any) =>
        transaction.category === 'Bank'
      );

      // Format the data correctly - include identifier and vendor for editing/deleting
      setModalData({
        type: "Bank Transactions",
        data: bankTransactionsData.map((transaction: any) => ({
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
      let startDate: string, endDate: string, billingCycle: string | undefined;

      if (dateRangeMode === 'custom') {
        startDate = customStartDate;
        endDate = customEndDate;
        billingCycle = undefined;
      } else {
        const range = getDateRange(selectedYear, selectedMonth, dateRangeMode as 'calendar' | 'billing');
        startDate = range.startDate;
        endDate = range.endDate;
        billingCycle = dateRangeMode === 'billing' ? `${selectedYear}-${selectedMonth}` : undefined;
      }
      const allExpensesData = await fetchAllTransactions(startDate, endDate, billingCycle);

      // Filter out 'Bank' and 'Income' category transactions to get credit card expenses
      const creditCardData = allExpensesData.filter((transaction: any) =>
        transaction.category !== 'Bank' && transaction.category !== 'Income'
      );

      // Format the data correctly - include identifier and vendor for editing/deleting
      setModalData({
        type: "Credit Card Expenses",
        data: creditCardData.map((transaction: any) => ({
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
      const url = new URL("/api/category_expenses", window.location.origin);

      if (dateRangeMode === 'custom') {
        url.searchParams.append("startDate", customStartDate);
        url.searchParams.append("endDate", customEndDate);
      } else {
        const { startDate, endDate } = getDateRange(selectedYear, selectedMonth, dateRangeMode as 'calendar' | 'billing');

        if (dateRangeMode === 'billing') {
          // In billing mode, use billingCycle parameter (filters by processed_date)
          url.searchParams.append("billingCycle", `${selectedYear}-${selectedMonth}`);
        } else {
          // In calendar mode, use date range
          url.searchParams.append("startDate", startDate);
          url.searchParams.append("endDate", endDate);
        }
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

    if (dateRangeMode === 'custom') {
      fetchTransactionsWithRange(customStartDate, customEndDate, undefined);
    } else {
      const { startDate, endDate } = getDateRange(selectedYear, selectedMonth, dateRangeMode as 'calendar' | 'billing');
      const billingCycle = dateRangeMode === 'billing' ? `${selectedYear}-${selectedMonth}` : undefined;
      fetchTransactionsWithRange(startDate, endDate, billingCycle);
    }
  };

  const fetchTransactionsWithRange = async (startDate: string, endDate: string, billingCycle?: string) => {
    setLoadingTransactions(true);
    try {
      const transactionsData = await fetchAllTransactions(startDate, endDate, billingCycle);
      setTransactions(transactionsData);
    } catch (error) {
      logger.error('Error fetching transactions data', error, {
        year: selectedYear,
        month: selectedMonth
      });
    } finally {
      setLoadingTransactions(false);
    }
  };

  const fetchTransactions = async () => {
    if (dateRangeMode === 'custom') {
      fetchTransactionsWithRange(customStartDate, customEndDate, undefined);
    } else {
      const { startDate, endDate } = getDateRange(selectedYear, selectedMonth, dateRangeMode as 'calendar' | 'billing');
      const billingCycle = dateRangeMode === 'billing' ? `${selectedYear}-${selectedMonth}` : undefined;
      fetchTransactionsWithRange(startDate, endDate, billingCycle);
    }
  };

  const handleDeleteTransaction = async (transaction: any) => {
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
        if (dateRangeMode === 'custom') {
          fetchData(customStartDate, customEndDate, undefined);
        } else {
          const { startDate, endDate } = getDateRange(selectedYear, selectedMonth, dateRangeMode as 'calendar' | 'billing');
          const billingCycle = dateRangeMode === 'billing' ? `${selectedYear}-${selectedMonth}` : undefined;
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

  const handleUpdateTransaction = async (transaction: any, newPrice: number, newCategory?: string) => {
    try {
      const updateData: any = { price: newPrice };
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
        if (dateRangeMode === 'custom') {
          fetchData(customStartDate, customEndDate, undefined);
        } else {
          const { startDate, endDate } = getDateRange(selectedYear, selectedMonth, dateRangeMode as 'calendar' | 'billing');
          const billingCycle = dateRangeMode === 'billing' ? `${selectedYear}-${selectedMonth}` : undefined;
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
      if (dateRangeMode === 'custom') {
        if (customStartDate && customEndDate) {
          fetchBudgetData(customStartDate, customEndDate, undefined);
        }
      } else if (selectedYear && selectedMonth) {
        const { startDate, endDate } = getDateRange(selectedYear, selectedMonth, dateRangeMode as 'calendar' | 'billing');
        const billingCycle = dateRangeMode === 'billing' ? `${selectedYear}-${selectedMonth}` : undefined;
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

        {/* Hero Section */}
        <Box sx={{
          background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.7)' : 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          borderRadius: { xs: '20px', md: '32px' },
          padding: { xs: '16px', sm: '24px', md: '36px' },
          marginBottom: { xs: '24px', md: '90px' },
          marginTop: { xs: '56px', md: '40px' },
          marginLeft: { xs: '8px', md: '24px' },
          marginRight: { xs: '8px', md: '24px' },
          border: `1px solid ${theme.palette.divider}`,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <Box sx={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '300px',
            height: '300px',
            background: 'radial-gradient(circle, rgba(96, 165, 250, 0.1) 0%, transparent 70%)',
            filter: 'blur(40px)',
            zIndex: 0,
            display: { xs: 'none', md: 'block' }
          }} />
          <Box sx={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'stretch', md: 'center' },
            gap: { xs: '16px', md: '24px' }
          }}>
            <div>
              <Box component="h1" sx={{
                fontSize: { xs: '22px', md: '28px' },
                fontWeight: 700,
                margin: 0,
                background: theme.palette.mode === 'dark'
                  ? 'linear-gradient(135deg, #94a3b8 0%, #cbd5e1 100%)'
                  : 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>Financial Overview</Box>
            </div>
            <Box sx={{
              display: 'flex',
              gap: { xs: '8px', md: '16px' },
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: { xs: 'center', md: 'flex-end' }
            }}>
              <IconButton
                onClick={handleRefreshClick}
                sx={{
                  background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                  backdropFilter: 'blur(10px)',
                  padding: '14px',
                  borderRadius: '16px',
                  border: `1px solid ${theme.palette.divider}`,
                  color: 'text.secondary',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                  '&:hover': {
                    transform: 'translateY(-2px) scale(1.05)',
                    boxShadow: '0 8px 24px rgba(96, 165, 250, 0.3)',
                    background: theme.palette.mode === 'dark' ? 'rgba(96, 165, 250, 0.2)' : 'rgba(96, 165, 250, 0.15)',
                    color: 'primary.main'
                  }
                }}
              >
                <RefreshIcon />
              </IconButton>
              <IconButton
                onClick={handleTransactionsTableClick}
                sx={{
                  background: showTransactionsTable
                    ? (theme.palette.mode === 'dark' ? 'rgba(96, 165, 250, 0.2)' : 'rgba(96, 165, 250, 0.15)')
                    : (theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.8)'),
                  backdropFilter: 'blur(10px)',
                  padding: '14px',
                  borderRadius: '16px',
                  border: showTransactionsTable
                    ? `1px solid ${theme.palette.primary.main}`
                    : `1px solid ${theme.palette.divider}`,
                  color: showTransactionsTable ? 'primary.main' : 'text.secondary',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: showTransactionsTable
                    ? '0 8px 24px rgba(96, 165, 250, 0.3)'
                    : '0 4px 16px rgba(0, 0, 0, 0.08)',
                  '&:hover': {
                    transform: 'translateY(-2px) scale(1.05)',
                    boxShadow: '0 8px 24px rgba(96, 165, 250, 0.3)',
                    color: 'primary.main'
                  }
                }}
              >
                <TableChartIcon />
              </IconButton>
              {dateRangeMode !== 'custom' && (
                <>
                  <select
                    value={selectedYear}
                    onChange={handleYearChange}
                    style={{ ...SELECT_STYLE, minWidth: '120px' }}
                    onMouseEnter={(e) => Object.assign(e.currentTarget.style, {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 8px 24px rgba(96, 165, 250, 0.3)',
                      background: 'rgba(96, 165, 250, 0.15)'
                    })}
                    onMouseLeave={(e) => Object.assign(e.currentTarget.style, {
                      transform: 'translateY(0)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                      background: 'rgba(255, 255, 255, 0.8)'
                    })}
                  >
                    {uniqueYears.map((year) => (
                      <option key={year} value={year} style={{
                        background: theme.palette.mode === 'dark' ? '#1e293b' : '#ffffff',
                        color: theme.palette.text.primary
                      }}>
                        {year}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedMonth}
                    onChange={handleMonthChange}
                    style={{ ...SELECT_STYLE, minWidth: '160px' }}
                    onMouseEnter={(e) => Object.assign(e.currentTarget.style, {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 8px 24px rgba(96, 165, 250, 0.3)',
                      background: 'rgba(96, 165, 250, 0.15)'
                    })}
                    onMouseLeave={(e) => Object.assign(e.currentTarget.style, {
                      transform: 'translateY(0)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                      background: 'rgba(255, 255, 255, 0.8)'
                    })}
                  >
                    {uniqueMonths.map((month) => (
                      <option key={month} value={month} style={{
                        background: theme.palette.mode === 'dark' ? '#1e293b' : '#ffffff',
                        color: theme.palette.text.primary
                      }}>
                        {new Date(`2024-${month}-01`).toLocaleDateString('default', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {/* Date Range Mode Toggle */}
              <div style={{
                display: 'flex',
                background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(10px)',
                borderRadius: '16px',
                border: `1px solid ${theme.palette.divider}`,
                padding: '4px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)'
              }}>
                <button
                  onClick={() => handleDateRangeModeChange('calendar')}
                  title="Full month (1st - end of month)"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: 'none',
                    background: dateRangeMode === 'calendar'
                      ? 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)'
                      : 'transparent',
                    color: dateRangeMode === 'calendar' ? '#ffffff' : '#64748b',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: dateRangeMode === 'calendar'
                      ? '0 4px 12px rgba(59, 130, 246, 0.3)'
                      : 'none'
                  }}
                >
                  <CalendarMonthIcon style={{ fontSize: '18px' }} />
                  <span>1-31</span>
                </button>
                <button
                  onClick={() => handleDateRangeModeChange('billing')}
                  title="Billing cycle (11th - 10th)"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: 'none',
                    background: dateRangeMode === 'billing'
                      ? 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)'
                      : 'transparent',
                    color: dateRangeMode === 'billing' ? '#ffffff' : '#64748b',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: dateRangeMode === 'billing'
                      ? '0 4px 12px rgba(139, 92, 246, 0.3)'
                      : 'none'
                  }}
                >
                  <DateRangeIcon style={{ fontSize: '18px' }} />
                  <span>Cycle</span>
                </button>
                <button
                  onClick={() => handleDateRangeModeChange('custom')}
                  title="Custom date range (up to 5 years)"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: 'none',
                    background: dateRangeMode === 'custom'
                      ? 'linear-gradient(135deg, #10b981 0%, #34d399 100%)'
                      : 'transparent',
                    color: dateRangeMode === 'custom' ? '#ffffff' : '#64748b',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: dateRangeMode === 'custom'
                      ? '0 4px 12px rgba(16, 185, 129, 0.3)'
                      : 'none'
                  }}
                >
                  <TuneIcon style={{ fontSize: '18px' }} />
                  <span>Custom</span>
                </button>
              </div>
            </Box>
          </Box>
          {/* Date range indicator */}
          {dateRangeMode === 'custom' ? (
            <div style={{
              marginTop: '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                flexWrap: 'wrap',
                justifyContent: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: theme.palette.text.secondary, fontSize: '14px', fontWeight: 500 }}>From:</span>
                  <TextField
                    type="date"
                    value={customStartDate}
                    onChange={(e) => handleCustomDateChange('start', e.target.value)}
                    size="small"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '12px',
                        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.9)',
                        color: theme.palette.text.primary,
                        '& fieldset': {
                          borderColor: dateRangeError ? '#ef4444' : theme.palette.divider,
                        },
                        '&:hover fieldset': {
                          borderColor: '#10b981',
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#10b981',
                        },
                      },
                      '& .MuiInputBase-input': {
                        padding: '10px 14px',
                        fontSize: '14px',
                        colorScheme: theme.palette.mode
                      },
                      '& .MuiSvgIcon-root': {
                        color: theme.palette.text.secondary
                      }
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: theme.palette.text.secondary, fontSize: '14px', fontWeight: 500 }}>To:</span>
                  <TextField
                    type="date"
                    value={customEndDate}
                    onChange={(e) => handleCustomDateChange('end', e.target.value)}
                    size="small"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '12px',
                        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.9)',
                        color: theme.palette.text.primary,
                        '& fieldset': {
                          borderColor: dateRangeError ? '#ef4444' : theme.palette.divider,
                        },
                        '&:hover fieldset': {
                          borderColor: '#10b981',
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#10b981',
                        },
                      },
                      '& .MuiInputBase-input': {
                        padding: '10px 14px',
                        fontSize: '14px',
                        colorScheme: theme.palette.mode
                      },
                      '& .MuiSvgIcon-root': {
                        color: theme.palette.text.secondary
                      }
                    }}
                  />
                </div>
              </div>
              {dateRangeError && (
                <span style={{
                  color: '#ef4444',
                  fontSize: '13px',
                  fontWeight: 500,
                  background: 'rgba(239, 68, 68, 0.1)',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(239, 68, 68, 0.2)'
                }}>
                  {dateRangeError}
                </span>
              )}
              {customStartDate && customEndDate && !dateRangeError && (
                <span style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  color: '#10b981',
                  fontSize: '13px',
                  fontWeight: 500
                }}>
                  📅 {new Date(customStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - {new Date(customEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
          ) : selectedYear && selectedMonth && dateRangeMode === 'billing' ? (
            <div style={{
              marginTop: '16px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '14px',
              fontWeight: 500
            }}>
              <span style={{
                background: 'rgba(139, 92, 246, 0.1)',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(139, 92, 246, 0.2)'
              }}>
                💳 Billing Cycle: {new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
            </div>
          ) : null}


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
      </Box>

      {modalData && (
        <ExpensesModal
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          data={modalData}
          color={categoryColors[modalData?.type] || '#94a3b8'}
          setModalData={setModalData}
          currentMonth={`${selectedYear}-${selectedMonth}`}
        />
      )}

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
