import React from 'react';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import TableChartIcon from '@mui/icons-material/TableChart';
import RefreshIcon from '@mui/icons-material/Refresh';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import DateRangeIcon from '@mui/icons-material/DateRange';
import TuneIcon from '@mui/icons-material/Tune';
import TextField from '@mui/material/TextField';
import { ResponseData, Expense, ModalData } from './types';
import { useCategoryIcons, useCategoryColors } from './utils/categoryUtils';
import Card from './components/Card';
import ExpensesModal from './components/ExpensesModal';
import TransactionsTable from './components/TransactionsTable';
import { useScreenContext } from '../Layout';

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
const getDateRange = (year: string, month: string, mode: DateRangeMode): { startDate: string; endDate: string } => {
  const y = parseInt(year);
  const m = parseInt(month);
  
  if (mode === 'calendar') {
    // Full calendar month: 1st to last day of month
    const startDate = `${year}-${month}-01`;
    const lastDay = new Date(y, m, 0).getDate(); // Get last day of month
    const endDate = `${year}-${month}-${lastDay.toString().padStart(2, '0')}`;
    return { startDate, endDate };
  } else {
    // Billing cycle: 10th of previous month to 9th of selected month
    // Example: February selection = January 10 to February 9
    let prevMonth = m - 1;
    let prevYear = y;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = y - 1;
    }
    const startDate = `${prevYear}-${prevMonth.toString().padStart(2, '0')}-10`;
    const endDate = `${year}-${month}-09`;
    return { startDate, endDate };
  }
};

