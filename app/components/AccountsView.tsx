import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Typography,
    Button,
    Grid,
    useTheme,
    alpha,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    MenuItem,
    Container,
    Tooltip
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import AddIcon from '@mui/icons-material/Add';
import HistoryIcon from '@mui/icons-material/History';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AccountCard from './AccountCard';
import SyncHistoryModal from './SyncHistoryModal';
import { useNotification } from './NotificationContext';
import { useView } from './Layout';
import { CREDIT_CARD_VENDORS, BANK_VENDORS, STANDARD_BANK_VENDORS } from '../utils/constants';
import { logger } from '../utils/client-logger';
import PageHeader from './PageHeader';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import { useStatus } from '../context/StatusContext';
import { useTranslation, Trans } from 'react-i18next';

interface Account {
    id: number;
    vendor: string;
    username?: string;
    id_number?: string;
    card6_digits?: string;
    bank_account_number?: string;
    phone_number?: string;
    has_otp_long_term_token?: boolean;
    nickname?: string;
    is_active: boolean;
    created_at?: string;
    last_synced_at?: string;
}

interface CardOwnership {
    id: number;
    vendor: string;
    account_number: string;
    credential_id: number;
    linked_bank_account_id?: number;
    card_nickname?: string;
    bank_account_nickname?: string;
    is_hidden?: boolean;
}

