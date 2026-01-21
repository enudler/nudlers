import React from 'react';
import { logger } from '../../../utils/client-logger';
import { useTheme } from '@mui/material/styles';
import { Table, TableBody, TableCell, TableHead, TableRow, Paper, Box, Typography, IconButton, TextField, Autocomplete, Snackbar, Alert, FormControlLabel, Checkbox, Tooltip } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { formatNumber } from '../utils/formatUtils';
import { dateUtils } from '../utils/dateUtils';
import { useCategories } from '../utils/useCategories';
import { useCardVendors } from '../utils/useCardVendors';
import { CardVendorIcon } from '../../CardVendorsModal';
import { getTableHeaderCellStyle, getTableBodyCellStyle, TABLE_ROW_HOVER_STYLE, getTableRowHoverBackground } from '../utils/tableStyles';
import DeleteConfirmationDialog from '../../DeleteConfirmationDialog';

export interface Transaction {
  name: string;
  price: number;
  date: string;
  category: string;
  identifier: string;
  vendor: string;
  installments_number?: number;
  installments_total?: number;
  vendor_nickname?: string;
  original_amount?: number;
  original_currency?: string;
  charged_currency?: string;
  account_number?: string;
}

export interface TransactionsTableProps {
  transactions: Transaction[];
  isLoading?: boolean;
  onDelete?: (transaction: Transaction) => void;
  onUpdate?: (transaction: Transaction, newPrice: number, newCategory?: string) => void;
  onTransactionsUpdated?: (updatedTransactions: Transaction[]) => void;
  groupByDate?: boolean;
}

