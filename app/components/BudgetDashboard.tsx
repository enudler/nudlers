import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '../utils/client-logger';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import PageHeader from './PageHeader';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import SavingsIcon from '@mui/icons-material/Savings';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
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
import { useNotification } from './NotificationContext';
import { useDateSelection, DateRangeMode } from '../context/DateSelectionContext';

// Helper function removed (handled by context)

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



interface TotalSpendBudget {
  is_set: boolean;
  budget_limit: number | null;
  actual_spent: number;
  remaining: number | null;
  percent_used: number | null;
  is_over_budget: boolean;
}





const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

const BudgetDashboard: React.FC = () => {
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

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => setSelectedYear(e.target.value);
  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => setSelectedMonth(e.target.value);
  const handleDateRangeModeChange = (mode: DateRangeMode) => setDateRangeMode(mode);
  const handleCustomDateChange = (type: 'start' | 'end', val: string) => {
    if (type === 'start') setCustomStartDate(val);
    else setCustomEndDate(val);
  };

  // Local state for data
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetsWithSpending, setBudgetsWithSpending] = useState<BudgetWithSpending[]>([]);
  const [loading, setLoading] = useState(true);
  const [allCategories, setAllCategories] = useState<string[]>([]);


  // Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [newBudgetCategory, setNewBudgetCategory] = useState('');
  const [newBudgetLimit, setNewBudgetLimit] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);



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
      logger.error('Error fetching budgets', error as Error);
      showNotification('Failed to load budgets', 'error');
      return [];
    }
  }, [showNotification]);

  const fetchSpendingData = useCallback(async (year: string, month: string, mode: DateRangeMode, budgetList: Budget[]) => {
    setLoading(true);
    try {
      const url = new URL('/api/reports/budget-vs-actual', window.location.origin);

      if (mode === 'billing') {
        url.searchParams.append('billingCycle', `${year}-${month}`);
      } else {
        url.searchParams.append('startDate', startDate);
        url.searchParams.append('endDate', endDate);
      }

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error('Failed to fetch spending data');
      const data = await response.json();

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

      budgetsWithData.sort((a, b) => b.percent_used - a.percent_used);
      setBudgetsWithSpending(budgetsWithData);

      if (data.total_spend_budget) {
        setTotalSpendBudget(data.total_spend_budget);
      }
    } catch (error) {
      logger.error('Error fetching spending data', error as Error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  // fetchAvailableMonths removed (managed by context)

  const fetchAllCategories = useCallback(async () => {
    try {
      const response = await fetch('/api/categories');
      const categories = await response.json();
      setAllCategories(categories.filter((c: string) => c !== 'Bank'));
    } catch (error) {
      logger.error('Error fetching categories', error as Error);
    }
  }, []);



  useEffect(() => {
    const init = async () => {
      // Always fetch budgets and categories
      const [budgetList] = await Promise.all([
        fetchBudgets(),
        fetchAllCategories()
      ]);

      // If we have selected dates from context, fetch data
      if (startDate && endDate && budgetList) {
        fetchSpendingData(selectedYear, selectedMonth, dateRangeMode, budgetList);
        setLoading(false);
      }
    };
    init();
  }, [startDate, endDate, dateRangeMode, fetchBudgets, fetchAllCategories, fetchSpendingData]);

  const handleRefresh = async () => {
    const budgetList = await fetchBudgets();
    if (selectedYear && selectedMonth) {
      fetchSpendingData(selectedYear, selectedMonth, dateRangeMode, budgetList);
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
      logger.error('Error saving budget', error as Error);
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
      logger.error('Error deleting budget', error as Error);
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
      const response = await fetch('/api/reports/total-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          budget_limit: parseFloat(newTotalBudgetLimit)
        })
      });

      if (!response.ok) throw new Error('Failed to save total budget');

      showNotification('Total credit card budget saved successfully', 'success');
      setIsTotalBudgetModalOpen(false);
      setNewTotalBudgetLimit('');

      // Refresh data
      if (selectedYear && selectedMonth) {
        fetchSpendingData(selectedYear, selectedMonth, dateRangeMode, budgets);
      }
    } catch (error) {
      logger.error('Error saving total budget', error as Error);
      showNotification('Failed to save total budget', 'error');
    } finally {
      setSavingTotalBudget(false);
    }
  };

  const handleDeleteTotalBudget = async () => {
    if (!confirm('Are you sure you want to remove the total credit card budget?')) return;

    try {
      const response = await fetch('/api/reports/total-budget', {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete total budget');

      showNotification('Total credit card budget removed', 'success');
      setTotalSpendBudget(null);

      // Refresh data
      if (selectedYear && selectedMonth) {
        fetchSpendingData(selectedYear, selectedMonth, dateRangeMode, budgets);
      }
    } catch (error) {
      logger.error('Error deleting total budget', error as Error);
      showNotification('Failed to remove total budget', 'error');
    }
  };

  const getProgressColor = (percentUsed: number): string => {
    if (percentUsed >= 100) return theme.palette.error.main;
    if (percentUsed >= 80) return theme.palette.warning.main;
    if (percentUsed >= 60) return theme.palette.warning.light;
    return theme.palette.success.main;
  };

  const overBudgetCount = budgetsWithSpending.filter(b => b.is_over_budget).length;
  const totalBudget = budgets.reduce((sum, b) => sum + b.budget_limit, 0);
  const totalSpent = budgetsWithSpending.reduce((sum, b) => sum + b.actual_spent, 0);
  const totalRemaining = totalBudget - totalSpent;
  const totalPercentUsed = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;


  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

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
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, transparent 70%)',
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
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.06) 0%, transparent 70%)',
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
        <PageHeader
          title="Monthly Budgets"
          description="Manage your monthly spending limits and track progress"
          icon={<SavingsIcon sx={{ fontSize: '32px', color: '#ffffff' }} />}
          stats={
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Total Budget
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main', lineHeight: 1, mt: 0.5 }}>
                ₪{new Intl.NumberFormat('he-IL').format(totalBudget)}
              </Typography>
            </Box>
          }
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
          onRefresh={handleRefresh}
          extraControls={
            <IconButton
              onClick={handleOpenAddModal}
              sx={{
                background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                padding: '10px',
                borderRadius: '12px',
                color: '#ffffff',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 8px 24px rgba(59, 130, 246, 0.4)'
                }
              }}
            >
              <AddIcon />
            </IconButton>
          }
          startDate={startDate}
          endDate={endDate}
        />

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
            <CircularProgress style={{ color: theme.palette.primary.main }} />
          </div>
        ) : (
          <>
            {/* Total Spend Budget - Prominent Feature Card */}
            <div className={`n-card n-card-hover ${totalSpendBudget?.is_over_budget ? '' : 'n-glass'}`} style={{
              background: totalSpendBudget?.is_over_budget
                ? (theme.palette.mode === 'dark' ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.1) 100%)' : 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%)')
                : 'var(--n-glass-bg)',
              margin: '0 24px 24px',
              border: totalSpendBudget?.is_over_budget
                ? '2px solid var(--n-error)'
                : '1px solid var(--n-border)',
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
                  : 'radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, transparent 70%)',
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
                        ? `linear-gradient(135deg, ${theme.palette.error.main} 0%, ${theme.palette.error.dark} 100%)`
                        : `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 100%)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
                    }}>
                      <SavingsIcon style={{ color: theme.palette.common.white, fontSize: '28px' }} />
                    </div>
                    <div>
                      <h2 style={{
                        margin: 0,
                        fontSize: '20px',
                        fontWeight: 700,
                        color: theme.palette.text.primary
                      }}>
                        Total Credit Card Budget
                      </h2>
                      <p style={{ margin: '4px 0 0', color: theme.palette.text.secondary, fontSize: '13px' }}>
                        Overall spending limit across all credit cards
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <IconButton
                      size="small"
                      onClick={handleOpenTotalBudgetModal}
                      style={{
                        color: theme.palette.primary.main,
                        background: 'rgba(59, 130, 246, 0.1)',
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
                          color: theme.palette.error.main,
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
                        color: totalSpendBudget.is_over_budget ? theme.palette.error.main : theme.palette.text.primary
                      }}>
                        {formatCurrency(totalSpendBudget.actual_spent || 0)}
                      </div>
                      <div style={{ fontSize: '18px', color: theme.palette.text.secondary, fontWeight: 500 }}>
                        / {formatCurrency(totalSpendBudget.budget_limit || 0)}
                      </div>
                      {totalSpendBudget.is_over_budget && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: theme.palette.error.main,
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
                            ? `linear-gradient(90deg, ${theme.palette.error.main} 0%, ${theme.palette.error.dark} 100%)`
                            : (totalSpendBudget.percent_used ?? 0) >= 80
                              ? `linear-gradient(90deg, ${theme.palette.warning.main} 0%, ${theme.palette.warning.dark} 100%)`
                              : `linear-gradient(90deg, ${theme.palette.secondary.main} 0%, ${theme.palette.secondary.light} 100%)`,
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
                        color: (totalSpendBudget.remaining ?? 0) > 0 ? theme.palette.success.main : theme.palette.error.main,
                        fontWeight: 600
                      }}>
                        {(totalSpendBudget.remaining ?? 0) >= 0
                          ? `${formatCurrency(totalSpendBudget.remaining ?? 0)} remaining`
                          : `${formatCurrency(Math.abs(totalSpendBudget.remaining ?? 0))} over`
                        }
                      </span>
                      <span style={{
                        color: totalSpendBudget.is_over_budget
                          ? theme.palette.error.main
                          : ((totalSpendBudget.percent_used ?? 0) >= 80
                            ? theme.palette.warning.main
                            : theme.palette.secondary.main),
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
                    <p style={{ color: theme.palette.text.secondary, margin: '0 0 16px' }}>
                      Set a total spending limit to track your overall credit card usage
                    </p>
                    <Button
                      onClick={handleOpenTotalBudgetModal}
                      variant="contained"
                      startIcon={<AddIcon />}
                      sx={{
                        background: `linear-gradient(135deg, ${theme.palette.secondary.main} 0%, ${theme.palette.secondary.light} 100%)`,
                        borderRadius: '12px',
                        padding: '10px 24px',
                        fontWeight: 600,
                        textTransform: 'none',
                        '&:hover': {
                          background: `linear-gradient(135deg, ${theme.palette.secondary.dark} 0%, ${theme.palette.secondary.main} 100%)`
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
                background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)',
                borderRadius: '24px',
                padding: '28px',
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <SavingsIcon style={{ color: theme.palette.primary.main, fontSize: '24px' }} />
                  <span style={{ color: theme.palette.text.secondary, fontSize: '14px', fontWeight: 600 }}>Category Budgets Total</span>
                </div>
                <div style={{ fontSize: '32px', fontWeight: 700, color: theme.palette.text.primary }}>
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
                      color: theme.palette.text.secondary
                    }}>
                      <span>Spent: {formatCurrency(totalSpent)}</span>
                      <span>{Math.round(totalPercentUsed)}%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Remaining Budget Card */}
              <div style={{
                background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)',
                borderRadius: '24px',
                padding: '28px',
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  {totalRemaining >= 0 ? (
                    <TrendingUpIcon style={{ color: theme.palette.success.main, fontSize: '24px' }} />
                  ) : (
                    <TrendingDownIcon style={{ color: theme.palette.error.main, fontSize: '24px' }} />
                  )}
                  <span style={{ color: theme.palette.text.secondary, fontSize: '14px', fontWeight: 600 }}>Remaining This Month</span>
                </div>
                <div style={{
                  fontSize: '32px',
                  fontWeight: 700,
                  color: totalRemaining >= 0 ? theme.palette.success.main : theme.palette.error.main
                }}>
                  {formatCurrency(Math.abs(totalRemaining))}
                  {totalRemaining < 0 && (
                    <span style={{ fontSize: '16px', marginLeft: '8px' }}>over</span>
                  )}
                </div>
              </div>

              {/* Status Card */}
              <div style={{
                background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)',
                borderRadius: '24px',
                padding: '28px',
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  {overBudgetCount > 0 ? (
                    <WarningIcon style={{ color: theme.palette.warning.main, fontSize: '24px' }} />
                  ) : (
                    <CheckCircleIcon style={{ color: theme.palette.success.main, fontSize: '24px' }} />
                  )}
                  <span style={{ color: theme.palette.text.secondary, fontSize: '14px', fontWeight: 600 }}>Status</span>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: theme.palette.text.primary }}>
                  {overBudgetCount > 0 ? (
                    <span style={{ color: theme.palette.warning.main }}>
                      {overBudgetCount} {overBudgetCount === 1 ? 'category' : 'categories'} over budget
                    </span>
                  ) : budgets.length > 0 ? (
                    <span style={{ color: theme.palette.success.main }}>All categories on track</span>
                  ) : (
                    <span style={{ color: theme.palette.text.secondary }}>No budgets set yet</span>
                  )}
                </div>
                <div style={{ marginTop: '8px', fontSize: '14px', color: theme.palette.text.secondary }}>
                  {budgets.length} budget{budgets.length !== 1 ? 's' : ''} configured
                </div>
              </div>
            </Box>



            {/* Budget List */}
            {budgets.length > 0 ? (
              <Box sx={{ padding: { xs: '0 8px', md: '0 24px' }, marginBottom: { xs: '16px', md: '32px' } }}>
                <Box component="h2" sx={{
                  fontSize: { xs: '16px', md: '18px' },
                  fontWeight: 700,
                  color: theme.palette.text.secondary,
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
                        background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(20px)',
                        borderRadius: '20px',
                        padding: '24px',
                        border: `2px solid ${budget.is_over_budget ? (theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)') : theme.palette.divider}`,
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
                            color: theme.palette.text.primary
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
                            <span style={{ fontSize: '14px', color: theme.palette.text.secondary, fontWeight: 500 }}>
                              {' '}/ {formatCurrency(budget.budget_limit)}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <IconButton
                            size="small"
                            onClick={() => handleEditBudget(budget)}
                            style={{ color: theme.palette.text.secondary }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteBudget(budget.id)}
                            style={{ color: theme.palette.error.main }}
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
                          color: budget.remaining >= 0 ? theme.palette.success.main : theme.palette.error.main,
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
                background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.7)',
                borderRadius: '24px',
                margin: '0 24px',
                border: `2px dashed ${theme.palette.divider}`
              }}>
                <SavingsIcon style={{ fontSize: '64px', color: theme.palette.text.disabled, marginBottom: '16px' }} />
                <h3 style={{ color: theme.palette.text.secondary, margin: '0 0 8px' }}>No Budgets Set</h3>
                <p style={{ color: theme.palette.text.secondary, margin: 0 }}>
                  Start tracking your spending by adding a monthly budget for your categories
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
          <SavingsIcon style={{ color: theme.palette.success.main }} />
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
                        <span style={{ color: theme.palette.success.main, fontWeight: 600 }}>
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
                startAdornment: <span style={{ color: theme.palette.text.secondary, marginRight: '8px' }}>₪</span>
              }}
            />
            <div style={{
              background: theme.palette.mode === 'dark' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)',
              padding: '12px 16px',
              borderRadius: '12px',
              fontSize: '14px',
              color: theme.palette.success.main
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
              background: `linear-gradient(135deg, ${theme.palette.success.main} 0%, ${theme.palette.success.dark} 100%)`,
              '&:hover': {
                background: `linear-gradient(135deg, ${theme.palette.success.dark} 0%, ${theme.palette.success.main} 100%)`
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
            background: `linear-gradient(135deg, ${theme.palette.secondary.main} 0%, ${theme.palette.secondary.light} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <SavingsIcon style={{ color: theme.palette.common.white, fontSize: '24px' }} />
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
                startAdornment: <span style={{ color: theme.palette.text.secondary, marginRight: '8px' }}>₪</span>
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
                <SavingsIcon style={{ color: theme.palette.secondary.main, fontSize: '20px' }} />
                <span style={{ fontWeight: 600, color: theme.palette.secondary.main }}>How it works</span>
              </div>
              <ul style={{
                margin: 0,
                paddingLeft: '20px',
                color: theme.palette.text.secondary,
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
              background: `linear-gradient(135deg, ${theme.palette.secondary.main} 0%, ${theme.palette.secondary.light} 100%)`,
              '&:hover': {
                background: `linear-gradient(135deg, ${theme.palette.secondary.dark} 0%, ${theme.palette.secondary.main} 100%)`
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
