import type { Meta, StoryObj } from '@storybook/react';
import {
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, Typography, Box, Badge
} from '@mui/material';
import React from 'react';

const meta: Meta = {
    title: 'Design System/Tables',
    parameters: {
        layout: 'padded',
    },
};

export default meta;

export const TransactionTable: StoryObj = {
    render: () => (
        <Box sx={{ p: 4, bgcolor: 'var(--n-bg-main)' }}>
            <Typography variant="h5" sx={{ mb: 3, fontWeight: 700 }}>Recent Transactions</Typography>
            <TableContainer component={Paper} className="n-card">
                <Table sx={{ minWidth: 650 }}>
                    <TableHead>
                        <TableRow>
                            <TableCell>Description</TableCell>
                            <TableCell align="right">Category</TableCell>
                            <TableCell align="right">Date</TableCell>
                            <TableCell align="right">Amount</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {[
                            { desc: 'Apple Services', cat: 'Subscriptions', date: '2024-01-20', amount: -29.90 },
                            { desc: 'Super-Pharm', cat: 'Health', date: '2024-01-19', amount: -142.00 },
                            { desc: 'Salary Deposit', cat: 'Income', date: '2024-01-15', amount: 18500.00, status: 'success' },
                            { desc: 'Wolt Dispatch', cat: 'Food', date: '2024-01-14', amount: -84.50 },
                        ].map((row) => (
                            <TableRow key={row.desc} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>
                                    {row.desc}
                                </TableCell>
                                <TableCell align="right">
                                    <Box sx={{
                                        px: 1.5, py: 0.5,
                                        borderRadius: 'var(--n-radius-full)',
                                        bgcolor: 'var(--n-bg-surface-alt)',
                                        display: 'inline-block',
                                        fontSize: '0.75rem',
                                        fontWeight: 600
                                    }}>
                                        {row.cat}
                                    </Box>
                                </TableCell>
                                <TableCell align="right" sx={{ color: 'var(--n-text-secondary)' }}>{row.date}</TableCell>
                                <TableCell align="right" sx={{
                                    fontWeight: 700,
                                    color: row.amount > 0 ? 'var(--n-success)' : 'var(--n-text-primary)'
                                }}>
                                    {row.amount < 0 ? `-₪${Math.abs(row.amount)}` : `₪${row.amount}`}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    ),
};

export const AdvancedPayments: StoryObj = {
    render: () => {
        const rows = [
            { name: 'MacBook Pro 14"', acc: 'Visa •••• 1234', cat: 'Tech', current: 3, total: 12, amount: 849, status: 'active' },
            { name: 'Netflix Premium', acc: 'Mastercard •••• 5678', cat: 'Entertainment', current: 1, total: 1, amount: 69.90, status: 'recurring' },
            { name: 'Gym Membership', acc: 'Visa •••• 1234', cat: 'Health', current: 5, total: 12, amount: 250, status: 'active' },
            { name: 'Amazon AWS', acc: 'Amex •••• 9012', cat: 'Business', current: 1, total: 1, amount: 124.50, status: 'recurring' },
        ];

        return (
            <Box sx={{ p: 4, bgcolor: 'var(--n-bg-main)', minWidth: '800px' }}>
                <Typography variant="h5" className="gradient-text" sx={{ mb: 3, fontWeight: 800 }}>Advanced Payment Tracking</Typography>
                <TableContainer component={Paper} className="n-glass" sx={{ border: '1px solid var(--n-border)' }}>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'var(--n-bg-surface-alt)' }}>
                                <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Account</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                                <TableCell align="center" sx={{ fontWeight: 700 }}>Progress</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>Amount</TableCell>
                                <TableCell align="center" sx={{ fontWeight: 700 }}>Status</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.map((row) => (
                                <TableRow key={row.name} hover>
                                    <TableCell sx={{ fontWeight: 700 }}>{row.name}</TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Box sx={{ width: 24, height: 16, bgcolor: 'var(--n-border)', borderRadius: 0.5 }} />
                                            <Typography variant="body2">{row.acc}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{
                                            bgcolor: 'var(--n-primary)',
                                            color: 'white',
                                            px: 1.5, py: 0.5,
                                            borderRadius: 1,
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 0.5
                                        }}>
                                            {row.cat}
                                        </Box>
                                    </TableCell>
                                    <TableCell align="center">
                                        {row.total > 1 ? (
                                            <Box sx={{ width: '80px', mx: 'auto' }}>
                                                <Typography variant="caption" sx={{ fontWeight: 700 }}>{row.current}/{row.total}</Typography>
                                                <Box sx={{ width: '100%', height: 4, bgcolor: 'var(--n-bg-surface-alt)', borderRadius: 2, mt: 0.5, overflow: 'hidden' }}>
                                                    <Box sx={{ width: `${(row.current / row.total) * 100}%`, height: '100%', bgcolor: 'var(--n-primary)' }} />
                                                </Box>
                                            </Box>
                                        ) : (
                                            <Typography variant="caption" color="text.secondary">Monthly</Typography>
                                        )}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 800, color: 'var(--n-primary)' }}>₪{row.amount}</TableCell>
                                    <TableCell align="center">
                                        <Box sx={{
                                            px: 1, py: 0.25,
                                            borderRadius: 'var(--n-radius-sm)',
                                            fontSize: '0.625rem',
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            bgcolor: row.status === 'active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                            color: row.status === 'active' ? 'var(--n-success)' : 'var(--n-info)',
                                            border: `1px solid ${row.status === 'active' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)'}`,
                                            display: 'inline-block'
                                        }}>
                                            {row.status}
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Box>
        );
    }
};
