import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Checkbox,
  TextField,
  IconButton,
  Divider,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Switch,
  FormControlLabel,
  Card,
  CardContent,
  Grid,
  useTheme
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MergeIcon from '@mui/icons-material/Merge';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import CheckIcon from '@mui/icons-material/Check';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useCategoryColors } from '../utils/categoryUtils';
import ModalHeader from '../../ModalHeader';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import LinearProgress from '@mui/material/LinearProgress';
import InputAdornment from '@mui/material/InputAdornment';
import Badge from '@mui/material/Badge';
import { useCategories } from '../utils/useCategories';
import { logger } from '../../../utils/client-logger';

interface Category {
  name: string;
  count: number;
}

interface CategorizationRule {
  id: number;
  name_pattern: string;
  target_category: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface CategoryMapping {
  id: number;
  source_category: string;
  target_category: string;
  created_at: string;
}

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

interface CategoryManagementModalProps {
  open: boolean;
  onClose: () => void;
  onCategoriesUpdated: () => void;
}

const CategoryManagementModal: React.FC<CategoryManagementModalProps> = ({
  open,
  onClose,
  onCategoriesUpdated
}) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState(0);
  const [rules, setRules] = useState<CategorizationRule[]>([]);
  const [isLoadingRules, setIsLoadingRules] = useState(false);
  const [editingRule, setEditingRule] = useState<CategorizationRule | null>(null);
  const [newRule, setNewRule] = useState({ name_pattern: '', target_category: '' });
  const [isApplyingRules, setIsApplyingRules] = useState(false);
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameNewName, setRenameNewName] = useState('');
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const [deleteOptions, setDeleteOptions] = useState({ deleteRules: true, deleteBudget: true });
  const [mappings, setMappings] = useState<CategoryMapping[]>([]);
  const [isLoadingMappings, setIsLoadingMappings] = useState(false);
  const [editingMapping, setEditingMapping] = useState<CategoryMapping | null>(null);
  const [editMappingTarget, setEditMappingTarget] = useState('');
  const [newMappingSource, setNewMappingSource] = useState('');
  const [newMappingTarget, setNewMappingTarget] = useState('');
  const categoryColors = useCategoryColors();
  const theme = useTheme();

  // Quick Categorize state
  const [uncategorizedDescriptions, setUncategorizedDescriptions] = useState<UncategorizedDescription[]>([]);
  const [currentQuickIndex, setCurrentQuickIndex] = useState(0);
  const [isLoadingQuick, setIsLoadingQuick] = useState(false);
  const [isSavingQuick, setIsSavingQuick] = useState(false);
  const [quickTransactions, setQuickTransactions] = useState<Transaction[]>([]);
  const [isLoadingQuickTransactions, setIsLoadingQuickTransactions] = useState(false);
  const [totalQuickProcessed, setTotalQuickProcessed] = useState(0);
  const [newQuickCategoryInput, setNewQuickCategoryInput] = useState('');
  const [showNewQuickCategoryInput, setShowNewQuickCategoryInput] = useState(false);

  useEffect(() => {
    if (open) {
      fetchCategories();
      fetchRules();
      fetchUncategorizedDescriptions();
      fetchMappings();
    }
  }, [open]);

  // Reset quick categorize state when switching tabs
  useEffect(() => {
    if (currentTab === 3 && uncategorizedDescriptions.length > 0) {
      fetchQuickTransactions(uncategorizedDescriptions[currentQuickIndex]?.description);
    }
  }, [currentTab, currentQuickIndex, uncategorizedDescriptions]);

  const fetchUncategorizedDescriptions = async () => {
    try {
      setIsLoadingQuick(true);
      const response = await fetch('/api/uncategorized_descriptions');
      if (!response.ok) throw new Error('Failed to fetch uncategorized descriptions');
      const data = await response.json();
      setUncategorizedDescriptions(data);
      setCurrentQuickIndex(0);
      setTotalQuickProcessed(0);
    } catch (error) {
      logger.error('Error fetching uncategorized descriptions', error);
    } finally {
      setIsLoadingQuick(false);
    }
  };

  const fetchQuickTransactions = async (description: string) => {
    if (!description) {
      setQuickTransactions([]);
      return;
    }
    try {
      setIsLoadingQuickTransactions(true);
      const response = await fetch(
        `/api/transactions_by_description?description=${encodeURIComponent(description)}&uncategorizedOnly=true`
      );
      if (!response.ok) throw new Error('Failed to fetch transactions');
      const data = await response.json();
      setQuickTransactions(data);
    } catch (error) {
      logger.error('Error fetching transactions', error, { description });
      setQuickTransactions([]);
    } finally {
      setIsLoadingQuickTransactions(false);
    }
  };

  const handleQuickCategorySelect = async (category: string) => {
    const currentDescription = uncategorizedDescriptions[currentQuickIndex];
    if (!currentDescription) return;

    try {
      setIsSavingQuick(true);
      setError(null);

      const response = await fetch('/api/update_category_by_description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: currentDescription.description,
          newCategory: category,
          createRule: true
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update category');
        } else {
          throw new Error(`Failed to update category: ${response.status} ${response.statusText}`);
        }
      }

      const result = await response.json();
      setSuccess(`Updated ${result.transactionsUpdated} transaction(s) to "${category}"`);
      setTotalQuickProcessed(prev => prev + 1);

      // Move to next description
      moveToNextQuick();

      // Refresh categories
      await fetchCategories();

      setTimeout(() => setSuccess(null), 1500);
    } catch (error) {
      logger.error('Error updating category', error, {
        description: currentDescription.description,
        newCategory: category
      });
      setError(error instanceof Error ? error.message : 'Failed to update category');
    } finally {
      setIsSavingQuick(false);
    }
  };

  const handleQuickSkip = () => {
    moveToNextQuick();
  };

  const handleAddNewQuickCategory = () => {
    const trimmedCategory = newQuickCategoryInput.trim();
    if (trimmedCategory) {
      handleQuickCategorySelect(trimmedCategory);
      setNewQuickCategoryInput('');
      setShowNewQuickCategoryInput(false);
    }
  };

  const moveToNextQuick = () => {
    if (currentQuickIndex < uncategorizedDescriptions.length - 1) {
      setCurrentQuickIndex(prev => prev + 1);
    }
  };

  const formatQuickCurrency = (amount: number) => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatQuickDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  };

  const fetchCategories = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/get_all_categories');
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        const errorMessage = `Failed to fetch categories: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`;
        throw new Error(errorMessage);
      }

      const categoryNames = await response.json();

      // Get transaction counts for each category
      const categoriesWithCounts = await Promise.all(
        categoryNames.map(async (name: string) => {
          try {
            const countResponse = await fetch(`/api/category_expenses?all=true&category=${encodeURIComponent(name)}`);
            if (!countResponse.ok) {
              console.warn(`Failed to fetch count for category "${name}": ${countResponse.status}`);
              return { name, count: 0 };
            }
            const transactions = await countResponse.json();
            return {
              name,
              count: Array.isArray(transactions) ? transactions.length : 0
            };
          } catch (err) {
            console.warn(`Error fetching count for category "${name}":`, err);
            return { name, count: 0 };
          }
        })
      );

      setCategories(categoriesWithCounts.sort((a, b) => b.count - a.count));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error fetching categories:', errorMessage);
      setError(`Failed to load categories: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRules = async () => {
    try {
      setIsLoadingRules(true);
      const response = await fetch('/api/categorization_rules');
      if (!response.ok) throw new Error('Failed to fetch rules');

      const rulesData = await response.json();
      setRules(rulesData);
    } catch (error) {
      logger.error('Error fetching rules', error);
      setError('Failed to load rules');
    } finally {
      setIsLoadingRules(false);
    }
  };

  const fetchMappings = async () => {
    try {
      setIsLoadingMappings(true);
      const response = await fetch('/api/category_mappings');
      if (!response.ok) throw new Error('Failed to fetch mappings');

      const data = await response.json();
      setMappings(data);
    } catch (error) {
      logger.error('Error fetching mappings', error);
      setError('Failed to load category mappings');
    } finally {
      setIsLoadingMappings(false);
    }
  };

  const handleDeleteMapping = async (mappingId: number) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/category_mappings', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: mappingId }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete mapping');
      }

      setSuccess('Mapping removed successfully');
      await fetchMappings();

      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to delete mapping');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditMapping = async (mapping: CategoryMapping) => {
    if (!editMappingTarget.trim()) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/category_mappings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_category: mapping.source_category,
          target_category: editMappingTarget.trim()
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update mapping');
      }

      setSuccess('Mapping updated successfully');
      setEditingMapping(null);
      setEditMappingTarget('');
      await fetchMappings();

      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update mapping');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddMapping = async () => {
    if (!newMappingSource.trim() || !newMappingTarget.trim()) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/category_mappings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_category: newMappingSource.trim(),
          target_category: newMappingTarget.trim()
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create mapping');
      }

      setSuccess('Mapping created successfully');
      setNewMappingSource('');
      setNewMappingTarget('');
      await fetchMappings();

      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      logger.error('Error creating mapping', error);
      setError(error instanceof Error ? error.message : 'Failed to create mapping');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategoryToggle = (categoryName: string) => {
    setSelectedCategories(prev =>
      prev.includes(categoryName)
        ? prev.filter(name => name !== categoryName)
        : [...prev, categoryName]
    );
  };

  const handleMerge = async () => {
    if (selectedCategories.length < 2) {
      setError('Please select at least 2 categories to merge');
      return;
    }

    if (!newCategoryName.trim()) {
      setError('Please enter a name for the new merged category');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Call the merge API
      const response = await fetch('/api/merge_categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceCategories: selectedCategories,
          newCategoryName: newCategoryName.trim()
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to merge categories');
        } else {
          throw new Error(`Failed to merge categories: ${response.status} ${response.statusText}`);
        }
      }

      setSuccess(`Successfully merged ${selectedCategories.length} categories into "${newCategoryName}"`);
      setSelectedCategories([]);
      setNewCategoryName('');

      // Refresh categories and mappings list
      await fetchCategories();
      await fetchMappings();

      // Notify parent component
      onCategoriesUpdated();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      logger.error('Error merging categories', error, {
        categories: selectedCategories,
        targetName: newCategoryName
      });
      setError(error instanceof Error ? error.message : 'Failed to merge categories');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    // Trigger refresh if any quick categorizations were done
    if (totalQuickProcessed > 0) {
      onCategoriesUpdated();
    }

    setSelectedCategories([]);
    setNewCategoryName('');
    setError(null);
    setSuccess(null);
    setCurrentTab(0);
    setEditingRule(null);
    setNewRule({ name_pattern: '', target_category: '' });
    setRenamingCategory(null);
    setRenameNewName('');
    setDeletingCategory(null);
    setDeleteOptions({ deleteRules: true, deleteBudget: true });
    setMappings([]);

    // Reset quick categorize state
    setCurrentQuickIndex(0);
    setTotalQuickProcessed(0);
    setNewQuickCategoryInput('');
    setShowNewQuickCategoryInput(false);

    onClose();
  };

  const handleRenameCategory = async () => {
    if (!renamingCategory || !renameNewName.trim()) {
      setError('Please enter a new category name');
      return;
    }

    if (renamingCategory === renameNewName.trim()) {
      setError('New category name must be different from the current name');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/rename_category', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          oldName: renamingCategory,
          newName: renameNewName.trim()
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to rename category');
        } else {
          throw new Error(`Failed to rename category: ${response.status} ${response.statusText}`);
        }
      }

      const result = await response.json();
      setSuccess(`Successfully renamed "${renamingCategory}" to "${renameNewName.trim()}" (${result.transactionsUpdated} transactions updated)`);
      setRenamingCategory(null);
      setRenameNewName('');

      // Refresh categories list
      await fetchCategories();

      // Notify parent component
      onCategoriesUpdated();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      logger.error('Error renaming category', error, {
        oldName: renamingCategory,
        newName: renameNewName.trim()
      });
      setError(error instanceof Error ? error.message : 'Failed to rename category');
    } finally {
      setIsLoading(false);
    }
  };

  const openRenameDialog = (categoryName: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setRenamingCategory(categoryName);
    setRenameNewName(categoryName);
  };

  const openDeleteDialog = (categoryName: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setDeletingCategory(categoryName);
    setDeleteOptions({ deleteRules: true, deleteBudget: true });
  };

  const handleDeleteCategory = async () => {
    if (!deletingCategory) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/delete_category', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          categoryName: deletingCategory,
          deleteRules: deleteOptions.deleteRules,
          deleteBudget: deleteOptions.deleteBudget
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to delete category');
        } else {
          throw new Error(`Failed to delete category: ${response.status} ${response.statusText}`);
        }
      }

      const result = await response.json();
      setSuccess(`Successfully deleted "${deletingCategory}" (${result.transactionsUncategorized} transactions uncategorized)`);
      setDeletingCategory(null);

      // Refresh categories list
      await fetchCategories();

      // Notify parent component
      onCategoriesUpdated();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      logger.error('Error deleting category', error, {
        category: deletingCategory
      });
      setError(error instanceof Error ? error.message : 'Failed to delete category');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRule = async () => {
    if (!newRule.name_pattern.trim() || !newRule.target_category.trim()) {
      setError('Please enter both pattern and category');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/categorization_rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newRule),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create rule');
        } else {
          throw new Error(`Failed to create rule: ${response.status} ${response.statusText}`);
        }
      }

      setSuccess('Rule created successfully');
      setNewRule({ name_pattern: '', target_category: '' });
      await fetchRules();

      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      logger.error('Error creating rule', error, {
        category: newRule.target_category,
        pattern: newRule.name_pattern
      });
      setError(error instanceof Error ? error.message : 'Failed to create rule');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateRule = async (rule: CategorizationRule) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/categorization_rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(rule),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update rule');
        } else {
          throw new Error(`Failed to update rule: ${response.status} ${response.statusText}`);
        }
      }

      setSuccess('Rule updated successfully');
      setEditingRule(null);
      await fetchRules();

      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      logger.error('Error updating rule', error, { ruleId: rule.id });
      setError(error instanceof Error ? error.message : 'Failed to update rule');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRule = async (ruleId: number) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/categorization_rules', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: ruleId }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to delete rule');
        } else {
          throw new Error(`Failed to delete rule: ${response.status} ${response.statusText}`);
        }
      }

      setSuccess('Rule deleted successfully');
      await fetchRules();

      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      logger.error('Error deleting rule', error, { ruleId });
      setError(error instanceof Error ? error.message : 'Failed to delete rule');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyRules = async () => {
    try {
      setIsApplyingRules(true);
      setError(null);

      const response = await fetch('/api/apply_categorization_rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to apply rules');
        } else {
          throw new Error(`Failed to apply rules: ${response.status} ${response.statusText}`);
        }
      }

      const result = await response.json();
      setSuccess(`Successfully applied ${result.rulesApplied} rules to ${result.transactionsUpdated} transactions`);

      // Refresh categories and notify parent
      await fetchCategories();
      onCategoriesUpdated();

      setTimeout(() => setSuccess(null), 5000);
    } catch (error) {
      logger.error('Error applying rules', error);
      setError(error instanceof Error ? error.message : 'Failed to apply rules');
    } finally {
      setIsApplyingRules(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        style: {
          background: theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, var(--modal-backdrop) 0%, var(--modal-backdrop-alt) 100%)'
            : 'var(--modal-backdrop)',
          borderRadius: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          border: `1px solid ${theme.palette.divider}`
        }
      }}
    >
      <ModalHeader title="Category Management" onClose={handleClose} />

      <DialogContent style={{ padding: '0 24px 24px 24px' }}>
        {error && (
          <Alert severity="error" style={{ marginBottom: '16px' }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" style={{ marginBottom: '16px' }}>
            {success}
          </Alert>
        )}

        <Tabs
          value={currentTab}
          onChange={(e, newValue) => setCurrentTab(newValue)}
          style={{ marginBottom: '24px' }}
        >
          <Tab label="Categories" />
          <Tab label="Rules" />
          <Tab label="Mappings" />
          <Tab
            label={
              <Badge
                badgeContent={uncategorizedDescriptions.length}
                color="warning"
                max={99}
                sx={{
                  '& .MuiBadge-badge': {
                    background: uncategorizedDescriptions.length > 0 ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 'transparent',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '10px',
                  }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <FlashOnIcon sx={{ fontSize: 18, color: uncategorizedDescriptions.length > 0 ? '#f59e0b' : 'inherit' }} />
                  Uncategorized
                </Box>
              </Badge>
            }
          />
        </Tabs>

        {currentTab === 0 && (
          <>
            <Box style={{ marginBottom: '24px' }}>
              <Typography variant="subtitle1" style={{ marginBottom: '12px', fontWeight: 600 }}>
                Merge Categories
              </Typography>
              <Typography variant="body2" color={theme.palette.text.secondary} style={{ marginBottom: '16px' }}>
                Select multiple categories to merge them into a new consolidated category.
                All transactions from the selected categories will be moved to the new category.
              </Typography>

              <TextField
                fullWidth
                label="New Category Name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Enter name for merged category..."
                style={{ marginBottom: '16px' }}
                disabled={isLoading}
              />

              <Button
                variant="contained"
                startIcon={<MergeIcon />}
                onClick={handleMerge}
                disabled={selectedCategories.length < 2 || !newCategoryName.trim() || isLoading}
                style={{
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  borderRadius: '12px',
                  padding: '10px 24px',
                  textTransform: 'none',
                  fontWeight: 600
                }}
              >
                {isLoading ? <CircularProgress size={20} color="inherit" /> : 'Merge Selected Categories'}
              </Button>
            </Box>

            <Divider style={{ margin: '24px 0' }} />

            <Box>
              <Typography variant="subtitle1" style={{ marginBottom: '16px', fontWeight: 600 }}>
                Available Categories ({categories.length})
              </Typography>

              {isLoading ? (
                <Box display="flex" justifyContent="center" padding="32px">
                  <CircularProgress />
                </Box>
              ) : (
                <Box
                  style={{
                    maxHeight: '400px',
                    overflow: 'auto',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px'
                  }}
                >
                  {categories.map((category, index) => (
                    <Box key={category.name} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <Chip
                        label={category.name}
                        onClick={() => handleCategoryToggle(category.name)}
                        onDelete={selectedCategories.includes(category.name) ? () => handleCategoryToggle(category.name) : undefined}
                        deleteIcon={<Checkbox
                          checked={selectedCategories.includes(category.name)}
                          style={{ color: 'white' }}
                        />}
                        style={{
                          backgroundColor: selectedCategories.includes(category.name)
                            ? categoryColors[category.name] || '#3b82f6'
                            : (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#f8f9fa'),
                          color: selectedCategories.includes(category.name)
                            ? 'white'
                            : theme.palette.text.primary,
                          border: selectedCategories.includes(category.name)
                            ? 'none'
                            : `1px solid ${selectedCategories.includes(category.name) ? (categoryColors[category.name] || '#3b82f6') : (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : (categoryColors[category.name] || '#3b82f6'))}`,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease-in-out',
                          fontWeight: selectedCategories.includes(category.name) ? '600' : '500',
                          fontSize: '14px',
                          height: '32px'
                        }}
                        sx={{
                          '&:hover': {
                            backgroundColor: selectedCategories.includes(category.name)
                              ? categoryColors[category.name] || '#3b82f6'
                              : (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(59, 130, 246, 0.1)'),
                            transform: 'translateY(-1px)',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                          }
                        }}
                      />
                      <IconButton
                        size="small"
                        onClick={(e) => openRenameDialog(category.name, e)}
                        style={{
                          padding: '4px',
                          color: categoryColors[category.name] || '#3b82f6'
                        }}
                        title={`Rename "${category.name}"`}
                      >
                        <EditIcon style={{ fontSize: '16px' }} />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={(e) => openDeleteDialog(category.name, e)}
                        style={{
                          padding: '4px',
                          color: '#ef4444'
                        }}
                        title={`Delete "${category.name}"`}
                      >
                        <DeleteIcon style={{ fontSize: '16px' }} />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </>
        )}

        {currentTab === 1 && (
          <>
            <Box style={{ marginBottom: '24px' }}>
              <Typography variant="subtitle1" style={{ marginBottom: '12px', fontWeight: 600 }}>
                Categorization Rules
              </Typography>
              <Typography variant="body2" color={theme.palette.text.secondary} style={{ marginBottom: '16px' }}>
                Create rules to automatically categorize transactions based on their names.
                Rules will be applied to existing and new transactions.
              </Typography>

              <Grid container spacing={2} style={{ marginBottom: '16px' }}>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Transaction Name Pattern"
                    value={newRule.name_pattern}
                    onChange={(e) => setNewRule({ ...newRule, name_pattern: e.target.value })}
                    placeholder="e.g., 'starbucks' or 'netflix'"
                    disabled={isLoading}
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    label="Target Category"
                    value={newRule.target_category}
                    onChange={(e) => setNewRule({ ...newRule, target_category: e.target.value })}
                    placeholder="e.g., 'Food' or 'Entertainment'"
                    disabled={isLoading}
                  />
                </Grid>
                <Grid item xs={2}>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleCreateRule}
                    disabled={!newRule.name_pattern.trim() || !newRule.target_category.trim() || isLoading}
                    style={{
                      backgroundColor: '#10b981',
                      color: 'white',
                      borderRadius: '12px',
                      padding: '10px 16px',
                      textTransform: 'none',
                      fontWeight: 600,
                      height: '56px',
                      width: '100%'
                    }}
                  >
                    {isLoading ? <CircularProgress size={20} color="inherit" /> : 'Add'}
                  </Button>
                </Grid>
              </Grid>

              <Button
                variant="outlined"
                startIcon={<PlayArrowIcon />}
                onClick={handleApplyRules}
                disabled={isApplyingRules || rules.length === 0}
                style={{
                  borderColor: '#3b82f6',
                  color: '#3b82f6',
                  borderRadius: '12px',
                  padding: '10px 24px',
                  textTransform: 'none',
                  fontWeight: 600
                }}
              >
                {isApplyingRules ? <CircularProgress size={20} color="inherit" /> : 'Apply Rules to Existing Transactions'}
              </Button>
            </Box>

            <Divider style={{ margin: '24px 0' }} />

            <Box>
              <Typography variant="subtitle1" style={{ marginBottom: '16px', fontWeight: 600 }}>
                Active Rules ({rules.length})
              </Typography>

              {isLoadingRules ? (
                <Box display="flex" justifyContent="center" padding="32px">
                  <CircularProgress />
                </Box>
              ) : rules.length === 0 ? (
                <Box style={{ textAlign: 'center', padding: '32px', color: theme.palette.text.secondary }}>
                  <Typography>No rules created yet. Create your first rule above.</Typography>
                </Box>
              ) : (
                <Grid container spacing={2}>
                  {rules.map((rule) => (
                    <Grid item xs={12} key={rule.id}>
                      <Card style={{
                        borderRadius: '12px',
                        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#fff',
                        border: theme.palette.mode === 'dark' ? `1px solid ${theme.palette.divider}` : 'none'
                      }}>
                        <CardContent style={{ padding: '16px' }}>
                          <Box display="flex" alignItems="center" justifyContent="space-between">
                            <Box flex={1}>
                              <Typography variant="body1" style={{ fontWeight: 600, marginBottom: '4px' }}>
                                IF transaction name contains "{rule.name_pattern}"
                              </Typography>
                              <Typography variant="body2" color={theme.palette.text.secondary}>
                                THEN set category to "{rule.target_category}"
                              </Typography>
                            </Box>
                            <Box display="flex" alignItems="center" gap="8px">
                              <FormControlLabel
                                control={
                                  <Switch
                                    checked={rule.is_active}
                                    onChange={(e) => handleUpdateRule({ ...rule, is_active: e.target.checked })}
                                    disabled={isLoading}
                                  />
                                }
                                label=""
                              />
                              <IconButton
                                onClick={() => setEditingRule(rule)}
                                size="small"
                                style={{ color: '#3b82f6' }}
                              >
                                <EditIcon />
                              </IconButton>
                              <IconButton
                                onClick={() => handleDeleteRule(rule.id)}
                                size="small"
                                style={{ color: '#ef4444' }}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>

            {editingRule && (
              <Box style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999
              }}>
                <Card style={{
                  padding: '24px',
                  maxWidth: '500px',
                  width: '100%',
                  margin: '16px',
                  backgroundColor: theme.palette.background.paper,
                }}>
                  <Typography variant="h6" style={{ marginBottom: '16px' }}>Edit Rule</Typography>
                  <Grid container spacing={2} style={{ marginBottom: '16px' }}>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Transaction Name Pattern"
                        value={editingRule.name_pattern}
                        onChange={(e) => setEditingRule({ ...editingRule, name_pattern: e.target.value })}
                        disabled={isLoading}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Target Category"
                        value={editingRule.target_category}
                        onChange={(e) => setEditingRule({ ...editingRule, target_category: e.target.value })}
                        disabled={isLoading}
                      />
                    </Grid>
                  </Grid>
                  <Box display="flex" gap="8px" justifyContent="flex-end">
                    <Button
                      onClick={() => setEditingRule(null)}
                      style={{ color: theme.palette.text.secondary }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="contained"
                      onClick={() => handleUpdateRule(editingRule)}
                      disabled={isLoading}
                      style={{
                        backgroundColor: '#3b82f6',
                        color: 'white'
                      }}
                    >
                      {isLoading ? <CircularProgress size={20} color="inherit" /> : 'Update'}
                    </Button>
                  </Box>
                </Card>
              </Box>
            )}
          </>
        )}

        {currentTab === 3 && (
          <>
            {uncategorizedDescriptions.length > 0 && (
              <LinearProgress
                variant="determinate"
                value={(currentQuickIndex / uncategorizedDescriptions.length) * 100}
                sx={{
                  height: 4,
                  borderRadius: 2,
                  marginBottom: 2,
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: '#3b82f6'
                  }
                }}
              />
            )}

            {isLoadingQuick ? (
              <Box display="flex" justifyContent="center" padding="64px">
                <CircularProgress />
              </Box>
            ) : uncategorizedDescriptions.length === 0 ? (
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
                <Typography color={theme.palette.text.secondary}>
                  All transactions have been categorized.
                </Typography>
                {totalQuickProcessed > 0 && (
                  <Typography color={theme.palette.text.secondary} sx={{ marginTop: 1 }}>
                    You categorized {totalQuickProcessed} description(s) in this session.
                  </Typography>
                )}
              </Box>
            ) : currentQuickIndex >= uncategorizedDescriptions.length ? (
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
                <Typography color={theme.palette.text.secondary}>
                  You categorized {totalQuickProcessed} description(s).
                </Typography>
              </Box>
            ) : (
              <>
                {/* Header with remaining count */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Assign Categories
                  </Typography>
                  <Chip
                    label={`${uncategorizedDescriptions.length - currentQuickIndex} remaining`}
                    size="small"
                    sx={{
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      color: '#3b82f6',
                      fontWeight: 600
                    }}
                  />
                </Box>

                {/* Current Description Card */}
                <Box
                  sx={{
                    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc',
                    borderRadius: '16px',
                    padding: '20px',
                    marginBottom: '20px',
                    border: `1px solid ${theme.palette.divider}`,
                    position: 'relative'
                  }}
                >
                  {isSavingQuick && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.8)',
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

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 600,
                        color: theme.palette.text.primary,
                        wordBreak: 'break-word'
                      }}
                    >
                      {uncategorizedDescriptions[currentQuickIndex]?.description}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, marginLeft: 2 }}>
                      <Chip
                        label={`${uncategorizedDescriptions[currentQuickIndex]?.count} txns`}
                        size="small"
                        sx={{
                          backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          color: '#3b82f6',
                          fontWeight: 600
                        }}
                      />
                      <Chip
                        label={formatQuickCurrency(uncategorizedDescriptions[currentQuickIndex]?.totalAmount || 0)}
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
                  {isLoadingQuickTransactions ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', padding: 2 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : quickTransactions.length > 0 ? (
                    <TableContainer
                      component={Paper}
                      sx={{
                        maxHeight: 150,
                        boxShadow: 'none',
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: '8px',
                        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : '#fff'
                      }}
                    >
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, backgroundColor: theme.palette.mode === 'dark' ? theme.palette.action.hover : '#f1f5f9', color: theme.palette.text.secondary, fontSize: '12px' }}>Date</TableCell>
                            <TableCell sx={{ fontWeight: 600, backgroundColor: theme.palette.mode === 'dark' ? theme.palette.action.hover : '#f1f5f9', color: theme.palette.text.secondary, fontSize: '12px' }}>Amount</TableCell>
                            <TableCell sx={{ fontWeight: 600, backgroundColor: theme.palette.mode === 'dark' ? theme.palette.action.hover : '#f1f5f9', color: theme.palette.text.secondary, fontSize: '12px' }}>Card</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {quickTransactions.slice(0, 5).map((tx, idx) => (
                            <TableRow key={idx}>
                              <TableCell sx={{ color: theme.palette.text.secondary, fontSize: '12px' }}>
                                {formatQuickDate(tx.date)}
                              </TableCell>
                              <TableCell sx={{ color: tx.price < 0 ? '#ef4444' : '#22c55e', fontWeight: 600, fontSize: '12px' }}>
                                {formatQuickCurrency(Math.abs(tx.price))}
                              </TableCell>
                              <TableCell sx={{ color: theme.palette.text.secondary, fontSize: '12px' }}>
                                {tx.vendor_nickname || tx.vendor}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : null}
                </Box>

                {/* Skip Button */}
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 2 }}>
                  <Button
                    onClick={handleQuickSkip}
                    disabled={isSavingQuick}
                    startIcon={<SkipNextIcon />}
                    sx={{
                      color: theme.palette.text.secondary,
                      textTransform: 'none',
                      fontWeight: 500
                    }}
                  >
                    Skip for now
                  </Button>
                </Box>

                {/* Category Buttons */}
                <Typography
                  variant="subtitle2"
                  sx={{ color: theme.palette.text.secondary, marginBottom: 1, fontWeight: 500 }}
                >
                  Select a category:
                </Typography>

                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    maxHeight: '200px',
                    overflow: 'auto',
                    padding: '4px'
                  }}
                >
                  {categories.map((cat) => (
                    <Button
                      key={cat.name}
                      onClick={() => handleQuickCategorySelect(cat.name)}
                      disabled={isSavingQuick}
                      sx={{
                        backgroundColor: categoryColors[cat.name] || '#3b82f6',
                        color: '#fff',
                        textTransform: 'none',
                        fontWeight: 600,
                        padding: '8px 16px',
                        borderRadius: '10px',
                        fontSize: '13px',
                        minWidth: 'auto',
                        '&:hover': {
                          backgroundColor: categoryColors[cat.name] || '#3b82f6',
                          filter: 'brightness(1.1)',
                          transform: 'translateY(-1px)',
                        },
                        '&:disabled': {
                          backgroundColor: theme.palette.action.disabledBackground,
                          color: theme.palette.text.disabled
                        }
                      }}
                    >
                      {cat.name}
                    </Button>
                  ))}

                  {/* Add New Category Button/Input */}
                  {showNewQuickCategoryInput ? (
                    <TextField
                      size="small"
                      value={newQuickCategoryInput}
                      onChange={(e) => setNewQuickCategoryInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newQuickCategoryInput.trim()) {
                          handleAddNewQuickCategory();
                        } else if (e.key === 'Escape') {
                          setShowNewQuickCategoryInput(false);
                          setNewQuickCategoryInput('');
                        }
                      }}
                      autoFocus
                      placeholder="New category"
                      disabled={isSavingQuick}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              size="small"
                              onClick={handleAddNewQuickCategory}
                              disabled={!newQuickCategoryInput.trim() || isSavingQuick}
                              sx={{ color: '#22c55e' }}
                            >
                              <CheckIcon fontSize="small" />
                            </IconButton>
                          </InputAdornment>
                        )
                      }}
                      sx={{
                        minWidth: '160px',
                        '& .MuiOutlinedInput-root': {
                          borderRadius: '10px',
                          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#fff',
                          '& fieldset': {
                            borderColor: '#22c55e',
                            borderWidth: '2px'
                          }
                        }
                      }}
                    />
                  ) : (
                    <Button
                      onClick={() => setShowNewQuickCategoryInput(true)}
                      disabled={isSavingQuick}
                      startIcon={<AddIcon />}
                      sx={{
                        backgroundColor: 'transparent',
                        color: '#22c55e',
                        border: '2px dashed #22c55e',
                        textTransform: 'none',
                        fontWeight: 600,
                        padding: '6px 12px',
                        borderRadius: '10px',
                        fontSize: '13px',
                        '&:hover': {
                          backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        }
                      }}
                    >
                      Add New
                    </Button>
                  )}
                </Box>
              </>
            )}
          </>
        )}

        {currentTab === 2 && (
          <>
            <Box style={{ marginBottom: '24px' }}>
              <Typography variant="subtitle1" style={{ marginBottom: '12px', fontWeight: 600 }}>
                Category Mappings
              </Typography>
              <Typography variant="body2" color={theme.palette.text.secondary} style={{ marginBottom: '16px' }}>
                When you merge categories, a mapping is created.
                Any new transactions scraped from a source category will automatically be moved to the target category.
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, backgroundColor: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)', padding: '12px', borderRadius: '12px', marginBottom: '20px' }}>
                <HelpOutlineIcon sx={{ color: '#3b82f6', fontSize: 20 }} />
                <Typography variant="body2" sx={{ color: theme.palette.mode === 'dark' ? '#93c5fd' : '#1e40af' }}>
                  Mappings are created automatically during the Merge process.
                </Typography>
              </Box>

              <Box sx={{
                mb: 4,
                p: 2.5,
                borderRadius: '16px',
                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                border: `1px dashed ${theme.palette.divider}`
              }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 700, color: theme.palette.text.primary }}>
                  Create Manual Mapping
                </Typography>
                <Grid container spacing={2} alignItems="flex-end">
                  <Grid item xs={12} sm={5}>
                    <TextField
                      size="small"
                      label="Source Category"
                      placeholder="e.g. Scraper Category"
                      value={newMappingSource}
                      onChange={(e) => setNewMappingSource(e.target.value)}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={1} sx={{ display: 'flex', justifyContent: 'center', pb: 1.5 }}>
                    <ArrowForwardIcon sx={{ opacity: 0.3 }} />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      size="small"
                      label="Target Mapping"
                      placeholder="e.g. Your Category"
                      value={newMappingTarget}
                      onChange={(e) => setNewMappingTarget(e.target.value)}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={2}>
                    <Button
                      variant="contained"
                      onClick={handleAddMapping}
                      disabled={!newMappingSource.trim() || !newMappingTarget.trim() || isLoading}
                      fullWidth
                      sx={{
                        height: '40px',
                        borderRadius: '10px',
                        textTransform: 'none',
                        fontWeight: 600,
                        boxShadow: 'none',
                        '&:hover': { boxShadow: 'none' }
                      }}
                    >
                      Add
                    </Button>
                  </Grid>
                </Grid>
              </Box>
            </Box>

            <Divider style={{ margin: '24px 0' }} />

            <Box>
              <Typography variant="subtitle1" style={{ marginBottom: '16px', fontWeight: 600 }}>
                Active Mappings ({mappings.length})
              </Typography>

              {isLoadingMappings ? (
                <Box display="flex" justifyContent="center" padding="32px">
                  <CircularProgress />
                </Box>
              ) : mappings.length === 0 ? (
                <Box style={{ textAlign: 'center', padding: '32px', color: theme.palette.text.secondary }}>
                  <Typography>No mappings found. Merge categories to create them.</Typography>
                </Box>
              ) : (
                <Grid container spacing={2}>
                  {mappings.map((mapping) => (
                    <Grid item xs={12} key={mapping.id}>
                      <Card style={{
                        borderRadius: '12px',
                        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#fff',
                        border: theme.palette.mode === 'dark' ? `1px solid ${theme.palette.divider}` : 'none'
                      }}>
                        <CardContent style={{ padding: '16px' }}>
                          <Box display="flex" alignItems="center" justifyContent="space-between">
                            <Box display="flex" alignItems="center" gap={2} flex={1}>
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="caption" color="textSecondary" display="block">Source</Typography>
                                <Chip
                                  label={mapping.source_category}
                                  size="small"
                                  sx={{
                                    backgroundColor: categoryColors[mapping.source_category] || '#64748b',
                                    color: '#fff',
                                    fontWeight: 600
                                  }}
                                />
                              </Box>
                              <ArrowForwardIcon sx={{ color: theme.palette.text.secondary, opacity: 0.5 }} />
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="caption" color="textSecondary" display="block">Target</Typography>
                                {editingMapping?.id === mapping.id ? (
                                  <TextField
                                    size="small"
                                    value={editMappingTarget}
                                    onChange={(e) => setEditMappingTarget(e.target.value)}
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleEditMapping(mapping);
                                      if (e.key === 'Escape') setEditingMapping(null);
                                    }}
                                    sx={{
                                      '& .MuiOutlinedInput-root': {
                                        borderRadius: '8px',
                                        height: '32px'
                                      }
                                    }}
                                  />
                                ) : (
                                  <Chip
                                    label={mapping.target_category}
                                    size="small"
                                    sx={{
                                      backgroundColor: categoryColors[mapping.target_category] || '#3b82f6',
                                      color: '#fff',
                                      fontWeight: 600
                                    }}
                                  />
                                )}
                              </Box>
                            </Box>
                            <Box>
                              {editingMapping?.id === mapping.id ? (
                                <>
                                  <IconButton
                                    onClick={() => handleEditMapping(mapping)}
                                    size="small"
                                    sx={{ color: '#22c55e' }}
                                  >
                                    <CheckIcon />
                                  </IconButton>
                                  <IconButton
                                    onClick={() => setEditingMapping(null)}
                                    size="small"
                                    sx={{ color: theme.palette.text.secondary }}
                                  >
                                    <CloseIcon />
                                  </IconButton>
                                </>
                              ) : (
                                <>
                                  <IconButton
                                    onClick={() => {
                                      setEditingMapping(mapping);
                                      setEditMappingTarget(mapping.target_category);
                                    }}
                                    size="small"
                                    sx={{ color: '#3b82f6', mr: 1 }}
                                    title="Edit target category"
                                  >
                                    <EditIcon />
                                  </IconButton>
                                  <IconButton
                                    onClick={() => handleDeleteMapping(mapping.id)}
                                    size="small"
                                    style={{ color: '#ef4444' }}
                                    title="Remove mapping"
                                  >
                                    <DeleteIcon />
                                  </IconButton>
                                </>
                              )}
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>
          </>
        )}
        {deletingCategory && (
          <Box style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}>
            <Card style={{
              padding: '24px',
              maxWidth: '450px',
              width: '100%',
              margin: '16px',
              borderRadius: '16px',
              backgroundColor: theme.palette.background.paper
            }}>
              <Typography variant="h6" style={{ marginBottom: '8px', fontWeight: 600, color: '#ef4444' }}>
                Delete Category
              </Typography>
              <Typography variant="body2" color={theme.palette.text.secondary} style={{ marginBottom: '20px' }}>
                Are you sure you want to delete "{deletingCategory}"? All transactions with this category will become uncategorized.
              </Typography>

              <Box style={{ marginBottom: '20px' }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={deleteOptions.deleteRules}
                      onChange={(e) => setDeleteOptions({ ...deleteOptions, deleteRules: e.target.checked })}
                      disabled={isLoading}
                    />
                  }
                  label={<Typography variant="body2">Also delete categorization rules targeting this category</Typography>}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={deleteOptions.deleteBudget}
                      onChange={(e) => setDeleteOptions({ ...deleteOptions, deleteBudget: e.target.checked })}
                      disabled={isLoading}
                    />
                  }
                  label={<Typography variant="body2">Also delete budget for this category</Typography>}
                />
              </Box>

              <Box display="flex" gap="8px" justifyContent="flex-end">
                <Button
                  onClick={() => {
                    setDeletingCategory(null);
                    setDeleteOptions({ deleteRules: true, deleteBudget: true });
                  }}
                  style={{ color: theme.palette.text.secondary, textTransform: 'none' }}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={handleDeleteCategory}
                  disabled={isLoading}
                  style={{
                    backgroundColor: '#ef4444',
                    color: 'white',
                    borderRadius: '8px',
                    textTransform: 'none',
                    fontWeight: 600
                  }}
                >
                  {isLoading ? <CircularProgress size={20} color="inherit" /> : 'Delete Category'}
                </Button>
              </Box>
            </Card>
          </Box>
        )}

        {/* Rename Category Dialog */}
        {renamingCategory && (
          <Box style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}>
            <Card style={{
              padding: '24px',
              maxWidth: '400px',
              width: '100%',
              margin: '16px',
              borderRadius: '16px',
              backgroundColor: theme.palette.background.paper
            }}>
              <Typography variant="h6" style={{ marginBottom: '8px', fontWeight: 600 }}>
                Rename Category
              </Typography>
              <Typography variant="body2" color={theme.palette.text.secondary} style={{ marginBottom: '20px' }}>
                Rename "{renamingCategory}" to a new name. All transactions with this category will be updated.
              </Typography>
              <TextField
                fullWidth
                label="New Category Name"
                value={renameNewName}
                onChange={(e) => setRenameNewName(e.target.value)}
                disabled={isLoading}
                autoFocus
                style={{ marginBottom: '20px' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && renameNewName.trim() && renameNewName.trim() !== renamingCategory) {
                    handleRenameCategory();
                  }
                }}
              />
              <Box display="flex" gap="8px" justifyContent="flex-end">
                <Button
                  onClick={() => {
                    setRenamingCategory(null);
                    setRenameNewName('');
                  }}
                  style={{ color: theme.palette.text.secondary, textTransform: 'none' }}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={handleRenameCategory}
                  disabled={isLoading || !renameNewName.trim() || renameNewName.trim() === renamingCategory}
                  style={{
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    borderRadius: '8px',
                    textTransform: 'none',
                    fontWeight: 600
                  }}
                >
                  {isLoading ? <CircularProgress size={20} color="inherit" /> : 'Rename'}
                </Button>
              </Box>
            </Card>
          </Box>
        )}
      </DialogContent>

      <DialogActions style={{ padding: '16px 24px 24px 24px' }}>
        <Button
          onClick={handleClose}
          style={{
            color: theme.palette.text.secondary,
            borderRadius: '12px',
            padding: '8px 16px',
            textTransform: 'none',
            fontWeight: 500
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CategoryManagementModal; 