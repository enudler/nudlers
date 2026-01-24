import React from 'react';
import { Box, Typography, IconButton, Tooltip, useTheme, TextField, CircularProgress } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import DateRangeIcon from '@mui/icons-material/DateRange';
import TuneIcon from '@mui/icons-material/Tune';
import SearchIcon from '@mui/icons-material/Search';
import { DateRangeMode } from '../context/DateSelectionContext';

interface PageHeaderProps {
    title: string;
    description?: string;
    icon: React.ReactNode;
    stats?: React.ReactNode;

    // Date Selection
    showDateSelectors?: boolean;
    dateRangeMode?: DateRangeMode;
    onDateRangeModeChange?: (mode: DateRangeMode) => void;

    selectedYear?: string;
    onYearChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
    selectedMonth?: string;
    onMonthChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
    uniqueYears?: string[];
    uniqueMonths?: string[];

    // Custom Date Range
    customStartDate?: string;
    onCustomStartDateChange?: (value: string) => void;
    customEndDate?: string;
    onCustomEndDateChange?: (value: string) => void;

    // Refresh & Search
    onRefresh?: () => void;
    showSearch?: boolean;
    searchQuery?: string;
    onSearchQueryChange?: (query: string) => void;
    onSearchSubmit?: (e: React.FormEvent) => void;
    isSearching?: boolean;

    // Extra actions/controls
    extraControls?: React.ReactNode;

