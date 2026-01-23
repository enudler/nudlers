import React, { useState, useEffect } from 'react';
import { logger } from '../utils/client-logger';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import CircularProgress from '@mui/material/CircularProgress';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';

import RepeatIcon from '@mui/icons-material/Repeat';
import CreditScoreIcon from '@mui/icons-material/CreditScore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ModalHeader from './ModalHeader';
import { useTheme, Theme } from '@mui/material/styles';
import { useCardVendors } from './CategoryDashboard/utils/useCardVendors';
import { CardVendorIcon } from './CardVendorsModal';
import { getTableHeaderCellStyle, getTableBodyCellStyle, TABLE_ROW_HOVER_STYLE, getTableRowHoverBackground } from './CategoryDashboard/utils/tableStyles';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import { fetchCategories } from './CategoryDashboard/utils/categoryUtils';
import CategoryAutocomplete from './CategoryAutocomplete';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

interface Installment {
  name: string;
  price: number;
  original_amount: number | null;
  original_currency: string | null;
  category: string | null;
  vendor: string;
  account_number: string | null;
  current_installment: number;
  total_installments: number;
  last_charge_date: string;
  last_billing_date: string | null;
  next_payment_date: string | null;
  last_payment_date: string;
  status: 'active' | 'completed';
  transaction_type?: string | null;
  bank_nickname?: string | null;
  bank_account_display?: string | null;
}

interface RecurringTransaction {
  name: string;
  price: number;
  category: string | null;
  vendor: string;
  account_number: string | null;
  month_count: number;
  last_charge_date: string;
  last_billing_date: string | null;
  months: string[];
  frequency: 'monthly' | 'bi-monthly';
  next_payment_date: string;
  occurrences: Array<{ date: string; amount: number }>;
  transaction_type?: string | null;
  bank_nickname?: string | null;
  bank_account_display?: string | null;
}

interface RecurringPaymentsModalProps {
  open: boolean;
  onClose: () => void;
}

