import React, { useState, useEffect } from 'react';
import { logger } from '../utils/client-logger';
import {
  Dialog,
  DialogContent,
  Box,
  TextField,
  MenuItem,
  styled,
  Typography,
  IconButton,
  Snackbar,
  Alert,
  useTheme,
  alpha
} from '@mui/material';
import Table from './Table';
import SaveIcon from '@mui/icons-material/Save';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CircularProgress from '@mui/material/CircularProgress';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ModalHeader from './ModalHeader';
import { BANK_VENDORS } from '../utils/constants';

// Card vendor definitions with their logos and colors
export const CARD_VENDORS = {
  visa: {
    name: 'Visa',
    logo: '/card-logos/visa.svg',
    color: '#1A1F71',
  },
  mastercard: {
    name: 'Mastercard',
    logo: '/card-logos/mastercard.svg',
    color: '#EB001B',
  },
  amex: {
    name: 'American Express',
    logo: '/card-logos/amex.svg',
    color: '#006FCF',
  },
  diners: {
    name: 'Diners Club',
    logo: '/card-logos/diners.svg',
    color: '#0079BE',
  },
  discover: {
    name: 'Discover',
    logo: '/card-logos/discover.svg',
    color: '#FF6000',
  },
  isracard: {
    name: 'Isracard',
    logo: '/card-logos/isracard.svg',
    color: '#00529B',
  },
  visaCal: {
    name: 'Visa Cal',
    logo: '/card-logos/visacal.svg',
    color: '#1A1F71',
  },
  max: {
    name: 'Max',
    logo: '/card-logos/max.svg',
    color: '#E31937',
  },
  leumi_card: {
    name: 'Leumi Card',
    logo: '/card-logos/leumi-card.svg',
    color: '#0066B3',
  },
};

interface CardData {
  last4_digits: string;
  transaction_count: number;
  card_vendor: string | null;
  card_nickname: string | null;
  card_vendor_id: number | null;
  card_ownership_id?: number | null;
  linked_bank_account_id?: number | null;
  bank_account_id?: number | null;
  bank_account_nickname?: string | null;
  bank_account_number?: string | null;
  bank_account_vendor?: string | null;
  custom_bank_account_number?: string | null;
  custom_bank_account_nickname?: string | null;
}

interface BankAccount {
  id: number;
  nickname: string;
  bank_account_number?: string;
  vendor: string;
}

interface CardVendorsModalProps {
  isOpen: boolean;
  onClose: () => void;
}


const CardChip = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '8px 16px',
  borderRadius: '12px',
  background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
  color: '#fff',
  fontFamily: 'monospace',
  fontSize: '18px',
  fontWeight: 600,
  letterSpacing: '2px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  minWidth: '140px',
});

// Component to display card vendor logo/icon
export const CardVendorIcon: React.FC<{ vendor: string | null; size?: number }> = ({
  vendor,
  size = 32
}) => {
  const theme = useTheme();
  const isBankVendor = vendor && BANK_VENDORS.includes(vendor);
  const vendorConfig = vendor ? CARD_VENDORS[vendor as keyof typeof CARD_VENDORS] : null;

  if (!vendorConfig) {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(148, 163, 184, 0.2)',
          borderRadius: '8px',
        }}
      >
        {isBankVendor ? (
          <AccountBalanceIcon sx={{ fontSize: size * 0.7, color: 'primary.main' }} />
        ) : (
          <CreditCardIcon sx={{ fontSize: size * 0.7, color: '#64748b' }} />
        )}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.9)' : 'white',
        borderRadius: '8px',
        padding: '4px',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      }}
    >
      <img
        src={vendorConfig.logo}
        alt={vendorConfig.name}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
        }}
        onError={(e) => {
          // Fallback to colored icon if image fails to load
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          target.parentElement!.innerHTML = `<span style="color: ${vendorConfig.color}; font-weight: bold; font-size: ${size * 0.4}px">${vendorConfig.name.substring(0, 2).toUpperCase()}</span>`;
        }}
      />
    </Box>
  );
};