const AccountsView: React.FC = () => {
    const theme = useTheme();
    const { t } = useTranslation('views');
    const { showNotification } = useNotification();
    const { setSyncDrawerOpen } = useView();

    const [accounts, setAccounts] = useState<Account[]>([]);
    const [cardOwnership, setCardOwnership] = useState<CardOwnership[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingAccount, setEditingAccount] = useState<Account | null>(null);

    const [formAccount, setFormAccount] = useState({
        vendor: 'isracard',
        username: '',
        id_number: '',
        card6_digits: '',
        bank_account_number: '',
        phone_number: '',
        password: '',
        nickname: '',
        id: 0,
    });

    const [truncateConfirm, setTruncateConfirm] = useState<{ isOpen: boolean; account: Account | null }>({
        isOpen: false,
        account: null,
    });
    const [isTruncating, setIsTruncating] = useState(false);

    const fetchAccounts = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await fetch('/api/credentials');
            if (response.ok) {
                setAccounts(await response.json());
            }
        } catch (_err) {
            showNotification(t('accounts.notifications.fetchFailed'), 'error');
        } finally {
            setIsLoading(false);
        }
    }, [showNotification, t]);

    const fetchCardOwnership = useCallback(async () => {
        try {
            const response = await fetch('/api/cards/ownerships', { cache: 'no-store' });
            if (response.ok) {
                setCardOwnership(await response.json());
            }
        } catch (err) {
            logger.error('Failed to fetch card ownership', err);
        }
    }, []);

    const { isVaultLocked } = useStatus();

    useEffect(() => {
        queueMicrotask(() => {
            fetchAccounts();
            fetchCardOwnership();
        });
    }, [fetchAccounts, fetchCardOwnership, isVaultLocked]);

    const handleToggleActive = async (account: Account) => {
        try {
            const response = await fetch(`/api/credentials/${account.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !account.is_active }),
            });
            if (response.ok) {
                const updated = await response.json();
                setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, is_active: updated.is_active } : a));
                const name = account.nickname || account.vendor;
                showNotification(updated.is_active ? t('accounts.notifications.activated', { name }) : t('accounts.notifications.deactivated', { name }), 'success');
            }
        } catch (_err) {
            showNotification(t('accounts.notifications.toggleFailed'), 'error');
        }
    };

    const handleSync = (account: Account) => {
        setSyncDrawerOpen(true);
        window.dispatchEvent(new CustomEvent('triggerSync', {
            detail: {
                accountId: account.id,
                vendor: account.vendor,
                nickname: account.nickname
            }
        }));
    };

    const handleDeleteAccount = async (id: number) => {
        if (!window.confirm(t('accounts.removeConfirm'))) return;
        try {
            const response = await fetch(`/api/credentials/${id}`, { method: 'DELETE' });
            if (response.ok) {
                setAccounts(prev => prev.filter(a => a.id !== id));
                showNotification(t('accounts.notifications.removed'), 'success');
            }
        } catch (_err) {
            showNotification(t('accounts.notifications.removeFailed'), 'error');
        }
    };

    const handleTruncateConfirm = async () => {
        if (!truncateConfirm.account) return;
        setIsTruncating(true);
        try {
            const response = await fetch(`/api/credentials/truncate/${truncateConfirm.account.id}`, { method: 'DELETE' });
            if (response.ok) {
                const result = await response.json();
                showNotification(t('accounts.notifications.deletedTransactions', { count: result.deletedCount }), 'success');
                window.dispatchEvent(new CustomEvent('dataRefresh'));
            }
        } catch (_err) {
            showNotification(t('accounts.notifications.deleteTransactionsFailed'), 'error');
        } finally {
            setIsTruncating(false);
            setTruncateConfirm({ isOpen: false, account: null });
        }
    };

    const handleUpdateCardLink = async (cardId: number, bankAccountId: number | null) => {
        try {
            const response = await fetch(`/api/cards/ownerships/${cardId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ linked_bank_account_id: bankAccountId }),
            });
            if (response.ok) {
                fetchCardOwnership();
                showNotification(t('accounts.notifications.linkUpdated'), 'success');
            }
        } catch (_err) {
            showNotification(t('accounts.notifications.linkUpdateFailed'), 'error');
        }
    };

    const handleToggleCardVisibility = async (cardId: number, isHidden: boolean) => {
        // Optimistic update so UI reflects change immediately
        setCardOwnership(prev => prev.map(co =>
            co.id === cardId ? { ...co, is_hidden: isHidden } : co
        ));
        try {
            const response = await fetch(`/api/cards/ownerships/${cardId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_hidden: isHidden }),
            });
            if (response.ok) {
                window.dispatchEvent(new CustomEvent('dataRefresh'));
            } else {
                // Revert on failure
                setCardOwnership(prev => prev.map(co =>
                    co.id === cardId ? { ...co, is_hidden: !isHidden } : co
                ));
                showNotification(t('accounts.notifications.visibilityFailed'), 'error');
            }
        } catch (_err) {
            // Revert on error
            setCardOwnership(prev => prev.map(co =>
                co.id === cardId ? { ...co, is_hidden: !isHidden } : co
            ));
            showNotification(t('accounts.notifications.visibilityFailed'), 'error');
        }
    };

    const handleSaveAccount = async () => {
        const isEditingMode = !!editingAccount;
        const url = isEditingMode ? `/api/credentials/${editingAccount.id}` : '/api/credentials';
        const method = isEditingMode ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formAccount),
            });

            if (response.ok) {
                fetchAccounts();
                setIsAdding(false);
                setIsEditing(false);
                setEditingAccount(null);
                showNotification(isEditingMode ? t('accounts.notifications.accountUpdated') : t('accounts.notifications.accountAdded'), 'success');
            } else {
                const data = await response.json();
                showNotification(data.error || (isEditingMode ? t('accounts.notifications.updateFailed') : t('accounts.notifications.addFailed')), 'error');
            }
        } catch (_err) {
            showNotification(t('accounts.notifications.genericError'), 'error');
        }
    };

    const openEditModal = (account: Account) => {
        setEditingAccount(account);
        setFormAccount({
            vendor: account.vendor,
            username: account.username || '',
            id_number: account.id_number || '',
            card6_digits: account.card6_digits || '',
            bank_account_number: account.bank_account_number || '',
            phone_number: account.phone_number || '',
            password: '',
            nickname: account.nickname || '',
            id: account.id,
        });
        setIsEditing(true);
    };

    const openAddModal = () => {
        setFormAccount({
            vendor: 'isracard',
            username: '',
            id_number: '',
            card6_digits: '',
            bank_account_number: '',
            phone_number: '',
            password: '',
            nickname: '',
            id: 0,
        });
        setIsAdding(true);
    };

    const bankAccounts = accounts.filter(a => BANK_VENDORS.includes(a.vendor));
    const creditAccounts = accounts.filter(a => CREDIT_CARD_VENDORS.includes(a.vendor));

    return (
        <Box sx={{ pb: 8 }}>
            <PageHeader
                title={t('accounts.title')}
                description={t('accounts.description')}
                icon={<ManageAccountsIcon sx={{ fontSize: '32px', color: '#fff' }} />}
                actions={
                    <Box sx={{ display: 'flex', gap: 1.5 }}>
                        <Button
                            startIcon={<HistoryIcon />}
                            onClick={() => setIsHistoryOpen(true)}
                            variant="outlined"
                            sx={{
                                borderRadius: '12px',
                                textTransform: 'none',
                                borderColor: alpha(theme.palette.divider, 0.1),
                                backdropFilter: 'blur(10px)',
                                background: alpha('#fff', 0.05),
                                color: theme.palette.text.primary,
                                '&:hover': { background: alpha('#fff', 0.1), borderColor: alpha(theme.palette.divider, 0.2) }
                            }}
                        >
                            {t('accounts.history')}
                        </Button>
                        <Tooltip title={isVaultLocked ? t('accounts.unlockToAdd') : ""}>
                            <span>
                                <Button
                                    variant="contained"
                                    startIcon={isVaultLocked ? <LockIcon /> : <AddIcon />}
                                    onClick={openAddModal}
                                    disabled={isVaultLocked}
                                    sx={{
                                        borderRadius: '12px',
                                        textTransform: 'none',
                                        background: isVaultLocked
                                            ? alpha(theme.palette.text.disabled, 0.1)
                                            : 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                                        boxShadow: isVaultLocked ? 'none' : '0 4px 15px rgba(99, 102, 241, 0.3)',
                                        '&:hover': { background: isVaultLocked ? 'none' : 'linear-gradient(135deg, #4f46e5 0%, #9333ea 100%)' }
                                    }}
                                >
                                    {t('accounts.addConnection')}
                                </Button>
                            </span>
                        </Tooltip>
                    </Box>
                }
            />
            <Container maxWidth="xl" sx={{ mt: 4 }}>
                {isLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                        <CircularProgress size={40} thickness={4} />
                    </Box>
                ) : (
                    <>
                        {/* Banks Section */}
                        <Box sx={{ mb: 6 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                                <AccountBalanceIcon color="primary" />
                                <Typography variant="h5" sx={{
                                    fontWeight: 700
                                }}>{t('accounts.bankAccounts')}</Typography>
                                <Typography variant="body2" sx={{ color: 'text.secondary', ml: 1 }}>{bankAccounts.length}</Typography>
                            </Box>
                            <Grid container spacing={3}>
                                {bankAccounts.map(account => (
                                    <Grid
                                        key={account.id}
                                        size={{
                                            xs: 12,
                                            sm: 6,
                                            lg: 4
                                        }}>
                                        <AccountCard
                                            account={account}
                                            isVaultLocked={isVaultLocked}
                                            onEdit={openEditModal}
                                            onSync={handleSync}
                                            onTruncate={(a) => setTruncateConfirm({ isOpen: true, account: a })}
                                            onDelete={handleDeleteAccount}
                                            onToggleActive={handleToggleActive}
                                        />
                                    </Grid>
                                ))}
                                {bankAccounts.length === 0 && (
                                    <Grid size={12}>
                                        <Box sx={{ p: 4, textAlign: 'center', borderRadius: '24px', border: `1px dashed ${theme.palette.divider}` }}>
                                            <Typography sx={{
                                                color: "text.secondary"
                                            }}>{t('accounts.noBankAccounts')}</Typography>
                                        </Box>
                                    </Grid>
                                )}
                            </Grid>
                        </Box>

                        {/* Credit Cards Section */}
                        <Box sx={{ mb: 6 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                                <CreditCardIcon sx={{ color: '#8b5cf6' }} />
                                <Typography variant="h5" sx={{
                                    fontWeight: 700
                                }}>{t('accounts.creditCards')}</Typography>
                                <Typography variant="body2" sx={{ color: 'text.secondary', ml: 1 }}>{creditAccounts.length}</Typography>
                            </Box>
                            <Grid container spacing={3}>
                                {creditAccounts.map(account => (
                                    <Grid
                                        key={account.id}
                                        size={{
                                            xs: 12,
                                            sm: 6,
                                            lg: 4
                                        }}>
                                        <AccountCard
                                            account={account}
                                            isVaultLocked={isVaultLocked}
                                            ownedCards={cardOwnership.filter(co => co.credential_id === account.id)}
                                            onEdit={openEditModal}
                                            onSync={handleSync}
                                            onTruncate={(a) => setTruncateConfirm({ isOpen: true, account: a })}
                                            onDelete={handleDeleteAccount}
                                            onToggleActive={handleToggleActive}
                                            onUpdateCardLink={handleUpdateCardLink}
                                            onToggleCardVisibility={handleToggleCardVisibility}
                                        />
                                    </Grid>
                                ))}
                                {creditAccounts.length === 0 && (
                                    <Grid size={12}>
                                        <Box sx={{ p: 4, textAlign: 'center', borderRadius: '24px', border: `1px dashed ${theme.palette.divider}` }}>
                                            <Typography sx={{
                                                color: "text.secondary"
                                            }}>{t('accounts.noCreditCards')}</Typography>
                                        </Box>
                                    </Grid>
                                )}
                            </Grid>
                        </Box>
                    </>
                )}
            </Container>
            {/* Sync History Modal */}
            <SyncHistoryModal
                open={isHistoryOpen}
                onClose={() => setIsHistoryOpen(false)}
            />
            {/* Add/Edit Modal */}
            <Dialog
                open={isAdding || isEditing}
                onClose={() => { setIsAdding(false); setIsEditing(false); }}
                maxWidth="sm"
                fullWidth
                slotProps={{
                    paper: {
                        sx: { borderRadius: '24px', p: 1 }
                    }
                }}
            >
                <DialogTitle sx={{ fontWeight: 700 }}>
                    {isEditing ? t('accounts.editConnection') : t('accounts.addConnectionTitle')}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        <TextField
                            fullWidth
                            label={t('accounts.fields.nickname')}
                            placeholder={t('accounts.fields.nicknamePlaceholder')}
                            value={formAccount.nickname}
                            onChange={(e) => setFormAccount({ ...formAccount, nickname: e.target.value })}
                        />
                        <TextField
                            fullWidth
                            select
                            label={t('accounts.fields.providerVendor')}
                            value={formAccount.vendor}
                            onChange={(e) => setFormAccount({ ...formAccount, vendor: e.target.value })}
                        >
                            <MenuItem value="isracard">Isracard</MenuItem>
                            <MenuItem value="amex">American Express</MenuItem>
                            <MenuItem value="visaCal">Visa Cal</MenuItem>
                            <MenuItem value="max">Max</MenuItem>
                            {BANK_VENDORS.map(v => (
                                <MenuItem key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</MenuItem>
                            ))}
                        </TextField>

                        {formAccount.vendor === 'onezero' ? (
                            <>
                                <TextField
                                    fullWidth
                                    type="email"
                                    label={t('accounts.fields.email')}
                                    value={formAccount.username}
                                    onChange={(e) => setFormAccount({ ...formAccount, username: e.target.value })}
                                />
                                <TextField
                                    fullWidth
                                    label={t('accounts.fields.phoneNumber')}
                                    placeholder={t('accounts.fields.phoneNumberPlaceholder')}
                                    value={formAccount.phone_number}
                                    onChange={(e) => setFormAccount({ ...formAccount, phone_number: e.target.value })}
                                    helperText={t('accounts.fields.phoneNumberHelper')}
                                />
                            </>
                        ) : (formAccount.vendor === 'visaCal' || formAccount.vendor === 'max' || BANK_VENDORS.includes(formAccount.vendor)) ? (
                            <TextField
                                fullWidth
                                label={t('accounts.fields.usernameOrId')}
                                value={formAccount.username}
                                onChange={(e) => setFormAccount({ ...formAccount, username: e.target.value })}
                            />
                        ) : (
                            <Box sx={{ display: 'flex', gap: 2 }}>
                                <TextField
                                    fullWidth
                                    label={t('accounts.fields.idNumber')}
                                    value={formAccount.id_number}
                                    onChange={(e) => setFormAccount({ ...formAccount, id_number: e.target.value })}
                                />
                                <TextField
                                    fullWidth
                                    label={t('accounts.fields.card6Digits')}
                                    value={formAccount.card6_digits}
                                    onChange={(e) => setFormAccount({ ...formAccount, card6_digits: e.target.value })}
                                />
                            </Box>
                        )}

                        {formAccount.vendor === 'yahav' && (
                            <TextField
                                fullWidth
                                required
                                label={t('accounts.fields.idNumber')}
                                value={formAccount.id_number}
                                onChange={(e) => setFormAccount({ ...formAccount, id_number: e.target.value })}
                                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                            />
                        )}

                        {STANDARD_BANK_VENDORS.includes(formAccount.vendor) && formAccount.vendor !== 'onezero' && (
                            <TextField
                                fullWidth
                                label={t('accounts.fields.accountNumber')}
                                value={formAccount.bank_account_number}
                                onChange={(e) => setFormAccount({ ...formAccount, bank_account_number: e.target.value })}
                            />
                        )}

                        <TextField
                            fullWidth
                            type="password"
                            label={isEditing ? t('accounts.fields.passwordEdit') : t('accounts.fields.password')}
                            value={formAccount.password}
                            onChange={(e) => setFormAccount({ ...formAccount, password: e.target.value })}
                        />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => { setIsAdding(false); setIsEditing(false); }}>{t('accounts.actions.cancel')}</Button>
                    <Button
                        variant="contained"
                        onClick={handleSaveAccount}
                        disabled={formAccount.vendor === 'yahav' && !formAccount.id_number.trim()}
                        sx={{
                            borderRadius: '12px',
                            px: 4,
                            background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                        }}
                    >
                        {isEditing ? t('accounts.actions.saveChanges') : t('accounts.actions.connect')}
                    </Button>
                </DialogActions>
            </Dialog>
            {/* Truncate Confirm Dialog */}
            <Dialog
                open={truncateConfirm.isOpen}
                onClose={() => setTruncateConfirm({ isOpen: false, account: null })}
                slotProps={{
                    paper: { sx: { borderRadius: '24px' } }
                }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
                    <WarningAmberIcon />
                    {t('accounts.deleteHistoryTitle')}
                </DialogTitle>
                <DialogContent>
                    <Typography>
                        <Trans
                            i18nKey="accounts.deleteHistoryBody"
                            t={t}
                            values={{ name: truncateConfirm.account?.nickname || truncateConfirm.account?.vendor || '' }}
                            components={{ strong: <strong /> }}
                        />
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setTruncateConfirm({ isOpen: false, account: null })}>{t('accounts.actions.cancel')}</Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={handleTruncateConfirm}
                        disabled={isTruncating}
                        sx={{ borderRadius: '12px' }}
                    >
                        {isTruncating ? <CircularProgress size={20} color="inherit" /> : t('accounts.deleteAllData')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default AccountsView;