const TransactionsTable: React.FC<TransactionsTableProps> = ({ transactions, isLoading, onDelete, onUpdate, onTransactionsUpdated, groupByDate }) => {
  const theme = useTheme();
  const [editingTransaction, setEditingTransaction] = React.useState<Transaction | null>(null);
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
  const [confirmDeleteTransaction, setConfirmDeleteTransaction] = React.useState<Transaction | null>(null);


  const handleDeleteClick = () => {
    if (!confirmDeleteTransaction) return;

    try {
      onDelete?.(confirmDeleteTransaction);
      setSnackbar({
        open: true,
        message: 'Transaction deleted successfully',
        severity: 'success'
      });
    } catch (error) {
      logger.error('Error deleting transaction', error as Error);
      setSnackbar({
        open: true,
        message: 'Error deleting transaction',
        severity: 'error'
      });
    }
  };

  const handleEditClick = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setEditPrice(Math.abs(transaction.price).toString());
    setEditCategory(transaction.category);
    setApplyToAll(false); // Default to single transaction only
  };

  const handleSaveClick = async () => {
    if (editingTransaction && editPrice) {
      const newPrice = parseFloat(editPrice);
      if (!isNaN(newPrice)) {
        const priceWithSign = editingTransaction.price < 0 ? -newPrice : newPrice;
        const categoryChanged = editCategory !== editingTransaction.category;
        const priceChanged = priceWithSign !== editingTransaction.price;

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
                  description: editingTransaction.name,
                  newCategory: editCategory,
                  createRule: true
                }),
              });

              if (response.ok) {
                const result = await response.json();

                // Show success message with count
                const message = result.transactionsUpdated > 1
                  ? `Updated ${result.transactionsUpdated} transactions with "${editingTransaction.name}" to "${editCategory}". Rule saved for future transactions.`
                  : `Category updated to "${editCategory}". Rule saved for future transactions.`;

                setSnackbar({
                  open: true,
                  message,
                  severity: 'success'
                });

                // Also update price if it changed
                if (priceChanged) {
                  onUpdate?.(editingTransaction, priceWithSign);
                }

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
              const response = await fetch(`/api/transactions/${editingTransaction.identifier}|${editingTransaction.vendor}`, {
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
            // Only price changed, use the regular update callback
            onUpdate?.(editingTransaction, priceWithSign, editCategory);
          }
        } catch (error) {
          logger.error('Error updating transaction', error as Error);
          setSnackbar({
            open: true,
            message: 'Error updating transaction',
            severity: 'error'
          });
        }

        setEditingTransaction(null);
      }
    }
  };

  const handleCancelClick = () => {
    setEditingTransaction(null);
  };

  const handleRowClick = (transaction: Transaction) => {
    // If clicking on a different row while editing, save the current changes
    if (editingTransaction && editingTransaction.identifier !== transaction.identifier) {
      handleSaveClick();
    }
  };

  const handleTableClick = (e: React.MouseEvent) => {
    // If clicking on the table background (not on a row), save current changes
    if (editingTransaction && (e.target as HTMLElement).tagName === 'TABLE') {
      handleSaveClick();
    }
  };

  // Group transactions by date
  const groupedTransactions = React.useMemo(() => {
    if (!groupByDate) return { 'all': transactions };

    const groups: { [date: string]: Transaction[] } = {};
    transactions.forEach(transaction => {
      // Assuming transaction.date is in YYYY-MM-DD format based on other code
      // If it includes time, we might need to split.
      // Based on API responses typically being dates for transactions:
      const dateKey = transaction.date.split('T')[0];
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(transaction);
    });
    return groups;
  }, [transactions, groupByDate]);

  const sortedDates = React.useMemo(() => {
    if (!groupByDate) return [];
    return Object.keys(groupedTransactions).sort((a, b) => b.localeCompare(a)); // Descending date
  }, [groupedTransactions, groupByDate]);

  const formatDateHeader = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) return 'Today';
    if (isYesterday) return 'Yesterday';

    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
        <Typography>Loading transactions...</Typography>
      </Box>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
        <Typography>No transactions found</Typography>
      </Box>
    );
  }

  return (
    <Paper sx={{
      width: '100%',
      overflow: 'hidden',
      borderRadius: '24px',
      background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 100%)',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 2px 12px rgba(0, 0, 0, 0.04)',
      border: `1px solid ${theme.palette.divider}`
    }}>
      <Table
        onClick={handleTableClick}
      >
        <TableHead>
          <TableRow>
            <TableCell style={getTableHeaderCellStyle(theme)}>Description</TableCell>
            <TableCell style={getTableHeaderCellStyle(theme)}>Category</TableCell>
            <TableCell align="right" style={getTableHeaderCellStyle(theme)}>Amount</TableCell>
            <TableCell style={getTableHeaderCellStyle(theme)}>Installment</TableCell>
            <TableCell style={getTableHeaderCellStyle(theme)}>Card</TableCell>
            <TableCell style={getTableHeaderCellStyle(theme)}>Date</TableCell>
            <TableCell align="right" style={getTableHeaderCellStyle(theme)}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {groupByDate ? (
            sortedDates.map(date => (
              <React.Fragment key={date}>
                <TableRow sx={{
                  backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.9)' : 'rgba(241, 245, 249, 0.9)',
                }}>
                  <TableCell colSpan={7} sx={{
                    padding: '8px 16px',
                    fontWeight: 700,
                    color: theme.palette.text.primary,
                    fontSize: '13px',
                    borderBottom: `1px solid ${theme.palette.divider}`
                  }}>
                    {formatDateHeader(date)}
                  </TableCell>
                </TableRow>
                {groupedTransactions[date].map((transaction, index) => (
                  <TransactionRow
                    key={`${transaction.identifier}-${index}`}
                    transaction={transaction}
                    theme={theme}
                    editingTransaction={editingTransaction}
                    editCategory={editCategory}
                    setEditCategory={setEditCategory}
                    availableCategories={availableCategories}
                    applyToAll={applyToAll}
                    setApplyToAll={setApplyToAll}
                    handleRowClick={handleRowClick}
                    handleEditClick={handleEditClick}
                    editPrice={editPrice}
                    setEditPrice={setEditPrice}
                    handleSaveClick={handleSaveClick}
                    handleCancelClick={handleCancelClick}
                    setConfirmDeleteTransaction={setConfirmDeleteTransaction}
                    getCardVendor={getCardVendor}
                    getCardNickname={getCardNickname}
                  />
                ))}
              </React.Fragment>
            ))
          ) : (
            transactions.map((transaction, index) => (
              <TransactionRow
                key={index}
                transaction={transaction}
                theme={theme}
                editingTransaction={editingTransaction}
                editCategory={editCategory}
                setEditCategory={setEditCategory}
                availableCategories={availableCategories}
                applyToAll={applyToAll}
                setApplyToAll={setApplyToAll}
                handleRowClick={handleRowClick}
                handleEditClick={handleEditClick}
                editPrice={editPrice}
                setEditPrice={setEditPrice}
                handleSaveClick={handleSaveClick}
                handleCancelClick={handleCancelClick}
                setConfirmDeleteTransaction={setConfirmDeleteTransaction}
                getCardVendor={getCardVendor}
                getCardNickname={getCardNickname}
              />
            ))
          )}
        </TableBody>
      </Table>

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

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={!!confirmDeleteTransaction}
        onClose={() => setConfirmDeleteTransaction(null)}
        onConfirm={handleDeleteClick}
        transaction={confirmDeleteTransaction}
      />
    </Paper>
  );
};