export default function CardVendorsModal({ isOpen, onClose }: CardVendorsModalProps) {
  const theme = useTheme();
  const [cards, setCards] = useState<CardData[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    vendor: string;
    nickname: string;
    bankAccountId: number | null;
    customBankNumber: string;
    customBankNickname: string;
  }>({
    vendor: '',
    nickname: '',
    bankAccountId: null,
    customBankNumber: '',
    customBankNickname: ''
  });
  const [originalValues, setOriginalValues] = useState<typeof editValues | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  useEffect(() => {
    if (isOpen) {
      fetchCards();
      fetchBankAccounts();
    }
  }, [isOpen]);

  const fetchCards = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/cards');
      if (!response.ok) {
        throw new Error('Failed to fetch cards');
      }
      const data = await response.json();
      setCards(data);
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'An error occurred',
        severity: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBankAccounts = async () => {
    try {
      const response = await fetch('/api/credentials');
      if (response.ok) {
        const data = await response.json();
        // Filter to only bank accounts
        const banks = data.filter((acc: any) =>
          ['hapoalim', 'leumi', 'mizrahi', 'discount', 'yahav', 'union', 'otsarHahayal', 'beinleumi', 'massad', 'pagi'].includes(acc.vendor)
        );
        setBankAccounts(banks);
      }
    } catch (err) {
      // Silent fail - bank accounts are supplementary
      logger.error('Failed to fetch bank accounts', err as Error);
    }
  };

  const handleEdit = (card: CardData, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }

    // If we're already editing this card, do nothing
    if (editingCard === card.last4_digits) return;

    // Save previous card if it has changes
    if (editingCard && originalValues) {
      const hasChanges = JSON.stringify(editValues) !== JSON.stringify(originalValues);
      if (hasChanges) {
        handleSave(editingCard, editValues);
      }
    }

    const initialValues = {
      vendor: card.card_vendor || '',
      nickname: card.card_nickname || '',
      bankAccountId: card.linked_bank_account_id || ((card.custom_bank_account_number || card.custom_bank_account_nickname) ? -1 : null),
      customBankNumber: card.custom_bank_account_number || '',
      customBankNickname: card.custom_bank_account_nickname || '',
    };

    setEditingCard(card.last4_digits);
    setEditValues(initialValues);
    setOriginalValues(initialValues);
    setLastSaved(null);
    setIsSaving(false);
  };

  const handleBackgroundClick = () => {
    if (editingCard && originalValues) {
      const hasChanges = JSON.stringify(editValues) !== JSON.stringify(originalValues);
      if (hasChanges) {
        handleSave(editingCard, editValues);
      }
    }
    setEditingCard(null);
  };

  const handleSave = async (last4_digits: string, values: typeof editValues) => {
    try {
      setIsSaving(true);

      // Optimistically update local state to avoid re-fetch and UI flash
      // We do this BEFORE the network request
      setCards(prevCards => prevCards.map(c => {
        if (c.last4_digits === last4_digits) {
          // Find linked bank info if applicable
          const linkedBank = bankAccounts.find(b => b.id === values.bankAccountId);

          return {
            ...c,
            card_vendor: values.vendor,
            card_nickname: values.nickname,
            linked_bank_account_id: values.bankAccountId === -1 ? null : values.bankAccountId,
            bank_account_nickname: linkedBank?.nickname || null,
            bank_account_number: linkedBank?.bank_account_number || null,
            bank_account_vendor: linkedBank?.vendor || null,
            custom_bank_account_number: values.bankAccountId === -1 ? values.customBankNumber : null,
            custom_bank_account_nickname: values.bankAccountId === -1 ? values.customBankNickname : null
          };
        }
        return c;
      }));

      // Update original values to current values so we don't save again
      setOriginalValues(values);
      setLastSaved(new Date());

      // Trigger refresh to update card icons in other views
      window.dispatchEvent(new CustomEvent('cardVendorsUpdated'));

      // Save card vendor info
      const cardResponse = await fetch('/api/cards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          last4_digits,
          card_vendor: values.vendor,
          card_nickname: values.nickname,
        }),
      });

      if (!cardResponse.ok) {
        throw new Error('Failed to save card vendor');
      }

      // Update bank account assignment if card ownership exists
      const card = cards.find(c => c.last4_digits === last4_digits);

      if (card?.card_ownership_id) {
        const payload: any = {};

        if (values.bankAccountId === -1) {
          // Custom bank account validation
          if (!values.customBankNumber?.trim() && !values.customBankNickname?.trim()) {
            throw new Error('Please provide at least a number or nickname for the custom account');
          }

          // Custom bank account
          payload.custom_bank_account_number = values.customBankNumber;
          payload.custom_bank_account_nickname = values.customBankNickname;
          // Ensure linked account is cleared (though API handles this too)
          payload.linked_bank_account_id = null;
        } else {
          // Regular linked account or null
          payload.linked_bank_account_id = values.bankAccountId;
          // Ensure custom fields are cleared (API handles this)
          payload.custom_bank_account_number = null;
          payload.custom_bank_account_nickname = null;
        }

        const bankResponse = await fetch(`/api/cards/ownerships/${card.card_ownership_id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!bankResponse.ok) {
          throw new Error('Failed to update bank account assignment');
        }
      }

    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to save',
        severity: 'error',
      });
      // Optionally revert optimistic update here if needed (skipping for complexity/UX tradeoff)
    } finally {
      setIsSaving(false);
    }
  };

  // Autosave effect
  useEffect(() => {
    if (!editingCard || !originalValues) return;

    // Check if values have actually changed
    const hasChanges = JSON.stringify(editValues) !== JSON.stringify(originalValues);
    if (!hasChanges) return;

    const timeoutId = setTimeout(() => {
      handleSave(editingCard, editValues);
    }, 1000); // Debounce for 1 second

    return () => clearTimeout(timeoutId);
  }, [editValues, editingCard, originalValues]);

  return (
    <>
      <Dialog
        open={isOpen}
        onClose={onClose}
        maxWidth="xl"
        fullWidth
        PaperProps={{
          style: {
            background: theme.palette.mode === 'dark'
              ? `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.98)} 0%, ${alpha(theme.palette.background.default, 0.98)} 100%)`
              : 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%)',
            backdropFilter: 'blur(20px)',
            borderRadius: '28px',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.15)',
            border: `1px solid ${theme.palette.divider}`,
            maxWidth: '1200px',
          },
        }}
        BackdropProps={{
          style: {
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(8px)',
          },
        }}
      >
        <ModalHeader title="Card Vendors" onClose={onClose} />
        <DialogContent style={{ padding: '0 32px 32px', color: theme.palette.text.primary }}>
          <Typography variant="body2" sx={{ mb: 3, color: theme.palette.text.secondary }}>
            Assign a card issuer/brand to each card. This will display the card logo throughout the app.
          </Typography>

          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
              Loading cards...
            </Box>
          ) : cards.length === 0 ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px', color: theme.palette.text.secondary }}>
              No cards found in the system
            </Box>
          ) : (
            <Box
              sx={{
                borderRadius: '20px',
                overflow: 'hidden',
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: '0 2px 12px rgba(0, 0, 0, 0.04)',
                background: theme.palette.mode === 'dark'
                  ? `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.95)} 0%, ${alpha(theme.palette.background.default, 0.95)} 100%)`
                  : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 100%)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <Table
                rows={cards}
                rowKey={(card) => card.last4_digits}
                emptyMessage="No cards found"
                columns={[
                  {
                    id: 'card',
                    label: 'Card',
                    format: (_: any, card: CardData) => (
                      <CardChip>
                        <CardVendorIcon vendor={card.card_vendor} size={28} />
                        •••• {card.last4_digits}
                      </CardChip>
                    )
                  },
                  {
                    id: 'transactions',
                    label: 'Transactions',
                    format: (_: any, card: CardData) => (
                      <Typography
                        sx={{
                          backgroundColor: 'rgba(99, 102, 241, 0.1)',
                          color: '#6366f1',
                          padding: '4px 12px',
                          borderRadius: '20px',
                          fontSize: '14px',
                          fontWeight: 500,
                          display: 'inline-block',
                        }}
                      >
                        {card.transaction_count.toLocaleString()}
                      </Typography>
                    )
                  },
                  {
                    id: 'vendor',
                    label: 'Card Vendor',
                    minWidth: '200px',
                    format: (_: any, card: CardData) => editingCard === card.last4_digits ? (
                      <TextField
                        select
                        size="small"
                        value={editValues.vendor}
                        onChange={(e) => setEditValues({ ...editValues, vendor: e.target.value })}
                        fullWidth
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '12px',
                          },
                        }}
                      >
                        <MenuItem value="">
                          <em>None</em>
                        </MenuItem>
                        {Object.entries(CARD_VENDORS).map(([key, config]) => (
                          <MenuItem key={key} value={key}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <CardVendorIcon vendor={key} size={24} />
                              {config.name}
                            </Box>
                          </MenuItem>
                        ))}
                      </TextField>
                    ) : (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          cursor: 'pointer',
                          padding: '8px 12px',
                          borderRadius: '12px',
                          transition: 'all 0.2s',
                          '&:hover': {
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          },
                        }}
                        onClick={() => handleEdit(card)}
                      >
                        <CardVendorIcon vendor={card.card_vendor} size={24} />
                        <Typography sx={{ color: card.card_vendor ? theme.palette.text.primary : theme.palette.text.disabled }}>
                          {card.card_vendor
                            ? CARD_VENDORS[card.card_vendor as keyof typeof CARD_VENDORS]?.name || card.card_vendor
                            : 'Click to set vendor'}
                        </Typography>
                      </Box>
                    )
                  },
                  {
                    id: 'nickname',
                    label: 'Nickname',
                    format: (_: any, card: CardData) => editingCard === card.last4_digits ? (
                      <TextField
                        size="small"
                        value={editValues.nickname}
                        onChange={(e) => setEditValues({ ...editValues, nickname: e.target.value })}
                        placeholder="e.g., Personal Card"
                        fullWidth
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '12px',
                          },
                        }}
                      />
                    ) : (
                      <Typography
                        sx={{
                          color: card.card_nickname ? theme.palette.text.primary : theme.palette.text.disabled,
                          fontStyle: card.card_nickname ? 'normal' : 'italic',
                          cursor: 'pointer',
                          padding: '8px 12px',
                          borderRadius: '12px',
                          '&:hover': {
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          }
                        }}
                        onClick={() => handleEdit(card)}
                      >
                        {card.card_nickname || 'No nickname'}
                      </Typography>
                    )
                  },
                  {
                    id: 'bankAccount',
                    label: 'Bank Account',
                    minWidth: '200px',
                    format: (_: any, card: CardData) => editingCard === card.last4_digits ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <TextField
                          select
                          size="small"
                          value={editValues.bankAccountId !== null ? editValues.bankAccountId : ''}
                          onChange={(e) => setEditValues({ ...editValues, bankAccountId: e.target.value ? Number(e.target.value) : null })}
                          fullWidth
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              borderRadius: '12px',
                            },
                          }}
                        >
                          <MenuItem value="">
                            <em>No bank account</em>
                          </MenuItem>
                          <MenuItem value="-1">
                            <em>Custom Bank Account</em>
                          </MenuItem>
                          {bankAccounts.map((bankAccount) => (
                            <MenuItem key={bankAccount.id} value={bankAccount.id}>
                              {bankAccount.nickname} ({bankAccount.bank_account_number || bankAccount.vendor})
                            </MenuItem>
                          ))}
                        </TextField>
                        {editValues.bankAccountId === -1 && (
                          <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <TextField
                              size="small"
                              placeholder="Nickname (e.g. My Bank)"
                              value={editValues.customBankNickname}
                              onChange={(e) => setEditValues({ ...editValues, customBankNickname: e.target.value })}
                              fullWidth
                              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                            />
                            <TextField
                              size="small"
                              placeholder="Account Number"
                              value={editValues.customBankNumber}
                              onChange={(e) => setEditValues({ ...editValues, customBankNumber: e.target.value })}
                              fullWidth
                              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                            />
                          </Box>
                        )}
                      </Box>
                    ) : (
                      <Typography
                        sx={{
                          color: card.bank_account_nickname || card.custom_bank_account_nickname ? theme.palette.text.primary : theme.palette.text.disabled,
                          fontStyle: card.bank_account_nickname || card.custom_bank_account_nickname ? 'normal' : 'italic',
                          cursor: 'pointer',
                          padding: '8px 12px',
                          borderRadius: '12px',
                          '&:hover': {
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          }
                        }}
                        onClick={() => handleEdit(card)}
                      >
                        {card.bank_account_nickname
                          ? `${card.bank_account_nickname} (${card.bank_account_number || card.bank_account_vendor})`
                          : card.custom_bank_account_nickname
                            ? `${card.custom_bank_account_nickname} (${card.custom_bank_account_number})`
                            : 'No bank account'}
                      </Typography>
                    )
                  },

                ]}
                mobileCardRenderer={(card: CardData) => (
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <CardChip sx={{ padding: '4px 12px', fontSize: '14px', minWidth: 'auto' }}>
                        <CardVendorIcon vendor={card.card_vendor} size={20} />
                        •••• {card.last4_digits}
                      </CardChip>
                      <Typography
                        sx={{
                          backgroundColor: 'rgba(99, 102, 241, 0.1)',
                          color: '#6366f1',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 500,
                        }}
                      >
                        {card.transaction_count} txns
                      </Typography>
                    </Box>
                    <Box sx={{ mb: 2 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          mb: 1,
                          cursor: 'pointer',
                        }}
                        onClick={() => handleEdit(card)}
                      >
                        <CardVendorIcon vendor={card.card_vendor} size={20} />
                        <Typography variant="body2" sx={{ color: card.card_vendor ? theme.palette.text.primary : theme.palette.text.disabled }}>
                          {card.card_vendor
                            ? CARD_VENDORS[card.card_vendor as keyof typeof CARD_VENDORS]?.name || card.card_vendor
                            : 'Click to set vendor'}
                        </Typography>
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{
                          color: card.card_nickname ? theme.palette.text.primary : theme.palette.text.disabled,
                          fontStyle: card.card_nickname ? 'normal' : 'italic',
                          cursor: 'pointer',
                          mb: 1
                        }}
                        onClick={() => handleEdit(card)}
                      >
                        {card.card_nickname || 'No nickname set'}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          display: 'block',
                          cursor: 'pointer'
                        }}
                        onClick={() => handleEdit(card)}
                      >
                        {card.bank_account_nickname
                          ? `Bank: ${card.bank_account_nickname}`
                          : card.custom_bank_account_nickname
                            ? `Bank: ${card.custom_bank_account_nickname}`
                            : 'No bank account linked'}
                      </Typography>
                    </Box>

                    {editingCard === card.last4_digits && (
                      <Box sx={{ borderTop: `1px solid ${theme.palette.divider}`, pt: 2, mt: 2 }}>
                        {/* Re-use edit fields for mobile if needed, or just show a message to use desktop */}
                        <Typography variant="caption" color="warning.main">Editing available on desktop view</Typography>
                      </Box>
                    )}
                  </Box>
                )}
              />
            </Box >
          )
          }
        </DialogContent >
      </Dialog >

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{
            width: '100%',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
