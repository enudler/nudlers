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
import HelpOutlineIcon from '@mui/icons-material/HelpOutlineOutlined';
import SearchIcon from '@mui/icons-material/Search';
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
import { logger } from '../../../utils/client-logger';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../../context/LocaleContext';

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
  const [categorySearchFilter, setCategorySearchFilter] = useState('');
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
  const { t } = useTranslation(['categoryMgmt', 'common']);
  const { locale } = useLocale();
  const dateLocale = locale === 'he' ? 'he-IL' : 'en-US';

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

  /* eslint-disable react-hooks/immutability, react-hooks/exhaustive-deps -- fetchers are declared below; closures capture them at runtime which works correctly since effects run after render */
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      fetchCategories();
      fetchRules();
      fetchUncategorizedDescriptions();
      fetchMappings();
    });
  }, [open]);

  // Reset quick categorize state when switching tabs
  useEffect(() => {
    if (currentTab !== 3 || uncategorizedDescriptions.length === 0) return;
    queueMicrotask(() => {
      fetchQuickTransactions(uncategorizedDescriptions[currentQuickIndex]?.description);
    });
  }, [currentTab, currentQuickIndex, uncategorizedDescriptions]);
  /* eslint-enable react-hooks/immutability, react-hooks/exhaustive-deps */

  const fetchUncategorizedDescriptions = async () => {
    try {
      setIsLoadingQuick(true);
      const response = await fetch('/api/categories/uncategorized');
      if (!response.ok) throw new Error(t('categoryMgmt:errors.failedToFetchUncategorized'));
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
        `/api/transactions?description=${encodeURIComponent(description)}&uncategorizedOnly=true`
      );
      if (!response.ok) throw new Error(t('categoryMgmt:errors.failedToFetchTransactions'));
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

      const response = await fetch('/api/categories/update-by-description', {
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
          throw new Error(errorData.error || t('categoryMgmt:errors.failedToUpdateCategory'));
        } else {
          throw new Error(`${t('categoryMgmt:errors.failedToUpdateCategory')}: ${response.status} ${response.statusText}`);
        }
      }

      const result = await response.json();
      setSuccess(t('categoryMgmt:success.quickUpdated', { count: result.transactionsUpdated, category }));
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
      setError(error instanceof Error ? error.message : t('categoryMgmt:errors.failedToUpdateCategory'));
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
    return new Intl.NumberFormat(dateLocale, {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatQuickDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(dateLocale, {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  };

  const fetchCategories = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/categories?withCounts=true');
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        const errorMessage = `Failed to fetch categories: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`;
        throw new Error(errorMessage);
      }

      const categoriesWithCounts: Category[] = await response.json();
      setCategories(categoriesWithCounts.sort((a, b) => a.name.localeCompare(b.name, locale)));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('categoryMgmt:errors.unknown');
      logger.error('Error fetching categories', undefined, { errorMessage });
      setError(t('categoryMgmt:errors.loadCategories', { message: errorMessage }));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRules = async () => {
    try {
      setIsLoadingRules(true);
      const response = await fetch('/api/categories/rules');
      if (!response.ok) throw new Error(t('categoryMgmt:errors.failedToFetchRules'));

      const rulesData = await response.json();
      setRules(rulesData);
    } catch (error) {
      logger.error('Error fetching rules', error);
      setError(t('categoryMgmt:errors.loadRules'));
    } finally {
      setIsLoadingRules(false);
    }
  };

  const fetchMappings = async () => {
    try {
      setIsLoadingMappings(true);
      const response = await fetch('/api/categories/mappings');
      if (!response.ok) throw new Error(t('categoryMgmt:errors.failedToFetchMappings'));

      const data = await response.json();
      setMappings(data);
    } catch (error) {
      logger.error('Error fetching mappings', error);
      setError(t('categoryMgmt:errors.loadMappings'));
    } finally {
      setIsLoadingMappings(false);
    }
  };

  const handleDeleteMapping = async (mappingId: number) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/categories/mappings', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: mappingId }),
      });

      if (!response.ok) {
        throw new Error(t('categoryMgmt:errors.failedToDeleteMapping'));
      }

      setSuccess(t('categoryMgmt:success.mappingRemoved'));
      await fetchMappings();

      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('categoryMgmt:errors.failedToDeleteMapping'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditMapping = async (mapping: CategoryMapping) => {
    if (!editMappingTarget.trim()) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/categories/mappings', {
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
        throw new Error(t('categoryMgmt:errors.failedToUpdateMapping'));
      }

      setSuccess(t('categoryMgmt:success.mappingUpdated'));
      setEditingMapping(null);
      setEditMappingTarget('');
      await fetchMappings();

      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('categoryMgmt:errors.failedToUpdateMapping'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddMapping = async () => {
    if (!newMappingSource.trim() || !newMappingTarget.trim()) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/categories/mappings', {
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
        throw new Error(t('categoryMgmt:errors.failedToCreateMapping'));
      }

      setSuccess(t('categoryMgmt:success.mappingCreated'));
      setNewMappingSource('');
      setNewMappingTarget('');
      await fetchMappings();

      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      logger.error('Error creating mapping', error);
      setError(error instanceof Error ? error.message : t('categoryMgmt:errors.failedToCreateMapping'));
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
      setError(t('categoryMgmt:errors.selectAtLeastTwo'));
      return;
    }

    if (!newCategoryName.trim()) {
      setError(t('categoryMgmt:errors.enterMergedName'));
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Call the merge API
      const response = await fetch('/api/categories/merge', {
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
          throw new Error(errorData.error || t('categoryMgmt:errors.failedToMerge'));
        } else {
          throw new Error(`${t('categoryMgmt:errors.failedToMerge')}: ${response.status} ${response.statusText}`);
        }
      }

      setSuccess(t('categoryMgmt:success.merged', { count: selectedCategories.length, name: newCategoryName }));
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
      setError(error instanceof Error ? error.message : t('categoryMgmt:errors.failedToMerge'));
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
      setError(t('categoryMgmt:errors.enterNewName'));
      return;
    }

    if (renamingCategory === renameNewName.trim()) {
      setError(t('categoryMgmt:errors.newNameDifferent'));
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/categories/${encodeURIComponent(renamingCategory)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newName: renameNewName.trim()
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || t('categoryMgmt:errors.failedToRename'));
        } else {
          throw new Error(`${t('categoryMgmt:errors.failedToRename')}: ${response.status} ${response.statusText}`);
        }
      }

      const result = await response.json();
      setSuccess(t('categoryMgmt:success.renamed', { oldName: renamingCategory, newName: renameNewName.trim(), count: result.transactionsUpdated }));
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
      setError(error instanceof Error ? error.message : t('categoryMgmt:errors.failedToRename'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deletingCategory) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/categories/${encodeURIComponent(deletingCategory)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deleteRules: deleteOptions.deleteRules,
          deleteBudget: deleteOptions.deleteBudget
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || t('categoryMgmt:errors.failedToDeleteCategory'));
        } else {
          throw new Error(`${t('categoryMgmt:errors.failedToDeleteCategory')}: ${response.status} ${response.statusText}`);
        }
      }

      const result = await response.json();
      setSuccess(t('categoryMgmt:success.deletedCategory', { name: deletingCategory, count: result.transactionsUncategorized }));
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
      setError(error instanceof Error ? error.message : t('categoryMgmt:errors.failedToDeleteCategory'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRule = async () => {
    if (!newRule.name_pattern.trim() || !newRule.target_category.trim()) {
      setError(t('categoryMgmt:errors.patternAndCategory'));
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/categories/rules', {
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
          throw new Error(errorData.error || t('categoryMgmt:errors.failedToCreateRule'));
        } else {
          throw new Error(`${t('categoryMgmt:errors.failedToCreateRule')}: ${response.status} ${response.statusText}`);
        }
      }

      setSuccess(t('categoryMgmt:success.ruleCreated'));
      setNewRule({ name_pattern: '', target_category: '' });
      await fetchRules();

      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      logger.error('Error creating rule', error, {
        category: newRule.target_category,
        pattern: newRule.name_pattern
      });
      setError(error instanceof Error ? error.message : t('categoryMgmt:errors.failedToCreateRule'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateRule = async (rule: CategorizationRule) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/categories/rules', {
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

      setSuccess(t('categoryMgmt:success.ruleUpdated'));
      setEditingRule(null);
      await fetchRules();

      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      logger.error('Error updating rule', error, { ruleId: rule.id });
      setError(error instanceof Error ? error.message : t('categoryMgmt:errors.failedToUpdateRule'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRule = async (ruleId: number) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/categories/rules', {
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

      setSuccess(t('categoryMgmt:success.ruleDeleted'));
      await fetchRules();

      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      logger.error('Error deleting rule', error, { ruleId });
      setError(error instanceof Error ? error.message : t('categoryMgmt:errors.failedToDeleteRule'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyRules = async () => {
    try {
      setIsApplyingRules(true);
      setError(null);

      const response = await fetch('/api/categories/apply-rules', {
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
      setSuccess(t('categoryMgmt:success.rulesApplied', { rules: result.rulesApplied, transactions: result.transactionsUpdated }));

      // Refresh categories and notify parent
      await fetchCategories();
      onCategoriesUpdated();

      setTimeout(() => setSuccess(null), 5000);
    } catch (error) {
      logger.error('Error applying rules', error);
      setError(error instanceof Error ? error.message : t('categoryMgmt:errors.failedToApplyRules'));
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
      slotProps={{
        paper: {
          style: {
            background: theme.palette.mode === 'dark'
              ? 'linear-gradient(135deg, var(--modal-backdrop) 0%, var(--modal-backdrop-alt) 100%)'
              : 'var(--modal-backdrop)',
            borderRadius: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
            border: `1px solid ${theme.palette.divider}`
          }
        }
      }}
    >
      <ModalHeader title={t('categoryMgmt:modal.title')} onClose={handleClose} />
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
          <Tab label={t('categoryMgmt:tabs.categories')} />
          <Tab label={t('categoryMgmt:tabs.rules')} />
          <Tab label={t('categoryMgmt:tabs.mappings')} />
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
                  <FlashOnIcon sx={{ fontSize: 18, color: uncategorizedDescriptions.length > 0 ? 'var(--n-warning)' : 'inherit' }} />
                  {t('categoryMgmt:tabs.uncategorized')}
                </Box>
              </Badge>
            }
          />
        </Tabs>

        {currentTab === 0 && (
          <>
            {/* Top Row: Selected Categories + Merge Form */}
            <Grid container spacing={2} sx={{ mb: 2 }}>
              {/* Selected Categories - Compact */}
              <Grid
                size={{
                  xs: 12,
                  md: 6
                }}>
                <Box
                  sx={{
                    background: theme.palette.mode === 'dark'
                      ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(147, 51, 234, 0.1) 100%)'
                      : 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(147, 51, 234, 0.05) 100%)',
                    borderRadius: '12px',
                    padding: '16px',
                    border: `2px dashed ${selectedCategories.length >= 2 ? 'var(--n-info)' : theme.palette.divider}`,
                    minHeight: '120px',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 0.3s ease'
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <MergeIcon sx={{ color: 'var(--n-info)', fontSize: 20 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {t('categoryMgmt:categories.selectedToMerge', { count: selectedCategories.length })}
                    </Typography>
                  </Box>

                  {selectedCategories.length === 0 ? (
                    <Typography
                      variant="body2"
                      sx={{
                        color: "text.secondary",
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center'
                      }}>
                      {t('categoryMgmt:categories.clickToSelect')}
                    </Typography>
                  ) : (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selectedCategories.map((catName) => (
                        <Chip
                          key={catName}
                          label={catName}
                          size="small"
                          onDelete={() => handleCategoryToggle(catName)}
                          sx={{
                            background: categoryColors[catName] || 'var(--n-info)',
                            color: '#fff',
                            fontWeight: 500,
                            '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.7)' }
                          }}
                        />
                      ))}
                    </Box>
                  )}
                </Box>
              </Grid>

              {/* Merge Form - Compact */}
              <Grid
                size={{
                  xs: 12,
                  md: 6
                }}>
                <Box
                  sx={{
                    background: theme.palette.mode === 'dark'
                      ? 'rgba(255, 255, 255, 0.03)'
                      : '#fff',
                    borderRadius: '12px',
                    padding: '16px',
                    border: `1px solid ${theme.palette.divider}`,
                    minHeight: '120px'
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                    {t('categoryMgmt:categories.newCategoryName')}
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder={t('categoryMgmt:categories.newCategoryPlaceholder')}
                    disabled={isLoading || selectedCategories.length < 2}
                    sx={{
                      mb: 1,
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '8px'
                      }
                    }}
                  />
                  <Button
                    fullWidth
                    variant="contained"
                    size="small"
                    startIcon={isLoading ? null : <MergeIcon />}
                    onClick={handleMerge}
                    disabled={selectedCategories.length < 2 || !newCategoryName.trim() || isLoading}
                    sx={{
                      background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                      color: 'white',
                      borderRadius: '8px',
                      textTransform: 'none',
                      fontWeight: 600,
                      '&:disabled': {
                        background: theme.palette.action.disabledBackground
                      }
                    }}
                  >
                    {isLoading ? <CircularProgress size={20} color="inherit" /> : t('categoryMgmt:categories.mergeCategories')}
                  </Button>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      display: 'block',
                      mt: 1
                    }}>
                    {t('categoryMgmt:categories.autoMappingHint')}
                  </Typography>
                </Box>
              </Grid>
            </Grid>

            {/* All Categories - Full Width */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, gap: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {t('categoryMgmt:categories.allCategories', { count: categories.filter(c => c.name.toLowerCase().includes(categorySearchFilter.toLowerCase())).length })}
                </Typography>
                <TextField
                  size="small"
                  placeholder={t('categoryMgmt:categories.searchPlaceholder')}
                  value={categorySearchFilter}
                  onChange={(e) => setCategorySearchFilter(e.target.value)}
                  sx={{
                    width: '250px',
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#fff'
                    }
                  }}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon sx={{ color: theme.palette.text.secondary, fontSize: 20 }} />
                        </InputAdornment>
                      ),
                      endAdornment: categorySearchFilter && (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setCategorySearchFilter('')}>
                            <CloseIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </InputAdornment>
                      )
                    }
                  }}
                />
              </Box>

              {isLoading ? (
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    padding: "32px"
                  }}>
                  <CircularProgress />
                </Box>
              ) : (
                <Box
                  sx={{
                    maxHeight: '450px',
                    overflow: 'auto',
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: 'repeat(2, 1fr)',
                      sm: 'repeat(4, 1fr)',
                      md: 'repeat(5, 1fr)',
                      lg: 'repeat(6, 1fr)'
                    },
                    gap: 1,
                    '&::-webkit-scrollbar': { width: '6px' },
                    '&::-webkit-scrollbar-track': { background: 'transparent' },
                    '&::-webkit-scrollbar-thumb': {
                      background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                      borderRadius: '10px'
                    }
                  }}
                >
                  {categories
                    .filter(c => c.name.toLowerCase().includes(categorySearchFilter.toLowerCase()))
                    .map((category) => (
                      <Card
                        key={category.name}
                        onClick={() => handleCategoryToggle(category.name)}
                        sx={{
                          borderRadius: '8px',
                          cursor: 'pointer',
                          border: selectedCategories.includes(category.name)
                            ? `2px solid ${categoryColors[category.name] || 'var(--n-info)'}`
                            : `1px solid ${theme.palette.divider}`,
                          background: selectedCategories.includes(category.name)
                            ? `linear-gradient(135deg, ${categoryColors[category.name] || 'var(--n-info)'}15 0%, ${categoryColors[category.name] || 'var(--n-info)'}05 100%)`
                            : theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : '#fff',
                          transition: 'all 0.15s ease',
                          '&:hover': {
                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
                            borderColor: categoryColors[category.name] || 'var(--n-info)'
                          }
                        }}
                      >
                        <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Box
                              sx={{
                                width: 16,
                                height: 16,
                                borderRadius: '3px',
                                border: selectedCategories.includes(category.name)
                                  ? 'none'
                                  : `1.5px solid ${theme.palette.divider}`,
                                background: selectedCategories.includes(category.name)
                                  ? categoryColors[category.name] || 'var(--n-info)'
                                  : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}
                            >
                              {selectedCategories.includes(category.name) && (
                                <CheckIcon sx={{ fontSize: 12, color: '#fff' }} />
                              )}
                            </Box>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 500,
                                fontSize: '0.8rem',
                                lineHeight: 1.2
                              }}
                            >
                              {category.name}
                            </Typography>
                          </Box>
                        </CardContent>
                      </Card>
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
                {t('categoryMgmt:rules.sectionTitle')}
              </Typography>
              <Typography variant="body2" color={theme.palette.text.secondary} style={{ marginBottom: '16px' }}>
                {t('categoryMgmt:rules.description')}
              </Typography>

              <Grid container spacing={2} style={{ marginBottom: '16px' }}>
                <Grid size={6}>
                  <TextField
                    fullWidth
                    label={t('categoryMgmt:rules.patternLabel')}
                    value={newRule.name_pattern}
                    onChange={(e) => setNewRule({ ...newRule, name_pattern: e.target.value })}
                    placeholder={t('categoryMgmt:rules.patternPlaceholder')}
                    disabled={isLoading}
                  />
                </Grid>
                <Grid size={4}>
                  <TextField
                    fullWidth
                    label={t('categoryMgmt:rules.targetCategoryLabel')}
                    value={newRule.target_category}
                    onChange={(e) => setNewRule({ ...newRule, target_category: e.target.value })}
                    placeholder={t('categoryMgmt:rules.targetCategoryPlaceholder')}
                    disabled={isLoading}
                  />
                </Grid>
                <Grid size={2}>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleCreateRule}
                    disabled={isLoading}
                    style={{
                      backgroundColor: 'var(--n-success)',
                      color: 'white',
                      borderRadius: '12px',
                      padding: '10px 16px',
                      textTransform: 'none',
                      fontWeight: 600,
                      height: '56px',
                      width: '100%'
                    }}
                  >
                    {isLoading ? <CircularProgress size={20} color="inherit" /> : t('categoryMgmt:rules.addButton')}
                  </Button>
                </Grid>
              </Grid>

              <Button
                variant="outlined"
                startIcon={<PlayArrowIcon />}
                onClick={handleApplyRules}
                disabled={isApplyingRules || rules.length === 0}
                style={{
                  borderColor: 'var(--n-info)',
                  color: 'var(--n-info)',
                  borderRadius: '12px',
                  padding: '10px 24px',
                  textTransform: 'none',
                  fontWeight: 600
                }}
              >
                {isApplyingRules ? <CircularProgress size={20} color="inherit" /> : t('categoryMgmt:rules.applyToExisting')}
              </Button>
            </Box>

            <Divider style={{ margin: '24px 0' }} />

            <Box>
              <Typography variant="subtitle1" style={{ marginBottom: '16px', fontWeight: 600 }}>
                {t('categoryMgmt:rules.activeRules', { count: rules.length })}
              </Typography>

              {isLoadingRules ? (
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    padding: "32px"
                  }}>
                  <CircularProgress />
                </Box>
              ) : rules.length === 0 ? (
                <Box style={{ textAlign: 'center', padding: '32px', color: theme.palette.text.secondary }}>
                  <Typography>'{t('categoryMgmt:rules.noRules')}'</Typography>
                </Box>
              ) : (
                <Grid container spacing={2}>
                  {rules.map((rule) => (
                    <Grid key={rule.id} size={12}>
                      <Card style={{
                        borderRadius: '12px',
                        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#fff',
                        border: theme.palette.mode === 'dark' ? `1px solid ${theme.palette.divider}` : 'none'
                      }}>
                        <CardContent style={{ padding: '16px' }}>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between"
                            }}>
                            <Box sx={{
                              flex: 1
                            }}>
                              <Typography variant="body1" style={{ fontWeight: 600, marginBottom: '4px' }}>
                                IF transaction name contains "{rule.name_pattern}"
                              </Typography>
                              <Typography variant="body2" color={theme.palette.text.secondary}>
                                THEN set category to "{rule.target_category}"
                              </Typography>
                            </Box>
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px"
                              }}>
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
                                size="medium"
                                sx={{
                                  padding: { xs: '8px', sm: '4px' },
                                  color: 'var(--n-info)',
                                  '& .MuiSvgIcon-root': {
                                    fontSize: { xs: '20px', sm: '16px' }
                                  }
                                }}
                              >
                                <EditIcon />
                              </IconButton>
                              <IconButton
                                onClick={() => handleDeleteRule(rule.id)}
                                size="medium"
                                sx={{
                                  padding: { xs: '8px', sm: '4px' },
                                  color: 'var(--n-error)',
                                  '& .MuiSvgIcon-root': {
                                    fontSize: { xs: '20px', sm: '16px' }
                                  }
                                }}
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

            <Dialog
              open={Boolean(editingRule)}
              onClose={() => setEditingRule(null)}
              slotProps={{
                paper: {
                  sx: {
                    borderRadius: '16px',
                    padding: '8px',
                    width: '100%',
                    maxWidth: '500px'
                  }
                }
              }}
            >
              <DialogTitle sx={{ fontWeight: 700 }}>{t('categoryMgmt:rules.editRuleTitle')}</DialogTitle>
              <DialogContent>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid
                    size={{
                      xs: 12,
                      sm: 6
                    }}>
                    <TextField
                      fullWidth
                      label={t('categoryMgmt:rules.patternLabel')}
                      value={editingRule?.name_pattern || ''}
                      onChange={(e) => editingRule && setEditingRule({ ...editingRule, name_pattern: e.target.value })}
                      disabled={isLoading}
                    />
                  </Grid>
                  <Grid
                    size={{
                      xs: 12,
                      sm: 6
                    }}>
                    <TextField
                      fullWidth
                      label={t('categoryMgmt:rules.targetCategoryLabel')}
                      value={editingRule?.target_category || ''}
                      onChange={(e) => editingRule && setEditingRule({ ...editingRule, target_category: e.target.value })}
                      disabled={isLoading}
                    />
                  </Grid>
                </Grid>
              </DialogContent>
              <DialogActions sx={{ p: 2, pt: 0 }}>
                <Button
                  onClick={() => setEditingRule(null)}
                  sx={{ color: 'text.secondary', textTransform: 'none' }}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={() => editingRule && handleUpdateRule(editingRule)}
                  disabled={isLoading}
                  sx={{
                    bgcolor: 'var(--n-info)',
                    '&:hover': { bgcolor: '#2563eb' },
                    borderRadius: '8px',
                    textTransform: 'none',
                    fontWeight: 600,
                    px: 3
                  }}
                >
                  {isLoading ? <CircularProgress size={20} color="inherit" /> : t('categoryMgmt:rules.updateButton')}
                </Button>
              </DialogActions>
            </Dialog>
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
                    backgroundColor: 'var(--n-info)'
                  }
                }}
              />
            )}

            {isLoadingQuick ? (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  padding: "64px"
                }}>
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
                      color: 'var(--n-info)',
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
                          color: 'var(--n-info)',
                          fontWeight: 600
                        }}
                      />
                      <Chip
                        label={formatQuickCurrency(uncategorizedDescriptions[currentQuickIndex]?.totalAmount || 0)}
                        size="small"
                        sx={{
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          color: 'var(--n-error)',
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
                            <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', backgroundColor: theme.palette.mode === 'dark' ? theme.palette.action.hover : '#f1f5f9', color: theme.palette.text.secondary, fontSize: '0.75rem' }}>{t('categoryMgmt:quick.tableDate')}</TableCell>
                            <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', backgroundColor: theme.palette.mode === 'dark' ? theme.palette.action.hover : '#f1f5f9', color: theme.palette.text.secondary, fontSize: '0.75rem' }}>{t('categoryMgmt:quick.tableAmount')}</TableCell>
                            <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', backgroundColor: theme.palette.mode === 'dark' ? theme.palette.action.hover : '#f1f5f9', color: theme.palette.text.secondary, fontSize: '0.75rem' }}>{t('categoryMgmt:quick.tableCard')}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {quickTransactions.slice(0, 5).map((tx, idx) => (
                            <TableRow key={idx}>
                              <TableCell sx={{ color: theme.palette.text.secondary, fontSize: '0.8125rem' }}>
                                {formatQuickDate(tx.date)}
                              </TableCell>
                              <TableCell sx={{ color: tx.price < 0 ? 'var(--n-error)' : '#22c55e', fontWeight: 600, fontSize: '0.8125rem' }}>
                                {formatQuickCurrency(Math.abs(tx.price))}
                              </TableCell>
                              <TableCell sx={{ color: theme.palette.text.secondary, fontSize: '0.8125rem' }}>
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
                        backgroundColor: categoryColors[cat.name] || 'var(--n-info)',
                        color: '#fff',
                        textTransform: 'none',
                        fontWeight: 600,
                        padding: '8px 16px',
                        borderRadius: '10px',
                        fontSize: '13px',
                        minWidth: 'auto',
                        '&:hover': {
                          backgroundColor: categoryColors[cat.name] || 'var(--n-info)',
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
                      placeholder={t('categoryMgmt:quick.newCategoryPlaceholder')}
                      disabled={isSavingQuick}
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
                      slotProps={{
                        input: {
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
                {t('categoryMgmt:mappings.sectionTitle')}
              </Typography>
              <Typography variant="body2" color={theme.palette.text.secondary} style={{ marginBottom: '16px' }}>
                {t('categoryMgmt:mappings.description')}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, backgroundColor: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)', padding: '12px', borderRadius: '12px', marginBottom: '20px' }}>
                <HelpOutlineIcon sx={{ color: 'var(--n-info)', fontSize: 20 }} />
                <Typography variant="body2" sx={{ color: theme.palette.mode === 'dark' ? '#93c5fd' : '#1e40af' }}>
                  {t('categoryMgmt:mappings.infoNotice')}
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
                  {t('categoryMgmt:mappings.createManual')}
                </Typography>
                <Grid container spacing={2} sx={{
                  alignItems: "flex-end"
                }}>
                  <Grid
                    size={{
                      xs: 12,
                      sm: 5
                    }}>
                    <TextField
                      size="small"
                      label={t('categoryMgmt:mappings.sourceLabel')}
                      placeholder={t('categoryMgmt:mappings.sourcePlaceholder')}
                      value={newMappingSource}
                      onChange={(e) => setNewMappingSource(e.target.value)}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                    />
                  </Grid>
                  <Grid
                    sx={{ display: 'flex', justifyContent: 'center', pb: 1.5 }}
                    size={{
                      xs: 12,
                      sm: 1
                    }}>
                    <ArrowForwardIcon sx={{ opacity: 0.3 }} />
                  </Grid>
                  <Grid
                    size={{
                      xs: 12,
                      sm: 4
                    }}>
                    <TextField
                      size="small"
                      label={t('categoryMgmt:mappings.targetLabel')}
                      placeholder={t('categoryMgmt:mappings.targetPlaceholder')}
                      value={newMappingTarget}
                      onChange={(e) => setNewMappingTarget(e.target.value)}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                    />
                  </Grid>
                  <Grid
                    size={{
                      xs: 12,
                      sm: 2
                    }}>
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
                      {t('categoryMgmt:mappings.addButton')}
                    </Button>
                  </Grid>
                </Grid>
              </Box>
            </Box>

            <Divider style={{ margin: '24px 0' }} />

            <Box>
              <Typography variant="subtitle1" style={{ marginBottom: '16px', fontWeight: 600 }}>
                {t('categoryMgmt:mappings.activeMappings', { count: mappings.length })}
              </Typography>

              {isLoadingMappings ? (
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    padding: "32px"
                  }}>
                  <CircularProgress />
                </Box>
              ) : mappings.length === 0 ? (
                <Box style={{ textAlign: 'center', padding: '32px', color: theme.palette.text.secondary }}>
                  <Typography>{t('categoryMgmt:mappings.noMappings')}</Typography>
                </Box>
              ) : (
                <Grid container spacing={2}>
                  {mappings.map((mapping) => (
                    <Grid key={mapping.id} size={12}>
                      <Card style={{
                        borderRadius: '12px',
                        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#fff',
                        border: theme.palette.mode === 'dark' ? `1px solid ${theme.palette.divider}` : 'none'
                      }}>
                        <CardContent style={{ padding: '16px' }}>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between"
                            }}>
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 2,
                                flex: 1
                              }}>
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="caption" color="textSecondary" sx={{
                                  display: "block"
                                }}>{t('categoryMgmt:mappings.sourceColumn')}</Typography>
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
                                <Typography variant="caption" color="textSecondary" sx={{
                                  display: "block"
                                }}>{t('categoryMgmt:mappings.targetColumn')}</Typography>
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
                                      backgroundColor: categoryColors[mapping.target_category] || 'var(--n-info)',
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
                                    sx={{ color: 'var(--n-info)', mr: 1 }}
                                    title={t('categoryMgmt:mappings.tooltipEditTarget')}
                                  >
                                    <EditIcon />
                                  </IconButton>
                                  <IconButton
                                    onClick={() => handleDeleteMapping(mapping.id)}
                                    size="small"
                                    style={{ color: 'var(--n-error)' }}
                                    title={t('categoryMgmt:mappings.tooltipRemove')}
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
        <Dialog
          open={Boolean(deletingCategory)}
          onClose={() => {
            setDeletingCategory(null);
            setDeleteOptions({ deleteRules: true, deleteBudget: true });
          }}
          slotProps={{
            paper: {
              sx: {
                borderRadius: '16px',
                padding: '8px',
                width: '100%',
                maxWidth: '450px'
              }
            }
          }}
        >
          <DialogTitle sx={{ fontWeight: 700, color: 'var(--n-error)' }}>{t('categoryMgmt:deleteDialog.title')}</DialogTitle>
          <DialogContent>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                mb: 3
              }}>
              {t('categoryMgmt:deleteDialog.description', { name: deletingCategory })}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={deleteOptions.deleteRules}
                    onChange={(e) => setDeleteOptions({ ...deleteOptions, deleteRules: e.target.checked })}
                    disabled={isLoading}
                  />
                }
                label={<Typography variant="body2">{t('categoryMgmt:deleteDialog.alsoDeleteRules')}</Typography>}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={deleteOptions.deleteBudget}
                    onChange={(e) => setDeleteOptions({ ...deleteOptions, deleteBudget: e.target.checked })}
                    disabled={isLoading}
                  />
                }
                label={<Typography variant="body2">{t('categoryMgmt:deleteDialog.alsoDeleteBudget')}</Typography>}
              />
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2, pt: 0 }}>
            <Button
              onClick={() => {
                setDeletingCategory(null);
                setDeleteOptions({ deleteRules: true, deleteBudget: true });
              }}
              sx={{ color: 'text.secondary', textTransform: 'none' }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleDeleteCategory}
              disabled={isLoading}
              sx={{
                bgcolor: 'var(--n-error)',
                '&:hover': { bgcolor: '#dc2626' },
                borderRadius: '8px',
                textTransform: 'none',
                fontWeight: 600,
                px: 3
              }}
            >
              {isLoading ? <CircularProgress size={20} color="inherit" /> : t('categoryMgmt:deleteDialog.title')}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Rename Category Dialog */}
        <Dialog
          open={Boolean(renamingCategory)}
          onClose={() => {
            setRenamingCategory(null);
            setRenameNewName('');
          }}
          slotProps={{
            paper: {
              sx: {
                borderRadius: '16px',
                padding: '8px',
                width: '100%',
                maxWidth: '400px'
              }
            }
          }}
        >
          <DialogTitle sx={{ fontWeight: 700 }}>{t('categoryMgmt:renameDialog.title')}</DialogTitle>
          <DialogContent>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                mb: 3
              }}>
              {t('categoryMgmt:renameDialog.description', { name: renamingCategory })}
            </Typography>
            <TextField
              fullWidth
              label={t('categoryMgmt:renameDialog.newNameLabel')}
              value={renameNewName}
              onChange={(e) => setRenameNewName(e.target.value)}
              disabled={isLoading}
              autoFocus
              sx={{ mt: 1 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameNewName.trim() && renameNewName.trim() !== renamingCategory) {
                  handleRenameCategory();
                }
              }}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2, pt: 0 }}>
            <Button
              onClick={() => {
                setRenamingCategory(null);
                setRenameNewName('');
              }}
              sx={{ color: 'text.secondary', textTransform: 'none' }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleRenameCategory}
              disabled={isLoading || !renameNewName.trim() || renameNewName.trim() === renamingCategory}
              sx={{
                bgcolor: 'var(--n-info)',
                '&:hover': { bgcolor: '#2563eb' },
                borderRadius: '8px',
                textTransform: 'none',
                fontWeight: 600,
                px: 3
              }}
            >
              {isLoading ? <CircularProgress size={20} color="inherit" /> : t('categoryMgmt:renameDialog.renameButton')}
            </Button>
          </DialogActions>
        </Dialog>
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
