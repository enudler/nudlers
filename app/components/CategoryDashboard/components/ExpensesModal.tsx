import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';
import ModalHeader from '../../ModalHeader';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
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
import { TABLE_HEADER_CELL_STYLE, TABLE_BODY_CELL_STYLE, TABLE_ROW_HOVER_STYLE, TABLE_ROW_HOVER_BACKGROUND } from '../utils/tableStyles';

type SortField = 'date' | 'amount' | 'installments';
type SortDirection = 'asc' | 'desc';

interface CategoryOverTimeData {
  year_month: string;
  amount: number;
  year: string;
  year_sort?: string;
}

const ExpensesModal: React.FC<ExpensesModalProps> = ({ open, onClose, data, color, setModalData, currentMonth }) => {
  const [timeSeriesData, setTimeSeriesData] = React.useState<CategoryOverTimeData[]>([]);
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
          const amountA = Math.abs(a.price);
          const amountB = Math.abs(b.price);
          comparison = amountA - amountB;
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
    if (data.type) {
      switch (data.type) {
        case "Total Expenses":
          fetch(`/api/expenses_by_month?month=10&groupByYear=false`)
            .then((response) => response.json())
            .then((data) => setTimeSeriesData(data))
            .catch((error) => console.error("Error fetching expense time series data:", error));
          break;
        case "Credit Card Expenses":
          fetch(`/api/expenses_by_month?month=10&groupByYear=false`)
            .then((response) => response.json())
            .then((data) => setTimeSeriesData(data))
            .catch((error) => console.error("Error fetching credit card expense time series data:", error));
          break;
        case "Bank Transactions":
          // Don't fetch time series data for Bank Transactions - no graph needed
          setTimeSeriesData([]);
          break;
        default:
          fetch(`/api/category_by_month?category=${data.type}&month=10&groupByYear=false`)
            .then((response) => response.json())
            .then((data) => setTimeSeriesData(data))
            .catch((error) => console.error("Error fetching time series data:", error));
      }
    }
  }, [data.type, data.data]);

  const getFormattedMonths = () =>
    timeSeriesData.map((data) => {
      if (!data.year_month) return new Date(parseInt(data.year), 0);
      const [month, year] = data.year_month.split("-");
      return new Date(parseInt(year), parseInt(month) - 1);
    });

  const getAmounts = () => timeSeriesData.map((data) => data.amount);

  const handleEditClick = (expense: Expense) => {
    setEditingExpense(expense);
    setEditPrice(Math.abs(expense.price).toString());
    setEditCategory(expense.category || data.type);
    setApplyToAll(false); // Default to single transaction only
  };

  const handleSaveClick = async () => {
    if (editingExpense && editPrice && editingExpense.identifier && editingExpense.vendor) {
      const newPrice = parseFloat(editPrice);
      if (!isNaN(newPrice)) {
        const priceWithSign = editingExpense.price < 0 ? -newPrice : newPrice;
        const categoryChanged = editCategory !== editingExpense.category && editCategory !== data.type;
        const priceChanged = priceWithSign !== editingExpense.price;
        
        try {
          if (categoryChanged) {
            if (applyToAll) {
              // Apply to ALL matching transactions and create rule
              const response = await fetch('/api/update_category_by_description', {
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
              console.error('Failed to update transaction');
            }
          }
        } catch (error) {
          console.error("Error updating transaction:", error);
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

  const handleDeleteTransaction = async (expense: Expense) => {
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
          
          // Trigger a refresh of the dashboard data
          window.dispatchEvent(new CustomEvent('dataRefresh'));
        } else {
          console.error('Failed to delete transaction');
        }
      } else {
        // Fallback to name-based delete for backward compatibility
        const response = await fetch(`/api/transactions/delete_transaction`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: expense.name,
            date: expense.date,
            price: expense.price,
            category: data.type === "Bank Transactions" ? 'Bank' : (expense.category || data.type)
          }),
        });
        
        if (response.ok) {
          // Remove the transaction from the local data
          const updatedData = data.data.filter((item: Expense) => 
            !(item.name === expense.name && 
              item.date === expense.date && 
              item.price === expense.price)
          );
          
          // Update the modal data if setModalData is provided
          setModalData?.({
            ...data,
            data: updatedData
          });
          
          // Trigger a refresh of the dashboard data
          window.dispatchEvent(new CustomEvent('dataRefresh'));
        } else {
          console.error('Failed to delete transaction');
        }
      }
    } catch (error) {
      console.error("Error deleting transaction:", error);
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        style: {
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%)',
          backdropFilter: 'blur(20px)',
          borderRadius: '28px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.15)',
          border: '1px solid rgba(148, 163, 184, 0.2)'
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
      <DialogContent style={{ padding: '32px' }}>
        {data.type !== "Bank Transactions" && (
          <Box sx={{ 
            mb: 4, 
            p: 3,
            borderRadius: '20px',
            background: 'linear-gradient(135deg, rgba(248, 250, 252, 0.8) 0%, rgba(241, 245, 249, 0.8) 100%)',
            border: '1px solid rgba(148, 163, 184, 0.15)',
            boxShadow: '0 2px 12px rgba(0, 0, 0, 0.04)',
            backdropFilter: 'blur(10px)'
          }}>
            <Box sx={{ width: '100%', overflow: 'hidden' }}>
              <LineChart
                xAxis={[
                  {
                    data: getFormattedMonths(),
                    valueFormatter: (value) => {
                      return new Intl.DateTimeFormat("en-US", {
                        year: "numeric",
                        month: "short",
                      }).format(value);
                    },
                    tickLabelStyle: { fill: '#666' },
                    scaleType: 'time',
                  },
                ]}
                yAxis={[
                  {
                    tickLabelStyle: { fill: '#666' },
                    valueFormatter: (value) => `₪${formatNumber(value)}`,
                  },
                ]}
                series={[
                  {
                    data: getAmounts(),
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '14px', fontWeight: 600 }}>
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
                  : 'rgba(255, 255, 255, 0.8)',
                color: sortField === field ? '#3b82f6' : '#64748b',
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
          border: '1px solid rgba(148, 163, 184, 0.15)',
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.04)',
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 100%)',
          backdropFilter: 'blur(10px)'
        }}>
        <Table
          onClick={handleTableClick}
        >
          <TableHead>
            <TableRow>
              <TableCell style={{ ...TABLE_HEADER_CELL_STYLE, width: '200px', maxWidth: '200px' }}>Description</TableCell>
              <TableCell style={TABLE_HEADER_CELL_STYLE}>Category</TableCell>
              <TableCell align="right" style={TABLE_HEADER_CELL_STYLE}>Amount</TableCell>
              <TableCell style={TABLE_HEADER_CELL_STYLE}>Installment</TableCell>
              <TableCell style={TABLE_HEADER_CELL_STYLE}>Card</TableCell>
              <TableCell style={TABLE_HEADER_CELL_STYLE}>Date</TableCell>
              <TableCell align="center" style={{ ...TABLE_HEADER_CELL_STYLE, width: '120px' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Array.isArray(sortedExpenses) ? sortedExpenses.map((expense: Expense, index) => (
              <TableRow 
                key={index}
                onClick={() => handleRowClick(expense)}
                style={TABLE_ROW_HOVER_STYLE}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = TABLE_ROW_HOVER_BACKGROUND;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <TableCell style={TABLE_BODY_CELL_STYLE}>
                  {expense.name}
                </TableCell>
                <TableCell style={TABLE_BODY_CELL_STYLE}>
                  {editingExpense?.identifier === expense.identifier && 
                   editingExpense?.vendor === expense.vendor ? (
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
                            '& fieldset': {
                              borderColor: '#e2e8f0',
                            },
                            '&:hover fieldset': {
                              borderColor: '#3b82f6',
                            },
                            '&.Mui-focused fieldset': {
                              borderColor: '#3b82f6',
                            },
                          },
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            placeholder="Enter category..."
                            sx={{
                              '& .MuiInputBase-input': {
                                fontSize: '14px',
                                padding: '6px 10px',
                              },
                            }}
                          />
                        )}
                      />
                      {editingExpense && editCategory !== editingExpense.category && editCategory !== data.type && (
                        <Tooltip title="When checked, applies to all transactions with the same description and creates a rule for future transactions">
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={applyToAll}
                                onChange={(e) => setApplyToAll(e.target.checked)}
                                size="small"
                                sx={{
                                  color: '#94a3b8',
                                  '&.Mui-checked': {
                                    color: '#3b82f6',
                                  },
                                  padding: '2px',
                                }}
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
                  ) : (
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
                      {expense.category || data.type}
                    </span>
                  )}
                </TableCell>
                <TableCell align="right" style={{ 
                  ...TABLE_BODY_CELL_STYLE,
                  color: data.type === "Bank Transactions" 
                    ? (expense.price >= 0 ? '#4ADE80' : '#F87171')
                    : color,
                  fontWeight: '600'
                }}>
                  {editingExpense?.identifier === expense.identifier && 
                   editingExpense?.vendor === expense.vendor ? (
                    <TextField
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      size="small"
                      type="number"
                      inputProps={{ 
                        style: { 
                          textAlign: 'right',
                          color: data.type === "Bank Transactions" 
                            ? (expense.price >= 0 ? '#4ADE80' : '#F87171')
                            : color
                        } 
                      }}
                      sx={{ 
                        width: '100px',
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': {
                            borderColor: data.type === "Bank Transactions" 
                              ? (expense.price >= 0 ? '#4ADE80' : '#F87171')
                              : color,
                          },
                        },
                      }}
                    />
                  ) : (
                    (() => {
                      // Price is already the per-installment amount (combineInstallments: false)
                      const displayAmount = Math.abs(expense.price);
                      
                      // Check if original currency is different from ILS (foreign transaction)
                      const isForeignCurrency = expense.original_currency && 
                        !['ILS', '₪', 'NIS'].includes(expense.original_currency);
                      
                      // Get the appropriate currency symbol
                      const getCurrencySymbol = (currency?: string) => {
                        if (!currency) return '₪';
                        if (['EUR', '€'].includes(currency)) return '€';
                        if (['USD', '$'].includes(currency)) return '$';
                        if (['GBP', '£'].includes(currency)) return '£';
                        if (['ILS', '₪', 'NIS'].includes(currency)) return '₪';
                        return currency + ' ';
                      };
                      
                      if (data.type === "Bank Transactions") {
                        return `${expense.price >= 0 ? '+' : ''}₪${formatNumber(displayAmount)}`;
                      }
                      
                      // For foreign currency transactions, show ILS amount with original amount below
                      if (isForeignCurrency && expense.original_amount) {
                        const symbol = getCurrencySymbol(expense.original_currency);
                        // original_amount is also already the per-installment amount
                        const originalDisplayAmount = Math.abs(expense.original_amount);
                        
                        return (
                          <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span>₪{formatNumber(displayAmount)}</span>
                            <span style={{ 
                              fontSize: '11px', 
                              color: '#64748b'
                            }}>
                              ({symbol}{formatNumber(originalDisplayAmount)})
                            </span>
                          </span>
                        );
                      }
                      
                      return `₪${formatNumber(displayAmount)}`;
                    })()
                  )}
                </TableCell>
                <TableCell style={{ ...TABLE_BODY_CELL_STYLE, textAlign: 'center' }}>
                  {expense.installments_total && expense.installments_total > 1 ? (
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
                  )}
                </TableCell>
                <TableCell style={{ ...TABLE_BODY_CELL_STYLE, fontSize: '12px' }}>
                  {expense.vendor_nickname || expense.vendor || expense.card6_digits || expense.account_number ? (
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
                          <span style={{ 
                            fontSize: '11px', 
                            color: '#64748b',
                            paddingLeft: '8px'
                          }}>
                            •••• {expense.account_number 
                              ? expense.account_number.slice(-4) 
                              : expense.card6_digits?.slice(-4)}
                          </span>
                        )}
                      </div>
                    </Box>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>—</span>
                  )}
                </TableCell>
                <TableCell style={TABLE_BODY_CELL_STYLE}>
                  {dateUtils.formatDate(expense.date)}
                </TableCell>
                <TableCell align="center" style={TABLE_BODY_CELL_STYLE}>
                  {editingExpense?.identifier === expense.identifier && 
                   editingExpense?.vendor === expense.vendor ? (
                    <>
                      <IconButton 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveClick();
                        }}
                        size="small"
                        sx={{ color: '#4ADE80' }}
                      >
                        <CheckIcon fontSize="small" />
                      </IconButton>
                      <IconButton 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelClick();
                        }}
                        size="small"
                        sx={{ color: '#ef4444' }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRowClick(expense);
                          handleEditClick(expense);
                        }}
                        size="small"
                        sx={{ 
                          color: '#3b82f6',
                          '&:hover': {
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          },
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTransaction(expense);
                        }}
                        size="small"
                        sx={{ 
                          color: '#ef4444',
                          '&:hover': {
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          },
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </>
                  )}
                </TableCell>
              </TableRow>
              )) : <TableRow><TableCell colSpan={7} style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>No data available</TableCell></TableRow>}
          </TableBody>
        </Table>
        </Box>
      </DialogContent>
      
      {/* Snackbar for feedback messages */}
      <Snackbar
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
      </Snackbar>
    </Dialog>
  );
};

export default ExpensesModal; 