// Extracted TransactionRow component for cleaner code
const TransactionRow = ({
  transaction,
  theme,
  editingTransaction,
  editCategory,
  setEditCategory,
  availableCategories,
  applyToAll,
  setApplyToAll,
  handleRowClick,
  handleEditClick,
  editPrice,
  setEditPrice,
  handleSaveClick,
  handleCancelClick,
  setConfirmDeleteTransaction,
  getCardVendor,
  getCardNickname
}: any) => {
  return (
    <TableRow
      onClick={() => handleRowClick(transaction)}
      style={TABLE_ROW_HOVER_STYLE}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = getTableRowHoverBackground(theme);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <TableCell style={getTableBodyCellStyle(theme)}>
        {transaction.name}
      </TableCell>
      <TableCell style={getTableBodyCellStyle(theme)}>
        {editingTransaction?.identifier === transaction.identifier ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Autocomplete
              value={editCategory}
              onChange={(event, newValue) => setEditCategory(newValue || '')}
              onInputChange={(event, newInputValue) => setEditCategory(newInputValue)}
              freeSolo
              options={availableCategories}
              size="small"
              sx={{
                minWidth: 150,
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
                      padding: '8px 12px',
                    },
                  }}
                />
              )}
            />
            {editCategory !== editingTransaction.category && (
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
              fontWeight: '400',
              fontSize: '13px'
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleRowClick(transaction);
              handleEditClick(transaction);
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
            {transaction.category}
          </span>
        )}
      </TableCell>
      <TableCell
        align="right"
        style={{
          ...getTableBodyCellStyle(theme),
          color: transaction.price < 0 ? '#ef4444' : '#10b981',
          fontWeight: 600
        }}
      >
        {editingTransaction?.identifier === transaction.identifier ? (
          <TextField
            value={editPrice}
            onChange={(e) => setEditPrice(e.target.value)}
            size="small"
            type="number"
            inputProps={{
              style: {
                textAlign: 'right',
                color: transaction.price < 0 ? '#F87171' : '#4ADE80'
              }
            }}
            sx={{
              width: '100px',
              '& .MuiOutlinedInput-root': {
                '& fieldset': {
                  borderColor: transaction.price < 0 ? '#F87171' : '#4ADE80',
                },
              },
            }}
          />
        ) : (
          (() => {
            // Price is already the per-installment amount (combineInstallments: false)
            const displayAmount = Math.abs(transaction.price);

            // Check if original currency is different from ILS (foreign transaction)
            const isForeignCurrency = transaction.original_currency &&
              !['ILS', '₪', 'NIS'].includes(transaction.original_currency);

            // Get the appropriate currency symbol
            const getCurrencySymbol = (currency?: string) => {
              if (!currency) return '₪';
              if (['EUR', '€'].includes(currency)) return '€';
              if (['USD', '$'].includes(currency)) return '$';
              if (['GBP', '£'].includes(currency)) return '£';
              if (['ILS', '₪', 'NIS'].includes(currency)) return '₪';
              return currency + ' ';
            };

            // For foreign currency transactions, show ILS amount with original amount below
            if (isForeignCurrency && transaction.original_amount) {
              const symbol = getCurrencySymbol(transaction.original_currency);
              // original_amount is also already the per-installment amount
              const originalDisplayAmount = Math.abs(transaction.original_amount);

              return (
                <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span>₪{formatNumber(displayAmount)}</span>
                  <span style={{
                    fontSize: '11px',
                    color: theme.palette.text.secondary
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
      <TableCell style={{ ...getTableBodyCellStyle(theme), textAlign: 'center' }}>
        {transaction.installments_total && transaction.installments_total > 1 ? (
          <span style={{
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            color: '#6366f1',
            padding: '4px 8px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500'
          }}>
            {transaction.installments_number}/{transaction.installments_total}
          </span>
        ) : (
          <span style={{ color: theme.palette.text.disabled, fontSize: '12px' }}>—</span>
        )}
      </TableCell>
      <TableCell style={{ ...getTableBodyCellStyle(theme), fontSize: '12px' }}>
        {transaction.account_number ? (
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <CardVendorIcon vendor={getCardVendor(transaction.account_number)} size={24} />
            <span style={{
              fontWeight: '500',
              color: '#334155',
              backgroundColor: 'rgba(148, 163, 184, 0.1)',
              padding: '4px 8px',
              borderRadius: '6px'
            }}>
              {getCardNickname(transaction.account_number) ? (
                <>
                  {getCardNickname(transaction.account_number)}
                  <span style={{ color: '#64748b', marginLeft: '4px', fontSize: '11px' }}>
                    •••• {transaction.account_number.slice(-4)}
                  </span>
                </>
              ) : (
                `•••• ${transaction.account_number.slice(-4)}`
              )}
            </span>
          </Box>
        ) : (
          <span style={{ color: theme.palette.text.disabled }}>—</span>
        )}
      </TableCell>
      <TableCell style={{ ...getTableBodyCellStyle(theme), color: theme.palette.text.secondary }}>
        {dateUtils.formatDate(transaction.date)}
      </TableCell>
      <TableCell align="right" style={getTableBodyCellStyle(theme)}>
        {editingTransaction?.identifier === transaction.identifier ? (
          <>
            <IconButton
              onClick={handleSaveClick}
              sx={{ color: '#4ADE80' }}
            >
              <CheckIcon />
            </IconButton>
            <IconButton
              onClick={handleCancelClick}
              sx={{ color: '#ef4444' }}
            >
              <CloseIcon />
            </IconButton>
          </>
        ) : (
          <>
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                handleRowClick(transaction);
                handleEditClick(transaction);
              }}
              sx={{ color: '#3b82f6' }}
            >
              <EditIcon />
            </IconButton>
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDeleteTransaction(transaction);
              }}
              sx={{ color: '#ef4444' }}
            >
              <DeleteIcon />
            </IconButton>
          </>
        )}
      </TableCell>
    </TableRow>
  );
};

export default TransactionsTable;