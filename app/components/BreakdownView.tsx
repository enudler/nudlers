import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '@mui/material/styles';
import {
    Box,
    Typography,
    CircularProgress,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    TextField,
    Autocomplete,
    Snackbar,
    Alert,
    FormControlLabel,
    Switch,
    Button
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DescriptionIcon from '@mui/icons-material/Description';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import SummarizeIcon from '@mui/icons-material/Summarize';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

import PageHeader from './PageHeader';
import ExpensesModal from './CategoryDashboard/components/ExpensesModal';
import { ModalData } from './CategoryDashboard/types';
import { useCategories } from './CategoryDashboard/utils/useCategories';
import { useDateSelection, DateRangeMode } from '../context/DateSelectionContext';
import { logger } from '../utils/client-logger';
import { getTableHeaderCellStyle, getTableBodyCellStyle, TABLE_ROW_HOVER_STYLE, getTableRowHoverBackground } from './CategoryDashboard/utils/tableStyles';

// Maximum date range in years
const MAX_YEARS_RANGE = 5;

interface MonthlySummaryData {
    month: string;
    vendor?: string;
    vendor_nickname?: string | null;
    description?: string;
    category?: string;
    last4digits?: string;
    transaction_count?: number;
    card_expenses: number;
    amount?: number;
    balance?: number | null;
    balance_updated_at?: string | null;
}

type SortField = 'name' | 'transaction_count' | 'card_expenses' | 'category';
type SortDirection = 'asc' | 'desc';

const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('he-IL').format(Math.round(num));
};

