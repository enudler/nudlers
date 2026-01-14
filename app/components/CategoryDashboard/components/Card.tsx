import React from 'react';
import { SvgIconComponent } from '@mui/icons-material';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { formatNumber } from '../utils/format';

interface BudgetInfo {
  budget_limit: number;
  actual_spent: number;
  remaining: number;
  percent_used: number;
  is_over_budget: boolean;
}

interface CardProps {
  title: string;
  value: number;
  color: string;
  icon: SvgIconComponent;
  onClick?: () => void;
  isLoading?: boolean;
  size?: 'large' | 'medium';
  clickable?: boolean;
  secondaryValue?: number;
  secondaryColor?: string;
  secondaryLabel?: string;
  budget?: BudgetInfo;
  onSetBudget?: (category: string) => void;
  onEditBudget?: (category: string, currentLimit: number) => void;
}

// Mini burndown chart component
const BurndownChart: React.FC<{ percentUsed: number; isOverBudget: boolean }> = ({ percentUsed, isOverBudget }) => {
  const clampedPercent = Math.min(percentUsed, 100);
  const chartColor = isOverBudget ? '#ef4444' : percentUsed >= 80 ? '#f59e0b' : '#22c55e';

  return (
    <div style={{
      width: '100%',
      height: '6px',
      background: 'rgba(148, 163, 184, 0.2)',
      borderRadius: '3px',
      overflow: 'hidden',
      position: 'relative'
    }}>
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        height: '100%',
        width: `${clampedPercent}%`,
        background: `linear-gradient(90deg, ${chartColor} 0%, ${chartColor}cc 100%)`,
        borderRadius: '3px',
        transition: 'width 0.5s ease-out'
      }} />
      {/* Threshold markers */}
      <div style={{
        position: 'absolute',
        left: '80%',
        top: 0,
        width: '1px',
        height: '100%',
        background: 'rgba(148, 163, 184, 0.4)'
      }} />
    </div>
  );
};