const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('he-IL').format(Math.round(Math.abs(num)));
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const formatMonth = (monthStr: string): string => {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

const RecurringPaymentsModal: React.FC<RecurringPaymentsModalProps> = ({ open, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'amount' | 'count'>('count');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [categories, setCategories] = useState<string[]>([]);
  const [editingItem, setEditingItem] = useState<{ type: 'installment' | 'recurring', index: number, item: Installment | RecurringTransaction } | null>(null);
  const [editCategory, setEditCategory] = useState('');
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });

  const theme = useTheme();
  const { getCardVendor, getCardNickname } = useCardVendors();

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await fetchCategories();
        setCategories(cats);
      } catch (err) {
        logger.error('Failed to load categories', err as Error);
      }
    };
    loadCategories();
  }, []);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/reports/recurring-payments');
      if (!response.ok) {
        throw new Error('Failed to fetch recurring payments');
      }
      const data = await response.json();
      setInstallments(data.installments || []);
      setRecurring(data.recurring || []);
    } catch (err) {
      logger.error('Error fetching recurring payments', err as Error);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Calculate summary stats
  const activeInstallments = installments.filter(i => i.status === 'active');
  const completedInstallments = installments.filter(i => i.status === 'completed');
  const totalMonthlyInstallments = activeInstallments.reduce((sum, i) => sum + Math.abs(i.price), 0);
  const totalMonthlyRecurring = recurring.reduce((sum, r) => sum + Math.abs(r.price), 0);

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const sortedRecurring = [...recurring].sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'amount') {
      comparison = Math.abs(a.price) - Math.abs(b.price);
      if (comparison === 0) {
        comparison = a.month_count - b.month_count;
      }
    } else if (sortBy === 'count') {
      comparison = a.month_count - b.month_count;
      if (comparison === 0) {
        comparison = Math.abs(a.price) - Math.abs(b.price);
      }
    }
    return sortOrder === 'desc' ? -comparison : comparison;
  });

  const handleSort = (field: 'amount' | 'count') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const renderAccountInfo = (item: Installment | RecurringTransaction) => {
    const isBank = item.transaction_type === 'bank' || (item.vendor && ['hapoalim', 'leumi', 'mizrahi', 'discount', 'yahav', 'union', 'otsarHahayal', 'beinleumi', 'massad', 'pagi'].includes(item.vendor));

    if (isBank) {
      const bankNames: Record<string, string> = {
        'hapoalim': 'Bank Hapoalim',
        'leumi': 'Bank Leumi',
        'mizrahi': 'Mizrahi Tefahot',
        'discount': 'Discount Bank',
        'yahav': 'Bank Yahav',
        'union': 'Union Bank',
        'otsarHahayal': 'Otsar HaHayal',
        'beinleumi': 'International Bank',
        'massad': 'Massad Bank',
        'pagi': 'Bank Pagi'
      };

      const bankName = bankNames[item.vendor] || item.bank_nickname || 'Bank Account';
      const bankAccount = item.bank_account_display || item.account_number;

      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(14, 165, 233, 0.2)'
          }}>
            <CardVendorIcon vendor={item.vendor} size={18} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{
              fontWeight: 700,
              fontSize: '13px',
              color: theme.palette.text.primary,
              letterSpacing: '0.2px'
            }}>
              {bankName}
            </span>
            {bankAccount && (
              <span style={{
                fontSize: '11px',
                color: theme.palette.text.secondary,
                fontWeight: 500
              }}>
                {bankAccount}
              </span>
            )}
          </div>
        </div>
      );
    }

    if (item.account_number) {
      const last4 = item.account_number.slice(-4);
      const nickname = getCardNickname(item.account_number);
      const vendor = getCardVendor(item.account_number);

      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(15, 23, 42, 0.2)'
          }}>
            <CardVendorIcon vendor={vendor} size={18} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{
              fontWeight: 700,
              fontSize: '13px',
              color: theme.palette.text.primary,
              letterSpacing: '0.2px'
            }}>
              {nickname || vendor || 'Credit Card'}
            </span>
            <span style={{
              fontSize: '11px',
              color: theme.palette.text.secondary,
              fontFamily: 'monospace',
              letterSpacing: '0.5px',
              fontWeight: 500
            }}>
              •••• {last4}
            </span>
          </div>
        </div>
      );
    }

    return <span style={{ color: '#94a3b8', fontSize: '13px' }}>-</span>;
  };

  const handleCategoryClick = (event: React.MouseEvent<HTMLElement>, item: Installment | RecurringTransaction, index: number, type: 'installment' | 'recurring') => {
    event.stopPropagation();
    setEditingItem({ type, index, item });
    setEditCategory(item.category || '');
  };

  const handleSaveCategory = async () => {
    if (!editingItem) return;

    try {
      const response = await fetch('/api/categories/update-by-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: editingItem.item.name,
          newCategory: editCategory,
          createRule: true
        }),
      });

      if (!response.ok) throw new Error('Failed to update category');

      const result = await response.json();

      // Update local state and categories list if it's new
      if (editCategory && !categories.includes(editCategory)) {
        setCategories(prev => [...prev, editCategory].sort());
      }

      const updateItem = (item: any) => ({ ...item, category: editCategory });

      if (editingItem.type === 'installment') {
        const newInstallments = [...installments];
        newInstallments[editingItem.index] = updateItem(newInstallments[editingItem.index]);
        setInstallments(newInstallments);
      } else {
        const newRecurring = [...recurring];
        newRecurring[editingItem.index] = updateItem(newRecurring[editingItem.index]);
        setRecurring(newRecurring);
      }

      // Show success message
      const message = result.transactionsUpdated > 1
        ? `Updated ${result.transactionsUpdated} transactions with "${editingItem.item.name}" to "${editCategory}". Rule saved.`
        : `Category updated to "${editCategory}". Rule saved.`;

      setSnackbar({
        open: true,
        message,
        severity: 'success'
      });

      // Refresh local data to catch ALL updates (since one rule might update multiple rows/groups)
      fetchData();

      // Trigger global refresh for other components
      window.dispatchEvent(new CustomEvent('dataRefresh'));

    } catch (err) {
      logger.error('Error updating category', err as Error);
      setSnackbar({
        open: true,
        message: 'Failed to update category',
        severity: 'error'
      });
    } finally {
      handleCancelCategory();
    }

  };

  const handleCancelCategory = () => {
    setEditingItem(null);
    setEditCategory('');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '28px',
          background: theme.palette.mode === 'dark'
            ? 'rgba(30, 41, 59, 0.7)'
            : 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(30px)',
          minHeight: '80vh',
          maxHeight: '90vh',
          border: `2px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(148,163,184,0.1)'}`,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
          fontFamily: 'Assistant, sans-serif'
        }
      }}
    >
      <ModalHeader
        title="Recurring Payments"
        onClose={onClose}
      />

      <DialogContent sx={{ p: 0 }}>
        {loading ? (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '400px'
          }}>
            <CircularProgress size={60} style={{ color: '#8b5cf6' }} />
          </div>
        ) : error ? (
          <div style={{
            textAlign: 'center',
            padding: '64px',
            color: '#ef4444'
          }}>
            Error: {error}
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div style={{
              display: 'flex',
              gap: '20px',
              padding: '24px 32px',
              flexWrap: 'wrap'
            }}>
              {[
                {
                  title: 'Active Installments',
                  value: activeInstallments.length,
                  secondary: `₪${formatNumber(totalMonthlyInstallments)}/mo`,
                  color: '#8b5cf6',
                  icon: <CreditScoreIcon sx={{ fontSize: '24px', color: '#8b5cf6' }} />
                },
                {
                  title: 'Completed',
                  value: completedInstallments.length,
                  secondary: 'Paid off',
                  color: '#10b981',
                  icon: <CheckCircleIcon sx={{ fontSize: '24px', color: '#10b981' }} />
                },
                {
                  title: 'Recurring',
                  value: recurring.length,
                  secondary: 'Active',
                  color: '#3b82f6',
                  icon: <RepeatIcon sx={{ fontSize: '24px', color: '#3b82f6' }} />
                }
              ].map((card, i) => (
                <div key={i} style={{
                  flex: '1 1 200px',
                  background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'white',
                  backdropFilter: 'blur(20px)',
                  borderRadius: '24px',
                  padding: '24px',
                  position: 'relative',
                  overflow: 'hidden',
                  border: `2px solid ${card.color}20`,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'default'
                }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
                    e.currentTarget.style.boxShadow = `0 12px 32px ${card.color}15`;
                    e.currentTarget.style.borderColor = `${card.color}40`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.05)';
                    e.currentTarget.style.borderColor = `${card.color}20`;
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: '100px',
                    height: '100px',
                    background: `radial-gradient(circle at top right, ${card.color}15, transparent 70%)`,
                    filter: 'blur(20px)'
                  }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div style={{
                      background: `${card.color}15`,
                      padding: '10px',
                      borderRadius: '12px',
                      display: 'flex',
                      border: `1px solid ${card.color}30`
                    }}>
                      {card.icon}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: theme.palette.text.secondary, fontSize: '13px', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {card.title}
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: theme.palette.text.primary, letterSpacing: '-0.02em', fontFamily: 'Assistant, sans-serif' }}>
                      {card.value}
                    </div>
                    <div style={{ fontSize: '13px', color: card.color, fontWeight: 600, marginTop: '4px' }}>
                      {card.secondary}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: theme.palette.divider, px: 3 }}>
              <Tabs
                value={activeTab}
                onChange={handleTabChange}
                sx={{
                  '& .MuiTab-root': {
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '15px',
                    color: theme.palette.text.secondary,
                    '&.Mui-selected': {
                      color: '#8b5cf6'
                    }
                  },
                  '& .MuiTabs-indicator': {
                    backgroundColor: '#8b5cf6',
                    height: '3px',
                    borderRadius: '3px 3px 0 0'
                  }
                }}
              >
                <Tab
                  label={`Installments (${installments.length})`}
                  icon={<CreditScoreIcon sx={{ fontSize: '18px' }} />}
                  iconPosition="start"
                />
                <Tab
                  label={`Recurring (${recurring.length})`}
                  icon={<RepeatIcon sx={{ fontSize: '18px' }} />}
                  iconPosition="start"
                />
              </Tabs>
            </Box>

            {/* Tab Content */}
            <div style={{ padding: '24px 32px', overflowY: 'auto', maxHeight: 'calc(90vh - 380px)' }}>
              {activeTab === 0 ? (
                // Installments Tab
                installments.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '64px',
                    color: theme.palette.text.secondary
                  }}>
                    <CreditScoreIcon sx={{ fontSize: '48px', opacity: 0.5, mb: 2 }} />
                    <div>No installment payments found</div>
                  </div>
                ) : (
                  <div style={{
                    overflowX: 'auto',
                    background: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.3)' : 'white',
                    borderRadius: '24px',
                    border: `1px solid ${theme.palette.divider}`,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                  }}>
                    <table style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      borderSpacing: 0,
                      fontSize: '14px',
                      fontFamily: 'Assistant, sans-serif'
                    }}>
                      <thead>
                        <tr>
                          <th style={getTableHeaderCellStyle(theme)}>Description</th>
                          <th style={getTableHeaderCellStyle(theme)}>Account</th>
                          <th style={getTableHeaderCellStyle(theme)}>Category</th>
                          <th style={{ ...getTableHeaderCellStyle(theme), textAlign: 'center' }}>Progress</th>
                          <th style={{ ...getTableHeaderCellStyle(theme), textAlign: 'right' }}>Monthly</th>
                          <th style={{ ...getTableHeaderCellStyle(theme), textAlign: 'right' }}>Original</th>
                          <th style={{ ...getTableHeaderCellStyle(theme), textAlign: 'center' }}>Next</th>
                          <th style={{ ...getTableHeaderCellStyle(theme), textAlign: 'center' }}>End</th>
                          <th style={{ ...getTableHeaderCellStyle(theme), textAlign: 'center' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {installments.map((item, index) => {
                          const progressPercent = Math.round((item.current_installment / item.total_installments) * 100);
                          const remaining = item.total_installments - item.current_installment;

                          return (
                            <tr
                              key={`${item.name}-${item.price}-${index}`}
                              style={{
                                ...TABLE_ROW_HOVER_STYLE,
                                background: index % 2 === 0 ? 'transparent' : (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(248, 250, 252, 0.5)')
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = getTableRowHoverBackground(theme);
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = index % 2 === 0 ? 'transparent' : (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(248, 250, 252, 0.5)');
                              }}
                            >
                              <td style={{
                                ...getTableBodyCellStyle(theme),
                                fontWeight: 700,
                                maxWidth: '250px'
                              }}>
                                <div style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {item.name}
                                </div>
                              </td>
                              <td style={getTableBodyCellStyle(theme)}>
                                {renderAccountInfo(item as Installment)}
                              </td>
                              <td style={getTableBodyCellStyle(theme)}>
                                {editingItem?.type === 'installment' && editingItem.index === index ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <CategoryAutocomplete
                                      value={editCategory}
                                      onChange={setEditCategory}
                                      options={categories}
                                      autoFocus
                                      placeholder="Category"
                                    />
                                    <div style={{ display: 'flex', gap: '2px' }}>
                                      <div
                                        onClick={(e) => { e.stopPropagation(); handleSaveCategory(); }}
                                        style={{ cursor: 'pointer', color: '#4ADE80', padding: '4px' }}
                                      >
                                        <CheckIcon fontSize="small" />
                                      </div>
                                      <div
                                        onClick={(e) => { e.stopPropagation(); handleCancelCategory(); }}
                                        style={{ cursor: 'pointer', color: '#ef4444', padding: '4px' }}
                                      >
                                        <CloseIcon fontSize="small" />
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <span
                                    onClick={(e) => handleCategoryClick(e, item, index, 'installment')}
                                    style={{
                                      background: 'rgba(59, 130, 246, 0.1)',
                                      padding: '4px 10px',
                                      borderRadius: '6px',
                                      fontSize: '12px',
                                      color: '#3b82f6',
                                      fontWeight: 700,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.5px',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                                      e.currentTarget.style.transform = 'scale(1.05)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                                      e.currentTarget.style.transform = 'scale(1)';
                                    }}
                                  >
                                    {item.category || 'Uncategorized'}
                                    <EditIcon sx={{ fontSize: '12px', opacity: 0.5 }} />
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                                <Tooltip title={`${item.current_installment} of ${item.total_installments} payments`}>
                                  <div>
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      justifyContent: 'center'
                                    }}>
                                      <span style={{
                                        fontWeight: 600,
                                        color: item.status === 'completed' ? '#10b981' : '#8b5cf6',
                                        fontSize: '13px'
                                      }}>
                                        {item.current_installment}/{item.total_installments}
                                      </span>
                                    </div>
                                    <div style={{
                                      width: '100%',
                                      maxWidth: '80px',
                                      height: '6px',
                                      background: 'rgba(148, 163, 184, 0.2)',
                                      borderRadius: '3px',
                                      overflow: 'hidden',
                                      margin: '6px auto 0'
                                    }}>
                                      <div style={{
                                        width: `${progressPercent}%`,
                                        height: '100%',
                                        background: item.status === 'completed'
                                          ? 'linear-gradient(90deg, #10b981 0%, #34d399 100%)'
                                          : 'linear-gradient(90deg, #8b5cf6 0%, #a78bfa 100%)',
                                        borderRadius: '3px',
                                        transition: 'width 0.3s ease'
                                      }} />
                                    </div>
                                    {remaining > 0 && (
                                      <div style={{
                                        fontSize: '11px',
                                        color: theme.palette.text.secondary,
                                        marginTop: '4px'
                                      }}>
                                        {remaining} left
                                      </div>
                                    )}
                                  </div>
                                </Tooltip>
                              </td>
                              <td style={{ ...getTableBodyCellStyle(theme), textAlign: 'right', fontWeight: 800, color: '#8b5cf6', fontSize: '15px' }}>
                                ₪{formatNumber(item.price)}
                              </td>
                              <td style={{ ...getTableBodyCellStyle(theme), textAlign: 'right', color: theme.palette.text.secondary, fontSize: '13px' }}>
                                {item.original_amount ? (
                                  <span>
                                    {item.original_currency !== 'ILS' && item.original_currency
                                      ? `${item.original_currency} `
                                      : '₪'}
                                    {formatNumber(item.original_amount)}
                                  </span>
                                ) : (
                                  <span style={{ opacity: 0.5 }}>-</span>
                                )}
                              </td>
                              <td style={{
                                padding: '16px 12px',
                                textAlign: 'center',
                                fontSize: '13px'
                              }}>
                                {(() => {
                                  // If no next payment date, check if truly completed based on installments
                                  if (!item.next_payment_date) {
                                    return (
                                      <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        color: '#10b981',
                                        fontWeight: 500
                                      }}>
                                        <CheckCircleIcon sx={{ fontSize: '14px' }} />
                                        Completed
                                      </span>
                                    );
                                  }

                                  // Compare dates using ISO string format to avoid timezone issues
                                  const nextDateStr = item.next_payment_date.split('T')[0]; // Get YYYY-MM-DD
                                  const todayStr = new Date().toISOString().split('T')[0];
                                  const isPast = nextDateStr < todayStr;

                                  // Only show completed if the date has actually passed
                                  if (isPast) {
                                    return (
                                      <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        color: '#10b981',
                                        fontWeight: 500
                                      }}>
                                        <CheckCircleIcon sx={{ fontSize: '14px' }} />
                                        Completed
                                      </span>
                                    );
                                  }

                                  // Date hasn't passed yet - show the upcoming date
                                  return (
                                    <span style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      color: '#f59e0b',
                                      fontWeight: 500
                                    }}>
                                      <CalendarTodayIcon sx={{ fontSize: '14px', opacity: 0.7 }} />
                                      {formatDate(item.next_payment_date)}
                                    </span>
                                  );
                                })()}
                              </td>
                              <td style={{
                                ...getTableBodyCellStyle(theme),
                                textAlign: 'center',
                                fontSize: '13px'
                              }}>
                                <Tooltip title="Final installment date">
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    color: item.status === 'completed' ? '#10b981' : '#64748b',
                                    fontWeight: 700
                                  }}>
                                    <CalendarTodayIcon sx={{ fontSize: '14px', opacity: 0.7 }} />
                                    {formatDate(item.last_payment_date)}
                                  </span>
                                </Tooltip>
                              </td>
                              <td style={{ ...getTableBodyCellStyle(theme), textAlign: 'center' }}>
                                {item.status === 'completed' ? (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: 'rgba(16, 185, 129, 0.1)',
                                    color: '#10b981',
                                    padding: '6px 12px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    textTransform: 'uppercase'
                                  }}>
                                    <CheckCircleIcon sx={{ fontSize: '14px' }} />
                                    Done
                                  </span>
                                ) : (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: 'rgba(139, 92, 246, 0.1)',
                                    color: '#8b5cf6',
                                    padding: '6px 12px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    textTransform: 'uppercase'
                                  }}>
                                    <PendingIcon sx={{ fontSize: '14px' }} />
                                    Active
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                // Recurring Transactions Tab
                recurring.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '64px',
                    color: theme.palette.text.secondary
                  }}>
                    <RepeatIcon sx={{ fontSize: '48px', opacity: 0.5, mb: 2 }} />
                    <div>No recurring payments detected</div>
                    <div style={{ fontSize: '13px', marginTop: '8px', opacity: 0.7 }}>
                      Recurring payments appear when the same expense occurs in 2+ months
                    </div>
                  </div>
                ) : (
                  <div style={{
                    overflowX: 'auto',
                    background: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.3)' : 'white',
                    borderRadius: '24px',
                    border: `1px solid ${theme.palette.divider}`,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                  }}>
                    <table style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      borderSpacing: 0,
                      fontSize: '14px',
                      fontFamily: 'Assistant, sans-serif'
                    }}>
                      <thead>
                        <tr>
                          <th style={getTableHeaderCellStyle(theme)}>Description</th>
                          <th style={getTableHeaderCellStyle(theme)}>Account</th>
                          <th style={getTableHeaderCellStyle(theme)}>Category</th>
                          <th
                            style={{ ...getTableHeaderCellStyle(theme), textAlign: 'center', cursor: 'pointer' }}
                            onClick={() => handleSort('count')}
                          >
                            Frequency {sortBy === 'count' && (sortOrder === 'desc' ? '↓' : '↑')}
                          </th>
                          <th
                            style={{ ...getTableHeaderCellStyle(theme), textAlign: 'right', cursor: 'pointer' }}
                            onClick={() => handleSort('amount')}
                          >
                            Amount (Avg) {sortBy === 'amount' && (sortOrder === 'desc' ? '↓' : '↑')}
                          </th>
                          <th style={{ ...getTableHeaderCellStyle(theme), textAlign: 'center' }}>Next</th>
                          <th style={{ ...getTableHeaderCellStyle(theme), textAlign: 'center' }}>Last</th>
                          <th style={{ ...getTableHeaderCellStyle(theme), textAlign: 'center' }}>Hist</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRecurring.map((item, index) => {
                          const rowId = `${item.name}-${item.account_number}-${item.price}`;
                          const isExpanded = expandedRows.has(rowId);

                          return (
                            <React.Fragment key={rowId}>
                              <tr
                                style={{
                                  ...TABLE_ROW_HOVER_STYLE,
                                  background: isExpanded
                                    ? (theme.palette.mode === 'dark' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.05)')
                                    : (index % 2 === 0 ? 'transparent' : (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(248, 250, 252, 0.5)')),
                                }}
                                onClick={() => toggleRow(rowId)}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = isExpanded ? (theme.palette.mode === 'dark' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.08)') : getTableRowHoverBackground(theme);
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = isExpanded
                                    ? (theme.palette.mode === 'dark' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.05)')
                                    : (index % 2 === 0 ? 'transparent' : (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(248, 250, 252, 0.5)'));
                                }}
                              >
                                <td style={{
                                  ...getTableBodyCellStyle(theme),
                                  fontWeight: 700,
                                  maxWidth: '250px'
                                }}>
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px'
                                  }}>
                                    <div style={{
                                      background: 'rgba(59, 130, 246, 0.1)',
                                      padding: '8px',
                                      borderRadius: '10px',
                                      display: 'flex'
                                    }}>
                                      <RepeatIcon sx={{ fontSize: '18px', color: '#3b82f6' }} />
                                    </div>
                                    <span style={{
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap'
                                    }}>
                                      {item.name}
                                    </span>
                                  </div>
                                </td>
                                <td style={getTableBodyCellStyle(theme)}>
                                  {renderAccountInfo(item)}
                                </td>
                                <td style={getTableBodyCellStyle(theme)}>
                                  {editingItem?.type === 'recurring' && editingItem.index === index ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <CategoryAutocomplete
                                        value={editCategory}
                                        onChange={setEditCategory}
                                        options={categories}
                                        autoFocus
                                        placeholder="Category"
                                      />
                                      <div style={{ display: 'flex', gap: '2px' }}>
                                        <div
                                          onClick={(e) => { e.stopPropagation(); handleSaveCategory(); }}
                                          style={{ cursor: 'pointer', color: '#4ADE80', padding: '4px' }}
                                        >
                                          <CheckIcon fontSize="small" />
                                        </div>
                                        <div
                                          onClick={(e) => { e.stopPropagation(); handleCancelCategory(); }}
                                          style={{ cursor: 'pointer', color: '#ef4444', padding: '4px' }}
                                        >
                                          <CloseIcon fontSize="small" />
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <span
                                      onClick={(e) => handleCategoryClick(e, item, index, 'recurring')}
                                      style={{
                                        background: 'rgba(59, 130, 246, 0.1)',
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        color: '#3b82f6',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        transition: 'all 0.2s'
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                                        e.currentTarget.style.transform = 'scale(1.05)';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                                        e.currentTarget.style.transform = 'scale(1)';
                                      }}
                                    >
                                      {item.category || 'Uncategorized'}
                                      <EditIcon sx={{ fontSize: '12px', opacity: 0.5 }} />
                                    </span>
                                  )}
                                </td>
                                <td style={{
                                  ...getTableBodyCellStyle(theme),
                                  textAlign: 'center'
                                }}>
                                  <span style={{
                                    background: item.frequency === 'bi-monthly' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                                    color: item.frequency === 'bi-monthly' ? '#f59e0b' : '#8b5cf6',
                                    padding: '6px 12px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px'
                                  }}>
                                    {item.frequency}
                                  </span>
                                </td>
                                <td style={{
                                  ...getTableBodyCellStyle(theme),
                                  textAlign: 'right',
                                  fontWeight: 800,
                                  color: '#3b82f6',
                                  fontSize: '15px'
                                }}>
                                  ₪{formatNumber(item.price)}
                                </td>
                                <td style={{
                                  ...getTableBodyCellStyle(theme),
                                  textAlign: 'center'
                                }}>
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    color: '#f59e0b',
                                    fontWeight: 700,
                                    fontSize: '13px'
                                  }}>
                                    <CalendarTodayIcon sx={{ fontSize: '14px', opacity: 0.8 }} />
                                    {formatDate(item.next_payment_date)}
                                  </span>
                                </td>
                                <td style={{
                                  ...getTableBodyCellStyle(theme),
                                  textAlign: 'center',
                                  color: theme.palette.text.secondary
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px', fontWeight: 500 }}>
                                    <CalendarTodayIcon sx={{ fontSize: '14px', opacity: 0.8 }} />
                                    {formatDate(item.last_charge_date)}
                                  </div>
                                </td>
                                <td style={{
                                  ...getTableBodyCellStyle(theme),
                                  textAlign: 'center'
                                }}>
                                  <span style={{
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    color: '#8b5cf6',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px'
                                  }}>
                                    {isExpanded ? 'Hide' : `Details (${item.month_count})`}
                                  </span>
                                </td>
                              </tr>

                              {/* Expanded Row Content */}
                              {isExpanded && (
                                <tr style={{
                                  background: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.6)' : 'rgba(241, 245, 249, 0.6)',
                                  borderBottom: `1px solid ${theme.palette.divider}`
                                }}>
                                  <td colSpan={8} style={{ padding: '0 32px 24px' }}>
                                    <div style={{
                                      padding: '20px',
                                      borderRadius: '12px',
                                      background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.5)' : 'white',
                                      border: `1px solid ${theme.palette.divider}`,
                                      marginTop: '-4px',
                                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'
                                    }}>
                                      <div style={{
                                        fontWeight: 700,
                                        marginBottom: '16px',
                                        fontSize: '13px',
                                        color: theme.palette.text.primary,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                      }}>
                                        <CalendarTodayIcon sx={{ fontSize: '16px', color: '#8b5cf6' }} />
                                        Payment History
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {item.occurrences?.map((occ, idx) => (
                                          <div key={idx} style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '12px 20px',
                                            borderRadius: '10px',
                                            background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                            border: `1px solid ${theme.palette.divider}`,
                                            transition: 'all 0.2s ease'
                                          }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                              <div style={{
                                                width: '8px',
                                                height: '8px',
                                                borderRadius: '50%',
                                                background: '#10b981'
                                              }} />
                                              <span style={{ fontSize: '14px', fontWeight: 500, color: theme.palette.text.primary }}>
                                                {formatDate(occ.date)}
                                              </span>
                                            </div>
                                            <span style={{ fontSize: '14px', fontWeight: 700, color: '#10b981' }}>
                                              ₪{formatNumber(occ.amount)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          </>
        )}
      </DialogContent>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Dialog>
  );
};

export default RecurringPaymentsModal;
