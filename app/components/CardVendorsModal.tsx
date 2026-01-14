import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
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
import SaveIcon from '@mui/icons-material/Save';
import CreditCardIcon from '@mui/icons-material/CreditCard';
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
        <CreditCardIcon sx={{ fontSize: size * 0.7, color: '#64748b' }} />
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
      const response = await fetch('/api/card_vendors');
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
      console.error('Failed to fetch bank accounts:', err);
    }
  };

  const handleEdit = (card: CardData) => {
    setEditingCard(card.last4_digits);
    setEditValues({
      vendor: card.card_vendor || '',
      nickname: card.card_nickname || '',
      bankAccountId: card.linked_bank_account_id || ((card.custom_bank_account_number || card.custom_bank_account_nickname) ? -1 : null),
      customBankNumber: card.custom_bank_account_number || '',
      customBankNickname: card.custom_bank_account_nickname || '',
    });
  };

  const handleSave = async (last4_digits: string) => {
    try {
      // Save card vendor info
      const cardResponse = await fetch('/api/card_vendors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          last4_digits,
          card_vendor: editValues.vendor,
          card_nickname: editValues.nickname,
        }),
      });

      if (!cardResponse.ok) {
        throw new Error('Failed to save card vendor');
      }

      // Update bank account assignment if card ownership exists
      const card = cards.find(c => c.last4_digits === last4_digits);

      if (card?.card_ownership_id) {
        const payload: any = {};

        if (editValues.bankAccountId === -1) {
          // Custom bank account validation
          if (!editValues.customBankNumber?.trim() && !editValues.customBankNickname?.trim()) {
            throw new Error('Please provide at least a number or nickname for the custom account');
          }

          // Custom bank account
          payload.custom_bank_account_number = editValues.customBankNumber;
          payload.custom_bank_account_nickname = editValues.customBankNickname;
          // Ensure linked account is cleared (though API handles this too)
          payload.linked_bank_account_id = null;
        } else {
          // Regular linked account or null
          payload.linked_bank_account_id = editValues.bankAccountId;
          // Ensure custom fields are cleared (API handles this)
          payload.custom_bank_account_number = null;
          payload.custom_bank_account_nickname = null;
        }

        const bankResponse = await fetch(`/api/card_ownership/${card.card_ownership_id}`, {
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

      setSnackbar({
        open: true,
        message: 'Card settings saved successfully',
        severity: 'success',
      });

      // Refresh cards to get updated data
      await fetchCards();
      setEditingCard(null);

      // Trigger refresh to update card icons in other views
      window.dispatchEvent(new CustomEvent('cardVendorsUpdated'));
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to save',
        severity: 'error',
      });
    }
  };

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
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell
                      style={{
                        color: theme.palette.text.secondary,
                        borderBottom: `2px solid ${theme.palette.divider}`,
                        fontWeight: 600,
                        fontSize: '13px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        background: theme.palette.mode === 'dark' ? alpha(theme.palette.background.default, 0.5) : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                        padding: '16px',
                      }}
                    >
                      Card
                    </TableCell>
                    <TableCell
                      style={{
                        color: '#475569',
                        borderBottom: '2px solid rgba(148, 163, 184, 0.2)',
                        fontWeight: 600,
                        fontSize: '13px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                        padding: '16px',
                      }}
                    >
                      Transactions
                    </TableCell>
                    <TableCell
                      style={{
                        color: '#475569',
                        borderBottom: '2px solid rgba(148, 163, 184, 0.2)',
                        fontWeight: 600,
                        fontSize: '13px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                        padding: '16px',
                        minWidth: '200px',
                      }}
                    >
                      Card Vendor
                    </TableCell>
                    <TableCell
                      style={{
                        color: '#475569',
                        borderBottom: '2px solid rgba(148, 163, 184, 0.2)',
                        fontWeight: 600,
                        fontSize: '13px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                        padding: '16px',
                      }}
                    >
                      Nickname
                    </TableCell>
                    <TableCell
                      style={{
                        color: '#475569',
                        borderBottom: '2px solid rgba(148, 163, 184, 0.2)',
                        fontWeight: 600,
                        fontSize: '13px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                        padding: '16px',
                        minWidth: '200px',
                      }}
                    >
                      Bank Account
                    </TableCell>
                    <TableCell
                      align="right"
                      style={{
                        color: '#475569',
                        borderBottom: '2px solid rgba(148, 163, 184, 0.2)',
                        fontWeight: 600,
                        fontSize: '13px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                        padding: '16px',
                      }}
                    >
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cards.map((card) => (
                    <StyledTableRow key={card.last4_digits}>
                      <TableCell>
                        <CardChip>
                          <CardVendorIcon vendor={card.card_vendor} size={28} />
                          •••• {card.last4_digits}
                        </CardChip>
                      </TableCell>
                      <TableCell style={{ color: '#64748b' }}>
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
                      </TableCell>
                      <TableCell>
                        {editingCard === card.last4_digits ? (
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
                        )}
                      </TableCell>
                      <TableCell>
                        {editingCard === card.last4_digits ? (
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
                            }}
                            onClick={() => handleEdit(card)}
                            style={{ cursor: 'pointer' }}
                          >
                            {card.card_nickname || 'No nickname'}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingCard === card.last4_digits ? (
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
                            }}
                            onClick={() => handleEdit(card)}
                            style={{ cursor: 'pointer' }}
                          >
                            {card.bank_account_nickname
                              ? `${card.bank_account_nickname} (${card.bank_account_number || card.bank_account_vendor})`
                              : card.custom_bank_account_nickname
                                ? `${card.custom_bank_account_nickname} (${card.custom_bank_account_number})`
                                : 'No bank account'}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {editingCard === card.last4_digits && (
                          <IconButton
                            onClick={() => handleSave(card.last4_digits)}
                            sx={{
                              color: '#10b981',
                              '&:hover': {
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                              },
                            }}
                          >
                            <SaveIcon />
                          </IconButton>
                        )}
                      </TableCell>
                    </StyledTableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </DialogContent>
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
