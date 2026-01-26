import React from 'react';
import { logger } from '../../../utils/client-logger';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';
import ModalHeader from '../../ModalHeader';

import Table, { Column } from '../../Table';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import CheckIcon from '@mui/icons-material/Check';
import EditIcon from '@mui/icons-material/Edit';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { ExpensesModalProps, Expense } from '../types';
import { formatNumber } from '../utils/format';
import { dateUtils } from '../utils/dateUtils';
import dynamic from 'next/dynamic';
const LineChart = dynamic(() => import('@mui/x-charts').then(m => m.LineChart), { ssr: false });
import Box from '@mui/material/Box';
import DeleteIcon from '@mui/icons-material/Delete';
import SortIcon from '@mui/icons-material/Sort';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { useCategories } from '../utils/useCategories';
import { useCardVendors } from '../utils/useCardVendors';
import { CardVendorIcon } from '../../CardVendorsModal';
import DeleteConfirmationDialog from '../../DeleteConfirmationDialog';

type SortField = 'date' | 'amount' | 'installments';
type SortDirection = 'asc' | 'desc';

interface ChartDataPoint {
  date: Date;
  amount: number;
}

const ExpensesModal: React.FC<ExpensesModalProps> = ({ open, onClose, data, color, setModalData, currentMonth }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [chartData, setChartData] = React.useState<ChartDataPoint[]>([]);
  const [editingExpense, setEditingExpense] = React.useState<Expense | null>(null);
  const [editPrice, setEditPrice] = React.useState<string>('');
  const [editCategory, setEditCategory] = React.useState<string>('');
  const [applyToAll, setApplyToAll] = React.useState<boolean>(false);
  const { categories: availableCategories } = useCategories();
  const { getCardVendor, getCardNickname } = useCardVendors();
  const [snackbar, setSnackbar] = React.useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'success'
  });
  const [sortField, setSortField] = React.useState<SortField>('date');
  const [sortDirection, setSortDirection] = React.useState<SortDirection>('desc');
  const [confirmDeleteExpense, setConfirmDeleteExpense] = React.useState<Expense | null>(null);

  const isBankView = data.type === "Bank Transactions" ||
    data.type === "All Bank Expenses" ||
    (data.type && (data.type.startsWith('Account') || data.type.startsWith('Bank') || data.type.startsWith('Search:')));

  // Sort function for expenses
  const getSortedData = React.useCallback((expenses: Expense[]) => {
    if (!Array.isArray(expenses)) return expenses;

    return [...expenses].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'date':
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case 'amount':
          // Sort by actual value (including sign) - negative amounts come before positive in ascending order
          comparison = a.price - b.price;
          break;
        case 'installments':
          const installA = a.installments_total || 0;
          const installB = b.installments_total || 0;
          comparison = installA - installB;
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [sortField, sortDirection]);

  const handleSortChange = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedExpenses = React.useMemo(() => getSortedData(data.data), [data.data, getSortedData]);

  React.useEffect(() => {
    // Determine if we should treat values as signed (Net) or absolute (Magnitude)
    // Bank View = Signed (Net). Category View = Absolute (Magnitude)
    const useSignedValues = isBankView;

    // if (isBankView) {
    //   setChartData([]);
    //   return;
    // }

    if (!data.data || data.data.length === 0) {
      setChartData([]);
      return;
    }

    const timestamps = data.data.map(e => new Date(e.date).getTime()).filter(t => !isNaN(t));
    if (timestamps.length === 0) {
      setChartData([]);
      return;
    }

    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    const msPerDay = 1000 * 60 * 60 * 24;
    const diffDays = Math.ceil((maxTime - minTime) / msPerDay);

    // If range is up to 31 days (inclusive of end date implies we might technically span simple checks, 
    // but diffDays is usually accurate enough). Data point per day.
    // If multiple months (implied by > 31 days), per month.
    // If range is up to 90 days (approx 3 months), show daily data points.
    // If > 90 days, switch to monthly aggregation.
    const isDaily = diffDays <= 90;

    const aggregated = new Map<string, number>();

    const getKey = (date: Date) => {
      if (isDaily) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; // YYYY-MM-DD
      } else {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
      }
    };

    // Fill gaps
    const startDate = new Date(minTime);
    const endDate = new Date(maxTime);

    if (isDaily) {
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);
    } else {
      startDate.setDate(1); startDate.setHours(0, 0, 0, 0);
      endDate.setDate(1); endDate.setHours(0, 0, 0, 0);
    }

    // Create a range of keys initialized to 0
    const current = new Date(startDate);
    // Add a safety limit to loop to prevent infinite loop if something is wrong with dates
    let safety = 0;
    while (current <= endDate && safety < 1000) {
      aggregated.set(getKey(current), 0);
      if (isDaily) {
        current.setDate(current.getDate() + 1);
      } else {
        current.setMonth(current.getMonth() + 1);
      }
      safety++;
    }

    // Sum data
    data.data.forEach(expense => {
      const d = new Date(expense.date);
      if (isNaN(d.getTime())) return;
      const key = getKey(d);
      // Expenses are usually summed by absolute value for these charts
      // But for Bank View, we might want Net (Signed)
      const val = useSignedValues ? expense.price : Math.abs(expense.price);

      if (aggregated.has(key)) {
        aggregated.set(key, (aggregated.get(key) || 0) + val);
      } else {
        // If data point falls outside the generated range (e.g. late month data vs 1st of month logic), 
        // for monthly we keyed by YYYY-MM so it should match.
        // For daily, strict YYYY-MM-DD match.
        // Just in case, set it.
        aggregated.set(key, (aggregated.get(key) || 0) + val);
      }
    });

    // Convert to sorted array
    const result = Array.from(aggregated.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, amount]) => {
        const parts = key.split('-').map(Number);
        // Daily: YYYY-MM-DD, Monthly: YYYY-MM
        const date = isDaily
          ? new Date(parts[0], parts[1] - 1, parts[2])
          : new Date(parts[0], parts[1] - 1);
        return { date, amount };
      });

    setChartData(result);

  }, [data.data, data.type]);

  const handleEditClick = (expense: Expense) => {
    setEditingExpense(expense);
    setEditPrice(Math.abs(expense.price).toString());
    setEditCategory(expense.category || 'Uncategorized');
    setApplyToAll(false); // Default to single transaction only
  };

  const handleSaveClick = async () => {
    if (editingExpense && editPrice && editingExpense.identifier && editingExpense.vendor) {
      const newPrice = parseFloat(editPrice);
      if (!isNaN(newPrice)) {
        const priceWithSign = editingExpense.price < 0 ? -newPrice : newPrice;
        const categoryChanged = editCategory !== editingExpense.category && editCategory !== (editingExpense.category || 'Uncategorized');
        const priceChanged = priceWithSign !== editingExpense.price;

        try {
          if (categoryChanged) {
            if (applyToAll) {
              // Apply to ALL matching transactions and create rule
              const response = await fetch('/api/categories/update-by-description', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  description: editingExpense.name,
                  newCategory: editCategory,
                  createRule: true
                }),
              });

              if (response.ok) {
                const result = await response.json();

                // Update all matching items in local data
                const updatedData = data.data.map((item: Expense) =>
                  item.name === editingExpense.name
                    ? { ...item, category: editCategory }
                    : item
                );

                // Also update price for the specific transaction
                const finalData = updatedData.map((item: Expense) =>
                  item.identifier === editingExpense.identifier && item.vendor === editingExpense.vendor
                    ? { ...item, price: priceWithSign }
                    : item
                );

                setModalData?.({
                  ...data,
                  data: finalData
                });

                // Show success message with count
                const message = result.transactionsUpdated > 1
                  ? `Updated ${result.transactionsUpdated} transactions with "${editingExpense.name}" to "${editCategory}". Rule saved for future transactions.`
                  : `Category updated to "${editCategory}". Rule saved for future transactions.`;

                setSnackbar({
                  open: true,
                  message,
                  severity: 'success'
                });

                // Trigger a refresh of the dashboard data
                window.dispatchEvent(new CustomEvent('dataRefresh'));
              } else {
                setSnackbar({
                  open: true,
                  message: 'Failed to update category',
                  severity: 'error'
                });
              }
            } else {
              // Apply to THIS transaction only - no rule created
              const response = await fetch(`/api/transactions/${editingExpense.identifier}|${editingExpense.vendor}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  category: editCategory,
                  ...(priceChanged && { price: priceWithSign })
                }),
              });

              if (response.ok) {
                // Update only this transaction in local data
                const updatedData = data.data.map((item: Expense) =>
                  item.identifier === editingExpense.identifier && item.vendor === editingExpense.vendor
                    ? { ...item, category: editCategory, price: priceWithSign }
                    : item
                );

                setModalData?.({
                  ...data,
                  data: updatedData
                });

                setSnackbar({
                  open: true,
                  message: `Category updated to "${editCategory}" for this transaction only.`,
                  severity: 'success'
                });

                // Trigger a refresh of the dashboard data
                window.dispatchEvent(new CustomEvent('dataRefresh'));
              } else {
                setSnackbar({
                  open: true,
                  message: 'Failed to update transaction',
                  severity: 'error'
                });
              }
            }
          } else if (priceChanged) {
            // Only price changed, use the regular update endpoint
            const response = await fetch(`/api/transactions/${editingExpense.identifier}|${editingExpense.vendor}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ price: priceWithSign }),
            });

            if (response.ok) {
              // Update the local data
              const updatedData = data.data.map((item: Expense) =>
                item.identifier === editingExpense.identifier && item.vendor === editingExpense.vendor
                  ? { ...item, price: priceWithSign }
                  : item
              );

              setModalData?.({
                ...data,
                data: updatedData
              });

              // Trigger a refresh of the dashboard data
              window.dispatchEvent(new CustomEvent('dataRefresh'));
            } else {
              logger.error('Failed to update transaction');
            }
          }
        } catch (error) {
          logger.error('Error updating transaction', error as Error);
          setSnackbar({
            open: true,
            message: 'Error updating transaction',
            severity: 'error'
          });
        }

        setEditingExpense(null);
      }
    }
  };

  const handleCancelClick = () => {
    setEditingExpense(null);
  };

  const handleRowClick = (expense: Expense) => {
    // If clicking on a different row while editing, save the current changes
    if (editingExpense && (editingExpense.identifier !== expense.identifier || editingExpense.vendor !== expense.vendor)) {
      handleSaveClick();
    }
  };

  const handleTableClick = (e: React.MouseEvent) => {
    // If clicking on the table background (not on a row), save current changes
    if (editingExpense && (e.target as HTMLElement).tagName === 'TABLE') {
      handleSaveClick();
    }
  };

  const handleDeleteTransaction = async () => {
    if (!confirmDeleteExpense) return;

    const expense = confirmDeleteExpense;
    try {
      // Use identifier-based delete if available, otherwise fall back to name-based delete
      if (expense.identifier && expense.vendor) {
        const response = await fetch(`/api/transactions/${expense.identifier}|${expense.vendor}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          // Remove the transaction from the local data
          const updatedData = data.data.filter((item: Expense) =>
            !(item.identifier === expense.identifier && item.vendor === expense.vendor)
          );

          // Update the modal data if setModalData is provided
          setModalData?.({
            ...data,
            data: updatedData
          });

          setSnackbar({
            open: true,
            message: 'Transaction deleted successfully',
            severity: 'success'
          });

          // Trigger a refresh of the dashboard data
          window.dispatchEvent(new CustomEvent('dataRefresh'));
        } else {
          setSnackbar({
            open: true,
            message: 'Failed to delete transaction',
            severity: 'error'
          });
        }
      } else {
        logger.error('Cannot delete transaction: missing identifier or vendor', expense);
        setSnackbar({
          open: true,
          message: 'Cannot delete transaction: missing identifier or vendor',
          severity: 'error'
        });
      }
    } catch (error) {
      logger.error('Error deleting transaction', error as Error);
      setSnackbar({
        open: true,
        message: 'Error deleting transaction',
        severity: 'error'
      });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          background: theme.palette.mode === 'dark'
            ? 'rgba(15, 23, 42, 0.95)'
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%)',
          backdropFilter: 'blur(20px)',
          borderRadius: isMobile ? 0 : '28px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.15)',
          border: isMobile ? 'none' : `1px solid ${theme.palette.divider}`,
          margin: isMobile ? 0 : undefined,
        }
      }}
      BackdropProps={{
        style: {
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)'
        }
      }}
    >
      <ModalHeader title={data.type} onClose={onClose} />
      <DialogContent sx={{ padding: { xs: '12px', sm: '16px', md: '32px' } }}>
        {chartData.length > 0 && (
          <Box sx={{
            mb: 4,
            p: 3,
            borderRadius: '20px',
            background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'linear-gradient(135deg, rgba(248, 250, 252, 0.8) 0%, rgba(241, 245, 249, 0.8) 100%)',
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: '0 2px 12px rgba(0, 0, 0, 0.04)',
            backdropFilter: 'blur(10px)'
          }}>
            <Box sx={{ width: '100%', overflow: 'hidden' }}>
              <LineChart
                xAxis={[
                  {
                    data: chartData.map(d => d.date),
                    valueFormatter: (value) => {
                      if (!value) return "";
                      return new Intl.DateTimeFormat("en-US", {
                        day: "numeric",
                        month: "short",
                        year: chartData.length > 31 ? "2-digit" : undefined
                      }).format(value);
                    },
                    tickLabelStyle: { fill: theme.palette.text.secondary },
                    scaleType: 'time',
                  },
                ]}
                yAxis={[
                  {
                    tickLabelStyle: { fill: theme.palette.text.secondary },
                    valueFormatter: (value) => `₪${formatNumber(value)}`,
                  },
                ]}
                series={[
                  {
                    data: chartData.map(d => d.amount),
                    color: color,
                    area: true,
                    showMark: true,
                    label: data.type,
                  },
                ]}
                height={300}
                margin={{ left: 70 }}
                grid={{ horizontal: true, vertical: false }}
                sx={{
                  '.MuiLineElement-root': {
                    stroke: color,
                    strokeWidth: 2,
                  },
                  '.MuiAreaElement-root': {
                    fill: color,
                    opacity: 0.1,
                  },
                  '.MuiMarkElement-root': {
                    stroke: color,
                    strokeWidth: 2,
                    fill: '#ffffff',
                  },
                  '.MuiChartsAxis-line': {
                    stroke: '#e2e8f0',
                  },
                  '.MuiChartsAxis-tick': {
                    stroke: '#e2e8f0',
                  },
                  '.MuiChartsGrid-root': {
                    stroke: '#e2e8f0',
                  },
                }}
              />
            </Box>
          </Box>
        )}
        {/* Sorting Controls */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          mb: 2,
          flexWrap: 'wrap'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', color: theme.palette.text.secondary, fontSize: '14px', fontWeight: 600 }}>
            <SortIcon sx={{ fontSize: '18px' }} />
            Sort by:
          </Box>
          {[
            { field: 'date' as SortField, label: 'Date' },
            { field: 'amount' as SortField, label: 'Amount' },
            { field: 'installments' as SortField, label: 'Installments' }
          ].map(({ field, label }) => (
            <button
              key={field}
              onClick={() => handleSortChange(field)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '8px 14px',
                borderRadius: '10px',
                border: sortField === field ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(148, 163, 184, 0.2)',
                background: sortField === field
                  ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.08) 100%)'
                  : (theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.8)'),
                color: sortField === field ? '#3b82f6' : theme.palette.text.secondary,
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
              }}
            >
              {label}
              {sortField === field && (
                sortDirection === 'asc'
                  ? <ArrowUpwardIcon sx={{ fontSize: '16px' }} />
                  : <ArrowDownwardIcon sx={{ fontSize: '16px' }} />
              )}
            </button>
          ))}
        </Box>

        <Box sx={{
          borderRadius: '20px',
          overflow: 'hidden',
          border: `1px solid ${theme.palette.divider}`,
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.04)',
          background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 100%)',
          backdropFilter: 'blur(10px)'
        }}>
          <Box sx={{
            borderRadius: '20px',
            overflow: 'hidden',
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: '0 2px 12px rgba(0, 0, 0, 0.04)',
            background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 100%)',
            backdropFilter: 'blur(10px)'
          }} onClick={handleTableClick}>

            <Table<Expense>
              rows={Array.isArray(sortedExpenses) ? sortedExpenses : []}
              rowKey={(row) => row.identifier ? `${row.identifier}-${row.vendor}` : JSON.stringify(row)} // Better unique key if possible
              emptyMessage="No data available"
              columns={React.useMemo(() => [
                {
                  id: 'name',
                  label: 'Description',
                  minWidth: 200,
                  format: (val) => val
                },
                {
                  id: 'category',
                  label: 'Category',
                  format: (_, expense) => {
                    const isEditing = editingExpense?.identifier === expense.identifier && editingExpense?.vendor === expense.vendor;
                    if (isEditing) {
                      return (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <Autocomplete
                            value={editCategory}
                            onChange={(event, newValue) => setEditCategory(newValue || '')}
                            onInputChange={(event, newInputValue) => setEditCategory(newInputValue)}
                            freeSolo
                            options={availableCategories}
                            size="small"
                            sx={{
                              minWidth: 120,
                              '& .MuiOutlinedInput-root': {
                                '& fieldset': { borderColor: '#e2e8f0' },
                                '&:hover fieldset': { borderColor: '#3b82f6' },
                                '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                              },
                            }}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                placeholder="Enter category..."
                                sx={{ '& .MuiInputBase-input': { fontSize: '14px', padding: '6px 10px' } }}
                              />
                            )}
                          />
                          {editingExpense && editCategory !== editingExpense.category && editCategory !== (editingExpense.category || 'Uncategorized') && (
                            <Tooltip title="When checked, applies to all transactions with the same description and creates a rule for future transactions">
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={applyToAll}
                                    onChange={(e) => setApplyToAll(e.target.checked)}
                                    size="small"
                                    sx={{ color: '#94a3b8', '&.Mui-checked': { color: '#3b82f6' }, padding: '2px' }}
                                  />
                                }
                                label={
                                  <Typography sx={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
                                    Apply to all & create rule
                                  </Typography>
                                }
                                sx={{ margin: 0 }}
                              />
                            </Tooltip>
                          )}
                        </Box>
                      );
                    }
                    return (
                      <span
                        style={{
                          cursor: 'pointer',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          transition: 'all 0.2s ease-in-out',
                          display: 'inline-block',
                          minWidth: '60px',
                          textAlign: 'center',
                          backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          color: '#3b82f6',
                          fontWeight: '500',
                          fontSize: '13px'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRowClick(expense);
                          handleEditClick(expense);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
                          e.currentTarget.style.transform = 'scale(1.02)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                      >
                        {expense.category || 'Uncategorized'}
                      </span>
                    );
                  }
                },
                {
                  id: 'price',
                  label: 'Amount',
                  align: 'right',
                  format: (_, expense) => {
                    const isEditing = editingExpense?.identifier === expense.identifier && editingExpense?.vendor === expense.vendor;
                    const displayAmount = Math.abs(expense.price);
                    const isForeignCurrency = expense.original_currency && !['ILS', '₪', 'NIS'].includes(expense.original_currency);
                    const sign = expense.price >= 0 ? (isBankView ? '+' : '') : '-';
                    const getCurrencySymbol = (currency?: string) => {
                      if (!currency) return '₪';
                      if (['EUR', '€'].includes(currency)) return '€';
                      if (['USD', '$'].includes(currency)) return '$';
                      if (['GBP', '£'].includes(currency)) return '£';
                      if (['ILS', '₪', 'NIS'].includes(currency)) return '₪';
                      return currency + ' ';
                    };

                    if (isEditing) {
                      return (
                        <TextField
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          size="small"
                          type="number"
                          inputProps={{
                            style: {
                              textAlign: 'right',
                              color: isBankView ? (expense.price >= 0 ? '#4ADE80' : '#F87171') : color
                            }
                          }}
                          sx={{
                            width: '100px',
                            '& .MuiOutlinedInput-root': {
                              '& fieldset': {
                                borderColor: isBankView ? (expense.price >= 0 ? '#4ADE80' : '#F87171') : color,
                              },
                            },
                          }}
                        />
                      );
                    }

                    if (isBankView) {
                      return <span style={{ fontWeight: 600, color: (expense.price >= 0 ? '#4ADE80' : '#F87171') }}>{sign}₪{formatNumber(displayAmount)}</span>;
                    }

                    if (isForeignCurrency && expense.original_amount) {
                      const symbol = getCurrencySymbol(expense.original_currency);
                      const originalDisplayAmount = Math.abs(expense.original_amount);
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
                          <span style={{ fontWeight: 600, color: (expense.price < 0 ? '#F87171' : color) }}>{sign}₪{formatNumber(displayAmount)}</span>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>({symbol}{formatNumber(originalDisplayAmount)})</span>
                        </div>
                      );
                    }

                    return <span style={{ fontWeight: 600, color: (expense.price < 0 ? '#F87171' : color) }}>{sign}₪{formatNumber(displayAmount)}</span>;
                  }
                },
                {
                  id: 'installments_number',
                  label: 'Installment',
                  align: 'center',
                  format: (_, expense) => expense.installments_total && expense.installments_total > 1 ? (
                    <span style={{
                      backgroundColor: 'rgba(99, 102, 241, 0.1)',
                      color: '#6366f1',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}>
                      {expense.installments_number}/{expense.installments_total}
                    </span>
                  ) : (
                    <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>
                  )
                },
                {
                  id: 'card',
                  label: 'Card',
                  format: (_, expense) => {
                    const hasCardInfo = expense.vendor_nickname || expense.vendor || expense.card6_digits || expense.account_number;
                    if (!hasCardInfo) return <span style={{ color: '#94a3b8' }}>—</span>;

                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CardVendorIcon vendor={getCardVendor(expense.account_number)} size={24} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{
                            fontWeight: '500',
                            color: '#334155',
                            backgroundColor: 'rgba(148, 163, 184, 0.1)',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            display: 'inline-block'
                          }}>
                            {getCardNickname(expense.account_number) || expense.vendor_nickname || expense.vendor}
                          </span>
                          {(expense.account_number || expense.card6_digits) && (
                            <span style={{ fontSize: '11px', color: '#64748b', paddingLeft: '8px' }}>
                              •••• {expense.account_number ? expense.account_number.slice(-4) : expense.card6_digits?.slice(-4)}
                            </span>
                          )}
                        </div>
                      </Box>
                    );
                  }
                },
                {
                  id: 'date',
                  label: 'Date',
                  format: (val) => <span style={{ color: theme.palette.text.secondary }}>{dateUtils.formatDate(val)}</span>
                },
                {
                  id: 'actions',
                  label: 'Actions',
                  align: 'center',
                  format: (_, expense) => {
                    const isEditing = editingExpense?.identifier === expense.identifier && editingExpense?.vendor === expense.vendor;
                    if (isEditing) {
                      return (
                        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                          <IconButton onClick={(e) => { e.stopPropagation(); handleSaveClick(); }} size="small" sx={{ color: '#4ADE80' }}>
                            <CheckIcon fontSize="small" />
                          </IconButton>
                          <IconButton onClick={(e) => { e.stopPropagation(); handleCancelClick(); }} size="small" sx={{ color: '#ef4444' }}>
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      );
                    }
                    return (
                      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                        <IconButton
                          onClick={(e) => { e.stopPropagation(); handleRowClick(expense); handleEditClick(expense); }}
                          size="small"
                          sx={{ color: '#3b82f6', '&:hover': { backgroundColor: 'rgba(59, 130, 246, 0.1)' } }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteExpense(expense); }}
                          size="small"
                          sx={{ color: '#ef4444', '&:hover': { backgroundColor: 'rgba(239, 68, 68, 0.1)' } }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    );
                  }
                }
              ], [editingExpense, editCategory, editPrice, applyToAll, isBankView, availableCategories, theme, color])}
              mobileCardRenderer={(expense) => (
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="subtitle2" fontWeight={700}>{expense.name}</Typography>
                    <Typography variant="subtitle2" fontWeight={700} color={expense.price >= 0 && isBankView ? 'success.main' : 'error.main'}>
                      {isBankView ? (expense.price >= 0 ? '+' : '') : (expense.price < 0 ? '-' : '')}₪{formatNumber(Math.abs(expense.price))}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="caption" color="text.secondary">{dateUtils.formatDate(expense.date)}</Typography>
                    <span
                      style={{ fontSize: '11px', color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); handleRowClick(expense); handleEditClick(expense); }}
                    >
                      {expense.category || 'Uncategorized'}
                    </span>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleRowClick(expense); handleEditClick(expense); }} sx={{ color: '#3b82f6' }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setConfirmDeleteExpense(expense); }} sx={{ color: '#ef4444' }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              )}
            />
          </Box>

        </Box>
      </DialogContent >

      {/* Snackbar for feedback messages */}
      < Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{
            width: '100%',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar >

      {/* Delete Confirmation Dialog */}
      < DeleteConfirmationDialog
        open={!!confirmDeleteExpense}
        onClose={() => setConfirmDeleteExpense(null)}
        onConfirm={handleDeleteTransaction}
        transaction={confirmDeleteExpense}
      />
    </Dialog >
  );
};

export default ExpensesModal; 