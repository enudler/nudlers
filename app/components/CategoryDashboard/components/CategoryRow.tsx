import React from 'react';
import { Box, Typography, LinearProgress, useTheme } from '@mui/material';
import { SvgIconComponent } from '@mui/icons-material';

interface BudgetInfo {
    budget_limit: number;
    actual_spent: number;
    remaining: number;
    percent_used: number;
    is_over_budget: boolean;
}

interface CategoryRowProps {
    name: string;
    value: number;
    color: string;
    icon: SvgIconComponent;
    budget?: BudgetInfo;
    onClick: () => void;
    formatCurrency: (amount: number) => string;
}

const CategoryRow: React.FC<CategoryRowProps> = ({
    name,
    value,
    color,
    icon: Icon,
    budget,
    onClick,
    formatCurrency
}) => {
    const theme = useTheme();

    return (
        <Box
            onClick={onClick}
            className="n-card n-card-hover"
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                p: 2,
                mb: 1.5,
                cursor: 'pointer',
                background: 'var(--n-bg-surface)',
                borderLeft: `4px solid ${color}`
            }}
        >
            <Box sx={{
                width: 40,
                height: 40,
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: `${color}15`,
                color: color
            }}>
                <Icon sx={{ fontSize: 20 }} />
            </Box>

            <Box sx={{ flex: 1 }}>
                <Typography variant="body1" sx={{ fontWeight: 700, color: 'var(--n-text-primary)' }}>
                    {name}
                </Typography>
                {budget && budget.budget_limit > 0 && (
                    <Box sx={{ width: '100%', mt: 0.5 }}>
                        <LinearProgress
                            variant="determinate"
                            value={Math.min(budget.percent_used, 100)}
                            sx={{
                                height: 4,
                                borderRadius: 2,
                                bgcolor: 'var(--n-bg-surface-alt)',
                                '& .MuiLinearProgress-bar': {
                                    borderRadius: 2,
                                    bgcolor: budget.is_over_budget ? 'var(--n-error)' : color,
                                }
                            }}
                        />
                    </Box>
                )}
            </Box>

            <Box sx={{ textAlign: 'right', minWidth: '100px' }}>
                <Typography variant="body1" sx={{ fontWeight: 800, color: 'var(--n-text-primary)' }}>
                    {formatCurrency(value)}
                </Typography>
                {budget && budget.budget_limit > 0 && (
                    <Typography variant="caption" sx={{ color: budget.is_over_budget ? 'var(--n-error)' : 'var(--n-text-muted)', fontWeight: 600 }}>
                        {budget.is_over_budget ? 'Over budget' : `${formatCurrency(budget.remaining)} left`}
                    </Typography>
                )}
            </Box>
        </Box>
    );
};

export default CategoryRow;