const Card: React.FC<CardProps> = ({
  title,
  value,
  color,
  icon: Icon,
  onClick,
  isLoading = false,
  size = 'medium',
  secondaryValue,
  secondaryColor,
  secondaryLabel,
  budget,
  onSetBudget,
  onEditBudget
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Responsive sizing
  const padding = isMobile ? '16px' : (size === 'large' ? '32px' : '20px');
  const titleSize = isMobile ? '14px' : (size === 'large' ? '16px' : '20px');
  const valueSize = isMobile ? '20px' : (size === 'large' ? '36px' : '24px');
  const secondaryValueSize = isMobile ? '14px' : (size === 'large' ? '20px' : '16px');
  const iconSize = isMobile ? '20px' : '24px';
  const iconPadding = isMobile ? '8px' : (size === 'large' ? '10px' : '12px');
  const iconBorderRadius = isMobile ? '12px' : (size === 'large' ? '12px' : '16px');

  // Determine border color based on budget status
  const getBorderColor = () => {
    if (!budget) return 'rgba(148, 163, 184, 0.15)';
    if (budget.is_over_budget) return 'rgba(239, 68, 68, 0.5)';
    if (budget.percent_used >= 80) return 'rgba(245, 158, 11, 0.4)';
    return 'rgba(34, 197, 94, 0.4)';
  };

  // Determine background gradient based on budget status  
  const getBackgroundGradient = () => {
    const isDark = theme.palette.mode === 'dark';
    if (!budget) {
      return isDark
        ? 'linear-gradient(135deg, var(--card-bg) 0%, var(--card-bg-alt) 100%)'
        : 'rgba(255, 255, 255, 0.95)';
    }
    if (budget.is_over_budget) {
      return isDark
        ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(127, 29, 29, 0.4) 100%)'
        : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(254, 226, 226, 0.4) 100%)';
    }
    if (budget.percent_used >= 80) {
      return isDark
        ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(180, 83, 9, 0.3) 100%)'
        : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(254, 243, 199, 0.3) 100%)';
    }
    return isDark
      ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(21, 128, 61, 0.3) 100%)'
      : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(220, 252, 231, 0.3) 100%)';
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div
      style={{
        background: getBackgroundGradient(),
        backdropFilter: 'blur(20px)',
        borderRadius: '28px',
        padding: padding,
        width: '100%',
        boxShadow: budget?.is_over_budget
          ? '0 4px 20px rgba(239, 68, 68, 0.15)'
          : '0 2px 12px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        border: `2px solid ${getBorderColor()}`,
        cursor: onClick ? (isLoading ? 'default' : 'pointer') : 'default',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
      onClick={isLoading ? undefined : onClick}
      onMouseEnter={(e) => {
        if (!isLoading && onClick) {
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-8px) scale(1.03)';
          (e.currentTarget as HTMLDivElement).style.boxShadow = `0 12px 32px ${color}20`;
          (e.currentTarget as HTMLDivElement).style.borderColor = `${color}80`;
        }
      }}
      onMouseLeave={(e) => {
        if (!isLoading) {
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0) scale(1)';
          (e.currentTarget as HTMLDivElement).style.boxShadow = budget?.is_over_budget
            ? '0 4px 20px rgba(239, 68, 68, 0.15)'
            : '0 2px 12px rgba(0, 0, 0, 0.04)';
          (e.currentTarget as HTMLDivElement).style.borderColor = getBorderColor();
        }
      }}
    >
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
          borderRadius: '24px'
        }}>
          <CircularProgress size={40} style={{ color: color }} />
        </div>
      )}
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: size === 'large' ? '140px' : '100px',
        height: size === 'large' ? '140px' : '100px',
        background: `radial-gradient(circle at top right, ${color}25, ${color}10 50%, transparent 70%)`,
        opacity: size === 'large' ? 0.6 : 0.4,
        filter: 'blur(20px)'
      }} />
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: size === 'large' ? '100px' : '70px',
        height: size === 'large' ? '100px' : '70px',
        background: `radial-gradient(circle at bottom left, ${color}15, transparent 60%)`,
        opacity: 0.3,
        filter: 'blur(15px)'
      }} />
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: size === 'large' ? 'center' : 'flex-start',
        gap: '16px'
      }}>
        <div style={{ flex: 1 }}>
          <h3 style={{
            margin: '0 0 12px 0',
            color: theme.palette.text.secondary,
            fontSize: titleSize,
            fontWeight: size === 'large' ? '600' : '700',
            letterSpacing: size === 'large' ? 'normal' : '-0.01em',
            fontFamily: 'Assistant, sans-serif',
            textShadow: 'none'
          }}>{title}</h3>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
            <span style={{
              fontSize: valueSize,
              fontWeight: size === 'large' ? '800' : '700',
              color: budget ? (budget.is_over_budget ? '#ef4444' : color) : color,
              letterSpacing: '-0.02em',
              fontFamily: 'Assistant, sans-serif',
              textShadow: `0 2px 12px ${color}60`
            }}>
              ₪{formatNumber(value || 0)}
            </span>
            {secondaryValue !== undefined && (
              <>
                <span style={{
                  fontSize: valueSize,
                  fontWeight: size === 'large' ? '700' : '600',
                  color: '#E5E7EB',
                  letterSpacing: '-0.02em',
                  fontFamily: 'Assistant, sans-serif'
                }}>
                  |
                </span>
                <span style={{
                  fontSize: valueSize,
                  fontWeight: size === 'large' ? '700' : '600',
                  color: secondaryColor || '#666',
                  letterSpacing: '-0.02em',
                  fontFamily: 'Assistant, sans-serif'
                }}>
                  {secondaryLabel && `${secondaryLabel}: `}₪{formatNumber(secondaryValue)}
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{
          background: `linear-gradient(135deg, ${color}40 0%, ${color}25 100%)`,
          borderRadius: iconBorderRadius,
          padding: iconPadding,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 6px 20px ${color}40`,
          border: `1px solid ${color}50`,
          position: 'relative',
          zIndex: 1
        }}>
          <Icon sx={{ fontSize: iconSize, color: color, filter: `drop-shadow(0 2px 8px ${color}60)` }} />
        </div>
      </div>

      {/* Budget Section */}
      {budget && budget.budget_limit > 0 && (
        <div style={{ marginTop: '16px', position: 'relative', zIndex: 1 }}>
          {/* Burndown Chart */}
          <BurndownChart percentUsed={budget.percent_used} isOverBudget={budget.is_over_budget} />

          {/* Budget Info Row */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '10px',
            fontSize: '12px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              {/* Budget remaining badge */}
              <span style={{
                background: budget.is_over_budget
                  ? 'rgba(239, 68, 68, 0.15)'
                  : budget.percent_used >= 80
                    ? 'rgba(245, 158, 11, 0.15)'
                    : 'rgba(34, 197, 94, 0.15)',
                color: budget.is_over_budget
                  ? '#dc2626'
                  : budget.percent_used >= 80
                    ? '#d97706'
                    : '#16a34a',
                padding: '4px 10px',
                borderRadius: '12px',
                fontWeight: 700,
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                {budget.is_over_budget ? (
                  <>
                    <span>⚠️</span>
                    <span>{formatCurrency(Math.abs(budget.remaining))} over</span>
                  </>
                ) : (
                  <>
                    <span>{budget.percent_used >= 80 ? '⚡' : '✓'}</span>
                    <span>{formatCurrency(budget.remaining)} left</span>
                  </>
                )}
              </span>
            </div>

            {/* Budget limit with edit button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                color: '#94a3b8',
                fontSize: '11px',
                fontWeight: 500
              }}>
                Budget: {formatCurrency(budget.budget_limit)}
              </span>
              {onEditBudget && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditBudget(title, budget.budget_limit);
                  }}
                  style={{
                    background: 'rgba(139, 92, 246, 0.1)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '6px',
                    padding: '2px 8px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#8b5cf6',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.2)';
                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.3)';
                  }}
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Set Budget Button - show when no budget is set */}
      {!budget && onSetBudget && (
        <div style={{ marginTop: '12px', position: 'relative', zIndex: 1 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSetBudget(title);
            }}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(168, 85, 247, 0.05) 100%)',
              border: '1px dashed rgba(139, 92, 246, 0.4)',
              borderRadius: '12px',
              padding: '10px 16px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#8b5cf6',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(168, 85, 247, 0.1) 100%)';
              e.currentTarget.style.borderStyle = 'solid';
              e.currentTarget.style.transform = 'scale(1.02)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(168, 85, 247, 0.05) 100%)';
              e.currentTarget.style.borderStyle = 'dashed';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <span>💰</span>
            <span>Set Budget</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default Card;