// Helper to format date range for display
const formatDateRangeDisplay = (year: string, month: string, mode: DateRangeMode): string => {
  const { startDate, endDate } = getDateRange(year, month, mode);
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
  const categoryIcons = useCategoryIcons();
  const categoryColors = useCategoryColors();
  const [allAvailableDates, setAllAvailableDates] = React.useState<string[]>([]);
  const { setScreenContext } = useScreenContext();
  
  // Budget data state
  const [budgetMap, setBudgetMap] = React.useState<Map<string, BudgetInfo>>(new Map());
  
  // Custom date range state
  const [customStartDate, setCustomStartDate] = React.useState<string>('');
  const [customEndDate, setCustomEndDate] = React.useState<string>('');
  const [dateRangeError, setDateRangeError] = React.useState<string>('');

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
      console.error("Error fetching budget data:", error);
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
      const response = await fetch("/api/available_months");
      const transactionsData = await response.json();
      setAllAvailableDates(transactionsData);
      
      // Sort dates in descending order to get the most recent first
      const sortedDates = transactionsData.sort((a: string, b: string) => b.localeCompare(a));
      
      // Default to current month/year (the current billing cycle)
      const now = new Date();
      const currentYear = now.getFullYear().toString();
      const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
      const currentYearMonth = `${currentYear}-${currentMonth}`;
      
      // Use current month if available, otherwise fall back to most recent
      const defaultDate = sortedDates.includes(currentYearMonth) ? currentYearMonth : sortedDates[0];
      const defaultYear = defaultDate.substring(0, 4);
      const defaultMonth = defaultDate.substring(5, 7);
      
      const years = Array.from(new Set(transactionsData.map((date: string) => date.substring(0, 4)))) as string[];
      
      setUniqueYears(years);
      setSelectedYear(defaultYear);

      // Get months for the default year
      const monthsForYear = transactionsData
        .filter((date: string) => date.startsWith(defaultYear))
        .map((date: string) => date.substring(5, 7));
      
      const months = Array.from(new Set(monthsForYear)) as string[];
      
      setUniqueMonths(months);
      setSelectedMonth(defaultMonth);

      // Fetch data for initial selection with current date range mode
      const { startDate, endDate } = getDateRange(defaultYear, defaultMonth, dateRangeMode);
      const billingCycle = dateRangeMode === 'billing' ? `${defaultYear}-${defaultMonth}` : undefined;
      fetchData(startDate, endDate, billingCycle);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleYearChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newYear = event.target.value;
    setSelectedYear(newYear);

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
    }
    const { startDate, endDate } = getDateRange(newYear, monthToUse, dateRangeMode);
    const billingCycle = dateRangeMode === 'billing' ? `${newYear}-${monthToUse}` : undefined;
    fetchData(startDate, endDate, billingCycle);
  };

  const handleMonthChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = event.target.value;
    setSelectedMonth(newMonth);
    const { startDate, endDate } = getDateRange(selectedYear, newMonth, dateRangeMode);
    const billingCycle = dateRangeMode === 'billing' ? `${selectedYear}-${newMonth}` : undefined;
    fetchData(startDate, endDate, billingCycle);
  };

  const handleDateRangeModeChange = (mode: DateRangeMode) => {
    setDateRangeMode(mode);
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
      console.error("Error fetching data:", error);
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
      console.error("Error fetching bank transactions data:", error);
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
      console.error("Error fetching credit card expenses data:", error);
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
      console.error("Error fetching category expenses:", error);
    } finally {
      setLoadingCategory(null);
    }
  };

  const handleTransactionsTableClick = async () => {
    const newShowTransactionsTable = !showTransactionsTable;
    setShowTransactionsTable(newShowTransactionsTable);
    if (!newShowTransactionsTable){
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
      console.error("Error fetching transactions data:", error);
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
      console.error("Error deleting transaction:", error);
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
      console.error("Error updating transaction:", error);
    }
  };

  return (
    <Box sx={{ 
      minHeight: '100vh',
      position: 'relative',
      background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%)',
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
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(20px)',
        borderRadius: { xs: '20px', md: '32px' },
        padding: { xs: '16px', sm: '24px', md: '36px' },
        marginBottom: { xs: '24px', md: '90px' },
        marginTop: { xs: '56px', md: '40px' },
        marginLeft: { xs: '8px', md: '24px' },
        marginRight: { xs: '8px', md: '24px' },
        border: '1px solid rgba(148, 163, 184, 0.15)',
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
              background: 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)',
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
              style={BUTTON_STYLE}
              onMouseEnter={(e) => Object.assign(e.currentTarget.style, HOVER_BUTTON_STYLE)}
              onMouseLeave={(e) => Object.assign(e.currentTarget.style, BUTTON_STYLE)}
            >
              <RefreshIcon />
            </IconButton>
            <IconButton
              onClick={handleTransactionsTableClick}
              style={{
                ...BUTTON_STYLE,
                ...(showTransactionsTable ? {
                  background: 'rgba(96, 165, 250, 0.2)',
                  border: '1px solid rgba(96, 165, 250, 0.4)',
                  color: '#3b82f6',
                  boxShadow: '0 8px 24px rgba(96, 165, 250, 0.3)'
                } : {})
              }}
              onMouseEnter={(e) => Object.assign(e.currentTarget.style, {
                transform: 'translateY(-2px) scale(1.05)',
                boxShadow: '0 8px 24px rgba(96, 165, 250, 0.3)',
                color: '#3b82f6'
              })}
              onMouseLeave={(e) => Object.assign(e.currentTarget.style, {
                transform: 'translateY(0) scale(1)',
                color: showTransactionsTable ? '#3b82f6' : '#475569',
                boxShadow: showTransactionsTable 
                  ? '0 8px 24px rgba(96, 165, 250, 0.3)' 
                  : '0 4px 16px rgba(0, 0, 0, 0.08)'
              })}
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
                    <option key={year} value={year} style={{ background: '#ffffff', color: '#1e293b' }}>
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
                    <option key={month} value={month} style={{ background: '#ffffff', color: '#1e293b' }}>
                      {new Date(`2024-${month}-01`).toLocaleDateString('default', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </>
            )}
            {/* Date Range Mode Toggle */}
            <div style={{
              display: 'flex',
              background: 'rgba(255, 255, 255, 0.8)',
              backdropFilter: 'blur(10px)',
              borderRadius: '16px',
              border: '1px solid rgba(148, 163, 184, 0.2)',
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
                <span style={{ color: '#64748b', fontSize: '14px', fontWeight: 500 }}>From:</span>
                <TextField
                  type="date"
                  value={customStartDate}
                  onChange={(e) => handleCustomDateChange('start', e.target.value)}
                  size="small"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '12px',
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      '& fieldset': {
                        borderColor: dateRangeError ? '#ef4444' : 'rgba(148, 163, 184, 0.3)',
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
                    }
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#64748b', fontSize: '14px', fontWeight: 500 }}>To:</span>
                <TextField
                  type="date"
                  value={customEndDate}
                  onChange={(e) => handleCustomDateChange('end', e.target.value)}
                  size="small"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '12px',
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      '& fieldset': {
                        borderColor: dateRangeError ? '#ef4444' : 'rgba(148, 163, 184, 0.3)',
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
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          borderRadius: { xs: '20px', md: '32px' },
          padding: { xs: '12px', md: '32px' },
          border: '1px solid rgba(148, 163, 184, 0.15)',
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
              />
            ))
          ) : (
            <div style={{
              gridColumn: '1 / -1',
              textAlign: 'center',
              padding: '64px',
              background: 'rgba(255, 255, 255, 0.95)',
              borderRadius: '24px',
              border: '1px solid rgba(148, 163, 184, 0.15)',
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
    </Box>
  );
};

export default CategoryDashboard;
