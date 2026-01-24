import React, { useState, useEffect } from 'react';
import { logger } from '../utils/client-logger';
import CircularProgress from '@mui/material/CircularProgress';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { useTheme } from '@mui/material/styles';

import RepeatIcon from '@mui/icons-material/Repeat';
import CreditScoreIcon from '@mui/icons-material/CreditScore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';

import { useCardVendors } from './CategoryDashboard/utils/useCardVendors';
import { getTableHeaderCellStyle, getTableBodyCellStyle, TABLE_ROW_HOVER_STYLE, getTableRowHoverBackground } from './CategoryDashboard/utils/tableStyles';
import { fetchCategories } from './CategoryDashboard/utils/categoryUtils';
import CategoryAutocomplete from './CategoryAutocomplete';
import AccountDisplay from './AccountDisplay';

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

const RecurringPaymentsView: React.FC = () => {
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
        fetchData();
    }, []);

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

    const activeInstallments = installments.filter(i => i.status === 'active');
    const completedInstallments = installments.filter(i => i.status === 'completed');
    const totalMonthlyInstallments = activeInstallments.reduce((sum, i) => sum + Math.abs(i.price), 0);

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
        return <AccountDisplay transaction={item} premium={true} />;
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

            const message = result.transactionsUpdated > 1
                ? `Updated ${result.transactionsUpdated} transactions with "${editingItem.item.name}" to "${editCategory}". Rule saved.`
                : `Category updated to "${editCategory}". Rule saved.`;

            setSnackbar({
                open: true,
                message,
                severity: 'success'
            });

            fetchData();
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
        <Box sx={{
            padding: { xs: '16px', md: '32px' },
            maxWidth: '1440px',
            margin: '0 auto',
            marginTop: { xs: '56px', md: '40px' },
        }}>
            {/* Header Section */}
            <Box sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                justifyContent: 'space-between',
                alignItems: { xs: 'stretch', md: 'center' },
                gap: '24px',
                padding: '32px',
                borderRadius: '32px',
                marginBottom: '24px',
                border: '1px solid var(--n-glass-border)',
                position: 'relative',
                overflow: 'hidden'
            }} className="n-glass">
                {/* Decorative background element */}
                <Box sx={{
                    position: 'absolute',
                    top: -50, right: -50,
                    width: 200, height: 200,
                    background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
                    zIndex: 0
                }} />

                <Box sx={{ display: 'flex', alignItems: 'center', gap: '20px', position: 'relative', zIndex: 1 }}>
                    <Box sx={{
                        background: 'linear-gradient(135deg, var(--n-primary) 0%, #a78bfa 100%)',
                        width: 56, height: 56,
                        borderRadius: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 8px 16px rgba(99, 102, 241, 0.2)'
                    }}>
                        <RepeatIcon sx={{ fontSize: '32px', color: '#ffffff' }} />
                    </Box>
                    <Box>
                        <Typography variant="h4" className="gradient-text" sx={{ fontWeight: 800, fontSize: { xs: '24px', md: '32px' } }}>Recurring Payments</Typography>
                        <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>Monitor your active installments and recurring subscriptions</Typography>
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', gap: '24px', alignItems: 'center', mt: { xs: 2, md: 0 } }}>
                    <Box sx={{ textAlign: 'center', px: 2 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.05em' }}>INSTALLMENTS</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 800, color: theme.palette.primary.main }}>₪{formatNumber(totalMonthlyInstallments)}</Typography>
                    </Box>
                    <Box sx={{ width: '1px', height: '40px', bgcolor: 'var(--n-border)' }} />
                    <Box sx={{ textAlign: 'center', px: 2 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.05em' }}>ACTIVE</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 800, color: theme.palette.success.main }}>{activeInstallments.length + recurring.length}</Typography>
                    </Box>
                </Box>
            </Box>

            {/* Main Content Card */}
            <Box sx={{
                padding: '0',
                borderRadius: '32px',
                border: '1px solid var(--n-border)',
                overflow: 'hidden',
                boxShadow: 'var(--n-shadow-xl)'
            }} className="n-glass">
                <Box sx={{ borderBottom: 1, borderColor: theme.palette.divider, px: 3, pt: 2 }}>
                    <Tabs
                        value={activeTab}
                        onChange={handleTabChange}
                        sx={{
                            '& .MuiTab-root': {
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '15px',
                                color: theme.palette.text.secondary,
                                '&.Mui-selected': { color: '#8b5cf6' }
                            },
                            '& .MuiTabs-indicator': { backgroundColor: '#8b5cf6', height: '3px', borderRadius: '3px 3px 0 0' }
                        }}
                    >
                        <Tab label={`Installments (${installments.length})`} icon={<CreditScoreIcon sx={{ fontSize: '18px' }} />} iconPosition="start" />
                        <Tab label={`Recurring (${recurring.length})`} icon={<RepeatIcon sx={{ fontSize: '18px' }} />} iconPosition="start" />
                    </Tabs>
                </Box>

                <Box sx={{ p: 3 }}>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}><CircularProgress /></Box>
                    ) : error ? (
                        <Box sx={{ p: 4, textAlign: 'center', color: 'error.main' }}>Error: {error}</Box>
                    ) : (
                        <>
                            {activeTab === 0 ? (
                                installments.length === 0 ? (
                                    <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">No installment payments found</Typography></Box>
                                ) : (
                                    <Box sx={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
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
                                                        <tr key={index} style={{ ...TABLE_ROW_HOVER_STYLE }}>
                                                            <td style={{ ...getTableBodyCellStyle(theme), fontWeight: 700 }}>{item.name}</td>
                                                            <td style={getTableBodyCellStyle(theme)}>{renderAccountInfo(item)}</td>
                                                            <td style={getTableBodyCellStyle(theme)}>
                                                                {editingItem?.type === 'installment' && editingItem.index === index ? (
                                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        <CategoryAutocomplete value={editCategory} onChange={setEditCategory} options={categories} autoFocus placeholder="Category" />
                                                                        <CheckIcon fontSize="small" sx={{ cursor: 'pointer', color: 'success.main' }} onClick={handleSaveCategory} />
                                                                        <CloseIcon fontSize="small" sx={{ cursor: 'pointer', color: 'error.main' }} onClick={handleCancelCategory} />
                                                                    </Box>
                                                                ) : (
                                                                    <Box
                                                                        onClick={(e) => handleCategoryClick(e, item, index, 'installment')}
                                                                        sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px', bgcolor: 'primary.main', color: 'white', px: 1, py: 0.5, borderRadius: 1, cursor: 'pointer', fontSize: '12px' }}
                                                                    >
                                                                        {item.category || 'Uncategorized'} <EditIcon sx={{ fontSize: '12px' }} />
                                                                    </Box>
                                                                )}
                                                            </td>
                                                            <td style={{ ...getTableBodyCellStyle(theme), textAlign: 'center' }}>
                                                                <Tooltip title={`${item.current_installment} of ${item.total_installments}`}>
                                                                    <Box>
                                                                        <Typography variant="caption" sx={{ fontWeight: 700 }}>{item.current_installment}/{item.total_installments}</Typography>
                                                                        <Box sx={{ width: '60px', height: '6px', bgcolor: 'action.hover', borderRadius: 3, mx: 'auto', mt: 0.5, overflow: 'hidden' }}>
                                                                            <Box sx={{ width: `${progressPercent}%`, height: '100%', bgcolor: item.status === 'completed' ? 'success.main' : 'primary.main' }} />
                                                                        </Box>
                                                                    </Box>
                                                                </Tooltip>
                                                            </td>
                                                            <td style={{ ...getTableBodyCellStyle(theme), textAlign: 'right', fontWeight: 800, color: 'primary.main' }}>₪{formatNumber(item.price)}</td>
                                                            <td style={{ ...getTableBodyCellStyle(theme), textAlign: 'right', color: 'text.secondary' }}>{item.original_amount ? `₪${formatNumber(item.original_amount)}` : '-'}</td>
                                                            <td style={{ ...getTableBodyCellStyle(theme), textAlign: 'center' }}>{item.next_payment_date ? formatDate(item.next_payment_date) : 'Completed'}</td>
                                                            <td style={{ ...getTableBodyCellStyle(theme), textAlign: 'center' }}>{formatDate(item.last_payment_date)}</td>
                                                            <td style={{ ...getTableBodyCellStyle(theme), textAlign: 'center' }}>
                                                                <Chip label={item.status} size="small" color={item.status === 'completed' ? 'success' : 'primary'} />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </Box>
                                )
                            ) : (
                                sortedRecurring.length === 0 ? (
                                    <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">No recurring payments detected</Typography></Box>
                                ) : (
                                    <Box sx={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                            <thead>
                                                <tr>
                                                    <th style={getTableHeaderCellStyle(theme)}>Description</th>
                                                    <th style={getTableHeaderCellStyle(theme)}>Account</th>
                                                    <th style={getTableHeaderCellStyle(theme)}>Category</th>
                                                    <th style={getTableHeaderCellStyle(theme)} onClick={() => handleSort('count')}>Frequency</th>
                                                    <th style={{ ...getTableHeaderCellStyle(theme), textAlign: 'right' }} onClick={() => handleSort('amount')}>Amount (Avg)</th>
                                                    <th style={{ ...getTableHeaderCellStyle(theme), textAlign: 'center' }}>Next</th>
                                                    <th style={{ ...getTableHeaderCellStyle(theme), textAlign: 'center' }}>Last</th>
                                                    <th style={{ ...getTableHeaderCellStyle(theme), textAlign: 'center' }}>Details</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedRecurring.map((item, index) => {
                                                    const rowId = `${item.name}-${index}`;
                                                    const isExpanded = expandedRows.has(rowId);
                                                    return (
                                                        <React.Fragment key={index}>
                                                            <tr style={{ ...TABLE_ROW_HOVER_STYLE }} onClick={() => toggleRow(rowId)}>
                                                                <td style={{ ...getTableBodyCellStyle(theme), fontWeight: 700 }}>{item.name}</td>
                                                                <td style={getTableBodyCellStyle(theme)}>{renderAccountInfo(item)}</td>
                                                                <td style={getTableBodyCellStyle(theme)}>
                                                                    {editingItem?.type === 'recurring' && editingItem.index === index ? (
                                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                            <CategoryAutocomplete value={editCategory} onChange={setEditCategory} options={categories} autoFocus placeholder="Category" />
                                                                            <CheckIcon fontSize="small" sx={{ cursor: 'pointer', color: 'success.main' }} onClick={handleSaveCategory} />
                                                                            <CloseIcon fontSize="small" sx={{ cursor: 'pointer', color: 'error.main' }} onClick={handleCancelCategory} />
                                                                        </Box>
                                                                    ) : (
                                                                        <Box
                                                                            onClick={(e) => handleCategoryClick(e, item, index, 'recurring')}
                                                                            sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px', bgcolor: 'primary.main', color: 'white', px: 1, py: 0.5, borderRadius: 1, cursor: 'pointer', fontSize: '12px' }}
                                                                        >
                                                                            {item.category || 'Uncategorized'} <EditIcon sx={{ fontSize: '12px' }} />
                                                                        </Box>
                                                                    )}
                                                                </td>
                                                                <td style={{ ...getTableBodyCellStyle(theme), textAlign: 'center' }}>
                                                                    <Chip label={item.frequency} size="small" color={item.frequency === 'bi-monthly' ? 'warning' : 'info'} />
                                                                </td>
                                                                <td style={{ ...getTableBodyCellStyle(theme), textAlign: 'right', fontWeight: 800, color: 'primary.main' }}>₪{formatNumber(item.price)}</td>
                                                                <td style={{ ...getTableBodyCellStyle(theme), textAlign: 'center' }}>{formatDate(item.next_payment_date)}</td>
                                                                <td style={{ ...getTableBodyCellStyle(theme), textAlign: 'center' }}>{formatDate(item.last_charge_date)}</td>
                                                                <td style={{ ...getTableBodyCellStyle(theme), textAlign: 'center' }}>{isExpanded ? 'Hide' : `History (${item.month_count})`}</td>
                                                            </tr>
                                                            {isExpanded && (
                                                                <tr>
                                                                    <td colSpan={8} style={{ padding: '16px' }}>
                                                                        <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 2 }}>
                                                                            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Payment History</Typography>
                                                                            {item.occurrences.map((occ, i) => (
                                                                                <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                                                                    <Typography variant="body2">{formatDate(occ.date)}</Typography>
                                                                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>₪{formatNumber(occ.amount)}</Typography>
                                                                                </Box>
                                                                            ))}
                                                                        </Box>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </Box>
                                )
                            )}
                        </>
                    )}
                </Box>
            </Box>

            <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
            </Snackbar>
        </Box>
    );
};

export default RecurringPaymentsView;
