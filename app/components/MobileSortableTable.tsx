import React, { useState, useRef, useCallback } from 'react';
import {
    Box,
    Paper,
    Typography,
    CircularProgress,
    useTheme,
    Chip,
    Menu,
    MenuItem,
    IconButton,
    Collapse,
    Divider,
} from '@mui/material';
import SortIcon from '@mui/icons-material/Sort';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import CheckIcon from '@mui/icons-material/Check';

export interface SortOption {
    id: string;
    label: string;
    defaultDirection?: 'asc' | 'desc';
}

export interface MobileSortableTableProps<T> {
    /** Array of sortable fields */
    sortOptions: SortOption[];
    /** Data rows to display */
    rows: T[];
    /** Loading state */
    loading?: boolean;
    /** Message when no data */
    emptyMessage?: string;
    /** Current sort field */
    sortField: string;
    /** Current sort direction */
    sortDirection: 'asc' | 'desc';
    /** Sort change handler */
    onSort: (field: string, direction: 'asc' | 'desc') => void;
    /** Unique key extractor */
    rowKey: (row: T) => string | number;
    /** Card renderer for each row */
    renderCard: (row: T, index: number) => React.ReactNode;
    /** Optional row click handler */
    onRowClick?: (row: T) => void;
    /** Expandable row content */
    renderExpandedContent?: (row: T) => React.ReactNode;
    /** Currently expanded row IDs */
    expandedRowIds?: Set<string | number>;
    /** Toggle row expansion */
    onRowToggle?: (rowId: string | number) => void;
    /** Optional footer content */
    footer?: React.ReactNode;
    /** Sticky sort bar */
    stickySort?: boolean;
    /** Sort bar offset from top (for headers) */
    stickyOffset?: number;
    /** Show quick sort chips */
    showQuickSortChips?: boolean;
    /** Maximum quick sort chips to show */
    maxQuickSortChips?: number;
}

