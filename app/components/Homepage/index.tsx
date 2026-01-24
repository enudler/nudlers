import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import SavingsIcon from '@mui/icons-material/Savings';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import SyncIcon from '@mui/icons-material/Sync';
import AddIcon from '@mui/icons-material/Add';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useDateSelection } from '../../context/DateSelectionContext';
import { formatNumber } from '../CategoryDashboard/utils/format';
import { logger } from '../../utils/client-logger';

interface Transaction {
  name: string;
  price: number;
  date: string;
  category: string;
  vendor: string;
  identifier: string;
}

interface CategorySummary {
  category: string;
  spent: number;
  budget_limit?: number;
  percent_used?: number;
  is_over_budget?: boolean;
}

interface MonthlyInsights {
  currentMonthTotal: number;
  lastMonthTotal: number;
  percentChange: number;
  bankIncome: number;
  bankExpenses: number;
  creditCardTotal: number;
  budgetRemaining: number;
  totalBudget: number;
  topCategories: CategorySummary[];
  overBudgetCategories: string[];
}

const Homepage: React.FC = () => {
  const theme = useTheme();
  const { startDate, endDate, billingCycle, selectedYear, selectedMonth } = useDateSelection();

  const [loading, setLoading] = React.useState(true);
  const [insights, setInsights] = React.useState<MonthlyInsights | null>(null);
  const [recentTransactions, setRecentTransactions] = React.useState<Transaction[]>([]);

  const fetchHomepageData = React.useCallback(async () => {
    if (!startDate || !endDate) return;

    setLoading(true);
    try {
      // Fetch current month data
      const currentMonthUrl = new URL("/api/reports/month-by-categories", window.location.origin);
      if (billingCycle) {
        currentMonthUrl.searchParams.append("billingCycle", billingCycle);
      } else {
        currentMonthUrl.searchParams.append("startDate", startDate);
        currentMonthUrl.searchParams.append("endDate", endDate);
      }

      // Fetch transactions
      const transactionsUrl = new URL("/api/reports/category-expenses", window.location.origin);
      if (billingCycle) {
        transactionsUrl.searchParams.append("billingCycle", billingCycle);
      } else {
        transactionsUrl.searchParams.append("startDate", startDate);
        transactionsUrl.searchParams.append("endDate", endDate);
      }
      transactionsUrl.searchParams.append("all", "true");

      // Fetch budget data
      const budgetUrl = new URL("/api/reports/budget-vs-actual", window.location.origin);
      if (billingCycle) {
        budgetUrl.searchParams.append("billingCycle", billingCycle);
      } else {
        budgetUrl.searchParams.append("startDate", startDate);
        budgetUrl.searchParams.append("endDate", endDate);
      }

      // Fetch total budget
      const totalBudgetUrl = new URL("/api/reports/total-budget", window.location.origin);
      if (billingCycle) {
        totalBudgetUrl.searchParams.append("billingCycle", billingCycle);
      } else {
        totalBudgetUrl.searchParams.append("startDate", startDate);
        totalBudgetUrl.searchParams.append("endDate", endDate);
      }

      const [categoriesData, transactionsData, budgetData, totalBudgetData] = await Promise.all([
        fetch(currentMonthUrl.toString(), { method: "PUT" }).then(r => r.json()),
        fetch(transactionsUrl.toString()).then(r => r.json()),
        fetch(budgetUrl.toString()).then(r => r.json()),
        fetch(totalBudgetUrl.toString()).then(r => r.json())
      ]);

      // Calculate insights
      const currentMonthTotal = categoriesData.reduce((sum: number, cat: { value: number }) => sum + cat.value, 0);

      // Calculate bank vs credit card
      const bankTransactions = transactionsData.filter((t: Transaction) =>
        t.category === 'Bank' || t.category === 'Income' || t.category === 'Salary'
      );
      const creditCardTransactions = transactionsData.filter((t: Transaction) =>
        t.category !== 'Bank' && t.category !== 'Income' && t.category !== 'Salary'
      );

      const bankIncome = bankTransactions
        .filter((t: Transaction) => t.price > 0)
        .reduce((sum: number, t: Transaction) => sum + t.price, 0);

      const bankExpenses = Math.abs(bankTransactions
        .filter((t: Transaction) => t.price < 0)
        .reduce((sum: number, t: Transaction) => sum + t.price, 0));

      const creditCardTotal = Math.abs(creditCardTransactions
        .reduce((sum: number, t: Transaction) => sum + t.price, 0));

      // Get top categories
      const topCategories: CategorySummary[] = budgetData.categories
        .filter((cat: CategorySummary) => cat.spent > 0)
        .sort((a: CategorySummary, b: CategorySummary) => b.spent - a.spent)
        .slice(0, 4);

      // Get over-budget categories
      const overBudgetCategories = budgetData.categories
        .filter((cat: CategorySummary) => cat.is_over_budget)
        .map((cat: CategorySummary) => cat.category);

      // Calculate last month for comparison
      const lastMonthDate = new Date(parseInt(selectedYear), parseInt(selectedMonth) - 2, 1);
      const lastMonthYear = lastMonthDate.getFullYear().toString();
      const lastMonthMonth = (lastMonthDate.getMonth() + 1).toString().padStart(2, '0');

      let lastMonthTotal = 0;
      try {
        const lastMonthUrl = new URL("/api/reports/month-by-categories", window.location.origin);
        lastMonthUrl.searchParams.append("billingCycle", `${lastMonthYear}-${lastMonthMonth}`);
        const lastMonthData = await fetch(lastMonthUrl.toString(), { method: "PUT" }).then(r => r.json());
        lastMonthTotal = lastMonthData.reduce((sum: number, cat: { value: number }) => sum + cat.value, 0);
      } catch (error) {
        logger.info('Could not fetch last month data for comparison', { error });
      }

      const percentChange = lastMonthTotal > 0
        ? ((currentMonthTotal - lastMonthTotal) / lastMonthTotal) * 100
        : 0;

      setInsights({
        currentMonthTotal,
        lastMonthTotal,
        percentChange,
        bankIncome,
        bankExpenses,
        creditCardTotal,
        budgetRemaining: totalBudgetData.remaining || 0,
        totalBudget: totalBudgetData.total_budget || 0,
        topCategories,
        overBudgetCategories
      });

      // Set recent transactions (last 7)
      const sortedTransactions = transactionsData
        .sort((a: Transaction, b: Transaction) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 7);
      setRecentTransactions(sortedTransactions);

    } catch (error) {
      logger.error('Error fetching homepage data', error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, billingCycle, selectedYear, selectedMonth]);

  React.useEffect(() => {
    fetchHomepageData();
  }, [fetchHomepageData]);

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getCurrentMonthName = () => {
    return new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  if (loading) {
    return (
      <Box sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh'
      }}>
        <CircularProgress size={60} />
      </Box>
    );
  }

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
      </Box>

      {/* Main content */}
      <Box sx={{
        padding: { xs: '12px 8px', sm: '16px 12px', md: '24px 16px' },
        maxWidth: '1440px',
        margin: '0 auto',
        position: 'relative',
        zIndex: 1
      }}>

        {/* Hero Section */}
        <Box sx={{
          background: theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(59, 130, 246, 0.15) 100%)'
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(99, 102, 241, 0.1) 100%)',
          backdropFilter: 'blur(20px)',
          borderRadius: { xs: '24px', md: '32px' },
          padding: { xs: '24px 20px', md: '40px 48px' },
          marginTop: { xs: '60px', md: '24px' },
          marginBottom: { xs: '24px', md: '32px' },
          border: `1px solid ${theme.palette.divider}`,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.06)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <Box sx={{
            position: 'absolute',
            top: -50,
            right: -50,
            width: 300,
            height: 300,
            background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%)',
            borderRadius: '50%',
            filter: 'blur(40px)'
          }} />

          <Box sx={{ position: 'relative', zIndex: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
              <Box>
                <Typography variant="h3" sx={{
                  fontSize: { xs: '28px', md: '36px' },
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  marginBottom: '8px'
                }}>
                  Welcome Back! 👋
                </Typography>
                <Typography variant="body1" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                  Here's your financial overview for {getCurrentMonthName()}
                </Typography>
              </Box>

              <IconButton
                onClick={fetchHomepageData}
                sx={{
                  background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                  backdropFilter: 'blur(10px)',
                  borderRadius: '12px',
                  padding: '12px',
                  border: `1px solid ${theme.palette.divider}`,
                  '&:hover': {
                    transform: 'rotate(180deg)',
                    background: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(99, 102, 241, 0.15)'
                  },
                  transition: 'all 0.3s ease'
                }}
              >
                <RefreshIcon sx={{ color: 'primary.main' }} />
              </IconButton>
            </Box>

            {/* Financial Health Indicator */}
            <Box sx={{
              marginTop: '24px',
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 2,
              alignItems: { xs: 'stretch', sm: 'center' }
            }}>
              <Box sx={{
                background: insights && insights.budgetRemaining >= 0
                  ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.05) 100%)'
                  : 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.05) 100%)',
                border: insights && insights.budgetRemaining >= 0
                  ? '1px solid rgba(34, 197, 94, 0.3)'
                  : '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '16px',
                padding: '16px 24px',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                flex: 1
              }}>
                <Box sx={{
                  fontSize: '32px',
                  lineHeight: 1
                }}>
                  {insights && insights.budgetRemaining >= 0 ? '✅' : '⚠️'}
                </Box>
                <Box>
                  <Typography variant="body2" sx={{
                    color: insights && insights.budgetRemaining >= 0 ? '#16a34a' : '#dc2626',
                    fontWeight: 700,
                    fontSize: '12px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    {insights && insights.budgetRemaining >= 0 ? 'On Track' : 'Over Budget'}
                  </Typography>
                  <Typography variant="h6" sx={{
                    color: insights && insights.budgetRemaining >= 0 ? '#16a34a' : '#dc2626',
                    fontWeight: 700,
                    marginTop: '4px'
                  }}>
                    {insights ? formatCurrency(Math.abs(insights.budgetRemaining)) : '₪0'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {insights && insights.budgetRemaining >= 0 ? 'remaining this month' : 'over budget'}
                  </Typography>
                </Box>
              </Box>

              {/* Spending trend */}
              <Box sx={{
                background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.6)',
                backdropFilter: 'blur(10px)',
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: '16px',
                padding: '16px 24px',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                flex: 1
              }}>
                {insights && insights.percentChange !== 0 && (
                  insights.percentChange > 0 ? (
                    <TrendingUpIcon sx={{ fontSize: 32, color: '#f59e0b' }} />
                  ) : (
                    <TrendingDownIcon sx={{ fontSize: 32, color: '#22c55e' }} />
                  )
                )}
                <Box>
                  <Typography variant="body2" sx={{
                    color: 'text.secondary',
                    fontWeight: 600,
                    fontSize: '12px',
                    textTransform: 'uppercase'
                  }}>
                    vs Last Month
                  </Typography>
                  <Typography variant="h6" sx={{
                    color: insights && insights.percentChange > 0 ? '#f59e0b' : '#22c55e',
                    fontWeight: 700,
                    marginTop: '4px'
                  }}>
                    {insights ? `${insights.percentChange > 0 ? '+' : ''}${insights.percentChange.toFixed(1)}%` : '0%'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {insights && insights.percentChange > 0 ? 'spending increased' : 'spending decreased'}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Key Metrics Row */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(4, 1fr)'
          },
          gap: { xs: '12px', md: '20px' },
          marginBottom: { xs: '24px', md: '32px' }
        }}>
          {/* Total Spending */}
          <MetricCard
            title="Total Spending"
            value={insights?.currentMonthTotal || 0}
            icon={<MonetizationOnIcon />}
            color="#f59e0b"
            theme={theme}
          />

          {/* Bank Balance */}
          <MetricCard
            title="Bank Activity"
            value={insights?.bankIncome || 0}
            secondaryValue={insights?.bankExpenses || 0}
            secondaryLabel="Expenses"
            icon={<AccountBalanceWalletIcon />}
            color="#22c55e"
            theme={theme}
          />

          {/* Credit Cards */}
          <MetricCard
            title="Credit Cards"
            value={insights?.creditCardTotal || 0}
            icon={<CreditCardIcon />}
            color="#3b82f6"
            theme={theme}
          />

          {/* Budget Status */}
          <MetricCard
            title="Budget Status"
            value={insights?.totalBudget || 0}
            secondaryValue={Math.abs(insights?.budgetRemaining || 0)}
            secondaryLabel={insights && insights.budgetRemaining >= 0 ? "Remaining" : "Over"}
            icon={<SavingsIcon />}
            color="#8b5cf6"
            theme={theme}
          />
        </Box>

        {/* Content Grid - Insights & Transactions */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
          gap: { xs: '16px', md: '24px' },
          marginBottom: { xs: '24px', md: '32px' }
        }}>
          {/* Top Categories */}
          <Box sx={{
            background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            borderRadius: { xs: '20px', md: '24px' },
            padding: { xs: '20px', md: '28px' },
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
          }}>
            <Typography variant="h6" sx={{
              fontWeight: 700,
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}>
              📊 Top Spending Categories
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {insights?.topCategories.map((cat, index) => (
                <Box key={index}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                      {cat.category}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                      {formatCurrency(cat.spent)}
                    </Typography>
                  </Box>
                  {cat.budget_limit && (
                    <>
                      <Box sx={{
                        width: '100%',
                        height: '8px',
                        background: 'rgba(148, 163, 184, 0.2)',
                        borderRadius: '4px',
                        overflow: 'hidden'
                      }}>
                        <Box sx={{
                          width: `${Math.min((cat.percent_used || 0), 100)}%`,
                          height: '100%',
                          background: cat.is_over_budget
                            ? 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)'
                            : (cat.percent_used || 0) >= 80
                              ? 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)'
                              : 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)',
                          borderRadius: '4px',
                          transition: 'width 0.5s ease'
                        }} />
                      </Box>
                      <Typography variant="caption" sx={{
                        color: 'text.secondary',
                        display: 'block',
                        marginTop: '4px'
                      }}>
                        {cat.is_over_budget
                          ? `⚠️ ${formatCurrency(cat.spent - (cat.budget_limit || 0))} over budget`
                          : `${formatCurrency((cat.budget_limit || 0) - cat.spent)} left of ${formatCurrency(cat.budget_limit || 0)}`
                        }
                      </Typography>
                    </>
                  )}
                </Box>
              ))}
            </Box>
          </Box>

          {/* Recent Transactions */}
          <Box sx={{
            background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            borderRadius: { xs: '20px', md: '24px' },
            padding: { xs: '20px', md: '28px' },
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
          }}>
            <Typography variant="h6" sx={{
              fontWeight: 700,
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}>
              🕒 Recent Transactions
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {recentTransactions.map((txn, index) => (
                <Box key={index} sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  background: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.4)' : 'rgba(248, 250, 252, 0.8)',
                  borderRadius: '12px',
                  border: `1px solid ${theme.palette.divider}`,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    transform: 'translateX(4px)',
                    borderColor: 'primary.main'
                  }
                }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{
                      fontWeight: 600,
                      color: 'text.primary',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {txn.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {txn.category} • {new Date(txn.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{
                    fontWeight: 700,
                    color: txn.price > 0 ? '#22c55e' : 'text.primary',
                    marginLeft: 2,
                    whiteSpace: 'nowrap'
                  }}>
                    {formatCurrency(Math.abs(txn.price))}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        {/* Quick Actions */}
        <Box sx={{
          background: theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(99, 102, 241, 0.1) 100%)'
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(99, 102, 241, 0.05) 100%)',
          backdropFilter: 'blur(20px)',
          borderRadius: { xs: '20px', md: '24px' },
          padding: { xs: '24px', md: '32px' },
          border: `1px solid ${theme.palette.divider}`,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
        }}>
          <Typography variant="h6" sx={{
            fontWeight: 700,
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            ⚡ Quick Actions
          </Typography>

          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
            gap: { xs: '12px', md: '16px' }
          }}>
            <QuickActionButton
              icon={<SyncIcon />}
              label="Sync Accounts"
              color="#3b82f6"
              theme={theme}
            />
            <QuickActionButton
              icon={<AddIcon />}
              label="Add Transaction"
              color="#22c55e"
              theme={theme}
            />
            <QuickActionButton
              icon={<AssessmentIcon />}
              label="View Reports"
              color="#8b5cf6"
              theme={theme}
            />
            <QuickActionButton
              icon={<SmartToyIcon />}
              label="AI Assistant"
              color="#f59e0b"
              theme={theme}
            />
          </Box>
        </Box>

        {/* Budget Alerts */}
        {insights && insights.overBudgetCategories.length > 0 && (
          <Box sx={{
            marginTop: { xs: '16px', md: '24px' },
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%)',
            backdropFilter: 'blur(20px)',
            borderRadius: { xs: '16px', md: '20px' },
            padding: { xs: '16px', md: '20px' },
            border: '1px solid rgba(239, 68, 68, 0.3)',
            boxShadow: '0 4px 20px rgba(239, 68, 68, 0.1)'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: '12px' }}>
              <Typography variant="body1" sx={{ fontWeight: 700, color: '#dc2626' }}>
                ⚠️ Budget Alerts
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              You're over budget in {insights.overBudgetCategories.length} {insights.overBudgetCategories.length === 1 ? 'category' : 'categories'}:
              <strong style={{ color: '#dc2626', marginLeft: '4px' }}>
                {insights.overBudgetCategories.join(', ')}
              </strong>
            </Typography>
          </Box>
        )}

      </Box>
    </Box>
  );
};

