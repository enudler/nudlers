import React, { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '../utils/client-logger';
import { Box, Typography, Button, IconButton, CircularProgress, Dialog, DialogTitle, DialogContent, TextField, Autocomplete, createFilterOptions, useTheme, LinearProgress, Tooltip, Collapse } from '@mui/material';
import SavingsIcon from '@mui/icons-material/Savings';
import AddIcon from '@mui/icons-material/Add';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import EditIcon from '@mui/icons-material/Edit';
import { useDateSelection, DateRangeMode } from '../context/DateSelectionContext';
import { useNotification } from './NotificationContext';

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

const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('he-IL', {
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
};

// Minimal Inline Budget Row
const MinimalBudgetRow: React.FC<{
    budget: BudgetWithSpending;
    onEdit: () => void;
    onViewTransactions: () => void;
    theme: any;
}> = ({ budget, onEdit, onViewTransactions, theme }) => {
    const hasBudget = budget.budget_limit > 0;

    const getProgressColor = (percent: number) => {
        if (!hasBudget) return theme.palette.info.main; // Blue for tracking only
        if (percent >= 100) return theme.palette.error.main;
        if (percent >= 80) return theme.palette.warning.main;
        return theme.palette.success.main;
    };

    const color = getProgressColor(budget.percent_used);
    // Cap visual progress at 100% to keep bar contained.
    // For unbudgeted, show a small static bar or activity indicator
    const visualProgress = hasBudget ? Math.min(budget.percent_used, 100) : (budget.actual_spent > 0 ? 100 : 0);
    // For unbudgeted, visual progress 100% but with very low opacity background makes it look like a full filled card distinctively

    return (
        <Box
            onClick={onViewTransactions}
            sx={{
                position: 'relative',
                width: '100%',
                height: '38px', // ~20% smaller than 48px
                minHeight: '38px',
                flexShrink: 0,
                borderRadius: '10px',
                overflow: 'hidden',
                cursor: 'pointer',
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                transition: 'all 0.2s',
                '&:hover': {
                    borderColor: color,
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                }
            }}
        >
            {/* Progress Bar Background Fill */}
            <Box
                sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: `${visualProgress}%`,
                    bgcolor: color,
                    opacity: hasBudget ? 0.12 : 0.04, // Very subtle for unbudgeted
                    transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                    zIndex: 0
                }}
            />

            {/* Active "Cap" or Line for clearer progress indication */}
            {hasBudget && (
                <Box
                    sx={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        height: '3px', // Slightly thicker
                        width: `${visualProgress}%`,
                        bgcolor: color,
                        zIndex: 1,
                        opacity: 0.8
                    }}
                />
            )}

            {/* Content Overlay */}
            <Box sx={{
                position: 'relative',
                zIndex: 2,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                height: '100%',
                px: 1.5,
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.75rem', color: theme.palette.text.primary }}>
                        {budget.category}
                    </Typography>
                    {hasBudget && budget.is_over_budget && (
                        <Typography variant="caption" sx={{
                            color: 'error.main',
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            bgcolor: 'rgba(239, 68, 68, 0.1)',
                            px: 0.6,
                            py: 0.1,
                            borderRadius: '4px',
                        }}>
                            OVER
                        </Typography>
                    )}
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.secondary', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {hasBudget ? (
                            <>
                                <span style={{ fontWeight: 500, color: hasBudget && budget.is_over_budget ? theme.palette.error.main : theme.palette.text.primary }}>
                                    ₪{formatCurrency(budget.actual_spent)}
                                </span>
                                <span style={{ opacity: 0.6, fontWeight: 500 }}> / </span>
                                <span style={{ fontWeight: 700, opacity: 0.9 }}>₪{formatCurrency(budget.budget_limit)}</span>
                            </>
                        ) : (
                            <>
                                <span style={{ fontWeight: 700, color: theme.palette.text.primary }}>
                                    ₪{formatCurrency(budget.actual_spent)}
                                </span>
                                <span style={{ opacity: 0.6, fontSize: '0.85em', marginLeft: '4px' }}> (spent)</span>
                            </>
                        )}
                    </Typography>

                    {/* Edit Button */}
                    {hasBudget && (
                        <IconButton
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit();
                            }}
                            sx={{
                                padding: '3px',
                                opacity: 0.3,
                                transition: 'all 0.2s',
                                '&:hover': { opacity: 1, color: 'primary.main', bgcolor: 'rgba(59, 130, 246, 0.1)' }
                            }}
                        >
                            <EditIcon sx={{ fontSize: '13px' }} />
                        </IconButton>
                    )}
                </Box>
            </Box>
        </Box>
    );
};