const MobileSortableTable = <T,>({
    sortOptions,
    rows,
    loading = false,
    emptyMessage = 'No data available',
    sortField,
    sortDirection,
    onSort,
    rowKey,
    renderCard,
    onRowClick,
    renderExpandedContent,
    expandedRowIds,
    onRowToggle,
    footer,
    stickySort = true,
    stickyOffset = 0,
    showQuickSortChips = true,
    maxQuickSortChips = 3,
}: MobileSortableTableProps<T>) => {
    const theme = useTheme();
    const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const currentSortOption = sortOptions.find(opt => opt.id === sortField);
    const quickChipOptions = sortOptions.slice(0, maxQuickSortChips);
    const hasMoreOptions = sortOptions.length > maxQuickSortChips;

    const handleSortFieldChange = useCallback((field: string) => {
        const option = sortOptions.find(opt => opt.id === field);
        if (field === sortField) {
            // Toggle direction
            onSort(field, sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            // New field - use default direction or 'asc'
            onSort(field, option?.defaultDirection || 'asc');
        }
        setMenuAnchor(null);
    }, [sortField, sortDirection, sortOptions, onSort]);

    const handleDirectionToggle = useCallback(() => {
        onSort(sortField, sortDirection === 'asc' ? 'desc' : 'asc');
    }, [sortField, sortDirection, onSort]);

    // Swipe detection for quick sort direction toggle
    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchStart(e.touches[0].clientX);
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStart === null) return;
        const touchEnd = e.changedTouches[0].clientX;
        const diff = touchStart - touchEnd;

        // Swipe threshold of 50px on sort bar to toggle direction
        if (Math.abs(diff) > 50) {
            handleDirectionToggle();
        }
        setTouchStart(null);
    };

    const glassStyle = {
        background: theme.palette.mode === 'dark'
            ? 'rgba(30, 41, 59, 0.8)'
            : 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${theme.palette.divider}`,
    };

    const cardStyle = {
        p: 2,
        borderRadius: 'var(--n-radius-xl)',
        border: `1px solid ${theme.palette.divider}`,
        background: theme.palette.mode === 'dark'
            ? 'rgba(30, 41, 59, 0.4)'
            : 'rgba(255, 255, 255, 0.6)',
        backdropFilter: 'blur(10px)',
        cursor: onRowClick || onRowToggle ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        '&:active': (onRowClick || onRowToggle) ? {
            transform: 'scale(0.98)',
            backgroundColor: theme.palette.mode === 'dark'
                ? 'rgba(30, 41, 59, 0.6)'
                : 'rgba(255, 255, 255, 0.8)',
        } : {},
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box ref={containerRef} sx={{ display: 'flex', flexDirection: 'column' }}>
            {/* Sort Control Bar */}
            <Box
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                sx={{
                    ...glassStyle,
                    position: stickySort ? 'sticky' : 'relative',
                    top: stickyOffset,
                    zIndex: 100,
                    py: 1.5,
                    px: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    flexWrap: 'wrap',
                }}
            >
                {/* Sort Label */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 1 }}>
                    <SortIcon
                        fontSize="small"
                        sx={{ color: 'var(--n-text-secondary)' }}
                    />
                    <Typography
                        variant="caption"
                        sx={{
                            color: 'var(--n-text-secondary)',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}
                    >
                        Sort
                    </Typography>
                </Box>

                {/* Quick Sort Chips */}
                {showQuickSortChips && (
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', flex: 1 }}>
                        {quickChipOptions.map((option) => {
                            const isActive = sortField === option.id;
                            return (
                                <Chip
                                    key={option.id}
                                    label={
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            {option.label}
                                            {isActive && (
                                                sortDirection === 'asc'
                                                    ? <ArrowUpwardIcon sx={{ fontSize: 14 }} />
                                                    : <ArrowDownwardIcon sx={{ fontSize: 14 }} />
                                            )}
                                        </Box>
                                    }
                                    size="small"
                                    onClick={() => handleSortFieldChange(option.id)}
                                    sx={{
                                        height: 28,
                                        fontWeight: isActive ? 600 : 500,
                                        fontSize: '0.75rem',
                                        backgroundColor: isActive
                                            ? 'var(--n-primary)'
                                            : theme.palette.mode === 'dark'
                                                ? 'rgba(255, 255, 255, 0.08)'
                                                : 'rgba(0, 0, 0, 0.06)',
                                        color: isActive
                                            ? 'var(--n-primary-foreground)'
                                            : 'var(--n-text-primary)',
                                        border: 'none',
                                        transition: 'all 0.2s ease',
                                        '&:hover': {
                                            backgroundColor: isActive
                                                ? 'var(--n-primary-hover)'
                                                : theme.palette.mode === 'dark'
                                                    ? 'rgba(255, 255, 255, 0.12)'
                                                    : 'rgba(0, 0, 0, 0.1)',
                                        },
                                        '&:active': {
                                            transform: 'scale(0.95)',
                                        },
                                    }}
                                />
                            );
                        })}

                        {/* More options button */}
                        {hasMoreOptions && (
                            <Chip
                                label="More"
                                size="small"
                                onClick={(e) => setMenuAnchor(e.currentTarget)}
                                sx={{
                                    height: 28,
                                    fontWeight: 500,
                                    fontSize: '0.75rem',
                                    backgroundColor: theme.palette.mode === 'dark'
                                        ? 'rgba(255, 255, 255, 0.08)'
                                        : 'rgba(0, 0, 0, 0.06)',
                                    color: 'var(--n-text-secondary)',
                                    '&:hover': {
                                        backgroundColor: theme.palette.mode === 'dark'
                                            ? 'rgba(255, 255, 255, 0.12)'
                                            : 'rgba(0, 0, 0, 0.1)',
                                    },
                                }}
                            />
                        )}
                    </Box>
                )}

                {/* Direction Toggle Button */}
                <IconButton
                    size="small"
                    onClick={handleDirectionToggle}
                    sx={{
                        ml: 'auto',
                        backgroundColor: theme.palette.mode === 'dark'
                            ? 'rgba(255, 255, 255, 0.08)'
                            : 'rgba(0, 0, 0, 0.06)',
                        '&:hover': {
                            backgroundColor: theme.palette.mode === 'dark'
                                ? 'rgba(255, 255, 255, 0.12)'
                                : 'rgba(0, 0, 0, 0.1)',
                        },
                        transition: 'all 0.2s ease',
                    }}
                    aria-label={`Sort ${sortDirection === 'asc' ? 'ascending' : 'descending'}`}
                >
                    <SwapVertIcon
                        fontSize="small"
                        sx={{
                            color: 'var(--n-primary)',
                            transform: sortDirection === 'desc' ? 'rotate(180deg)' : 'none',
                            transition: 'transform 0.2s ease',
                        }}
                    />
                </IconButton>
            </Box>

            {/* Sort Options Menu */}
            <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                PaperProps={{
                    sx: {
                        mt: 1,
                        borderRadius: 'var(--n-radius-lg)',
                        minWidth: 180,
                        background: theme.palette.mode === 'dark'
                            ? 'rgba(30, 41, 59, 0.95)'
                            : 'rgba(255, 255, 255, 0.98)',
                        backdropFilter: 'blur(12px)',
                        border: `1px solid ${theme.palette.divider}`,
                    }
                }}
            >
                {sortOptions.map((option) => (
                    <MenuItem
                        key={option.id}
                        onClick={() => handleSortFieldChange(option.id)}
                        sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.875rem',
                            py: 1.5,
                        }}
                    >
                        <span>{option.label}</span>
                        {sortField === option.id && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                {sortDirection === 'asc'
                                    ? <ArrowUpwardIcon fontSize="small" color="primary" />
                                    : <ArrowDownwardIcon fontSize="small" color="primary" />
                                }
                                <CheckIcon fontSize="small" color="primary" />
                            </Box>
                        )}
                    </MenuItem>
                ))}
            </Menu>

            {/* Current Sort Indicator */}
            {currentSortOption && (
                <Box
                    sx={{
                        px: 2,
                        py: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        borderBottom: `1px solid ${theme.palette.divider}`,
                        backgroundColor: theme.palette.mode === 'dark'
                            ? 'rgba(99, 102, 241, 0.08)'
                            : 'rgba(99, 102, 241, 0.05)',
                    }}
                >
                    <Typography
                        variant="caption"
                        sx={{ color: 'var(--n-text-secondary)' }}
                    >
                        Sorted by
                    </Typography>
                    <Typography
                        variant="caption"
                        sx={{
                            color: 'var(--n-primary)',
                            fontWeight: 600
                        }}
                    >
                        {currentSortOption.label}
                    </Typography>
                    {sortDirection === 'asc'
                        ? <ArrowUpwardIcon sx={{ fontSize: 14, color: 'var(--n-primary)' }} />
                        : <ArrowDownwardIcon sx={{ fontSize: 14, color: 'var(--n-primary)' }} />
                    }
                    <Typography
                        variant="caption"
                        sx={{ color: 'var(--n-text-muted)', ml: 0.5 }}
                    >
                        ({rows.length} items)
                    </Typography>
                </Box>
            )}

            {/* Empty State */}
            {rows.length === 0 && (
                <Box sx={{ textAlign: 'center', p: 4, color: 'text.secondary' }}>
                    <Typography>{emptyMessage}</Typography>
                </Box>
            )}

            {/* Card List */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2 }}>
                {rows.map((row, index) => {
                    const key = rowKey(row);
                    const isExpanded = expandedRowIds?.has(key);

                    return (
                        <Box key={key}>
                            <Paper
                                elevation={0}
                                sx={cardStyle}
                                onClick={() => {
                                    if (onRowToggle) onRowToggle(key);
                                    if (onRowClick) onRowClick(row);
                                }}
                            >
                                {renderCard(row, index)}
                            </Paper>

                            {/* Expandable Content */}
                            {renderExpandedContent && (
                                <Collapse in={isExpanded} timeout={200}>
                                    <Box
                                        sx={{
                                            mt: 0.5,
                                            ml: 2,
                                            pl: 2,
                                            borderLeft: `2px solid var(--n-primary)`,
                                        }}
                                    >
                                        {renderExpandedContent(row)}
                                    </Box>
                                </Collapse>
                            )}
                        </Box>
                    );
                })}
            </Box>

            {/* Footer */}
            {footer && (
                <>
                    <Divider sx={{ mx: 2 }} />
                    <Box sx={{ p: 2 }}>{footer}</Box>
                </>
            )}
        </Box>
    );
};

export default MobileSortableTable;