    // Billing info display
    startDate?: string;
    endDate?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    description,
    icon,
    stats,
    showDateSelectors,
    dateRangeMode,
    onDateRangeModeChange,
    selectedYear,
    onYearChange,
    selectedMonth,
    onMonthChange,
    uniqueYears = [],
    uniqueMonths = [],
    customStartDate,
    onCustomStartDateChange,
    customEndDate,
    onCustomEndDateChange,
    onRefresh,
    showSearch,
    searchQuery,
    onSearchQueryChange,
    onSearchSubmit,
    isSearching,
    extraControls,
    startDate,
    endDate
}) => {
    const theme = useTheme();

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            padding: { xs: '20px', md: '32px' },
            borderRadius: '32px',
            marginBottom: '24px',
            marginTop: { xs: '56px', md: '40px' },
            marginLeft: { xs: '8px', md: '24px' },
            marginRight: { xs: '8px', md: '24px' },
            border: '1px solid var(--n-glass-border)',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.04)',
            background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.6)',
            backdropFilter: 'blur(20px)',
        }} className="n-glass">

            {/* Background Decor */}
            <Box sx={{
                position: 'absolute',
                top: -100, right: -100,
                width: 400, height: 400,
                background: 'radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, transparent 70%)',
                zIndex: 0,
                pointerEvents: 'none'
            }} />

            {/* Row 1: Title & Stats */}
            <Box sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                justifyContent: 'space-between',
                alignItems: { xs: 'flex-start', md: 'center' },
                gap: 3,
                position: 'relative',
                zIndex: 1
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <Box sx={{
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        width: 56, height: 56,
                        borderRadius: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 8px 16px rgba(59, 130, 246, 0.25)'
                    }}>
                        {icon}
                    </Box>
                    <Box>
                        <Box component="h1" className="gradient-text" sx={{
                            fontSize: { xs: '24px', md: '32px' },
                            fontWeight: 800,
                            margin: 0,
                            lineHeight: 1.2
                        }}>
                            {title}
                            {dateRangeMode !== 'custom' && selectedMonth && selectedYear && (
                                <Box component="span" sx={{
                                    display: { xs: 'none', sm: 'inline' },
                                    opacity: 0.9,
                                    fontSize: '0.8em',
                                    ml: 1.5,
                                    fontWeight: 500,
                                    color: theme.palette.text.secondary,
                                    textFillColor: 'initial',
                                    background: 'none',
                                    WebkitTextFillColor: 'currentColor'
                                }}>
                                    • {new Date(`2024-${selectedMonth}-01`).toLocaleDateString('default', { month: 'long' })} {selectedYear}
                                </Box>
                            )}
                        </Box>
                        {description && (
                            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, mt: 0.5 }}>
                                {description}
                            </Typography>
                        )}
                    </Box>
                </Box>

                {stats && (
                    <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        bgcolor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.5)' : 'rgba(255,255,255,0.5)',
                        borderRadius: '20px',
                        padding: '12px 24px',
                        border: `1px solid ${theme.palette.divider}`,
                        minWidth: '200px'
                    }}>
                        {stats}
                    </Box>
                )}
            </Box>

            {/* Divider */}
            <Box sx={{ height: '1px', bgcolor: theme.palette.divider, opacity: 0.5 }} />

            {/* Row 2: Controls Toolbar */}
            <Box sx={{
                display: 'flex',
                flexDirection: { xs: 'column', lg: 'row' },
                justifyContent: 'space-between',
                alignItems: { xs: 'stretch', lg: 'center' },
                gap: 2,
                position: 'relative',
                zIndex: 1
            }}>

                {/* Left Group: Toggles & Pickers */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                    {showDateSelectors && onDateRangeModeChange && (
                        <div style={{
                            display: 'flex',
                            background: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                            padding: '4px',
                            borderRadius: '14px',
                            border: `1px solid ${theme.palette.divider}`
                        }}>
                            {[
                                { id: 'calendar', icon: <CalendarMonthIcon sx={{ fontSize: 18 }} />, label: '1-31' },
                                { id: 'billing', icon: <DateRangeIcon sx={{ fontSize: 18 }} />, label: 'Cycle' },
                                { id: 'custom', icon: <TuneIcon sx={{ fontSize: 18 }} />, label: 'Custom' }
                            ].map((mode) => (
                                <button
                                    key={mode.id}
                                    onClick={() => onDateRangeModeChange(mode.id as DateRangeMode)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px',
                                        border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                                        background: dateRangeMode === mode.id ? 'var(--n-primary)' : 'transparent',
                                        color: dateRangeMode === mode.id ? '#ffffff' : theme.palette.text.secondary,
                                        transition: 'all 0.2s ease',
                                        boxShadow: dateRangeMode === mode.id ? '0 2px 8px rgba(59, 130, 246, 0.3)' : 'none'
                                    }}
                                >
                                    {mode.icon} {mode.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {showDateSelectors && dateRangeMode !== 'custom' && onYearChange && onMonthChange && (
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <select
                                value={selectedYear}
                                onChange={onYearChange}
                                className="n-glass n-select"
                                style={{ minWidth: '110px' }}
                                aria-label="Selected Year"
                            >
                                {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                            <select
                                value={selectedMonth}
                                onChange={onMonthChange}
                                className="n-glass n-select"
                                style={{ minWidth: '140px' }}
                                aria-label="Selected Month"
                            >
                                {uniqueMonths.map(m => (
                                    <option key={m} value={m}>
                                        {new Date(`2024-${m}-01`).toLocaleDateString('default', { month: 'long' })}
                                    </option>
                                ))}
                            </select>
                        </Box>
                    )}

                    {showDateSelectors && dateRangeMode === 'custom' && onCustomStartDateChange && onCustomEndDateChange && (
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <TextField
                                type="date"
                                size="small"
                                value={customStartDate}
                                onChange={(e) => onCustomStartDateChange(e.target.value)}
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: 'background.paper', height: '40px' } }}
                            />
                            <Typography sx={{ color: 'text.secondary' }}>-</Typography>
                            <TextField
                                type="date"
                                size="small"
                                value={customEndDate}
                                onChange={(e) => onCustomEndDateChange(e.target.value)}
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: 'background.paper', height: '40px' } }}
                            />
                        </Box>
                    )}
                </Box>

                {/* Right Group: Search, Extra & Refresh */}
                <Box sx={{
                    display: 'flex',
                    gap: 2,
                    alignItems: 'center',
                    width: { xs: '100%', lg: 'auto' },
                    flexGrow: { lg: 1 },
                    justifyContent: { lg: 'flex-end' }
                }}>
                    {extraControls}

                    {showSearch && onSearchSubmit && (
                        <Box
                            component="form"
                            onSubmit={onSearchSubmit}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                background: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                                padding: '4px 8px 4px 16px',
                                borderRadius: '14px',
                                border: `1px solid ${theme.palette.divider}`,
                                width: '100%',
                                maxWidth: '300px',
                                height: '40px',
                                transition: 'all 0.2s',
                                '&:focus-within': { borderColor: 'primary.main', boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.2)' }
                            }}
                        >
                            <input
                                type="text"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={(e) => onSearchQueryChange?.(e.target.value)}
                                style={{
                                    border: 'none', background: 'transparent', outline: 'none', fontSize: '14px',
                                    width: '100%', color: theme.palette.text.primary, fontWeight: 500
                                }}
                            />
                            <IconButton type="submit" size="small" disabled={isSearching} sx={{ padding: '4px' }}>
                                {isSearching ? <CircularProgress size={18} /> : <SearchIcon fontSize="small" />}
                            </IconButton>
                        </Box>
                    )}

                    {onRefresh && (
                        <Tooltip title="Refresh Data">
                            <IconButton
                                onClick={onRefresh}
                                className="n-glass"
                                sx={{
                                    borderRadius: '12px',
                                    color: 'primary.main',
                                    width: 40, height: 40,
                                    '&:hover': { transform: 'rotate(180deg)', bgcolor: 'primary.soft' }
                                }}
                            >
                                <RefreshIcon />
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>
            </Box>

            {/* Date Range Badge - Row 3 */}
            {showDateSelectors && (
                <Box sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    mt: -1,
                    position: 'relative',
                    zIndex: 1
                }}>
                    {dateRangeMode === 'billing' ? (
                        <span style={{
                            background: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
                            padding: '6px 16px',
                            borderRadius: '12px',
                            border: `1px solid ${theme.palette.primary.main}`,
                            color: theme.palette.primary.main,
                            fontSize: '13px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            💳 Billing Cycle: {selectedMonth && selectedYear ? new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ''}
                            {startDate && endDate && (
                                <Box component="span" sx={{ opacity: 0.7, fontWeight: 500, fontSize: '12px' }}>
                                    ({new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})
                                </Box>
                            )}
                        </span>
                    ) : (
                        <span style={{
                            background: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
                            padding: '6px 16px',
                            borderRadius: '12px',
                            border: `1px solid ${theme.palette.primary.main}`,
                            color: theme.palette.primary.main,
                            fontSize: '13px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            {dateRangeMode === 'custom' ? <TuneIcon sx={{ fontSize: 16 }} /> : <CalendarMonthIcon sx={{ fontSize: 16 }} />}
                            {dateRangeMode === 'custom' ? 'Custom Range' : 'Full Month'}: {startDate && endDate ? `${new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                        </span>
                    )}
                </Box>
            )}
        </Box>
    );
};

export default PageHeader;
