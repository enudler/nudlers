import React from 'react';
import { logger } from '../../../utils/client-logger';
import { useTheme } from '@mui/material/styles';
import { Table, TableBody, TableCell, TableHead, TableRow, Paper, Box, Typography, IconButton, TextField, Autocomplete, Snackbar, Alert, FormControlLabel, Checkbox, Tooltip, TableSortLabel } from '@mui/material';
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
import CategoryAutocomplete from '../../CategoryAutocomplete';
import AccountDisplay from '../../AccountDisplay';

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
  groupByDate?: boolean;
  disableWrapper?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;
}

const TransactionsTable: React.FC<TransactionsTableProps> = ({
  transactions,
  isLoading,
  onDelete,
  onUpdate,
  groupByDate,
  disableWrapper,
  sortBy,
  sortOrder,
  onSort
}) => {
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
      // Use local date for grouping to match displayed row dates
      const d = new Date(transaction.date);
      const dateKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;

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
    // dateStr is YYYY-MM-DD in local time
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const isToday = date.getTime() === today.getTime();
    const isYesterday = date.getTime() === yesterday.getTime();

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

  const tableHeaderBaseStyle = getTableHeaderCellStyle(theme);
  const widgetHeaderStyle = disableWrapper ? { ...tableHeaderBaseStyle, fontSize: '0.7rem', padding: '8px 12px' } : tableHeaderBaseStyle;

  const renderSortableHeader = (label: string, field: string, align: 'left' | 'right' = 'left') => {
    const isSorted = sortBy === field;
    return (
      <TableCell
        align={align}
        style={{
          ...widgetHeaderStyle,
          cursor: onSort ? 'pointer' : 'default',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 1)' : '#f8fafc'
        }}
        sortDirection={isSorted ? sortOrder : false}
      >
        {onSort ? (
          <TableSortLabel
            active={isSorted}
            direction={isSorted ? sortOrder : 'desc'}
            onClick={() => onSort(field)}
            sx={{
              color: 'inherit !important',
              '& .MuiTableSortLabel-icon': {
                color: 'inherit !important',
                opacity: isSorted ? 1 : 0.3
              }
            }}
          >
            {label}
          </TableSortLabel>
        ) : (
          label
        )}
      </TableCell>
    );
  };

  const Content = (
    <Table
      onClick={handleTableClick}
      size={disableWrapper ? "small" : "medium"}
      stickyHeader
    >
      <TableHead>
        <TableRow>
          {renderSortableHeader('Description', 'name')}
          {renderSortableHeader('Category', 'category')}
          {renderSortableHeader('Amount', 'price', 'right')}
          {!disableWrapper && (
            <TableCell
              style={{
                ...widgetHeaderStyle,
                position: 'sticky',
                top: 0,
                zIndex: 10,
                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 1)' : '#f8fafc'
              }}
            >
              Installment
            </TableCell>
          )}
          {renderSortableHeader('Card', 'account_number')}
          {!disableWrapper && renderSortableHeader('Date', 'date')}
          {!disableWrapper && (
            <TableCell
              align="right"
              style={{
                ...widgetHeaderStyle,
                position: 'sticky',
                top: 0,
                zIndex: 10,
                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 1)' : '#f8fafc'
              }}
            >
              Actions
            </TableCell>
          )}
        </TableRow>
      </TableHead>
      <TableBody>
        {groupByDate ? (
          sortedDates.map(date => (
            <React.Fragment key={date}>
              <TableRow sx={{
                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.95)' : 'rgba(241, 245, 249, 0.95)',
                position: 'sticky',
                top: disableWrapper ? 32 : 53, // Offset for the main header (approx heights)
                zIndex: 9,
                backdropFilter: 'blur(8px)'
              }}>
                <TableCell colSpan={disableWrapper ? 4 : 7} sx={{
                  padding: disableWrapper ? '4px 12px' : '8px 16px',
                  fontWeight: 700,
                  color: theme.palette.text.primary,
                  fontSize: disableWrapper ? '11px' : '13px',
                  borderBottom: `1px solid ${theme.palette.divider}`,
                  backgroundColor: 'inherit'
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
                  isWidget={disableWrapper}
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
              isWidget={disableWrapper}
            />
          ))
        )}
      </TableBody>
    </Table>
  );

  if (disableWrapper) {
    return (
      <Box sx={{ width: '100%', overflow: 'hidden' }}>
        {Content}
        {/* Snackbar and Dialog still needed */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={5000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setSnackbar({ ...snackbar, open: false })}
            severity={snackbar.severity}
            sx={{ borderRadius: '12px' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
        <DeleteConfirmationDialog
          open={!!confirmDeleteTransaction}
          onClose={() => setConfirmDeleteTransaction(null)}
          onConfirm={handleDeleteClick}
          transaction={confirmDeleteTransaction}
        />
      </Box>
    );
  }

  return (
    <Paper sx={{
      width: '100%',
      overflow: 'hidden',
      borderRadius: '24px',
      background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 100%)',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 2px 12px rgba(0, 0, 0, 0.04)',
      border: `1px solid ${theme.palette.divider}`
    }}>
      {Content}


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

import { Theme } from '@mui/material/styles';

interface TransactionRowProps {
  transaction: Transaction;
  theme: Theme;
  editingTransaction: Transaction | null;
  editCategory: string;
  setEditCategory: (val: string) => void;
  availableCategories: string[];
  applyToAll: boolean;
  setApplyToAll: (val: boolean) => void;
  handleRowClick: (t: Transaction) => void;
  handleEditClick: (t: Transaction) => void;
  editPrice: string;
  setEditPrice: (val: string) => void;
  handleSaveClick: () => void;
  handleCancelClick: () => void;
  setConfirmDeleteTransaction: (t: Transaction) => void;
  getCardVendor: (accountNumber: string | undefined | null) => string | null;
  getCardNickname: (accountNumber: string | undefined | null) => string | null | undefined;
  isWidget?: boolean;
}

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
  getCardNickname,
  isWidget
}: TransactionRowProps) => {
  const cellStyle = {
    ...getTableBodyCellStyle(theme),
    fontSize: isWidget ? '11px' : '0.875rem',
    padding: isWidget ? '4px 8px' : '8px 16px'
  };
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
      <TableCell style={cellStyle}>
        {transaction.name}
      </TableCell>
      <TableCell style={cellStyle}>
        {editingTransaction?.identifier === transaction.identifier ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <CategoryAutocomplete
              value={editCategory}
              onChange={setEditCategory}
              options={availableCategories}
              applyToAll={applyToAll}
              onApplyToAllChange={setApplyToAll}
              showApplyToAll={editCategory !== editingTransaction.category}
            />
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
              fontSize: isWidget ? '10px' : '13px'
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
          ...cellStyle,
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
      {!isWidget && (
        <TableCell style={{ ...cellStyle, textAlign: 'center' }}>
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
      )}
      <TableCell style={cellStyle}>
        <AccountDisplay transaction={transaction} premium={false} compact={isWidget} />
      </TableCell>
      {!isWidget && (
        <TableCell style={{ ...cellStyle, color: theme.palette.text.secondary }}>
          {dateUtils.formatDate(transaction.date)}
        </TableCell>
      )}
      {!isWidget && (
        <TableCell align="right" style={cellStyle}>
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
      )}
    </TableRow>
  );
};

export default TransactionsTable;