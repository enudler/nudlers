import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '../utils/client-logger';
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  Button,
  Chip,
  CircularProgress,
  Alert,
  LinearProgress,
  Skeleton,
  TextField,
  InputAdornment,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  useTheme,
  alpha
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import AddIcon from '@mui/icons-material/Add';
import ModalHeader from './ModalHeader';
import { useCategoryColors } from './CategoryDashboard/utils/categoryUtils';

interface UncategorizedDescription {
  description: string;
  count: number;
  totalAmount: number;
}

interface Transaction {
  name: string;
  price: number;
  date: string;
  processed_date: string;
  vendor: string;
  vendor_nickname?: string;
  account_number?: string;
  card6_digits?: string;
  installments_number?: number;
  installments_total?: number;
  original_amount?: number;
  original_currency?: string;
}

interface QuickCategoryModalProps {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

const QuickCategoryModal: React.FC<QuickCategoryModalProps> = ({
  open,
  onClose,
  onComplete
}) => {
  const theme = useTheme();
  const [descriptions, setDescriptions] = useState<UncategorizedDescription[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const categoryColors = useCategoryColors();

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [descriptionsRes, categoriesRes] = await Promise.all([
        fetch('/api/uncategorized_descriptions'),
        fetch('/api/get_all_categories')
      ]);

      if (!descriptionsRes.ok || !categoriesRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const descriptionsData = await descriptionsRes.json();
      const categoriesData = await categoriesRes.json();

      setDescriptions(descriptionsData);
      setCategories(categoriesData);
      setCurrentIndex(0);
    } catch (err) {
      logger.error('Error fetching data', err as Error);
      setError('Failed to load data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchData();
      setTotalProcessed(0);
    }
  }, [open, fetchData]);

  // Fetch transactions when current description changes
  const fetchTransactions = useCallback(async (description: string) => {
    try {
      setIsLoadingTransactions(true);
      const response = await fetch(
        `/api/transactions_by_description?description=${encodeURIComponent(description)}&uncategorizedOnly=true`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }
      const data = await response.json();
      setTransactions(data);
    } catch (err) {
      logger.error('Error fetching transactions', err as Error);
      setTransactions([]);
    } finally {
      setIsLoadingTransactions(false);
    }
  }, []);

  useEffect(() => {
    const currentDescription = descriptions[currentIndex];
    if (currentDescription?.description) {
      fetchTransactions(currentDescription.description);
    } else {
      setTransactions([]);
    }
  }, [currentIndex, descriptions, fetchTransactions]);

  const handleCategorySelect = async (category: string) => {
    if (!descriptions[currentIndex]) return;

    const description = descriptions[currentIndex].description;

    try {
      setIsSaving(true);
      setError(null);

      const response = await fetch('/api/update_category_by_description', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description,
          newCategory: category,
          createRule: true
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update category');
      }

      const result = await response.json();
      setSuccess(`Updated ${result.transactionsUpdated} transaction(s) to "${category}"`);
      setTotalProcessed(prev => prev + 1);

      // Move to next description
      moveToNext();

      // Clear success message after a short delay
      setTimeout(() => setSuccess(null), 1500);
    } catch (err) {
      logger.error('Error updating category', err as Error);
      setError(err instanceof Error ? err.message : 'Failed to update category');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    moveToNext();
  };

  const handleAddNewCategory = () => {
    const trimmedCategory = newCategoryInput.trim();
    if (trimmedCategory && !categories.includes(trimmedCategory)) {
      // Add to categories list and select it
      setCategories(prev => [...prev, trimmedCategory]);
      handleCategorySelect(trimmedCategory);
      setNewCategoryInput('');
      setShowNewCategoryInput(false);
    } else if (categories.includes(trimmedCategory)) {
      // Category already exists, just select it
      handleCategorySelect(trimmedCategory);
      setNewCategoryInput('');
      setShowNewCategoryInput(false);
    }
  };

  const moveToNext = () => {
    if (currentIndex < descriptions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // All done!
      onComplete?.();
    }
  };

  const handleClose = () => {
    if (totalProcessed > 0) {
      window.dispatchEvent(new CustomEvent('dataRefresh'));
    }
    onClose();
  };

  const currentDescription = descriptions[currentIndex];
  const remaining = descriptions.length - currentIndex;
  const progress = descriptions.length > 0
    ? ((currentIndex) / descriptions.length) * 100
    : 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        style: {
          backgroundColor: theme.palette.mode === 'dark' ? theme.palette.background.paper : '#ffffff',
          borderRadius: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          minHeight: '600px',
          maxHeight: '90vh',
          backgroundImage: theme.palette.mode === 'dark' ? 'linear-gradient(rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05))' : 'none',
        }
      }}
    >
      <ModalHeader
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <span>Quick Categorize</span>
            {descriptions.length > 0 && (
              <Chip
                label={`${remaining} remaining`}
                size="small"
                sx={{
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  color: '#3b82f6',
                  fontWeight: 600
                }}
              />
            )}
          </Box>
        }
        onClose={handleClose}
      />

      {descriptions.length > 0 && (
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 4,
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            '& .MuiLinearProgress-bar': {
              backgroundColor: '#3b82f6'
            }
          }}
        />
      )}

      <DialogContent sx={{ padding: '24px 32px 32px' }}>
        {error && (
          <Alert severity="error" sx={{ marginBottom: 2 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert
            severity="success"
            icon={<CheckIcon />}
            sx={{ marginBottom: 2 }}
          >
            {success}
          </Alert>
        )}

        {isLoading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Skeleton variant="rounded" height={120} />
            <Skeleton variant="rounded" height={200} />
          </Box>
        ) : descriptions.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '64px 32px',
              textAlign: 'center'
            }}
          >
            <CheckIcon sx={{ fontSize: 64, color: '#22c55e', marginBottom: 2 }} />
            <Typography variant="h5" sx={{ fontWeight: 600, marginBottom: 1 }}>
              All Done!
            </Typography>
            <Typography color="textSecondary">
              All transactions have been categorized.
            </Typography>
            {totalProcessed > 0 && (
              <Typography color="textSecondary" sx={{ marginTop: 1 }}>
                You categorized {totalProcessed} description(s) in this session.
              </Typography>
            )}
          </Box>
        ) : !currentDescription ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '64px 32px',
              textAlign: 'center'
            }}
          >
            <CheckIcon sx={{ fontSize: 64, color: '#22c55e', marginBottom: 2 }} />
            <Typography variant="h5" sx={{ fontWeight: 600, marginBottom: 1 }}>
              Session Complete!
            </Typography>
            <Typography color="textSecondary">
              You categorized {totalProcessed} description(s).
            </Typography>
          </Box>
        ) : (
          <>
            {/* Current Description Card */}
            <Box
              sx={{
                backgroundColor: theme.palette.mode === 'dark' ? alpha(theme.palette.background.default, 0.5) : '#f8fafc',
                borderRadius: '16px',
                padding: '24px',
                marginBottom: '24px',
                border: `1px solid ${theme.palette.divider}`,
                position: 'relative'
              }}
            >
              {isSaving && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '16px',
                    zIndex: 1
                  }}
                >
                  <CircularProgress size={32} />
                </Box>
              )}

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 600,
                    color: theme.palette.text.primary,
                    wordBreak: 'break-word'
                  }}
                >
                  {currentDescription.description}
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexShrink: 0, marginLeft: 2 }}>
                  <Chip
                    label={`${currentDescription.count} transactions`}
                    size="small"
                    sx={{
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      color: '#3b82f6',
                      fontWeight: 600
                    }}
                  />
                  <Chip
                    label={formatCurrency(currentDescription.totalAmount)}
                    size="small"
                    sx={{
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      color: '#ef4444',
                      fontWeight: 600
                    }}
                  />
                </Box>
              </Box>

              {/* Transactions Table */}
              {isLoadingTransactions ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', padding: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : transactions.length > 0 ? (
                <TableContainer
                  component={Paper}
                  sx={{
                    maxHeight: 200,
                    boxShadow: 'none',
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: '8px',
                    backgroundColor: theme.palette.mode === 'dark' ? 'transparent' : '#fff'
                  }}
                >
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, backgroundColor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.05) : '#f1f5f9', color: theme.palette.text.secondary }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 600, backgroundColor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.05) : '#f1f5f9', color: theme.palette.text.secondary }}>Amount</TableCell>
                        <TableCell sx={{ fontWeight: 600, backgroundColor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.05) : '#f1f5f9', color: theme.palette.text.secondary }}>Card</TableCell>
                        <TableCell sx={{ fontWeight: 600, backgroundColor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.05) : '#f1f5f9', color: theme.palette.text.secondary }}>Details</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {transactions.map((tx, idx) => (
                        <TableRow key={idx} sx={{ '&:hover': { backgroundColor: theme.palette.mode === 'dark' ? alpha(theme.palette.primary.main, 0.1) : 'rgba(59, 130, 246, 0.05)' } }}>
                          <TableCell sx={{ color: theme.palette.text.secondary, fontSize: '13px' }}>
                            {formatDate(tx.date)}
                          </TableCell>
                          <TableCell sx={{ color: tx.price < 0 ? '#ef4444' : '#22c55e', fontWeight: 600, fontSize: '13px' }}>
                            {formatCurrency(Math.abs(tx.price))}
                          </TableCell>
                          <TableCell sx={{ color: theme.palette.text.secondary, fontSize: '13px' }}>
                            {tx.vendor_nickname || tx.vendor}
                            {tx.card6_digits && ` (${tx.card6_digits.slice(-4)})`}
                          </TableCell>
                          <TableCell sx={{ color: theme.palette.text.secondary, fontSize: '13px' }}>
                            {tx.installments_total && tx.installments_total > 1 && (
                              <Chip
                                label={`${tx.installments_number}/${tx.installments_total}`}
                                size="small"
                                sx={{
                                  height: '20px',
                                  fontSize: '11px',
                                  backgroundColor: 'rgba(139, 92, 246, 0.1)',
                                  color: '#8b5cf6'
                                }}
                              />
                            )}
                            {tx.original_currency && tx.original_currency !== 'ILS' && (
                              <Chip
                                label={`${tx.original_amount} ${tx.original_currency}`}
                                size="small"
                                sx={{
                                  height: '20px',
                                  fontSize: '11px',
                                  marginLeft: tx.installments_total && tx.installments_total > 1 ? '4px' : 0,
                                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                                  color: '#f59e0b'
                                }}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography variant="body2" color="textSecondary" sx={{ textAlign: 'center', padding: 2 }}>
                  No transactions found
                </Typography>
              )}
            </Box>

            {/* Skip Button */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <Button
                onClick={handleSkip}
                disabled={isSaving}
                startIcon={<SkipNextIcon />}
                sx={{
                  color: theme.palette.text.secondary,
                  textTransform: 'none',
                  fontWeight: 500,
                  '&:hover': {
                    backgroundColor: 'rgba(100, 116, 139, 0.1)'
                  }
                }}
              >
                Skip for now
              </Button>
            </Box>

            {/* Category Buttons */}
            <Typography
              variant="subtitle2"
              sx={{ color: theme.palette.text.secondary, marginBottom: '12px', fontWeight: 500 }}
            >
              Select a category:
            </Typography>

            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                maxHeight: '280px',
                overflow: 'auto',
                padding: '4px'
              }}
            >
              {categories.map((category) => (
                <Button
                  key={category}
                  onClick={() => handleCategorySelect(category)}
                  disabled={isSaving}
                  sx={{
                    backgroundColor: categoryColors[category] || '#3b82f6',
                    color: '#fff',
                    textTransform: 'none',
                    fontWeight: 600,
                    padding: '10px 20px',
                    borderRadius: '12px',
                    fontSize: '14px',
                    minWidth: 'auto',
                    transition: 'all 0.2s ease-in-out',
                    '&:hover': {
                      backgroundColor: categoryColors[category] || '#3b82f6',
                      filter: 'brightness(1.1)',
                      transform: 'translateY(-2px)',
                      boxShadow: `0 4px 12px ${categoryColors[category] || '#3b82f6'}40`
                    },
                    '&:active': {
                      transform: 'translateY(0)'
                    },
                    '&:disabled': {
                      backgroundColor: theme.palette.action.disabledBackground,
                      color: theme.palette.text.disabled
                    }
                  }}
                >
                  {category}
                </Button>
              ))}

              {/* Add New Category Button/Input */}
              {showNewCategoryInput ? (
                <TextField
                  size="small"
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newCategoryInput.trim()) {
                      handleAddNewCategory();
                    } else if (e.key === 'Escape') {
                      setShowNewCategoryInput(false);
                      setNewCategoryInput('');
                    }
                  }}
                  autoFocus
                  placeholder="New category name"
                  disabled={isSaving}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={handleAddNewCategory}
                          disabled={!newCategoryInput.trim() || isSaving}
                          sx={{ color: '#22c55e' }}
                        >
                          <CheckIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    )
                  }}
                  sx={{
                    minWidth: '200px',
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '12px',
                      backgroundColor: theme.palette.mode === 'dark' ? theme.palette.background.default : '#fff',
                      '& fieldset': {
                        borderColor: '#22c55e',
                        borderWidth: '2px'
                      },
                      '&:hover fieldset': {
                        borderColor: '#16a34a'
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#22c55e'
                      }
                    }
                  }}
                />
              ) : (
                <Button
                  onClick={() => setShowNewCategoryInput(true)}
                  disabled={isSaving}
                  startIcon={<AddIcon />}
                  sx={{
                    backgroundColor: 'transparent',
                    color: '#22c55e',
                    border: '2px dashed #22c55e',
                    textTransform: 'none',
                    fontWeight: 600,
                    padding: '8px 16px',
                    borderRadius: '12px',
                    fontSize: '14px',
                    minWidth: 'auto',
                    transition: 'all 0.2s ease-in-out',
                    '&:hover': {
                      backgroundColor: 'rgba(34, 197, 94, 0.1)',
                      borderColor: '#16a34a',
                      transform: 'translateY(-2px)'
                    },
                    '&:disabled': {
                      borderColor: theme.palette.action.disabled,
                      color: theme.palette.text.disabled
                    }
                  }}
                >
                  Add New
                </Button>
              )}
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default QuickCategoryModal;
