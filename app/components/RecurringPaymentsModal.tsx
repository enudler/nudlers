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

  const theme = useTheme();
  const { getCardVendor, getCardNickname } = useCardVendors();

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
      return (
        <Tooltip title={`${item.bank_nickname || 'Bank Account'} (${item.bank_account_display || item.account_number})`}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
            padding: '6px 12px',
            borderRadius: '8px',
            width: 'fit-content'
          }}>
            <CardVendorIcon vendor={item.vendor} size={20} />
            <span style={{
              color: 'white',
              fontSize: '12px',
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '120px',
              whiteSpace: 'nowrap'
            }}>
              {item.bank_nickname || 'Bank Account'}
            </span>
          </div>
        </Tooltip>
      );
    }

    if (item.account_number) {
      const last4 = item.account_number.slice(-4);
      const nickname = getCardNickname(item.account_number);
      const vendor = getCardVendor(item.account_number);

      return (
        <Tooltip title={nickname || `Card ending in ${last4}`}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
              padding: '6px 12px',
              borderRadius: '8px',
              width: 'fit-content'
            }}>
              <CardVendorIcon vendor={vendor} size={20} />
              <span style={{
                color: 'white',
                fontFamily: 'monospace',
                fontSize: '13px',
                fontWeight: 600,
                letterSpacing: '1px'
              }}>
                •••• {last4}
              </span>
            </div>
            {nickname && (
              <span style={{ fontSize: '11px', color: theme.palette.text.secondary, paddingLeft: '4px' }}>
                {nickname}
              </span>
            )}
          </div>
        </Tooltip>
      );
    }

    return <span style={{ color: '#94a3b8', fontSize: '13px' }}>-</span>;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '24px',
          background: theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)'
            : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
          minHeight: '80vh',
          maxHeight: '90vh',
          border: theme.palette.mode === 'dark' ? `1px solid ${theme.palette.divider}` : 'none'
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
              gap: '16px',
              padding: '24px 32px',
              flexWrap: 'wrap'
            }}>
              {/* Active Installments Card */}
              <div style={{
                background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                borderRadius: '16px',
                padding: '20px 24px',
                minWidth: '180px',
                boxShadow: '0 4px 16px rgba(139, 92, 246, 0.3)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <CreditScoreIcon sx={{ color: 'white', fontSize: '20px' }} />
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px', fontWeight: 600 }}>
                    Active Installments
                  </span>
                </div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'white' }}>
                  {activeInstallments.length}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>
                  ₪{formatNumber(totalMonthlyInstallments)}/month
                </div>
              </div>

              {/* Completed Installments Card */}
              <div style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                borderRadius: '16px',
                padding: '20px 24px',
                minWidth: '180px',
                boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <CheckCircleIcon sx={{ color: 'white', fontSize: '20px' }} />
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px', fontWeight: 600 }}>
                    Completed
                  </span>
                </div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'white' }}>
                  {completedInstallments.length}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>
                  Paid off
                </div>
              </div>

              {/* Recurring Transactions Card */}
              <div style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                borderRadius: '16px',
                padding: '20px 24px',
                minWidth: '180px',
                boxShadow: '0 4px 16px rgba(59, 130, 246, 0.3)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <RepeatIcon sx={{ color: 'white', fontSize: '20px' }} />
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px', fontWeight: 600 }}>
                    Recurring Subscriptions
                  </span>
                </div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'white' }}>
                  {recurring.length}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>
                  ₪{formatNumber(totalMonthlyRecurring)}/month
                </div>
              </div>

              {/* Total Monthly Commitment */}
              <div style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                borderRadius: '16px',
                padding: '20px 24px',
                minWidth: '180px',
                boxShadow: '0 4px 16px rgba(245, 158, 11, 0.3)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <TrendingUpIcon sx={{ color: 'white', fontSize: '20px' }} />
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px', fontWeight: 600 }}>
                    Total Monthly
                  </span>
                </div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'white' }}>
                  ₪{formatNumber(totalMonthlyInstallments + totalMonthlyRecurring)}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>
                  Fixed commitments
                </div>
              </div>
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
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '14px'
                    }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${theme.palette.divider}` }}>
                          <th style={getHeaderCellStyle(theme)}>Description</th>
                          <th style={getHeaderCellStyle(theme)}>Account</th>
                          <th style={getHeaderCellStyle(theme)}>Category</th>
                          <th style={{ ...getHeaderCellStyle(theme), textAlign: 'center' }}>Progress</th>
                          <th style={{ ...getHeaderCellStyle(theme), textAlign: 'right' }}>Monthly Amount</th>
                          <th style={{ ...getHeaderCellStyle(theme), textAlign: 'right' }}>Original Amount</th>
                          <th style={{ ...getHeaderCellStyle(theme), textAlign: 'center' }}>Next Payment</th>
                          <th style={{ ...getHeaderCellStyle(theme), textAlign: 'center' }}>Last Payment</th>
                          <th style={{ ...getHeaderCellStyle(theme), textAlign: 'center' }}>Status</th>
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
                                borderBottom: `1px solid ${theme.palette.divider}`,
                                background: index % 2 === 0 ? 'transparent' : (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(248, 250, 252, 0.5)')
                              }}
                            >
                              <td style={{
                                padding: '16px 12px',
                                fontWeight: 600,
                                color: theme.palette.text.primary,
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
                              <td style={{ padding: '16px 12px' }}>
                                {renderAccountInfo(item as Installment)}
                              </td>
                              <td style={{ padding: '16px 12px', color: theme.palette.text.secondary }}>
                                <span style={{
                                  background: 'rgba(59, 130, 246, 0.1)',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  fontSize: '13px',
                                  color: '#3b82f6',
                                  fontWeight: 500
                                }}>
                                  {item.category || 'Uncategorized'}
                                </span>
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
                              <td style={{
                                padding: '16px 12px',
                                textAlign: 'right',
                                fontWeight: 600,
                                color: '#8b5cf6'
                              }}>
                                ₪{formatNumber(item.price)}
                              </td>
                              <td style={{
                                padding: '16px 12px',
                                textAlign: 'right',
                                color: theme.palette.text.secondary
                              }}>
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
                                padding: '16px 12px',
                                textAlign: 'center',
                                fontSize: '13px'
                              }}>
                                <Tooltip title="Final installment date">
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    color: item.status === 'completed' ? '#10b981' : '#64748b',
                                    fontWeight: 500
                                  }}>
                                    <CalendarTodayIcon sx={{ fontSize: '14px', opacity: 0.7 }} />
                                    {formatDate(item.last_payment_date)}
                                  </span>
                                </Tooltip>
                              </td>
                              <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                                {item.status === 'completed' ? (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: 'rgba(16, 185, 129, 0.1)',
                                    color: '#10b981',
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 600
                                  }}>
                                    <CheckCircleIcon sx={{ fontSize: '14px' }} />
                                    Completed
                                  </span>
                                ) : (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: 'rgba(139, 92, 246, 0.1)',
                                    color: '#8b5cf6',
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 600
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
                    <div>No recurring transactions detected</div>
                    <div style={{ fontSize: '13px', marginTop: '8px', opacity: 0.7 }}>
                      Recurring transactions appear when the same expense occurs in 2+ months
                    </div>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '14px'
                    }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${theme.palette.divider}` }}>
                          <th style={getHeaderCellStyle(theme)}>Description</th>
                          <th style={getHeaderCellStyle(theme)}>Account</th>
                          <th style={getHeaderCellStyle(theme)}>Category</th>
                          <th
                            style={{ ...getHeaderCellStyle(theme), textAlign: 'center', cursor: 'pointer' }}
                            onClick={() => handleSort('count')}
                          >
                            Frequency {sortBy === 'count' && (sortOrder === 'desc' ? '↓' : '↑')}
                          </th>
                          <th
                            style={{ ...getHeaderCellStyle(theme), textAlign: 'right', cursor: 'pointer' }}
                            onClick={() => handleSort('amount')}
                          >
                            Amount (Avg) {sortBy === 'amount' && (sortOrder === 'desc' ? '↓' : '↑')}
                          </th>
                          <th style={{ ...getHeaderCellStyle(theme), textAlign: 'center' }}>Next Payment</th>
                          <th style={{ ...getHeaderCellStyle(theme), textAlign: 'center' }}>Last Charge</th>
                          <th style={{ ...getHeaderCellStyle(theme), textAlign: 'center' }}>History</th>
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
                                  borderBottom: isExpanded ? 'none' : `1px solid ${theme.palette.divider}`,
                                  background: isExpanded
                                    ? (theme.palette.mode === 'dark' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.05)')
                                    : (index % 2 === 0 ? 'transparent' : (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(248, 250, 252, 0.5)')),
                                  transition: 'background-color 0.2s ease',
                                  cursor: 'pointer'
                                }}
                                onClick={() => toggleRow(rowId)}
                              >
                                <td style={{
                                  padding: '16px 12px',
                                  fontWeight: 600,
                                  color: theme.palette.text.primary,
                                  maxWidth: '250px'
                                }}>
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                  }}>
                                    <RepeatIcon sx={{ fontSize: '16px', color: '#3b82f6', opacity: 0.7 }} />
                                    <span style={{
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap'
                                    }}>
                                      {item.name}
                                    </span>
                                  </div>
                                </td>
                                <td style={{ padding: '16px 12px' }}>
                                  {renderAccountInfo(item)}
                                </td>
                                <td style={{ padding: '16px 12px', color: theme.palette.text.secondary }}>
                                  <span style={{
                                    background: 'rgba(59, 130, 246, 0.1)',
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    color: '#3b82f6',
                                    fontWeight: 500
                                  }}>
                                    {item.category || 'Uncategorized'}
                                  </span>
                                </td>
                                <td style={{
                                  padding: '16px 12px',
                                  textAlign: 'center'
                                }}>
                                  <span style={{
                                    background: item.frequency === 'bi-monthly' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                    color: item.frequency === 'bi-monthly' ? '#f59e0b' : '#3b82f6',
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    textTransform: 'capitalize'
                                  }}>
                                    {item.frequency}
                                  </span>
                                </td>
                                <td style={{
                                  padding: '16px 12px',
                                  textAlign: 'right',
                                  fontWeight: 600,
                                  color: '#3b82f6'
                                }}>
                                  ₪{formatNumber(item.price)}
                                </td>
                                <td style={{
                                  padding: '16px 12px',
                                  textAlign: 'center',
                                  fontSize: '13px'
                                }}>
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
                                </td>
                                <td style={{
                                  padding: '16px 12px',
                                  textAlign: 'center',
                                  color: theme.palette.text.secondary,
                                  fontSize: '13px'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                    <CalendarTodayIcon sx={{ fontSize: '14px', opacity: 0.7 }} />
                                    {formatDate(item.last_charge_date)}
                                  </div>
                                </td>
                                <td style={{
                                  padding: '16px 12px',
                                  textAlign: 'center',
                                  color: '#8b5cf6'
                                }}>
                                  <span style={{
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    textDecoration: 'underline'
                                  }}>
                                    {isExpanded ? 'Hide' : `Show ${item.month_count} payments`}
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
                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                                        {item.occurrences?.map((occ, idx) => (
                                          <div key={idx} style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '10px 14px',
                                            borderRadius: '8px',
                                            background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                            border: `1px solid ${theme.palette.divider}`
                                          }}>
                                            <span style={{ fontSize: '13px', color: theme.palette.text.secondary }}>
                                              {formatDate(occ.date)}
                                            </span>
                                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#10b981' }}>
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
    </Dialog>
  );
};

const getHeaderCellStyle = (theme: Theme): React.CSSProperties => ({
  padding: '16px 12px',
  textAlign: 'left',
  color: theme.palette.text.secondary,
  fontWeight: 600,
  fontSize: '13px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px'
});

export default RecurringPaymentsModal;
