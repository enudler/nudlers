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
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import BlockIcon from '@mui/icons-material/Block';
import IconButton from '@mui/material/IconButton';

import { useCardVendors } from './CategoryDashboard/utils/useCardVendors';
import { fetchCategories } from './CategoryDashboard/utils/categoryUtils';
import CategoryAutocomplete from './CategoryAutocomplete';
import AccountDisplay from './AccountDisplay';
import Table, { Column } from './Table';
import PageHeader from './PageHeader';

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

    const [installmentSortBy, setInstallmentSortBy] = useState<'status' | 'amount' | 'next_payment_date' | 'name'>('status');
    const [installmentSortOrder, setInstallmentSortOrder] = useState<'asc' | 'desc'>('desc');
    const [recurringSortBy, setRecurringSortBy] = useState<'amount' | 'month_count' | 'name' | 'last_charge_date'>('amount');
    const [recurringSortOrder, setRecurringSortOrder] = useState<'asc' | 'desc'>('desc');

    const PAGE_SIZE = 25;
    const installmentPageRef = React.useRef(0);
    const recurringPageRef = React.useRef(0);
    const [hasMoreInstallments, setHasMoreInstallments] = useState(true);
    const [hasMoreRecurring, setHasMoreRecurring] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [totalInstallments, setTotalInstallments] = useState(0);
    const [totalRecurring, setTotalRecurring] = useState(0);

    const [activeInstallmentsCount, setActiveInstallmentsCount] = useState(0);
    const [activeInstallmentsAmount, setActiveInstallmentsAmount] = useState(0);

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
    }, []);

    const fetchData = async (isLoadMore = false) => {
        try {
            if (!isLoadMore) {
                setLoading(true);
                if (activeTab === 0) {
                    installmentPageRef.current = 0;
                    setInstallments([]);
                } else {
                    recurringPageRef.current = 0;
                    setRecurring([]);
                }
            } else {
                setLoadingMore(true);
            }

            setError(null);

            const type = activeTab === 0 ? 'installments' : 'recurring';
            const sortBy = activeTab === 0 ? installmentSortBy : recurringSortBy;
            const sortOrder = activeTab === 0 ? installmentSortOrder : recurringSortOrder;
            const currentPage = isLoadMore
                ? (activeTab === 0 ? installmentPageRef.current + 1 : recurringPageRef.current + 1)
                : 0;
            const offset = currentPage * PAGE_SIZE;

            const params = new URLSearchParams({
                type,
                sortBy,
                sortOrder,
                limit: String(PAGE_SIZE),
                offset: String(offset),
                ...(type === 'recurring' && { frequency: 'monthly' })
            });

            const response = await fetch(`/api/reports/recurring-payments?${params}`);
            if (!response.ok) throw new Error('Failed to fetch recurring payments');
            const data = await response.json();

            if (activeTab === 0) {
                const newItems = data.installments || [];
                if (isLoadMore) {
                    setInstallments(prev => [...prev, ...newItems]);
                    installmentPageRef.current = currentPage;
                } else {
                    setInstallments(newItems);
                }
                setTotalInstallments(data.pagination?.totalInstallments || 0);
                setHasMoreInstallments(newItems.length === PAGE_SIZE);
                setActiveInstallmentsCount(data.summary?.activeInstallmentsCount || 0);
                setActiveInstallmentsAmount(data.summary?.activeInstallmentsAmount || 0);
            } else {
                const newItems = data.recurring || [];
                if (isLoadMore) {
                    setRecurring(prev => [...prev, ...newItems]);
                    recurringPageRef.current = currentPage;
                } else {
                    setRecurring(newItems);
                }
                setTotalRecurring(data.pagination?.totalRecurring || 0);
                setHasMoreRecurring(newItems.length === PAGE_SIZE);
            }
        } catch (err) {
            logger.error('Error fetching recurring payments', err as Error);
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        fetchData(false);
    }, [activeTab, installmentSortBy, installmentSortOrder, recurringSortBy, recurringSortOrder]);

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setActiveTab(newValue);
    };

    const toggleRow = (id: string) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedRows(newExpanded);
    };

    const handleRecurringSort = (field: string) => {
        const sortField = field === 'price' ? 'amount' : field as any;
        if (recurringSortBy === sortField) {
            setRecurringSortOrder(recurringSortOrder === 'desc' ? 'asc' : 'desc');
        } else {
            setRecurringSortBy(sortField);
            setRecurringSortOrder('desc');
        }
    };

    const handleInstallmentSort = (field: string) => {
        const sortField = field === 'price' ? 'amount' : field as any;
        if (installmentSortBy === sortField) {
            setInstallmentSortOrder(installmentSortOrder === 'desc' ? 'asc' : 'desc');
        } else {
            setInstallmentSortBy(sortField);
            setInstallmentSortOrder('desc');
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
                ? `Updated ${result.transactionsUpdated} transactions with "${editingItem.item.name}" to "${editCategory}".`
                : `Category updated to "${editCategory}".`;
            setSnackbar({ open: true, message, severity: 'success' });
            window.dispatchEvent(new CustomEvent('dataRefresh'));
        } catch (err) {
            logger.error('Error updating category', err as Error);
            setSnackbar({ open: true, message: 'Failed to update category', severity: 'error' });
        } finally {
            setEditingItem(null);
            setEditCategory('');
        }
    };

    const handleCancelCategory = () => {
        setEditingItem(null);
        setEditCategory('');
    };

    const handleMarkNotRecurring = async (item: RecurringTransaction) => {
        try {
            const response = await fetch('/api/reports/non-recurring-exclusions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: item.name,
                    account_number: item.account_number
                }),
            });
            if (!response.ok) throw new Error('Failed to mark as non-recurring');
            setSnackbar({ open: true, message: `"${item.name}" marked as non-recurring`, severity: 'success' });
            fetchData(false);
            window.dispatchEvent(new CustomEvent('dataRefresh'));
        } catch (err) {
            logger.error('Error marking as non-recurring', err as Error);
            setSnackbar({ open: true, message: 'Failed to mark as non-recurring', severity: 'error' });
        }
    };

    return (
        <Box sx={{
            padding: { xs: '12px 8px', sm: '16px 12px', md: '24px 16px' },
            maxWidth: '1440px',
            margin: '0 auto',
            position: 'relative',
            zIndex: 1
        }}>
            <PageHeader
                title="Recurring Payments"
                description="Monitor your active installments and recurring subscriptions"
                icon={<RepeatIcon sx={{ fontSize: '32px', color: '#ffffff' }} />}
            />

            <Box sx={{
                borderRadius: '32px',
                border: `1px solid ${theme.palette.divider}`,
                overflow: 'hidden',
                background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)'
            }}>
                <Box sx={{ borderBottom: 1, borderColor: theme.palette.divider, px: 3, pt: 2 }}>
                    <Tabs
                        value={activeTab}
                        onChange={handleTabChange}
                        sx={{
                            '& .MuiTab-root': {
                                textTransform: 'none',
                                fontWeight: 700,
                                fontSize: '15px',
                                color: theme.palette.text.secondary,
                                minHeight: '48px',
                                '&.Mui-selected': { color: theme.palette.primary.main }
                            },
                            '& .MuiTabs-indicator': { backgroundColor: theme.palette.primary.main, height: '3px', borderRadius: '3px 3px 0 0' }
                        }}
                    >
                        <Tab label={`Installments (${totalInstallments || '...'})`} icon={<CreditScoreIcon sx={{ fontSize: '18px' }} />} iconPosition="start" />
                        <Tab label={`Recurring (${totalRecurring || '...'})`} icon={<RepeatIcon sx={{ fontSize: '18px' }} />} iconPosition="start" />
                    </Tabs>
                </Box>

                <Box sx={{ p: { xs: 1, md: 3 } }}>
                    {error ? (
                        <Box sx={{ p: 4, textAlign: 'center', color: 'error.main' }}>Error: {error}</Box>
                    ) : (
                        <>
                            {activeTab === 0 && (
                                <Box sx={{
                                    display: 'flex',
                                    gap: 3,
                                    mb: 3,
                                    p: 2,
                                    borderRadius: 2,
                                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                                    border: `1px solid ${theme.palette.divider}`
                                }}>
                                    <Box sx={{ textAlign: 'center', flex: 1 }}>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.05em' }}>
                                            ACTIVE INSTALLMENTS
                                        </Typography>
                                        <Typography variant="h5" sx={{ fontWeight: 800, color: theme.palette.primary.main }}>
                                            {activeInstallmentsCount}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ width: '1px', bgcolor: 'divider' }} />
                                    <Box sx={{ textAlign: 'center', flex: 1 }}>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.05em' }}>
                                            MONTHLY TOTAL
                                        </Typography>
                                        <Typography variant="h5" sx={{ fontWeight: 800, color: theme.palette.success.main }}>
                                            ₪{formatNumber(activeInstallmentsAmount)}
                                        </Typography>
                                    </Box>
                                </Box>
                            )}

                            <Box
                                onScroll={(e) => {
                                    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
                                    if (scrollHeight - scrollTop <= clientHeight + 100) {
                                        const hasMore = activeTab === 0 ? hasMoreInstallments : hasMoreRecurring;
                                        if (hasMore && !loading && !loadingMore) {
                                            fetchData(true);
                                        }
                                    }
                                }}
                                sx={{
                                    maxHeight: '70vh',
                                    overflow: 'auto',
                                    borderRadius: '24px',
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
                                }}
                            >
                                {loading && !loadingMore ? (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}><CircularProgress /></Box>
                                ) : activeTab === 0 ? (
                                    <Table
                                        rows={installments}
                                        rowKey={(row) => `${row.name}-${row.current_installment}-${row.total_installments}`}
                                        emptyMessage="No installment payments found"
                                        onSort={handleInstallmentSort}
                                        sortField={installmentSortBy === 'amount' ? 'price' : installmentSortBy}
                                        sortDirection={installmentSortOrder}
                                        stickyHeader
                                        maxHeight="none"
                                        columns={[
                                            { id: 'name', label: 'Description', sortable: true, format: (val) => <span style={{ fontWeight: 700 }}>{val}</span> },
                                            { id: 'account', label: 'Account', format: (_, row) => renderAccountInfo(row) },
                                            {
                                                id: 'category',
                                                label: 'Category',
                                                format: (_, row: Installment,) => {
                                                    const index = installments.indexOf(row);
                                                    if (editingItem?.type === 'installment' && editingItem.index === index) {
                                                        return (
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <CategoryAutocomplete value={editCategory} onChange={setEditCategory} options={categories} autoFocus placeholder="Category" />
                                                                <CheckIcon fontSize="small" sx={{ cursor: 'pointer', color: 'success.main' }} onClick={handleSaveCategory} />
                                                                <CloseIcon fontSize="small" sx={{ cursor: 'pointer', color: 'error.main' }} onClick={handleCancelCategory} />
                                                            </Box>
                                                        );
                                                    }
                                                    return (
                                                        <Box
                                                            onClick={(e) => handleCategoryClick(e, row, index, 'installment')}
                                                            sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px', bgcolor: theme.palette.primary.main, color: 'white', px: 1, py: 0.5, borderRadius: 1.5, cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                                                        >
                                                            {row.category || 'Uncategorized'} <EditIcon sx={{ fontSize: '12px' }} />
                                                        </Box>
                                                    );
                                                }
                                            },
                                            {
                                                id: 'progress',
                                                label: 'Progress',
                                                align: 'center',
                                                format: (_, row) => {
                                                    const progressPercent = Math.round((row.current_installment / row.total_installments) * 100);
                                                    return (
                                                        <Tooltip title={`${row.current_installment} of ${row.total_installments}`}>
                                                            <Box>
                                                                <Typography variant="caption" sx={{ fontWeight: 700 }}>{row.current_installment}/{row.total_installments}</Typography>
                                                                <Box sx={{ width: '60px', height: '6px', bgcolor: 'action.hover', borderRadius: 3, mx: 'auto', mt: 0.5, overflow: 'hidden' }}>
                                                                    <Box sx={{ width: `${progressPercent}%`, height: '100%', bgcolor: row.status === 'completed' ? 'success.main' : 'primary.main' }} />
                                                                </Box>
                                                            </Box>
                                                        </Tooltip>
                                                    );
                                                }
                                            },
                                            { id: 'price', label: 'Monthly', align: 'right', sortable: true, format: (val) => <span style={{ fontWeight: 800, color: theme.palette.primary.main }}>₪{formatNumber(val)}</span> },
                                            { id: 'next_payment_date', label: 'Next', align: 'center', sortable: true, format: (val) => val ? formatDate(val) : 'Completed' },
                                            { id: 'status', label: 'Status', align: 'center', sortable: true, format: (val) => <Chip label={val} size="small" color={val === 'completed' ? 'success' : 'primary'} sx={{ fontWeight: 600, borderRadius: '8px' }} /> }
                                        ]}
                                    />
                                ) : (
                                    <Table
                                        rows={recurring}
                                        rowKey={(row) => `${row.name}-${row.month_count}`}
                                        emptyMessage="No recurring payments detected"
                                        onSort={handleRecurringSort}
                                        sortField={recurringSortBy === 'amount' ? 'price' : recurringSortBy}
                                        sortDirection={recurringSortOrder}
                                        expandedRowIds={expandedRows}
                                        onRowToggle={(rowKey) => toggleRow(rowKey as string)}
                                        stickyHeader
                                        maxHeight="none"
                                        columns={[
                                            { id: 'name', label: 'Description', format: (val) => <span style={{ fontWeight: 700 }}>{val}</span> },
                                            { id: 'account', label: 'Account', format: (_, row) => renderAccountInfo(row) },
                                            {
                                                id: 'category',
                                                label: 'Category',
                                                format: (_, row) => {
                                                    const index = recurring.indexOf(row);
                                                    if (editingItem?.type === 'recurring' && editingItem.index === index) {
                                                        return (
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <CategoryAutocomplete value={editCategory} onChange={setEditCategory} options={categories} autoFocus placeholder="Category" />
                                                                <CheckIcon fontSize="small" sx={{ cursor: 'pointer', color: 'success.main' }} onClick={handleSaveCategory} />
                                                                <CloseIcon fontSize="small" sx={{ cursor: 'pointer', color: 'error.main' }} onClick={handleCancelCategory} />
                                                            </Box>
                                                        );
                                                    }
                                                    return (
                                                        <Box
                                                            onClick={(e) => handleCategoryClick(e, row, index, 'recurring')}
                                                            sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px', bgcolor: theme.palette.primary.main, color: 'white', px: 1, py: 0.5, borderRadius: 1.5, cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                                                        >
                                                            {row.category || 'Uncategorized'} <EditIcon sx={{ fontSize: '12px' }} />
                                                        </Box>
                                                    );
                                                }
                                            },
                                            { id: 'price', label: 'Amount (Avg)', align: 'right', sortable: true, format: (val) => <span style={{ fontWeight: 800, color: theme.palette.primary.main }}>₪{formatNumber(val)}</span> },
                                            { id: 'last_charge_date', label: 'Last Charge', align: 'center', sortable: true, format: (val) => formatDate(val) },
                                            { id: 'month_count', label: 'Months', align: 'center', sortable: true, format: (val) => <span style={{ fontWeight: 600 }}>{val}</span> },
                                            {
                                                id: 'actions',
                                                label: '',
                                                align: 'center',
                                                format: (_, row) => (
                                                    <Tooltip title="Not a recurring payment">
                                                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleMarkNotRecurring(row); }}>
                                                            <BlockIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )
                                            }
                                        ]}
                                    />
                                )}
                                {(loadingMore || (loading && (installments.length > 0 || recurring.length > 0))) && (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                                        <CircularProgress size={32} thickness={4} />
                                    </Box>
                                )}
                                {!(activeTab === 0 ? hasMoreInstallments : hasMoreRecurring) && (installments.length > 0 || recurring.length > 0) && (
                                    <Box sx={{ p: 4, textAlign: 'center' }}>
                                        <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                                            That's all for now ✨
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        </>
                    )}
                </Box>
            </Box>

            <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert severity={snackbar.severity} sx={{ borderRadius: '12px', fontWeight: 600 }}>{snackbar.message}</Alert>
            </Snackbar>
        </Box>
    );
};

export default RecurringPaymentsView;