// Metric Card Component
const MetricCard: React.FC<{
  title: string;
  value: number;
  secondaryValue?: number;
  secondaryLabel?: string;
  icon: React.ReactNode;
  color: string;
  theme: any;
}> = ({ title, value, secondaryValue, secondaryLabel, icon, color, theme }) => {
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <Box sx={{
      background: theme.palette.mode === 'dark'
        ? 'rgba(30, 41, 59, 0.4)'
        : 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(20px)',
      borderRadius: { xs: '20px', md: '24px' },
      padding: { xs: '20px', md: '24px' },
      border: `1px solid ${theme.palette.divider}`,
      boxShadow: '0 2px 12px rgba(0, 0, 0, 0.04)',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'relative',
      overflow: 'hidden',
      '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: `0 8px 24px ${color}20`,
        borderColor: `${color}40`
      }
    }}>
      {/* Background gradient */}
      <Box sx={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: '100px',
        height: '100px',
        background: `radial-gradient(circle at top right, ${color}20, transparent 70%)`,
        filter: 'blur(20px)'
      }} />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" sx={{
            color: 'text.secondary',
            fontWeight: 600,
            fontSize: '13px',
            marginBottom: '12px'
          }}>
            {title}
          </Typography>
          <Typography variant="h5" sx={{
            fontWeight: 700,
            color: color,
            fontSize: { xs: '20px', md: '24px' },
            marginBottom: secondaryValue !== undefined ? '8px' : 0
          }}>
            {formatCurrency(value)}
          </Typography>
          {secondaryValue !== undefined && (
            <Typography variant="body2" sx={{
              color: 'text.secondary',
              fontSize: '12px'
            }}>
              {secondaryLabel}: <strong style={{ color: 'text.primary' }}>{formatCurrency(secondaryValue)}</strong>
            </Typography>
          )}
        </Box>
        <Box sx={{
          background: `linear-gradient(135deg, ${color}40 0%, ${color}20 100%)`,
          borderRadius: '12px',
          padding: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 4px 12px ${color}30`
        }}>
          {React.cloneElement(icon as React.ReactElement, {
            sx: { fontSize: 24, color: color }
          })}
        </Box>
      </Box>
    </Box>
  );
};

// Quick Action Button Component
const QuickActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  color: string;
  theme: any;
}> = ({ icon, label, color, theme }) => {
  return (
    <Button
      sx={{
        background: theme.palette.mode === 'dark'
          ? 'rgba(30, 41, 59, 0.6)'
          : 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(10px)',
        borderRadius: '16px',
        padding: { xs: '16px 12px', md: '20px 16px' },
        border: `1px solid ${theme.palette.divider}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        textTransform: 'none',
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          borderColor: color,
          background: theme.palette.mode === 'dark'
            ? `${color}20`
            : `${color}10`,
          boxShadow: `0 8px 20px ${color}30`
        }
      }}
    >
      <Box sx={{
        background: `linear-gradient(135deg, ${color}40 0%, ${color}20 100%)`,
        borderRadius: '12px',
        padding: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {React.cloneElement(icon as React.ReactElement, {
          sx: { fontSize: { xs: 24, md: 28 }, color: color }
        })}
      </Box>
      <Typography variant="body2" sx={{
        fontWeight: 600,
        color: 'text.primary',
        fontSize: { xs: '12px', md: '13px' }
      }}>
        {label}
      </Typography>
    </Button>
  );
};

export default Homepage;
