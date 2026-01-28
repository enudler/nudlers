import React from 'react';
import { Box, Typography, LinearProgress, IconButton, Tooltip, useTheme } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

interface BudgetRowProps {
    category: string;
    limit: number;
    spent: number;
    remaining: number;
    percentUsed: number;
    isOverBudget: boolean;
    onEdit: () => void;
    onDelete: () => void;
    formatCurrency: (amount: number) => string;
}

const BudgetRow: React.FC<BudgetRowProps> = ({
    category,
    limit,
    spent,
    remaining,
    percentUsed,
    isOverBudget,
    onEdit,
    onDelete,
    formatCurrency
}) => {
    const theme = useTheme();

    const getProgressColor = (percent: number) => {
        if (percent >= 100) return 'var(--n-error)';
        if (percent >= 80) return 'var(--n-warning)';
        return 'var(--n-success)';
    };

    const progressColor = getProgressColor(percentUsed);

    return (
        <Box
            className="n-card n-card-hover"
            sx={{
                display: 'flex',
                flexDirection: 'column',
                p: 2,
                mb: 2,
                gap: 1.5,
                position: 'relative',
                border: isOverBudget ? '1px solid var(--n-error-opacity)' : '1px solid var(--n-border)',
                background: isOverBudget
                    ? 'linear-gradient(90deg, var(--n-bg-surface) 0%, rgba(239, 68, 68, 0.05) 100%)'
                    : 'var(--n-bg-surface)'
            }}
        >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box
                        sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor: progressColor,
                            boxShadow: `0 0 10px ${progressColor}`
                        }}
                    />
                    <Typography variant="body1" sx={{ fontWeight: 700, color: 'var(--n-text-primary)' }}>
                        {category}
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body2" sx={{ fontWeight: 800, color: isOverBudget ? 'var(--n-error)' : 'var(--n-text-primary)' }}>
                            {formatCurrency(spent)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'var(--n-text-muted)', fontWeight: 600 }}>
                            of {formatCurrency(limit)}
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Edit Budget">
                            <IconButton size="small" onClick={onEdit} sx={{ color: 'var(--n-text-muted)', '&:hover': { color: 'var(--n-primary)' } }}>
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete Budget">
                            <IconButton size="small" onClick={onDelete} sx={{ color: 'var(--n-text-muted)', '&:hover': { color: 'var(--n-error)' } }}>
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>
            </Box>

            <Box sx={{ width: '100%', position: 'relative' }}>
                <LinearProgress
                    variant="determinate"
                    value={Math.min(percentUsed, 100)}
                    sx={{
                        height: 6,
                        borderRadius: 3,
                        bgcolor: 'var(--n-bg-surface-alt)',
                        '& .MuiLinearProgress-bar': {
                            borderRadius: 3,
                            background: `linear-gradient(90deg, ${progressColor}dd 0%, ${progressColor} 100%)`,
                        }
                    }}
                />
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {isOverBudget ? (
                        <>
                            <WarningIcon sx={{ fontSize: 14, color: 'var(--n-error)' }} />
                            <Typography variant="caption" sx={{ color: 'var(--n-error)', fontWeight: 700 }}>
                                {formatCurrency(Math.abs(remaining))} over budget
                            </Typography>
                        </>
                    ) : (
                        <>
                            <CheckCircleIcon sx={{ fontSize: 14, color: 'var(--n-success)' }} />
                            <Typography variant="caption" sx={{ color: 'var(--n-success)', fontWeight: 700 }}>
                                {formatCurrency(remaining)} remaining
                            </Typography>
                        </>
                    )}
                </Box>
                <Typography variant="caption" sx={{ color: 'var(--n-text-muted)', fontWeight: 700 }}>
                    {percentUsed.toFixed(0)}% used
                </Typography>
            </Box>
        </Box>
    );
};

export default BudgetRow;
