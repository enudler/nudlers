import React, { useState, useEffect, useCallback } from 'react';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import SavingsIcon from '@mui/icons-material/Savings';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import DateRangeIcon from '@mui/icons-material/DateRange';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { LineChart } from '@mui/x-charts/LineChart';
import { useNotification } from './NotificationContext';

// Date range mode type
type DateRangeMode = 'calendar' | 'billing';

// Helper function to calculate date range based on mode
const getDateRange = (year: string, month: string, mode: DateRangeMode): { startDate: string; endDate: string } => {
  const y = parseInt(year);
  const m = parseInt(month);
  
  if (mode === 'calendar') {
    // Full calendar month: 1st to last day of month
    const startDate = `${year}-${month}-01`;
    const lastDay = new Date(y, m, 0).getDate();
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

interface Budget {
  id: number;
  category: string;
  budget_limit: number;
}

interface BudgetWithSpending extends Budget {
  actual_spent: number;
  remaining: number;
  percent_used: number;
  is_over_budget: boolean;
}

interface DailyData {
  day: number;
  date: string;
  daily_spent: number;
  cumulative_spent: number;
  ideal_remaining: number;
  actual_remaining: number;
}

interface TotalSpendBudget {
  is_set: boolean;
  budget_limit: number | null;
  actual_spent: number;
  remaining: number | null;
  percent_used: number | null;
  is_over_budget: boolean;
}

interface BurndownData {
  cycle: string;
  days_in_month: number;
  total_budget: number;
  is_current_month: boolean;
  daily_data: DailyData[];
}

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

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

const BudgetDashboard: React.FC = () => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetsWithSpending, setBudgetsWithSpending] = useState<BudgetWithSpending[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [uniqueYears, setUniqueYears] = useState<string[]>([]);
  const [uniqueMonths, setUniqueMonths] = useState<string[]>([]);
  const [allAvailableDates, setAllAvailableDates] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>('billing');
  
  // Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [newBudgetCategory, setNewBudgetCategory] = useState('');
  const [newBudgetLimit, setNewBudgetLimit] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  
  // Burndown data
  const [burndownData, setBurndownData] = useState<BurndownData | null>(null);
  const [burndownLoading, setBurndownLoading] = useState(false);
  
  // Total spend budget state
  const [totalSpendBudget, setTotalSpendBudget] = useState<TotalSpendBudget | null>(null);
  const [isTotalBudgetModalOpen, setIsTotalBudgetModalOpen] = useState(false);
  const [newTotalBudgetLimit, setNewTotalBudgetLimit] = useState('');
  const [savingTotalBudget, setSavingTotalBudget] = useState(false);
  
  const { showNotification } = useNotification();

  const fetchBudgets = useCallback(async () => {
    try {
      const response = await fetch('/api/budgets');
      if (!response.ok) throw new Error('Failed to fetch budgets');
      const data = await response.json();
      setBudgets(data);
      return data;
    } catch (error) {
      console.error('Error fetching budgets:', error);
      showNotification('Failed to load budgets', 'error');
      return [];
    }
  }, [showNotification]);

  const fetchSpendingData = useCallback(async (year: string, month: string, mode: DateRangeMode, budgetList: Budget[]) => {
    setLoading(true);
    try {
      const url = new URL('/api/budget_vs_actual', window.location.origin);
      
      if (mode === 'billing') {
        url.searchParams.append('billingCycle', `${year}-${month}`);
      } else {
        const { startDate, endDate } = getDateRange(year, month, mode);
        url.searchParams.append('startDate', startDate);
        url.searchParams.append('endDate', endDate);
      }
      
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error('Failed to fetch spending data');
      const data = await response.json();
      
      // Map budgets with their spending data
      const budgetsWithData: BudgetWithSpending[] = budgetList.map(budget => {
        const spendingData = data.categories.find((c: any) => c.category === budget.category);
        const actualSpent = spendingData?.actual_spent || 0;
        const remaining = budget.budget_limit - actualSpent;
        const percentUsed = budget.budget_limit > 0 ? (actualSpent / budget.budget_limit) * 100 : 0;
        
        return {
          ...budget,
          actual_spent: actualSpent,
          remaining,
          percent_used: Math.round(percentUsed * 10) / 10,
          is_over_budget: actualSpent > budget.budget_limit
        };
      });
      
      // Sort by percent used descending
      budgetsWithData.sort((a, b) => b.percent_used - a.percent_used);
      setBudgetsWithSpending(budgetsWithData);
      
      // Set total spend budget data from API response
      if (data.total_spend_budget) {
        setTotalSpendBudget(data.total_spend_budget);
      }
    } catch (error) {
      console.error('Error fetching spending data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAvailableMonths = useCallback(async () => {
    try {
      const response = await fetch('/api/available_months');
      const dates = await response.json();
      setAllAvailableDates(dates);
      
      // Sort dates in descending order
      const sortedDates = dates.sort((a: string, b: string) => b.localeCompare(a));
      
      // Default to current month/year (the current billing cycle)
      const now = new Date();
      const currentYear = now.getFullYear().toString();
      const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
      const currentYearMonth = `${currentYear}-${currentMonth}`;
      
      // Use current month if available, otherwise fall back to most recent
      const defaultDate = sortedDates.includes(currentYearMonth) ? currentYearMonth : sortedDates[0];
      const defaultYear = defaultDate.substring(0, 4);
      const defaultMonth = defaultDate.substring(5, 7);
      
      const years = Array.from(new Set(dates.map((d: string) => d.substring(0, 4)))) as string[];
      
      setUniqueYears(years);
      setSelectedYear(defaultYear);
      
      const monthsForYear = dates
        .filter((d: string) => d.startsWith(defaultYear))
        .map((d: string) => d.substring(5, 7));
      const months = Array.from(new Set(monthsForYear)) as string[];
      
      setUniqueMonths(months);
      setSelectedMonth(defaultMonth);
      
      return { year: defaultYear, month: defaultMonth };
    } catch (error) {
      console.error('Error fetching available months:', error);
      return null;
    }
  }, []);

  const fetchAllCategories = useCallback(async () => {
    try {
      const response = await fetch('/api/get_all_categories');
      const categories = await response.json();
      setAllCategories(categories.filter((c: string) => c !== 'Bank'));
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }, []);

  const fetchBurndownData = useCallback(async (year: string, month: string, mode: DateRangeMode) => {
    setBurndownLoading(true);
    try {
      const url = new URL('/api/daily_spending', window.location.origin);
      
      if (mode === 'billing') {
        url.searchParams.append('cycle', `${year}-${month}`);
      } else {
        const { startDate, endDate } = getDateRange(year, month, mode);
        url.searchParams.append('startDate', startDate);
        url.searchParams.append('endDate', endDate);
      }
      
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error('Failed to fetch burndown data');
      const data = await response.json();
      setBurndownData(data);
    } catch (error) {
      console.error('Error fetching burndown data:', error);
      setBurndownData(null);
    } finally {
      setBurndownLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const [budgetList, dateInfo] = await Promise.all([
        fetchBudgets(),
        fetchAvailableMonths(),
        fetchAllCategories()
      ]);
      if (dateInfo && budgetList.length > 0) {
        fetchSpendingData(dateInfo.year, dateInfo.month, dateRangeMode, budgetList);
        fetchBurndownData(dateInfo.year, dateInfo.month, dateRangeMode);
      } else if (dateInfo) {
        fetchSpendingData(dateInfo.year, dateInfo.month, dateRangeMode, []);
        fetchBurndownData(dateInfo.year, dateInfo.month, dateRangeMode);
      } else {
        setLoading(false);
      }
    };
    init();
  }, [fetchBudgets, fetchAvailableMonths, fetchAllCategories, fetchSpendingData, fetchBurndownData]);

  const handleYearChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newYear = event.target.value;
    setSelectedYear(newYear);
    
    const monthsForYear = allAvailableDates
      .filter((d: string) => d.startsWith(newYear))
      .map((d: string) => d.substring(5, 7));
    const months = Array.from(new Set(monthsForYear)) as string[];
    setUniqueMonths(months);
    
    const monthToUse = months.includes(selectedMonth) ? selectedMonth : months[0];
    if (!months.includes(selectedMonth)) {
      setSelectedMonth(monthToUse);
    }
    
    fetchSpendingData(newYear, monthToUse, dateRangeMode, budgets);
    fetchBurndownData(newYear, monthToUse, dateRangeMode);
  };

  const handleMonthChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = event.target.value;
    setSelectedMonth(newMonth);
    fetchSpendingData(selectedYear, newMonth, dateRangeMode, budgets);
    fetchBurndownData(selectedYear, newMonth, dateRangeMode);
  };

  const handleDateRangeModeChange = (mode: DateRangeMode) => {
    setDateRangeMode(mode);
    if (selectedYear && selectedMonth) {
      fetchSpendingData(selectedYear, selectedMonth, mode, budgets);
      fetchBurndownData(selectedYear, selectedMonth, mode);
    }
  };

  const handleRefresh = async () => {
    const budgetList = await fetchBudgets();
    if (selectedYear && selectedMonth) {
      fetchSpendingData(selectedYear, selectedMonth, dateRangeMode, budgetList);
      fetchBurndownData(selectedYear, selectedMonth, dateRangeMode);
    }
  };

  const handleSaveBudget = async () => {
    if (!newBudgetLimit || parseFloat(newBudgetLimit) <= 0) {
      showNotification('Please enter a valid budget limit', 'error');
      return;
    }
    
    const category = editingBudget?.category || newBudgetCategory;
    if (!category) {
      showNotification('Please select a category', 'error');
      return;
    }
    
    setSavingBudget(true);
    try {
      const response = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          budget_limit: parseFloat(newBudgetLimit)
        })
      });
      
      if (!response.ok) throw new Error('Failed to save budget');
      
      showNotification(editingBudget ? 'Budget updated successfully' : 'Budget created successfully', 'success');
      setIsAddModalOpen(false);
      setEditingBudget(null);
      setNewBudgetCategory('');
      setNewBudgetLimit('');
      
      // Refresh data
      const budgetList = await fetchBudgets();
      if (selectedYear && selectedMonth) {
        fetchSpendingData(selectedYear, selectedMonth, dateRangeMode, budgetList);
      }
    } catch (error) {
      console.error('Error saving budget:', error);
      showNotification('Failed to save budget', 'error');
    } finally {
      setSavingBudget(false);
    }
  };

  const handleDeleteBudget = async (budgetId: number) => {
    if (!confirm('Are you sure you want to delete this budget?')) return;
    
    try {
      const response = await fetch(`/api/budgets/${budgetId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to delete budget');
      
      showNotification('Budget deleted successfully', 'success');
      const budgetList = await fetchBudgets();
      if (selectedYear && selectedMonth) {
        fetchSpendingData(selectedYear, selectedMonth, dateRangeMode, budgetList);
      }
    } catch (error) {
      console.error('Error deleting budget:', error);
      showNotification('Failed to delete budget', 'error');
    }
  };

  const handleEditBudget = (budget: Budget) => {
    setEditingBudget(budget);
    setNewBudgetLimit(budget.budget_limit.toString());
    setIsAddModalOpen(true);
  };

  const handleOpenAddModal = () => {
    setEditingBudget(null);
    setNewBudgetCategory('');
    setNewBudgetLimit('');
    setIsAddModalOpen(true);
  };

  const handleOpenTotalBudgetModal = () => {
    setNewTotalBudgetLimit(totalSpendBudget?.budget_limit?.toString() || '');
    setIsTotalBudgetModalOpen(true);
  };

  const handleSaveTotalBudget = async () => {
    if (!newTotalBudgetLimit || parseFloat(newTotalBudgetLimit) <= 0) {
      showNotification('Please enter a valid budget limit', 'error');
      return;
    }
    
    setSavingTotalBudget(true);
    try {
      const response = await fetch('/api/total_budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          budget_limit: parseFloat(newTotalBudgetLimit)
        })
      });
      
      if (!response.ok) throw new Error('Failed to save total budget');
      
      showNotification('Total spend budget saved successfully', 'success');
      setIsTotalBudgetModalOpen(false);
      setNewTotalBudgetLimit('');
      
      // Refresh data
      if (selectedYear && selectedMonth) {
        fetchSpendingData(selectedYear, selectedMonth, dateRangeMode, budgets);
      }
    } catch (error) {
      console.error('Error saving total budget:', error);
      showNotification('Failed to save total budget', 'error');
    } finally {
      setSavingTotalBudget(false);
    }
  };

  const handleDeleteTotalBudget = async () => {
    if (!confirm('Are you sure you want to remove the total spend budget?')) return;
    
    try {
      const response = await fetch('/api/total_budget', {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to delete total budget');
      
      showNotification('Total spend budget removed', 'success');
      setTotalSpendBudget(null);
      
      // Refresh data
      if (selectedYear && selectedMonth) {
        fetchSpendingData(selectedYear, selectedMonth, dateRangeMode, budgets);
      }
    } catch (error) {
      console.error('Error deleting total budget:', error);
      showNotification('Failed to remove total budget', 'error');
    }
  };

  const getProgressColor = (percentUsed: number): string => {
    if (percentUsed >= 100) return '#ef4444';
    if (percentUsed >= 80) return '#f59e0b';
    if (percentUsed >= 60) return '#fbbf24';
    return '#22c55e';
  };

  const overBudgetCount = budgetsWithSpending.filter(b => b.is_over_budget).length;
  const totalBudget = budgets.reduce((sum, b) => sum + b.budget_limit, 0);
  const totalSpent = budgetsWithSpending.reduce((sum, b) => sum + b.actual_spent, 0);
  const totalRemaining = totalBudget - totalSpent;
  const totalPercentUsed = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

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
          background: 'radial-gradient(circle, rgba(34, 197, 94, 0.08) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(60px)',
          zIndex: 0
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-10%',
          left: '-5%',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.06) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(60px)',
          zIndex: 0
        }} />
      </Box>
      
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
          marginBottom: { xs: '16px', md: '32px' },
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
            background: 'radial-gradient(circle, rgba(34, 197, 94, 0.1) 0%, transparent 70%)',
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: '12px', md: '16px' } }}>
              <SavingsIcon sx={{ fontSize: { xs: '28px', md: '36px' }, color: '#22c55e' }} />
              <div>
                <Box component="h1" sx={{
                  fontSize: { xs: '22px', md: '28px' },
                  fontWeight: 700,
                  margin: 0,
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}>Monthly Budgets</Box>
                <Box component="p" sx={{ margin: '4px 0 0', color: '#64748b', fontSize: { xs: '12px', md: '14px' } }}>
                  Set general budget limits for each category
                </Box>
              </div>
            </Box>
            <Box sx={{
              display: 'flex',
              gap: { xs: '8px', md: '16px' },
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: { xs: 'center', md: 'flex-end' }
            }}>
              <IconButton
                onClick={handleRefresh}
                style={BUTTON_STYLE}
                onMouseEnter={(e) => Object.assign(e.currentTarget.style, HOVER_BUTTON_STYLE)}
                onMouseLeave={(e) => Object.assign(e.currentTarget.style, BUTTON_STYLE)}
              >
                <RefreshIcon />
              </IconButton>
              <IconButton
                onClick={handleOpenAddModal}
                style={{
                  ...BUTTON_STYLE,
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  color: '#fff',
                  border: 'none'
                }}
                onMouseEnter={(e) => Object.assign(e.currentTarget.style, {
                  transform: 'translateY(-2px) scale(1.05)',
                  boxShadow: '0 8px 24px rgba(34, 197, 94, 0.4)'
                })}
                onMouseLeave={(e) => Object.assign(e.currentTarget.style, {
                  transform: 'translateY(0) scale(1)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)'
                })}
              >
                <AddIcon />
              </IconButton>
              {/* Month selector to view spending comparison */}
              <select 
                value={selectedYear}
                onChange={handleYearChange}
                style={{ ...SELECT_STYLE, minWidth: '120px' }}
              >
                {uniqueYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <select 
                value={selectedMonth}
                onChange={handleMonthChange}
                style={{ ...SELECT_STYLE, minWidth: '160px' }}
              >
                {uniqueMonths.map((month) => (
                  <option key={month} value={month}>
                    {new Date(`2024-${month}-01`).toLocaleDateString('default', { month: 'long' })}
                  </option>
                ))}
              </select>
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
                      ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' 
                      : 'transparent',
                    color: dateRangeMode === 'billing' ? '#ffffff' : '#64748b',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: dateRangeMode === 'billing' 
                      ? '0 4px 12px rgba(34, 197, 94, 0.3)' 
                      : 'none'
                  }}
                >
                  <DateRangeIcon style={{ fontSize: '18px' }} />
                  <span>Cycle</span>
                </button>
              </div>
            </Box>
          </Box>
          {/* Date range indicator */}
          {selectedYear && selectedMonth && (
            <div style={{
              marginTop: '16px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '14px',
              fontWeight: 500
            }}>
              {dateRangeMode === 'billing' ? (
                <span style={{ 
                  background: 'rgba(34, 197, 94, 0.1)', 
                  padding: '6px 12px', 
                  borderRadius: '8px',
                  border: '1px solid rgba(34, 197, 94, 0.2)',
                  color: '#16a34a'
                }}>
                  💳 Billing Cycle: {new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
              ) : (
                <span style={{ 
                  background: 'rgba(59, 130, 246, 0.1)', 
                  padding: '6px 12px', 
                  borderRadius: '8px',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  color: '#3b82f6'
                }}>
                  📅 Full Month: {(() => {
                    const { startDate, endDate } = getDateRange(selectedYear, selectedMonth, 'calendar');
                    const start = new Date(startDate);
                    const end = new Date(endDate);
                    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                  })()}
                </span>
              )}
            </div>
          )}
        </Box>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
            <CircularProgress style={{ color: '#22c55e' }} />
          </div>
        ) : (
          <>
            {/* Total Spend Budget - Prominent Feature Card */}
            <div style={{
              background: totalSpendBudget?.is_over_budget 
                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%)'
                : 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(168, 85, 247, 0.05) 100%)',
              backdropFilter: 'blur(20px)',
              borderRadius: '24px',
              padding: '28px',
              margin: '0 24px 24px',
              border: totalSpendBudget?.is_over_budget 
                ? '2px solid rgba(239, 68, 68, 0.3)'
                : '2px solid rgba(139, 92, 246, 0.2)',
              boxShadow: '0 8px 32px rgba(139, 92, 246, 0.15)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{
                position: 'absolute',
                top: '-50px',
                right: '-50px',
                width: '200px',
                height: '200px',
                background: totalSpendBudget?.is_over_budget 
                  ? 'radial-gradient(circle, rgba(239, 68, 68, 0.15) 0%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(139, 92, 246, 0.2) 0%, transparent 70%)',
                borderRadius: '50%',
                filter: 'blur(20px)'
              }} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '16px',
                      background: totalSpendBudget?.is_over_budget 
                        ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                        : 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
                    }}>
                      <SavingsIcon style={{ color: '#fff', fontSize: '28px' }} />
                    </div>
                    <div>
                      <h2 style={{
                        margin: 0,
                        fontSize: '20px',
                        fontWeight: 700,
                        color: '#1e293b'
                      }}>
                        Total Spend Budget
                      </h2>
                      <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>
                        Overall spending limit across all credit cards
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <IconButton
                      size="small"
                      onClick={handleOpenTotalBudgetModal}
                      style={{ 
                        color: '#8b5cf6',
                        background: 'rgba(139, 92, 246, 0.1)',
                        borderRadius: '12px'
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    {totalSpendBudget?.is_set && (
                      <IconButton
                        size="small"
                        onClick={handleDeleteTotalBudget}
                        style={{ 
                          color: '#ef4444',
                          background: 'rgba(239, 68, 68, 0.1)',
                          borderRadius: '12px'
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </div>
                </div>
                
                {totalSpendBudget?.is_set ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '16px' }}>
                      <div style={{
                        fontSize: '36px',
                        fontWeight: 700,
                        color: totalSpendBudget.is_over_budget ? '#ef4444' : '#1e293b'
                      }}>
                        {formatCurrency(totalSpendBudget.actual_spent || 0)}
                      </div>
                      <div style={{ fontSize: '18px', color: '#64748b', fontWeight: 500 }}>
                        / {formatCurrency(totalSpendBudget.budget_limit || 0)}
                      </div>
                      {totalSpendBudget.is_over_budget && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          padding: '6px 12px',
                          borderRadius: '20px',
                          fontSize: '13px',
                          fontWeight: 600
                        }}>
                          <WarningIcon style={{ fontSize: '16px' }} />
                          Over Budget!
                        </div>
                      )}
                    </div>
                    <LinearProgress 
                      variant="determinate" 
                      value={Math.min(totalSpendBudget.percent_used || 0, 100)}
                      sx={{
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: 'rgba(148, 163, 184, 0.2)',
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 6,
                          background: totalSpendBudget.is_over_budget 
                            ? 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)'
                            : totalSpendBudget.percent_used! >= 80
                            ? 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)'
                            : 'linear-gradient(90deg, #8b5cf6 0%, #a855f7 100%)'
                        }
                      }}
                    />
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      marginTop: '12px',
                      fontSize: '14px'
                    }}>
                      <span style={{ 
                        color: (totalSpendBudget.remaining ?? 0) >= 0 ? '#22c55e' : '#ef4444',
                        fontWeight: 600
                      }}>
                        {(totalSpendBudget.remaining ?? 0) >= 0 
                          ? `${formatCurrency(totalSpendBudget.remaining ?? 0)} remaining`
                          : `${formatCurrency(Math.abs(totalSpendBudget.remaining ?? 0))} over`
                        }
                      </span>
                      <span style={{ 
                        color: totalSpendBudget.is_over_budget 
                          ? '#ef4444' 
                          : (totalSpendBudget.percent_used ?? 0) >= 80 
                          ? '#f59e0b' 
                          : '#8b5cf6',
                        fontWeight: 600
                      }}>
                        {totalSpendBudget.percent_used?.toFixed(1)}% used
                      </span>
                    </div>
                  </>
                ) : (
                  <div style={{
                    textAlign: 'center',
                    padding: '20px 0'
                  }}>
                    <p style={{ color: '#64748b', margin: '0 0 16px' }}>
                      Set a total spending limit to track your overall credit card usage
                    </p>
                    <Button
                      onClick={handleOpenTotalBudgetModal}
                      variant="contained"
                      startIcon={<AddIcon />}
                      sx={{
                        background: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
                        borderRadius: '12px',
                        padding: '10px 24px',
                        fontWeight: 600,
                        textTransform: 'none',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)'
                        }
                      }}
                    >
                      Set Total Budget
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Summary Cards */}
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(auto-fit, minmax(280px, 1fr))' },
              gap: { xs: '12px', md: '24px' },
              marginBottom: { xs: '16px', md: '32px' },
              padding: { xs: '0 8px', md: '0 24px' }
            }}>
              {/* Category Budget Total Card */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)',
                borderRadius: '24px',
                padding: '28px',
                border: '1px solid rgba(148, 163, 184, 0.15)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <SavingsIcon style={{ color: '#3b82f6', fontSize: '24px' }} />
                  <span style={{ color: '#64748b', fontSize: '14px', fontWeight: 600 }}>Category Budgets Total</span>
                </div>
                <div style={{ fontSize: '32px', fontWeight: 700, color: '#1e293b' }}>
                  {formatCurrency(totalBudget)}
                </div>
                {budgetsWithSpending.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <LinearProgress 
                      variant="determinate" 
                      value={Math.min(totalPercentUsed, 100)}
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: 'rgba(148, 163, 184, 0.2)',
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 4,
                          backgroundColor: getProgressColor(totalPercentUsed)
                        }
                      }}
                    />
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      marginTop: '8px',
                      fontSize: '12px',
                      color: '#64748b'
                    }}>
                      <span>Spent: {formatCurrency(totalSpent)}</span>
                      <span>{Math.round(totalPercentUsed)}%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Remaining Budget Card */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)',
                borderRadius: '24px',
                padding: '28px',
                border: '1px solid rgba(148, 163, 184, 0.15)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  {totalRemaining >= 0 ? (
                    <TrendingUpIcon style={{ color: '#22c55e', fontSize: '24px' }} />
                  ) : (
                    <TrendingDownIcon style={{ color: '#ef4444', fontSize: '24px' }} />
                  )}
                  <span style={{ color: '#64748b', fontSize: '14px', fontWeight: 600 }}>Remaining This Month</span>
                </div>
                <div style={{ 
                  fontSize: '32px', 
                  fontWeight: 700, 
                  color: totalRemaining >= 0 ? '#22c55e' : '#ef4444'
                }}>
                  {formatCurrency(Math.abs(totalRemaining))}
                  {totalRemaining < 0 && (
                    <span style={{ fontSize: '16px', marginLeft: '8px' }}>over</span>
                  )}
                </div>
              </div>

              {/* Status Card */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)',
                borderRadius: '24px',
                padding: '28px',
                border: '1px solid rgba(148, 163, 184, 0.15)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  {overBudgetCount > 0 ? (
                    <WarningIcon style={{ color: '#f59e0b', fontSize: '24px' }} />
                  ) : (
                    <CheckCircleIcon style={{ color: '#22c55e', fontSize: '24px' }} />
                  )}
                  <span style={{ color: '#64748b', fontSize: '14px', fontWeight: 600 }}>Status</span>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b' }}>
                  {overBudgetCount > 0 ? (
                    <span style={{ color: '#f59e0b' }}>
                      {overBudgetCount} {overBudgetCount === 1 ? 'category' : 'categories'} over budget
                    </span>
                  ) : budgets.length > 0 ? (
                    <span style={{ color: '#22c55e' }}>All categories on track</span>
                  ) : (
                    <span style={{ color: '#64748b' }}>No budgets set yet</span>
                  )}
                </div>
                <div style={{ marginTop: '8px', fontSize: '14px', color: '#64748b' }}>
                  {budgets.length} budget{budgets.length !== 1 ? 's' : ''} configured
                </div>
              </div>
            </Box>

            {/* Burndown Chart */}
            {burndownData && burndownData.total_budget > 0 && burndownData.daily_data.length > 0 && (
              <div style={{
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)',
                borderRadius: '24px',
                padding: '24px',
                margin: '0 24px 32px',
                border: '1px solid rgba(148, 163, 184, 0.15)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <ShowChartIcon style={{ color: '#8b5cf6', fontSize: '24px' }} />
                  <span style={{ color: '#1e293b', fontSize: '16px', fontWeight: 700 }}>Budget Burndown</span>
                  <span style={{ 
                    color: '#64748b', 
                    fontSize: '13px', 
                    marginLeft: 'auto',
                    background: 'rgba(139, 92, 246, 0.1)',
                    padding: '4px 12px',
                    borderRadius: '8px'
                  }}>
                    {burndownData.is_current_month ? 'Current month' : 'Complete month'}
                  </span>
                </div>
                {burndownLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                    <CircularProgress size={32} style={{ color: '#8b5cf6' }} />
                  </div>
                ) : (
                  <div style={{ height: '200px', width: '100%' }}>
                    <LineChart
                      xAxis={[{
                        data: burndownData.daily_data.map(d => d.day),
                        label: 'Day of Month',
                        scaleType: 'linear',
                        min: 1,
                        max: burndownData.days_in_month,
                        tickMinStep: 1
                      }]}
                      yAxis={[{
                        label: 'Remaining (₪)',
                        min: Math.min(0, ...burndownData.daily_data.map(d => d.actual_remaining)),
                        max: burndownData.total_budget
                      }]}
                      series={[
                        {
                          data: burndownData.daily_data.map(d => d.ideal_remaining),
                          label: 'Ideal',
                          color: '#94a3b8',
                          showMark: false,
                          curve: 'linear'
                        },
                        {
                          data: burndownData.daily_data.map(d => d.actual_remaining),
                          label: 'Actual',
                          color: burndownData.daily_data[burndownData.daily_data.length - 1]?.actual_remaining >= 0 
                            ? '#22c55e' 
                            : '#ef4444',
                          showMark: false,
                          curve: 'monotoneX'
                        }
                      ]}
                      height={200}
                      margin={{ left: 70, right: 20, top: 20, bottom: 40 }}
                      slotProps={{
                        legend: {
                          direction: 'row',
                          position: { vertical: 'top', horizontal: 'right' },
                          padding: 0,
                          itemMarkWidth: 10,
                          itemMarkHeight: 10,
                          markGap: 5,
                          itemGap: 15
                        }
                      }}
                      sx={{
                        '.MuiLineElement-root': {
                          strokeWidth: 2.5
                        },
                        '.MuiChartsAxis-tickLabel': {
                          fill: '#64748b',
                          fontSize: '11px'
                        },
                        '.MuiChartsAxis-label': {
                          fill: '#475569',
                          fontSize: '12px'
                        },
                        '.MuiChartsLegend-label': {
                          fill: '#475569',
                          fontSize: '12px'
                        }
                      }}
                    />
                  </div>
                )}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  gap: '24px', 
                  marginTop: '12px',
                  fontSize: '12px',
                  color: '#64748b'
                }}>
                  <span>
                    <span style={{ 
                      display: 'inline-block', 
                      width: '12px', 
                      height: '3px', 
                      background: '#94a3b8', 
                      marginRight: '6px',
                      verticalAlign: 'middle'
                    }}></span>
                    Ideal pace
                  </span>
                  <span>
                    <span style={{ 
                      display: 'inline-block', 
                      width: '12px', 
                      height: '3px', 
                      background: burndownData.daily_data[burndownData.daily_data.length - 1]?.actual_remaining >= 0 
                        ? '#22c55e' 
                        : '#ef4444', 
                      marginRight: '6px',
                      verticalAlign: 'middle'
                    }}></span>
                    Your spending
                  </span>
                </div>
              </div>
            )}

            {/* Budget List */}
            {budgets.length > 0 ? (
              <Box sx={{ padding: { xs: '0 8px', md: '0 24px' }, marginBottom: { xs: '16px', md: '32px' } }}>
                <Box component="h2" sx={{
                  fontSize: { xs: '16px', md: '18px' },
                  fontWeight: 700,
                  color: '#475569',
                  marginBottom: { xs: '12px', md: '20px' },
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <SavingsIcon style={{ fontSize: '20px' }} />
                  Budget Limits
                </Box>
                <Box sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(auto-fill, minmax(360px, 1fr))' },
                  gap: { xs: '12px', md: '20px' }
                }}>
                  {budgetsWithSpending.map((budget) => (
                    <div
                      key={budget.id}
                      style={{
                        background: 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(20px)',
                        borderRadius: '20px',
                        padding: '24px',
                        border: `2px solid ${budget.is_over_budget ? 'rgba(239, 68, 68, 0.3)' : 'rgba(148, 163, 184, 0.15)'}`,
                        boxShadow: budget.is_over_budget 
                          ? '0 4px 16px rgba(239, 68, 68, 0.1)' 
                          : '0 4px 16px rgba(0, 0, 0, 0.04)',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <div>
                          <h3 style={{ 
                            margin: 0, 
                            fontSize: '18px', 
                            fontWeight: 600, 
                            color: '#1e293b' 
                          }}>
                            {budget.category}
                          </h3>
                          <div style={{ 
                            fontSize: '24px', 
                            fontWeight: 700, 
                            color: getProgressColor(budget.percent_used),
                            marginTop: '4px'
                          }}>
                            {formatCurrency(budget.actual_spent)}
                            <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 500 }}>
                              {' '}/ {formatCurrency(budget.budget_limit)}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <IconButton
                            size="small"
                            onClick={() => handleEditBudget(budget)}
                            style={{ color: '#64748b' }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteBudget(budget.id)}
                            style={{ color: '#ef4444' }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </div>
                      </div>
                      <LinearProgress 
                        variant="determinate" 
                        value={Math.min(budget.percent_used, 100)}
                        sx={{
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: 'rgba(148, 163, 184, 0.2)',
                          '& .MuiLinearProgress-bar': {
                            borderRadius: 5,
                            backgroundColor: getProgressColor(budget.percent_used)
                          }
                        }}
                      />
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        marginTop: '12px',
                        fontSize: '13px'
                      }}>
                        <span style={{ 
                          color: budget.remaining >= 0 ? '#22c55e' : '#ef4444',
                          fontWeight: 600
                        }}>
                          {budget.remaining >= 0 
                            ? `${formatCurrency(budget.remaining)} left`
                            : `${formatCurrency(Math.abs(budget.remaining))} over`
                          }
                        </span>
                        <span style={{ 
                          color: getProgressColor(budget.percent_used),
                          fontWeight: 600
                        }}>
                          {budget.percent_used}%
                        </span>
                      </div>
                    </div>
                  ))}
                </Box>
              </Box>
            ) : (
              <div style={{ 
                padding: '60px 24px', 
                textAlign: 'center',
                background: 'rgba(255, 255, 255, 0.7)',
                borderRadius: '24px',
                margin: '0 24px',
                border: '2px dashed rgba(148, 163, 184, 0.3)'
              }}>
                <SavingsIcon style={{ fontSize: '64px', color: '#94a3b8', marginBottom: '16px' }} />
                <h3 style={{ color: '#475569', margin: '0 0 8px' }}>No Budgets Set</h3>
                <p style={{ color: '#64748b', margin: 0 }}>
                  Click the + button to add your first budget
                </p>
              </div>
            )}
          </>
        )}
      </Box>

      {/* Add/Edit Budget Modal */}
      <Dialog 
        open={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)}
        PaperProps={{
          style: {
            borderRadius: '24px',
            padding: '8px',
            minWidth: '400px'
          }
        }}
      >
        <DialogTitle style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          fontWeight: 700
        }}>
          <SavingsIcon style={{ color: '#22c55e' }} />
          {editingBudget ? 'Edit Budget' : 'Add Budget'}
        </DialogTitle>
        <DialogContent>
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {!editingBudget && (
              <Autocomplete
                value={newBudgetCategory}
                onChange={(event, newValue) => {
                  if (typeof newValue === 'string') {
                    setNewBudgetCategory(newValue);
                  } else if (newValue && typeof newValue === 'object' && 'inputValue' in newValue) {
                    setNewBudgetCategory((newValue as { inputValue: string }).inputValue);
                  } else {
                    setNewBudgetCategory(newValue || '');
                  }
                }}
                filterOptions={(options, params) => {
                  const filter = createFilterOptions<string>();
                  const filtered = filter(options, params);

                  const { inputValue } = params;
                  const isExisting = options.some((option) => inputValue.toLowerCase() === option.toLowerCase());
                  if (inputValue !== '' && !isExisting) {
                    filtered.push(inputValue);
                  }

                  return filtered;
                }}
                selectOnFocus
                clearOnBlur
                handleHomeEndKeys
                freeSolo
                options={allCategories.filter(c => !budgets.find(b => b.category === c))}
                getOptionLabel={(option) => {
                  if (typeof option === 'string') return option;
                  if (option && typeof option === 'object' && 'inputValue' in option) {
                    return (option as { inputValue: string }).inputValue;
                  }
                  return '';
                }}
                renderOption={(props, option) => {
                  const existingCategories = allCategories.filter(c => !budgets.find(b => b.category === c));
                  const isNewOption = !existingCategories.includes(option);
                  return (
                    <li {...props}>
                      {isNewOption ? (
                        <span style={{ color: '#22c55e', fontWeight: 600 }}>
                          + Add "{option}"
                        </span>
                      ) : (
                        option
                      )}
                    </li>
                  );
                }}
                fullWidth
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Category"
                    placeholder="Select or type a new category"
                  />
                )}
              />
            )}
            {editingBudget && (
              <TextField
                label="Category"
                value={editingBudget.category}
                disabled
                fullWidth
              />
            )}
            <TextField
              label="Monthly Budget Limit"
              type="number"
              value={newBudgetLimit}
              onChange={(e) => setNewBudgetLimit(e.target.value)}
              fullWidth
              InputProps={{
                startAdornment: <span style={{ color: '#64748b', marginRight: '8px' }}>₪</span>
              }}
            />
            <div style={{ 
              background: 'rgba(34, 197, 94, 0.1)', 
              padding: '12px 16px', 
              borderRadius: '12px',
              fontSize: '14px',
              color: '#16a34a'
            }}>
              💡 This budget applies to every month - no need to set it up monthly!
            </div>
          </div>
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px' }}>
          <Button 
            onClick={() => setIsAddModalOpen(false)}
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
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'
              }
            }}
          >
            {savingBudget ? 'Saving...' : 'Save Budget'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Total Spend Budget Modal */}
      <Dialog 
        open={isTotalBudgetModalOpen} 
        onClose={() => setIsTotalBudgetModalOpen(false)}
        PaperProps={{
          style: {
            borderRadius: '24px',
            padding: '8px',
            minWidth: '400px'
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
          {totalSpendBudget?.is_set ? 'Edit Total Spend Budget' : 'Set Total Spend Budget'}
        </DialogTitle>
        <DialogContent>
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <TextField
              label="Total Monthly Spending Limit"
              type="number"
              value={newTotalBudgetLimit}
              onChange={(e) => setNewTotalBudgetLimit(e.target.value)}
              fullWidth
              autoFocus
              InputProps={{
                startAdornment: <span style={{ color: '#64748b', marginRight: '8px' }}>₪</span>
              }}
              helperText="Maximum amount you want to spend across all credit cards this month"
            />
            <div style={{ 
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(168, 85, 247, 0.05) 100%)', 
              padding: '16px', 
              borderRadius: '12px',
              border: '1px solid rgba(139, 92, 246, 0.2)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <SavingsIcon style={{ color: '#8b5cf6', fontSize: '20px' }} />
                <span style={{ fontWeight: 600, color: '#7c3aed' }}>How it works</span>
              </div>
              <ul style={{ 
                margin: 0, 
                paddingLeft: '20px', 
                color: '#64748b', 
                fontSize: '13px',
                lineHeight: '1.6'
              }}>
                <li>This budget tracks <strong>all</strong> credit card spending combined</li>
                <li>It's separate from individual category budgets</li>
                <li>You'll see a warning when you're close to or over your limit</li>
              </ul>
            </div>
          </div>
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px' }}>
          <Button 
            onClick={() => setIsTotalBudgetModalOpen(false)}
            startIcon={<CloseIcon />}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSaveTotalBudget}
            variant="contained"
            disabled={savingTotalBudget}
            startIcon={savingTotalBudget ? <CircularProgress size={16} /> : <SaveIcon />}
            sx={{
              background: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)'
              }
            }}
          >
            {savingTotalBudget ? 'Saving...' : 'Save Budget'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BudgetDashboard;
