import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Box,
  Button,
  TextField,
  MenuItem,
  styled,
  Typography,
  Tooltip,
  Switch,
  Chip,
  useTheme,
  alpha
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import SyncIcon from '@mui/icons-material/Sync';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import CloseIcon from '@mui/icons-material/Close';
import HistoryIcon from '@mui/icons-material/History';
import ScrapeModal from './ScrapeModal';
import SyncHistoryModal from './SyncHistoryModal';
import { CREDIT_CARD_VENDORS, BANK_VENDORS, BEINLEUMI_GROUP_VENDORS, STANDARD_BANK_VENDORS } from '../utils/constants';
import { dateUtils } from './CategoryDashboard/utils/dateUtils';
import { useNotification } from './NotificationContext';
import ModalHeader from './ModalHeader';

// Format a date as a relative time string (e.g., "2 hours ago", "3 days ago")
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'Just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  } else {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months !== 1 ? 's' : ''} ago`;
  }
}

interface Account {
  id: number;
  vendor: string;
  username?: string;
  id_number?: string;
  card6_digits?: string;
  bank_account_number?: string;
  nickname?: string;
  is_active: boolean;
  // SECURITY: password field removed - fetched separately when needed
  created_at: string;
  last_synced_at?: string;
}

interface AccountWithPassword extends Account {
  password: string;
}

interface CardOwnership {
  id: number;
  vendor: string;
  account_number: string;
  credential_id: number;
  linked_bank_account_id?: number;
  card_vendor?: string;
  card_nickname?: string;
  bank_account_id?: number;
  bank_account_nickname?: string;
  bank_account_number?: string;
  bank_account_vendor?: string;
}

