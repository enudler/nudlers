import React from 'react';
import { Box, useTheme, Tooltip } from '@mui/material';
import { CardVendorIcon } from './CardVendorsModal';
import { useCardVendors } from './CategoryDashboard/utils/useCardVendors';

interface AccountDisplayProps {
    /**
     * The transaction object containing account details.
     * Can be a full Transaction, Installment, or RecurringTransaction.
     */
    transaction: {
        vendor?: string;
        account_number?: string | null;
        transaction_type?: string | null;
        bank_nickname?: string | null;
        bank_account_display?: string | null;
    };
    /**
     * Optional manual override for vendor if not available in transaction
     */
    vendorOverride?: string;
    /**
     * Show gradient background for the icon (more premium look)
     * Defaults to false (simple look)
     */
    premium?: boolean;
}

const BANK_NAMES: Record<string, string> = {
    'hapoalim': 'Bank Hapoalim',
    'leumi': 'Bank Leumi',
    'mizrahi': 'Mizrahi Tefahot',
    'discount': 'Discount Bank',
    'yahav': 'Bank Yahav',
    'union': 'Union Bank',
    'otsarHahayal': 'Otsar HaHayal',
    'beinleumi': 'International Bank',
    'massad': 'Massad Bank',
    'pagi': 'Bank Pagi'
};

const BANK_VENDORS = Object.keys(BANK_NAMES);

/**
 * A unified component to display account or card information.
 * Handles both Bank accounts and Credit Cards.
 */
const AccountDisplay: React.FC<AccountDisplayProps> = ({ transaction, vendorOverride, premium = false }) => {
    const theme = useTheme();
    const { getCardVendor, getCardNickname } = useCardVendors();

    // Determine if it's a bank account
    const isBank = transaction.transaction_type === 'bank' ||
        (transaction.vendor && BANK_VENDORS.includes(transaction.vendor));

    if (isBank) {
        const vendor = transaction.vendor || vendorOverride || 'unknown';
        const bankName = BANK_NAMES[vendor] || transaction.bank_nickname || 'Bank Account';
        const bankAccount = transaction.bank_account_display || transaction.account_number;

        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {premium ? (
                    <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(14, 165, 233, 0.2)'
                    }}>
                        <CardVendorIcon vendor={vendor} size={18} />
                    </div>
                ) : (
                    <CardVendorIcon vendor={vendor} size={24} />
                )}

                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{
                        fontWeight: 700,
                        fontSize: '13px',
                        color: theme.palette.text.primary,
                    }}>
                        {bankName}
                    </span>
                    {bankAccount && (
                        <span style={{
                            fontSize: '11px',
                            color: theme.palette.text.secondary,
                            fontWeight: 500
                        }}>
                            {bankAccount}
                        </span>
                    )}
                </Box>
            </Box>
        );
    }

    // It's a credit card (or unknown)
    if (transaction.account_number) {
        const last4 = transaction.account_number.slice(-4);
        const nickname = getCardNickname(transaction.account_number);
        const vendor = getCardVendor(transaction.account_number) || transaction.vendor;

        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {premium ? (
                    <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(15, 23, 42, 0.2)'
                    }}>
                        <CardVendorIcon vendor={vendor} size={18} />
                    </div>
                ) : (
                    <CardVendorIcon vendor={vendor} size={24} />
                )}

                {premium ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{
                            fontWeight: 700,
                            fontSize: '13px',
                            color: theme.palette.text.primary,
                        }}>
                            {nickname || vendor || 'Credit Card'}
                        </span>
                        <span style={{
                            fontSize: '11px',
                            color: theme.palette.text.secondary,
                            fontFamily: 'monospace',
                            fontWeight: 500
                        }}>
                            •••• {last4}
                        </span>
                    </Box>
                ) : (
                    <span style={{
                        fontWeight: '500',
                        color: '#334155',
                        backgroundColor: 'rgba(148, 163, 184, 0.1)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '13px'
                    }}>
                        {nickname ? (
                            <>
                                {nickname}
                                <span style={{ color: '#64748b', marginLeft: '4px', fontSize: '11px' }}>
                                    •••• {last4}
                                </span>
                            </>
                        ) : (
                            `•••• ${last4}`
                        )}
                    </span>
                )}
            </Box>
        );
    }

    return <span style={{ color: theme.palette.text.disabled }}>—</span>;
};

export default AccountDisplay;