const BreakdownView: React.FC = () => {
    const theme = useTheme();
    const [data, setData] = useState<MonthlySummaryData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    const [dateRangeError, setDateRangeError] = useState<string>('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalData, setModalData] = useState<ModalData | undefined>();
    const [loadingDescription, setLoadingDescription] = useState<string | null>(null);

    const [sortField, setSortField] = useState<SortField>('card_expenses');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const [editingDescription, setEditingDescription] = useState<string | null>(null);
    const [editCategory, setEditCategory] = useState<string>('');
    const { categories: availableCategories } = useCategories();

    const [showBankTransactions, setShowBankTransactions] = useState<boolean>(false);
    const pageRef = React.useRef(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [total, setTotal] = useState(0);
    const PAGE_SIZE = 50;
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
        open: false,
        message: '',
        severity: 'success'
    });

    const validateDateRange = (start: string, end: string): boolean => {
        if (!start || !end) return false;
        const startDateObj = new Date(start);
        const endDateObj = new Date(end);
        if (startDateObj > endDateObj) {
            setDateRangeError('Start date must be before end date');
            return false;
        }
        const diffTime = Math.abs(endDateObj.getTime() - startDateObj.getTime());
        const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365);
        if (diffYears > MAX_YEARS_RANGE) {
            setDateRangeError(`Date range cannot exceed ${MAX_YEARS_RANGE} years`);
            return false;
        }
        setDateRangeError('');
        return true;
    };

    const fetchBreakdown = useCallback(async (skipLoadingState = false, isLoadMore = false) => {
        if (dateRangeMode === 'custom') {
            if (!customStartDate || !customEndDate) return;
        } else {
            if (!selectedYear || !selectedMonth) return;
        }

        if (!isLoadMore) {
            setLoading(true);
            pageRef.current = 0;
            setData([]);
        } else {
            setLoadingMore(true);
        }

        try {
            const currentPage = isLoadMore ? pageRef.current + 1 : 0;
            const queryParams = new URLSearchParams();
            if (billingCycle) {
                queryParams.set('billingCycle', billingCycle);
            } else {
                queryParams.set('startDate', startDate);
                queryParams.set('endDate', endDate);
            }
            queryParams.set('groupBy', 'description');
            queryParams.set('limit', PAGE_SIZE.toString());
            queryParams.set('offset', (currentPage * PAGE_SIZE).toString());
            queryParams.set('sortBy', sortField);
            queryParams.set('sortOrder', sortDirection);
            if (!showBankTransactions) {
                queryParams.set('excludeBankTransactions', 'true');
            }

            const url = `/api/reports/monthly-summary?${queryParams.toString()}`;

            const response = await fetch(url);
            const result = await response.json();
            const items = result.items || [];
            const newTotal = result.total || 0;

            if (isLoadMore) {
                setData(prev => [...prev, ...items]);
                pageRef.current = currentPage;
            } else {
                setData(items);
            }
            setTotal(newTotal);
            setHasMore(items.length === PAGE_SIZE);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [startDate, endDate, billingCycle, dateRangeMode, customStartDate, customEndDate, showBankTransactions, selectedYear, selectedMonth, sortField, sortDirection]);

    useEffect(() => {
        // Debounce or just check required fields
        if (dateRangeMode === 'custom') {
            if (customStartDate && customEndDate) {
                fetchBreakdown(false, false);
            }
        } else if (startDate && endDate) {
            fetchBreakdown(false, false);
        }
    }, [startDate, endDate, billingCycle, dateRangeMode, customStartDate, customEndDate, selectedYear, selectedMonth, sortField, sortDirection, showBankTransactions]); // Added showBankTransactions here to trigger refetch

    const handleYearChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedYear(event.target.value);
    };

    const handleMonthChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newMonth = event.target.value;
        setSelectedMonth(newMonth);
        localStorage.setItem('monthlySummary_month', newMonth);
    };

    const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
        if (type === 'start') {
            setCustomStartDate(value);
            if (customEndDate) validateDateRange(value, customEndDate);
        } else {
            setCustomEndDate(value);
            if (customStartDate) validateDateRange(customStartDate, value);
        }
    };

    const handleRefresh = () => {
        if (dateRangeMode === 'custom') {
            if (customStartDate && customEndDate && validateDateRange(customStartDate, customEndDate)) {
                fetchBreakdown(false, false);
            }
        } else {
            fetchBreakdown(false, false);
        }
    };

    const handleLoadMore = () => {
        if (!loading && !loadingMore && hasMore) {
            fetchBreakdown(true, true);
        }
    };

    const handleDateRangeModeChange = (mode: DateRangeMode) => {
        setDateRangeMode(mode);
    };

    const handleCategoryEditClick = (description: string, currentCategory: string) => {
        setEditingDescription(description);
        setEditCategory(currentCategory || '');
    };

    const handleCategorySave = async (description: string) => {
        if (!editCategory.trim()) {
            setSnackbar({ open: true, message: 'Category cannot be empty', severity: 'error' });
            return;
        }

        try {
            const response = await fetch('/api/categories/update-by-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: description,
                    newCategory: editCategory.trim(),
                    createRule: true
                }),
            });

            if (response.ok) {
                const result = await response.json();
                setData(prevData =>
                    prevData.map(row =>
                        row.description === description
                            ? { ...row, category: editCategory.trim() }
                            : row
                    )
                );
                const message = result.transactionsUpdated > 1
                    ? `Updated ${result.transactionsUpdated} transactions.`
                    : `Category updated.`;
                setSnackbar({ open: true, message, severity: 'success' });
            } else {
                setSnackbar({ open: true, message: 'Failed to update category', severity: 'error' });
            }
        } catch (error) {
            logger.error('Error updating category', error);
            setSnackbar({ open: true, message: 'Error updating category', severity: 'error' });
        }
        setEditingDescription(null);
    };

    const handleCategoryCancel = () => {
        setEditingDescription(null);
        setEditCategory('');
    };

    const handleDescriptionClick = async (description: string) => {
        if (dateRangeMode === 'custom') {
            if (!customStartDate || !customEndDate) return;
        } else {
            if (!selectedYear || !selectedMonth) return;
        }

        try {
            setLoadingDescription(description);
            let url: string;
            if (dateRangeMode === 'custom') {
                url = `/api/transactions?startDate=${customStartDate}&endDate=${customEndDate}&description=${encodeURIComponent(description)}`;
            } else if (dateRangeMode === 'billing') {
                const billingCycle = `${selectedYear}-${selectedMonth}`;
                url = `/api/transactions?billingCycle=${billingCycle}&description=${encodeURIComponent(description)}`;
            } else {
                url = `/api/transactions?startDate=${startDate}&endDate=${endDate}&description=${encodeURIComponent(description)}`;
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch transactions');
            const transactions = await response.json();

            setModalData({
                type: description,
                data: transactions
            });
            setIsModalOpen(true);
        } catch (err) {
            logger.error('Error fetching transactions by description', err);
        } finally {
            setLoadingDescription(null);
        }
    };

    const handleSortChange = (field: SortField) => {
        if (field === sortField) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            // Default sort directions:
            // 'name', 'category': ASC (A-Z)
            // 'transaction_count': DESC (High to Low)
            // 'card_expenses': ASC (Most negative/Highest Expense to Positive/Income)
            if (field === 'transaction_count') {
                setSortDirection('desc');
            } else if (field === 'card_expenses') {
                setSortDirection('asc');
            } else {
                setSortDirection('asc');
            }
        }
    };

    const tableHeaderCellStyle = useMemo(() => getTableHeaderCellStyle(theme), [theme]);
    const tableBodyCellStyle = useMemo(() => getTableBodyCellStyle(theme), [theme]);

    const totals = useMemo(() => ({
        count: data.reduce((sum, row) => sum + Number(row.transaction_count || 0), 0),
        amount: data.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    }), [data]);

    return (
        <Box sx={{
            minHeight: '100vh',
            maxWidth: '1440px',
            margin: '0 auto',
            padding: { xs: '12px 8px', sm: '16px 12px', md: '24px 16px' },
        }}>
            <PageHeader
                title="Breakdown"
                description="Detailed breakdown of your expenses by description"
                icon={<SummarizeIcon sx={{ fontSize: '32px', color: '#ffffff' }} />}
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
                startDate={startDate}
                endDate={endDate}
            />

            <Box sx={{
                marginTop: '24px',
                background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(8px)',
                borderRadius: { xs: '20px', md: '32px' },
                padding: { xs: '16px', md: '32px' },
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
            }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h6" fontWeight={700}>Breakdown by Description</Typography>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={showBankTransactions}
                                onChange={(e) => setShowBankTransactions(e.target.checked)}
                                size="small"
                            />
                        }
                        label="Show Bank Transactions"
                    />
                </Box>

                {loading && data.length === 0 ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : data.length === 0 ? (
                    <Typography align="center" color="textSecondary" sx={{ py: 4 }}>
                        No transactions found.
                    </Typography>
                ) : (
                    <>
                        <Paper
                            onScroll={(e) => {
                                const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
                                if (scrollHeight - scrollTop <= clientHeight + 100) {
                                    handleLoadMore();
                                }
                            }}
                            sx={{
                                width: '100%',
                                overflow: 'auto',
                                maxHeight: '72vh',
                                borderRadius: '24px',
                                background: 'transparent',
                                boxShadow: 'none',
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
                            }}>
                            <Table stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell
                                            onClick={() => handleSortChange('name')}
                                            style={{
                                                ...tableHeaderCellStyle,
                                                cursor: 'pointer',
                                                position: 'sticky',
                                                top: 0,
                                                zIndex: 10,
                                                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 1)' : '#f8fafc'
                                            }}
                                        >
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                Description
                                                {sortField === 'name' && (
                                                    sortDirection === 'asc' ? <ArrowUpwardIcon sx={{ fontSize: 16 }} /> : <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                                                )}
                                            </Box>
                                        </TableCell>
                                        <TableCell
                                            onClick={() => handleSortChange('category')}
                                            style={{
                                                ...tableHeaderCellStyle,
                                                cursor: 'pointer',
                                                position: 'sticky',
                                                top: 0,
                                                zIndex: 10,
                                                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 1)' : '#f8fafc'
                                            }}
                                        >
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                Category
                                                {sortField === 'category' && (
                                                    sortDirection === 'asc' ? <ArrowUpwardIcon sx={{ fontSize: 16 }} /> : <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                                                )}
                                            </Box>
                                        </TableCell>
                                        <TableCell
                                            align="center"
                                            onClick={() => handleSortChange('transaction_count')}
                                            style={{
                                                ...tableHeaderCellStyle,
                                                cursor: 'pointer',
                                                position: 'sticky',
                                                top: 0,
                                                zIndex: 10,
                                                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 1)' : '#f8fafc'
                                            }}
                                        >
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                                                Count
                                                {sortField === 'transaction_count' && (
                                                    sortDirection === 'asc' ? <ArrowUpwardIcon sx={{ fontSize: 16 }} /> : <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                                                )}
                                            </Box>
                                        </TableCell>
                                        <TableCell
                                            align="right"
                                            onClick={() => handleSortChange('card_expenses')}
                                            style={{
                                                ...tableHeaderCellStyle,
                                                cursor: 'pointer',
                                                position: 'sticky',
                                                top: 0,
                                                zIndex: 10,
                                                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 1)' : '#f8fafc'
                                            }}
                                        >
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                                                Amount
                                                {sortField === 'card_expenses' && (
                                                    sortDirection === 'asc' ? <ArrowUpwardIcon sx={{ fontSize: 16 }} /> : <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                                                )}
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {data.map((row) => (
                                        <TableRow
                                            key={row.description}
                                            style={TABLE_ROW_HOVER_STYLE}
                                            onClick={() => handleDescriptionClick(row.description as string)}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = getTableRowHoverBackground(theme);
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'transparent';
                                            }}
                                        >
                                            <TableCell style={tableBodyCellStyle}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    {loadingDescription === row.description ? (
                                                        <CircularProgress size={16} />
                                                    ) : (
                                                        <DescriptionIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                                                    )}
                                                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                        {row.description}
                                                    </Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell style={tableBodyCellStyle}>
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    {editingDescription === row.description ? (
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                            <Autocomplete
                                                                value={editCategory}
                                                                onChange={(event, newValue) => setEditCategory(newValue || '')}
                                                                onInputChange={(event, newInputValue) => setEditCategory(newInputValue)}
                                                                freeSolo
                                                                options={availableCategories}
                                                                size="small"
                                                                sx={{ minWidth: 150 }}
                                                                renderInput={(params) => <TextField {...params} autoFocus placeholder="Category" />}
                                                            />
                                                            <IconButton size="small" onClick={() => handleCategorySave(row.description!)} sx={{ color: '#4ADE80' }}><CheckIcon /></IconButton>
                                                            <IconButton size="small" onClick={handleCategoryCancel} sx={{ color: '#ef4444' }}><CloseIcon /></IconButton>
                                                        </Box>
                                                    ) : (
                                                        <span
                                                            style={{
                                                                background: 'rgba(59, 130, 246, 0.1)',
                                                                padding: '4px 10px',
                                                                borderRadius: '6px',
                                                                fontSize: '13px',
                                                                cursor: 'pointer',
                                                                color: '#3b82f6',
                                                                fontWeight: 500
                                                            }}
                                                            onClick={() => handleCategoryEditClick(row.description!, row.category || '')}
                                                        >
                                                            {row.category || 'Uncategorized'}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell align="center" style={tableBodyCellStyle}>
                                                <Typography variant="body2" color="textSecondary">{row.transaction_count}</Typography>
                                            </TableCell>
                                            <TableCell align="right" style={{ ...tableBodyCellStyle, fontWeight: 700 }}>
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        fontWeight: 700,
                                                        color: row.amount && row.amount >= 0 ? '#10B981' : '#F43F5E'
                                                    }}
                                                >
                                                    {row.amount !== undefined
                                                        ? `${row.amount >= 0 ? '+' : ''}₪${formatNumber(Math.abs(row.amount))}`
                                                        : `₪${formatNumber(row.card_expenses)}`
                                                    }
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ))}

                                    {/* Totals Row */}
                                    <TableRow sx={{
                                        borderTop: `2px solid ${theme.palette.divider}`,
                                        bgcolor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 1)' : '#f1f5f9',
                                        position: 'sticky',
                                        bottom: 0,
                                        zIndex: 10,
                                        boxShadow: '0 -2px 10px rgba(0,0,0,0.05)'
                                    }}>
                                        <TableCell style={tableBodyCellStyle}><Typography fontWeight={700}>TOTAL</Typography></TableCell>
                                        <TableCell style={tableBodyCellStyle} />
                                        <TableCell align="center" style={tableBodyCellStyle}>
                                            <Typography fontWeight={700} color="textSecondary">
                                                {totals.count}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right" style={tableBodyCellStyle}>
                                            <Typography fontWeight={700} color="primary">
                                                {`${totals.amount >= 0 ? '+' : ''}₪${formatNumber(Math.abs(totals.amount))}`}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>

                                </TableBody>
                            </Table>
                            {(loadingMore || (loading && data.length > 0)) && (
                                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                                    <CircularProgress size={32} thickness={4} />
                                </Box>
                            )}
                            {!hasMore && data.length > 0 && (
                                <Box sx={{ p: 4, textAlign: 'center' }}>
                                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                                        That's all for this period ✨
                                    </Typography>
                                </Box>
                            )}
                        </Paper>
                    </>
                )}
            </Box>

            {modalData && (
                <ExpensesModal
                    open={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    data={modalData}
                    color="#3b82f6"
                    setModalData={setModalData}
                    currentMonth={dateRangeMode === "custom" ? `${customStartDate}` : `${selectedYear}-${selectedMonth}`}
                />
            )}

            <Snackbar
                open={snackbar.open}
                autoHideDuration={5000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: "100%", borderRadius: "12px" }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default BreakdownView;