interface AccountsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const StyledTableRow = styled(TableRow)(({ theme }) => ({
  transition: 'all 0.2s ease-in-out',
  '&:nth-of-type(odd)': {
    backgroundColor: theme.palette.mode === 'dark' ? alpha(theme.palette.primary.main, 0.05) : 'rgba(248, 250, 252, 0.5)',
  },
  '&:hover': {
    background: theme.palette.mode === 'dark'
      ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.15)} 0%, ${alpha(theme.palette.secondary.main, 0.15)} 100%)`
      : 'linear-gradient(135deg, rgba(96, 165, 250, 0.05) 0%, rgba(167, 139, 250, 0.05) 100%)',
    transform: 'scale(1.005)',
  },
}));

const SectionHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '20px 0',
  marginBottom: '20px',
  borderBottom: `2px solid ${theme.palette.divider}`,
  background: theme.palette.mode === 'dark'
    ? `linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, transparent 100%)`
    : 'linear-gradient(90deg, rgba(96, 165, 250, 0.05) 0%, transparent 100%)',
  borderRadius: '8px',
  paddingLeft: '12px',
  '& .MuiTypography-root': {
    fontWeight: 700,
    fontSize: '18px',
    letterSpacing: '-0.01em',
  },
}));

const AccountSection = styled(Box)(({ theme }) => ({
  marginBottom: '32px',
  '&:last-child': {
    marginBottom: 0,
  },
}));

export default function AccountsModal({ isOpen, onClose }: AccountsModalProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cardOwnership, setCardOwnership] = useState<CardOwnership[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [isScrapeModalOpen, setIsScrapeModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountWithPassword | null>(null);
  const [editingCardBankAccount, setEditingCardBankAccount] = useState<number | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const { showNotification } = useNotification();
  const theme = useTheme();
  const [formAccount, setFormAccount] = useState({
    vendor: 'isracard',
    username: '',
    id_number: '',
    card6_digits: '',
    bank_account_number: '',
    password: '',
    nickname: '',
    id: 0,
    created_at: new Date().toISOString(),
  });
  const [truncateConfirm, setTruncateConfirm] = useState<{ isOpen: boolean; account: Account | null }>({
    isOpen: false,
    account: null,
  });
  const [isTruncating, setIsTruncating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchAccounts();
      fetchCardOwnership();
    }
  }, [isOpen]);

  const fetchAccounts = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/credentials');
      if (!response.ok) {
        throw new Error('Failed to fetch accounts');
      }
      const data = await response.json();
      setAccounts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCardOwnership = async () => {
    try {
      const response = await fetch('/api/card_ownership');
      if (response.ok) {
        const data = await response.json();
        setCardOwnership(data);
      }
    } catch (err) {
      // Silent fail - card ownership is supplementary info
      console.error('Failed to fetch card ownership:', err);
    }
  };

  // Helper to get owned cards for a specific credential
  const getOwnedCards = (credentialId: number): CardOwnership[] => {
    return cardOwnership.filter(co => co.credential_id === credentialId);
  };

  // Helper to get bank accounts for dropdown
  const getBankAccounts = (): Account[] => {
    return accounts.filter(account => BANK_VENDORS.includes(account.vendor));
  };

  // Update card's linked bank account
  const handleUpdateCardBankAccount = async (cardId: number, bankAccountId: number | null) => {
    try {
      const response = await fetch(`/api/card_ownership/${cardId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ linked_bank_account_id: bankAccountId }),
      });

      if (!response.ok) {
        throw new Error('Failed to update card bank account');
      }

      await fetchCardOwnership();
      setEditingCardBankAccount(null);
      showNotification('Card bank account updated successfully', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update card bank account');
      showNotification('Failed to update card bank account', 'error');
    }
  };

  const resetFormAccount = () => {
    setFormAccount({
      vendor: 'isracard',
      username: '',
      id_number: '',
      card6_digits: '',
      bank_account_number: '',
      password: '',
      nickname: '',
      id: 0,
      created_at: new Date().toISOString(),
    });
  };

  const validateForm = (requirePassword: boolean = true): boolean => {
    // Validate based on vendor type
    if (formAccount.vendor === 'visaCal' || formAccount.vendor === 'max') {
      if (!formAccount.username) {
        setError('Username is required for Visa Cal and Max');
        return false;
      }
      if (formAccount.id_number) {
        setError('ID number is not used for Visa Cal and Max');
        return false;
      }
    } else if (formAccount.vendor === 'isracard' || formAccount.vendor === 'amex') {
      if (!formAccount.id_number) {
        setError('ID number is required for Isracard and American Express');
        return false;
      }
      if (!formAccount.card6_digits) {
        setError('Card 6 digits is required for Isracard and American Express login');
        return false;
      }
      if (formAccount.username) {
        setError('Username is not used for Isracard and American Express');
        return false;
      }
    } else if (BEINLEUMI_GROUP_VENDORS.includes(formAccount.vendor)) {
      // Beinleumi Group banks only need username/ID, no account number
      if (!formAccount.username) {
        setError('Username/ID is required for Beinleumi Group banks');
        return false;
      }
    } else if (STANDARD_BANK_VENDORS.includes(formAccount.vendor)) {
      // Standard banks need both username and account number
      if (!formAccount.username) {
        setError('Username is required for bank accounts');
        return false;
      }
      if (!formAccount.bank_account_number) {
        setError('Bank account number is required for bank accounts');
        return false;
      }
    }

    if (requirePassword && !formAccount.password) {
      setError('Password is required');
      return false;
    }
    if (!formAccount.nickname) {
      setError('Account nickname is required');
      return false;
    }
    return true;
  };

  const handleAdd = async () => {
    if (!validateForm(true)) return;

    try {
      const response = await fetch('/api/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formAccount),
      });

      if (response.ok) {
        await fetchAccounts();
        resetFormAccount();
        setIsAdding(false);
        showNotification('Account added successfully', 'success');
      } else {
        throw new Error('Failed to add account');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleEdit = (account: Account) => {
    setFormAccount({
      vendor: account.vendor,
      username: account.username || '',
      id_number: account.id_number || '',
      card6_digits: account.card6_digits || '',
      bank_account_number: account.bank_account_number || '',
      password: '', // Don't pre-fill password for security
      nickname: account.nickname || '',
      id: account.id,
      created_at: account.created_at,
    });
    setEditingAccountId(account.id);
    setIsEditing(true);
    setError(null);
  };

  const handleUpdate = async () => {
    // Password is optional when editing (empty means keep existing)
    if (!validateForm(false)) return;

    try {
      const response = await fetch(`/api/credentials/${editingAccountId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formAccount),
      });

      if (response.ok) {
        await fetchAccounts();
        resetFormAccount();
        setIsEditing(false);
        setEditingAccountId(null);
        showNotification('Account updated successfully', 'success');
      } else {
        throw new Error('Failed to update account');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleCancelForm = () => {
    resetFormAccount();
    setIsAdding(false);
    setIsEditing(false);
    setEditingAccountId(null);
    setError(null);
  };

  const handleDelete = async (accountID: number) => {
    try {
      const response = await fetch(`/api/credentials/${accountID}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setAccounts(accounts.filter((account) => account.id !== accountID));
      } else {
        throw new Error('Failed to delete account');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleToggleActive = async (account: Account) => {
    try {
      const response = await fetch(`/api/credentials/${account.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: !account.is_active }),
      });
      if (response.ok) {
        const updatedAccount = await response.json();
        setAccounts(accounts.map((a) =>
          a.id === account.id ? { ...a, is_active: updatedAccount.is_active } : a
        ));
        showNotification(
          `Account ${account.nickname} ${updatedAccount.is_active ? 'activated' : 'deactivated'}`,
          'success'
        );
      } else {
        throw new Error('Failed to update account status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleTruncateClick = (account: Account) => {
    setTruncateConfirm({ isOpen: true, account });
  };

  const handleTruncateConfirm = async () => {
    if (!truncateConfirm.account) return;

    setIsTruncating(true);
    try {
      const response = await fetch(`/api/credentials/truncate/${truncateConfirm.account.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to truncate account data');
      }

      const result = await response.json();
      showNotification(`Successfully deleted ${result.deletedCount} transactions for ${truncateConfirm.account.nickname || truncateConfirm.account.vendor}`, 'success');

      // Refresh data across the app
      window.dispatchEvent(new CustomEvent('dataRefresh'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to truncate account data');
      showNotification('Failed to truncate account data', 'error');
    } finally {
      setIsTruncating(false);
      setTruncateConfirm({ isOpen: false, account: null });
    }
  };

  const handleTruncateCancel = () => {
    setTruncateConfirm({ isOpen: false, account: null });
  };

  const handleScrape = async (account: Account) => {
    try {
      // SECURITY: Fetch full credentials including password from secure endpoint
      const response = await fetch(`/api/credentials/${account.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch account credentials');
      }
      const accountWithPassword: AccountWithPassword = await response.json();

      setSelectedAccount(accountWithPassword);
      setIsScrapeModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load credentials for scraping');
      showNotification('Failed to load credentials for scraping', 'error');
    }
  };

  const handleScrapeSuccess = () => {
    showNotification('Scraping process completed successfully!', 'success');
    window.dispatchEvent(new CustomEvent('dataRefresh'));
    // Refresh accounts to update last_synced_at and card ownership
    fetchAccounts();
    fetchCardOwnership();
  };

  // Separate accounts by type
  const bankAccounts = accounts.filter(account => BANK_VENDORS.includes(account.vendor));
  const creditAccounts = accounts.filter(account => CREDIT_CARD_VENDORS.includes(account.vendor));

  const renderAccountTable = (accounts: Account[], type: 'bank' | 'credit') => {
    if (accounts.length === 0) {
      return (
        <Box sx={{
          display: 'flex',
          justifyContent: 'center',
          padding: '32px',
          color: theme.palette.text.secondary,
          fontStyle: 'italic'
        }}>
          No {type === 'bank' ? 'bank' : 'credit card'} accounts found
        </Box>
      );
    }

    // Shared header cell style for theme consistency
    const headerCellStyle = {
      color: theme.palette.text.secondary,
      borderBottom: `2px solid ${theme.palette.divider}`,
      fontWeight: 600,
      fontSize: '13px',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
      background: 'var(--table-header-bg)',
      padding: '16px'
    };

    return (
      <Box sx={{
        borderRadius: '20px',
        overflow: 'hidden',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.04)',
        background: theme.palette.mode === 'dark'
          ? `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.95)} 0%, ${alpha(theme.palette.background.default, 0.95)} 100%)`
          : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 100%)',
        backdropFilter: 'blur(10px)'
      }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell style={headerCellStyle}>Nickname</TableCell>
              <TableCell style={headerCellStyle}>Vendor</TableCell>
              <TableCell style={headerCellStyle}>{type === 'bank' ? 'Username' : 'ID Number'}</TableCell>
              {type === 'bank' ? (
                <TableCell style={headerCellStyle}>Account Number</TableCell>
              ) : (
                <TableCell style={headerCellStyle}>Card Last Digits</TableCell>
              )}
              <TableCell style={headerCellStyle}>Last Synced</TableCell>
              <TableCell align="center" style={headerCellStyle}>Active</TableCell>
              <TableCell align="right" style={headerCellStyle}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {accounts.map((account) => (
              <StyledTableRow
                key={account.id}
                sx={{
                  opacity: account.is_active ? 1 : 0.6,
                }}
              >
                <TableCell style={{ color: account.is_active ? theme.palette.text.primary : theme.palette.text.disabled }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      {account.nickname}
                      {!account.is_active && (
                        <Tooltip title="Account is inactive - won't be synced automatically">
                          <PauseCircleOutlineIcon
                            sx={{
                              fontSize: '16px',
                              ml: 1,
                              verticalAlign: 'middle',
                              color: '#94a3b8'
                            }}
                          />
                        </Tooltip>
                      )}
                    </Box>
                    {type === 'credit' && getOwnedCards(account.id).length > 0 && (
                      <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                        {getOwnedCards(account.id).map((card) => (
                          <Box key={card.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {editingCardBankAccount === card.id ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <TextField
                                  select
                                  size="small"
                                  value={card.linked_bank_account_id || ''}
                                  onChange={(e) => {
                                    const bankAccountId = e.target.value ? Number(e.target.value) : null;
                                    handleUpdateCardBankAccount(card.id, bankAccountId);
                                  }}
                                  sx={{
                                    minWidth: 150,
                                    '& .MuiOutlinedInput-root': {
                                      fontSize: '11px',
                                      height: '24px',
                                    },
                                  }}
                                  SelectProps={{
                                    native: true,
                                  }}
                                >
                                  <option value="">No bank account</option>
                                  {getBankAccounts().map((bankAccount) => (
                                    <option key={bankAccount.id} value={bankAccount.id}>
                                      {bankAccount.nickname} ({bankAccount.bank_account_number || bankAccount.vendor})
                                    </option>
                                  ))}
                                </TextField>
                                <IconButton
                                  size="small"
                                  onClick={() => setEditingCardBankAccount(null)}
                                  sx={{
                                    padding: '2px',
                                    color: '#64748b',
                                    '&:hover': { backgroundColor: 'rgba(100, 116, 139, 0.1)' }
                                  }}
                                >
                                  <CloseIcon sx={{ fontSize: '14px' }} />
                                </IconButton>
                              </Box>
                            ) : (
                              <Tooltip
                                title={
                                  <Box>
                                    <Box>{card.card_nickname || card.card_vendor || `Card ending in ${card.account_number}`}</Box>
                                    {card.bank_account_nickname ? (
                                      <Box sx={{ mt: 0.5, fontSize: '11px' }}>
                                        Bank: {card.bank_account_nickname} ({card.bank_account_number || card.bank_account_vendor})
                                      </Box>
                                    ) : (
                                      <Box sx={{ mt: 0.5, fontSize: '11px', fontStyle: 'italic' }}>
                                        No bank account linked
                                      </Box>
                                    )}
                                  </Box>
                                }
                              >
                                <Chip
                                  size="small"
                                  label={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <span>****{card.account_number}</span>
                                      {card.bank_account_nickname && (
                                        <span style={{ fontSize: '9px', opacity: 0.7 }}>
                                          • {card.bank_account_nickname}
                                        </span>
                                      )}
                                    </Box>
                                  }
                                  onClick={() => setEditingCardBankAccount(card.id)}
                                  sx={{
                                    height: '20px',
                                    fontSize: '11px',
                                    backgroundColor: card.linked_bank_account_id
                                      ? 'rgba(59, 130, 246, 0.1)'
                                      : 'rgba(139, 92, 246, 0.1)',
                                    color: card.linked_bank_account_id ? '#2563eb' : '#7c3aed',
                                    border: `1px solid ${card.linked_bank_account_id ? 'rgba(59, 130, 246, 0.2)' : 'rgba(139, 92, 246, 0.2)'}`,
                                    cursor: 'pointer',
                                    '&:hover': {
                                      backgroundColor: card.linked_bank_account_id
                                        ? 'rgba(59, 130, 246, 0.15)'
                                        : 'rgba(139, 92, 246, 0.15)',
                                    },
                                    '& .MuiChip-label': {
                                      px: 1,
                                    },
                                  }}
                                />
                              </Tooltip>
                            )}
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Box>
                </TableCell>
                <TableCell style={{ color: account.is_active ? theme.palette.text.primary : theme.palette.text.disabled }}>{account.vendor}</TableCell>
                <TableCell style={{ color: account.is_active ? theme.palette.text.primary : theme.palette.text.disabled }}>{account.username || account.id_number}</TableCell>
                <TableCell style={{ color: account.is_active ? theme.palette.text.primary : theme.palette.text.disabled }}>{type === 'bank' ? account.bank_account_number : (account.card6_digits || '-')}</TableCell>
                <TableCell style={{ color: account.is_active ? theme.palette.text.secondary : theme.palette.text.disabled }}>
                  {account.last_synced_at ? (
                    <Tooltip title={dateUtils.formatDate(account.last_synced_at)}>
                      <span>{formatRelativeTime(account.last_synced_at)}</span>
                    </Tooltip>
                  ) : (
                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Never</span>
                  )}
                </TableCell>
                <TableCell align="center">
                  <Tooltip title={account.is_active ? 'Click to deactivate (won\'t be synced automatically)' : 'Click to activate'}>
                    <Switch
                      checked={account.is_active}
                      onChange={() => handleToggleActive(account)}
                      size="small"
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': {
                          color: '#22c55e',
                        },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                          backgroundColor: '#22c55e',
                        },
                      }}
                    />
                  </Tooltip>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit account">
                    <IconButton
                      onClick={() => handleEdit(account)}
                      sx={{
                        color: '#8b5cf6',
                        '&:hover': {
                          backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        },
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={account.is_active ? "Sync transactions" : "Activate account to sync"}>
                    <span>
                      <IconButton
                        onClick={() => handleScrape(account)}
                        disabled={!account.is_active}
                        sx={{
                          color: account.is_active ? '#3b82f6' : '#cbd5e1',
                          '&:hover': {
                            backgroundColor: account.is_active ? 'rgba(59, 130, 246, 0.1)' : undefined,
                          },
                        }}
                      >
                        <SyncIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Delete all transactions for this account">
                    <IconButton
                      onClick={() => handleTruncateClick(account)}
                      sx={{
                        color: '#f59e0b',
                        '&:hover': {
                          backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        },
                      }}
                    >
                      <DeleteSweepIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete account">
                    <IconButton
                      onClick={() => handleDelete(account.id)}
                      sx={{
                        color: '#ef4444',
                        '&:hover': {
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        },
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </StyledTableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    );
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onClose={() => {
          if (isAdding || isEditing) {
            handleCancelForm();
          } else {
            onClose();
          }
        }}
        maxWidth="md"
        fullWidth
        PaperProps={{
          style: {
            background: theme.palette.mode === 'dark'
              ? `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.98)} 0%, ${alpha(theme.palette.background.default, 0.98)} 100%)`
              : 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%)',
            backdropFilter: 'blur(20px)',
            borderRadius: '28px',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.15)',
            border: `1px solid ${theme.palette.divider}`
          }
        }}
        BackdropProps={{
          style: {
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(8px)'
          }
        }}
      >
        <ModalHeader
          title={isEditing ? "Edit Account" : "Accounts Management"}
          onClose={() => {
            if (isAdding || isEditing) {
              handleCancelForm();
            } else {
              onClose();
            }
          }}
          startAction={
            !isAdding && !isEditing && (
              <Button
                startIcon={<HistoryIcon />}
                onClick={() => setIsHistoryOpen(true)}
                variant="outlined"
                size="small"
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  borderColor: '#cbd5e1',
                  color: '#64748b',
                  mr: 2,
                  '&:hover': {
                    borderColor: '#94a3b8',
                    bgcolor: '#f8fafc'
                  }
                }}
              >
                Sync History
              </Button>
            )
          }
          actions={
            !isAdding && !isEditing && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setIsAdding(true)}
                sx={{
                  backgroundColor: '#3b82f6',
                  '&:hover': {
                    backgroundColor: '#2563eb',
                  },
                }}
              >
                Add Account
              </Button>
            )
          }
        />
        <DialogContent style={{ padding: '0 32px 32px', color: theme.palette.text.primary }}>
          {error && (
            <div style={{
              background: theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.1) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: theme.palette.mode === 'dark' ? '#fca5a5' : '#1e293b',
              padding: '16px',
              borderRadius: '16px',
              marginBottom: '16px',
              boxShadow: '0 8px 24px rgba(239, 68, 68, 0.3)',
              backdropFilter: 'blur(10px)'
            }}>
              {error}
            </div>
          )}
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
              Loading accounts...
            </Box>
          ) : accounts.length === 0 && !isAdding && !isEditing ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
              No saved accounts found
            </Box>
          ) : isAdding || isEditing ? (
            <Box sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ mb: 2, color: isEditing ? '#8b5cf6' : '#3b82f6' }}>
                {isEditing ? 'Edit Account' : 'Add New Account'}
              </Typography>
              <TextField
                fullWidth
                label="Account Nickname"
                value={formAccount.nickname}
                onChange={(e) => setFormAccount({ ...formAccount, nickname: e.target.value })}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                select
                label="Vendor"
                value={formAccount.vendor}
                onChange={(e) => {
                  const vendor = e.target.value;
                  setFormAccount({
                    ...formAccount,
                    vendor,
                    // Clear fields that are not used for the selected vendor
                    username: vendor === 'visaCal' || vendor === 'max' || BANK_VENDORS.includes(vendor) ? formAccount.username : '',
                    id_number: vendor === 'isracard' || vendor === 'amex' ? formAccount.id_number : '',
                    bank_account_number: BANK_VENDORS.includes(vendor) ? formAccount.bank_account_number : '',
                  });
                }}
                margin="normal"
                disabled={isEditing} // Don't allow changing vendor when editing
              >
                <MenuItem value="isracard">Isracard</MenuItem>
                <MenuItem value="amex">American Express</MenuItem>
                <MenuItem value="visaCal">Visa Cal</MenuItem>
                <MenuItem value="max">Max</MenuItem>
                <MenuItem value="hapoalim">Bank Hapoalim</MenuItem>
                <MenuItem value="leumi">Bank Leumi</MenuItem>
                <MenuItem value="mizrahi">Mizrahi Tefahot</MenuItem>
                <MenuItem value="discount">Discount Bank</MenuItem>
                <MenuItem value="otsarHahayal">Otsar Hahayal</MenuItem>
                <MenuItem value="beinleumi">Beinleumi</MenuItem>
                <MenuItem value="massad">Massad</MenuItem>
                <MenuItem value="pagi">Pagi</MenuItem>
                <MenuItem value="yahav">Yahav</MenuItem>
                <MenuItem value="union">Union Bank</MenuItem>
              </TextField>
              {(formAccount.vendor === 'visaCal' || formAccount.vendor === 'max' || BANK_VENDORS.includes(formAccount.vendor)) ? (
                <TextField
                  fullWidth
                  label="Username"
                  value={formAccount.username}
                  onChange={(e) => setFormAccount({ ...formAccount, username: e.target.value })}
                  margin="normal"
                  required
                />
              ) : (
                <TextField
                  fullWidth
                  label="ID Number"
                  value={formAccount.id_number}
                  onChange={(e) => setFormAccount({ ...formAccount, id_number: e.target.value })}
                  margin="normal"
                  required
                />
              )}
              {STANDARD_BANK_VENDORS.includes(formAccount.vendor) && (
                <TextField
                  fullWidth
                  label="Bank Account Number"
                  value={formAccount.bank_account_number}
                  onChange={(e) => setFormAccount({ ...formAccount, bank_account_number: e.target.value })}
                  margin="normal"
                  required
                  helperText="Required for standard banks"
                />
              )}
              {BEINLEUMI_GROUP_VENDORS.includes(formAccount.vendor) && (
                <TextField
                  fullWidth
                  label="Username / ID"
                  value={formAccount.username}
                  onChange={(e) => setFormAccount({ ...formAccount, username: e.target.value })}
                  margin="normal"
                  required
                  helperText="Your ID number (no account number needed for this bank)"
                />
              )}
              {(formAccount.vendor === 'isracard' || formAccount.vendor === 'amex') && (
                <TextField
                  fullWidth
                  label="Card Last 6 Digits"
                  value={formAccount.card6_digits}
                  onChange={(e) => setFormAccount({ ...formAccount, card6_digits: e.target.value })}
                  margin="normal"
                  required
                  helperText="Required for login - the last 6 digits of your credit card"
                />
              )}
              <TextField
                fullWidth
                label={isEditing ? "Password (leave blank to keep current)" : "Password"}
                type="password"
                value={formAccount.password}
                onChange={(e) => setFormAccount({ ...formAccount, password: e.target.value })}
                margin="normal"
                required={!isEditing}
                helperText={isEditing ? "Leave blank to keep the existing password" : undefined}
              />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                <Button onClick={handleCancelForm} sx={{ mr: 1 }}>
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={isEditing ? handleUpdate : handleAdd}
                  sx={{
                    backgroundColor: isEditing ? '#8b5cf6' : '#3b82f6',
                    '&:hover': {
                      backgroundColor: isEditing ? '#7c3aed' : '#2563eb',
                    },
                  }}
                >
                  {isEditing ? 'Save Changes' : 'Add'}
                </Button>
              </Box>
            </Box>
          ) : (
            <Box>
              {/* Bank Accounts Section */}
              <AccountSection>
                <SectionHeader>
                  <AccountBalanceIcon sx={{ color: '#3b82f6', fontSize: '24px' }} />
                  <Typography variant="h6" color="primary">
                    Bank Accounts ({bankAccounts.length})
                  </Typography>
                </SectionHeader>
                {renderAccountTable(bankAccounts, 'bank')}
              </AccountSection>

              {/* Credit Card Accounts Section */}
              <AccountSection>
                <SectionHeader>
                  <CreditCardIcon sx={{ color: '#8b5cf6', fontSize: '24px' }} />
                  <Typography variant="h6" sx={{ color: '#8b5cf6' }}>
                    Credit Card Accounts ({creditAccounts.length})
                  </Typography>
                </SectionHeader>
                {renderAccountTable(creditAccounts, 'credit')}
              </AccountSection>
            </Box>
          )}
        </DialogContent>
      </Dialog>
      <ScrapeModal
        isOpen={isScrapeModalOpen}
        onClose={() => {
          setIsScrapeModalOpen(false);
          setSelectedAccount(null);
        }}
        onSuccess={handleScrapeSuccess}
        initialConfig={selectedAccount ? {
          options: {
            companyId: selectedAccount.vendor,
            startDate: new Date(),
            combineInstallments: false,
            showBrowser: false,
            additionalTransactionInformation: true
          },
          credentials: {
            id: selectedAccount.id_number,
            card6Digits: selectedAccount.card6_digits,
            password: selectedAccount.password,
            username: selectedAccount.username,
            bankAccountNumber: selectedAccount.bank_account_number,
            nickname: selectedAccount.nickname
          },
          credentialId: selectedAccount.id
        } : undefined}
      />

      <SyncHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />

      {/* Truncate Confirmation Dialog */}
      <Dialog
        open={truncateConfirm.isOpen}
        onClose={handleTruncateCancel}
        PaperProps={{
          style: {
            borderRadius: '16px',
            padding: '8px',
          }
        }}
      >
        <DialogTitle sx={{
          color: '#f59e0b',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 1
        }}>
          <DeleteSweepIcon />
          Truncate Account Data
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Are you sure you want to delete <strong>all transactions</strong> for account{' '}
            <strong>{truncateConfirm.account?.nickname || truncateConfirm.account?.vendor}</strong>?
          </Typography>
          <Typography variant="body2" sx={{ color: '#ef4444' }}>
            ⚠️ This action cannot be undone. All transaction history for this account will be permanently deleted.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px' }}>
          <Button
            onClick={handleTruncateCancel}
            disabled={isTruncating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleTruncateConfirm}
            variant="contained"
            disabled={isTruncating}
            sx={{
              backgroundColor: '#f59e0b',
              '&:hover': {
                backgroundColor: '#d97706',
              },
            }}
          >
            {isTruncating ? 'Deleting...' : 'Delete All Transactions'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}