interface BudgetModuleProps {
    onViewTransactions?: (category: string) => void;
}

const BudgetModule: React.FC<BudgetModuleProps> = ({ onViewTransactions }) => {
    const theme = useTheme();
    const {
        selectedYear,
        selectedMonth,
        dateRangeMode,
        startDate,
        endDate
    } = useDateSelection();

    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [budgetsWithSpending, setBudgetsWithSpending] = useState<BudgetWithSpending[]>([]);
    const [loading, setLoading] = useState(true);
    const [allCategories, setAllCategories] = useState<string[]>([]);
    const { showNotification } = useNotification();
    const [isExpanded, setIsExpanded] = useState(true);

    // Modal state
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
    const [newBudgetCategory, setNewBudgetCategory] = useState('');
    const [newBudgetLimit, setNewBudgetLimit] = useState('');
    const [savingBudget, setSavingBudget] = useState(false);

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
            } else if (startDate && endDate) {
                url.searchParams.append('startDate', startDate);
                url.searchParams.append('endDate', endDate);
            } else {
                setLoading(false);
                return;
            }

            const response = await fetch(url.toString());
            if (!response.ok) throw new Error('Failed to fetch spending data');
            const data = await response.json();

            // Create maps for easy lookup
            const spendingMap = new Map<string, number>();
            data.categories.forEach((c: any) => {
                spendingMap.set(c.category, c.actual_spent);
            });

            const budgetMap = new Map<string, Budget>();
            budgetList.forEach(b => {
                budgetMap.set(b.category, b);
            });

            // Union of all categories
            const allCategoryNames = new Set([...spendingMap.keys(), ...budgetMap.keys()]);

            const mergedData: BudgetWithSpending[] = Array.from(allCategoryNames).map(categoryName => {
                const budget = budgetMap.get(categoryName);
                const actualSpent = spendingMap.get(categoryName) || 0;
                const budgetLimit = budget?.budget_limit || 0;

                const percentUsed = budgetLimit > 0 ? (actualSpent / budgetLimit) * 100 : 0;

                return {
                    id: budget?.id || 0, // 0 if no budget set
                    category: categoryName,
                    budget_limit: budgetLimit,
                    actual_spent: actualSpent,
                    remaining: budgetLimit - actualSpent,
                    percent_used: Math.round(percentUsed * 10) / 10,
                    is_over_budget: budgetLimit > 0 && actualSpent > budgetLimit
                };
            });

            // Sort: Over budget > Has Budget (High %) > Has Budget (Low %) > No Budget (High Spend)
            mergedData.sort((a, b) => {
                const aHasBudget = a.budget_limit > 0;
                const bHasBudget = b.budget_limit > 0;

                if (aHasBudget && !bHasBudget) return -1;
                if (!aHasBudget && bHasBudget) return 1;

                if (a.is_over_budget && !b.is_over_budget) return -1;
                if (!a.is_over_budget && b.is_over_budget) return 1;

                // If both have budget or both don't, sort by spend/percent
                if (aHasBudget) return b.percent_used - a.percent_used;

                return b.actual_spent - a.actual_spent;
            });

            setBudgetsWithSpending(mergedData);
        } catch (error) {
            logger.error('Error fetching spending data', error as Error);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate]);

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
            const [budgetList] = await Promise.all([
                fetchBudgets(),
                fetchAllCategories()
            ]);

            if ((selectedYear && selectedMonth) || (startDate && endDate)) {
                if (budgetList) {
                    fetchSpendingData(selectedYear, selectedMonth, dateRangeMode, budgetList);
                }
            }
        };
        init();
    }, [selectedYear, selectedMonth, startDate, endDate, dateRangeMode, fetchBudgets, fetchAllCategories, fetchSpendingData]);

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

            const budgetList = await fetchBudgets();
            if ((selectedYear && selectedMonth) || (startDate && endDate)) {
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
            if ((selectedYear && selectedMonth) || (startDate && endDate)) {
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





    if (loading && budgets.length === 0) return null;

    return (
        <Box sx={{
            mb: 2,
            background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(8px)',
            borderRadius: '20px',
            border: `1px solid ${theme.palette.divider}`,
            overflow: 'hidden',
        }}>
            <Box
                onClick={() => setIsExpanded(!isExpanded)}
                sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    p: 1.5,
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                    '&:hover': { bgcolor: theme.palette.action.hover }
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SavingsIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>Category Budgets</Typography>
                    <Box sx={{
                        bgcolor: 'rgba(59, 130, 246, 0.1)',
                        color: 'primary.main',
                        px: 0.8,
                        py: 0.1,
                        borderRadius: '4px',
                        fontSize: '0.65rem',
                        fontWeight: 700
                    }}>
                        {budgetsWithSpending.length}
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>

                    <Box sx={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s', display: 'flex', color: 'text.secondary' }}>
                        <KeyboardArrowDownIcon />
                    </Box>
                </Box>
            </Box>

            <Collapse in={isExpanded}>
                {/* Scrollable Container with explicit max-height */}
                <Box
                    sx={{
                        px: 2,
                        pb: 2,
                    }}
                >
                    <Box sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        maxHeight: '480px', // ~10 items * 38px + gaps
                        overflowY: 'auto',
                        pr: 0.5
                    }}>
                        {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2, width: '100%' }}>
                                <CircularProgress size={20} />
                            </Box>
                        ) : budgetsWithSpending.length === 0 ? (
                            <Box sx={{ textAlign: 'center', py: 3, px: 4, width: '100%', color: 'text.secondary', bgcolor: theme.palette.action.hover, borderRadius: '12px', border: '1px dashed ' + theme.palette.divider }}>
                                <Typography variant="body2" fontSize="0.85rem">No budgets set. Manage budgets in the Budgets Dashboard.</Typography>
                            </Box>
                        ) : (
                            budgetsWithSpending.map((budget) => (
                                <MinimalBudgetRow
                                    key={budget.category} // Use category since ID might be 0
                                    budget={budget}
                                    onEdit={() => {
                                        if (budget.budget_limit > 0) {
                                            handleEditBudget(budget);
                                        } else {
                                            setNewBudgetCategory(budget.category);
                                            setNewBudgetLimit('');
                                            setEditingBudget(null);
                                            setIsAddModalOpen(true);
                                        }
                                    }}
                                    onViewTransactions={() => onViewTransactions?.(budget.category)}
                                    theme={theme}
                                />
                            ))
                        )}
                    </Box>
                </Box>
            </Collapse>

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
                                    const { key, ...otherProps } = props;
                                    return (
                                        <li key={key} {...otherProps}>
                                            {option}
                                            {isNewOption && ` (Add "${option}")`}
                                        </li>
                                    );
                                }}
                                renderInput={(params) => <TextField {...params} label="Category" variant="outlined" />}
                            />
                        )}
                        <TextField
                            label="Monthly Limit"
                            type="number"
                            value={newBudgetLimit}
                            onChange={(e) => setNewBudgetLimit(e.target.value)}
                            InputProps={{
                                startAdornment: <span style={{ marginRight: '4px' }}>₪</span>
                            }}
                            variant="outlined"
                        />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                        {editingBudget && (
                            <Button
                                onClick={() => {
                                    if (editingBudget) handleDeleteBudget(editingBudget.id);
                                    setIsAddModalOpen(false);
                                }}
                                color="error"
                                style={{ marginRight: 'auto' }}
                            >
                                Delete
                            </Button>
                        )}
                        <Button
                            onClick={() => setIsAddModalOpen(false)}
                            style={{ color: theme.palette.text.secondary, borderRadius: '12px' }}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveBudget}
                            variant="contained"
                            disabled={savingBudget}
                            style={{
                                borderRadius: '12px',
                                background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`
                            }}
                        >
                            {savingBudget ? <CircularProgress size={24} color="inherit" /> : 'Save Budget'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </Box>
    );
};

export default BudgetModule;
