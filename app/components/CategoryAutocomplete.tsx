import React from 'react';
import {
    Autocomplete,
    TextField,
    Box,
    Tooltip,
    FormControlLabel,
    Checkbox,
    Typography
} from '@mui/material';

interface CategoryAutocompleteProps {
    value: string;
    onChange: (newValue: string) => void;
    options: string[];
    applyToAll?: boolean;
    onApplyToAllChange?: (checked: boolean) => void;
    showApplyToAll?: boolean;
    placeholder?: string;
    autoFocus?: boolean;
}

const CategoryAutocomplete: React.FC<CategoryAutocompleteProps> = ({
    value,
    onChange,
    options,
    applyToAll,
    onApplyToAllChange,
    showApplyToAll = false,
    placeholder = "Enter category...",
    autoFocus = false
}) => {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Autocomplete
                value={value}
                onChange={(event, newValue) => onChange(newValue || '')}
                onInputChange={(event, newInputValue) => {
                    // Only update if it's a typed change, to avoid clearing on blur if not intended,
                    // though typically onInputChange handles both.
                    // For freeSolo, we want to capture the text input.
                    if (newInputValue !== undefined) {
                        onChange(newInputValue);
                    }
                }}
                freeSolo
                options={options}
                size="small"
                autoHighlight
                sx={{
                    minWidth: 150,
                    '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                            borderColor: '#e2e8f0',
                        },
                        '&:hover fieldset': {
                            borderColor: '#3b82f6',
                        },
                        '&.Mui-focused fieldset': {
                            borderColor: '#3b82f6',
                        },
                    },
                }}
                renderInput={(params) => (
                    <TextField
                        {...params}
                        placeholder={placeholder}
                        autoFocus={autoFocus}
                        sx={{
                            '& .MuiInputBase-input': {
                                fontSize: '14px',
                                padding: '8px 12px',
                            },
                        }}
                    />
                )}
            />
            {showApplyToAll && onApplyToAllChange && (
                <Tooltip title="When checked, applies to all transactions with the same description and creates a rule for future transactions">
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={applyToAll}
                                onChange={(e) => onApplyToAllChange(e.target.checked)}
                                size="small"
                                sx={{
                                    color: '#94a3b8',
                                    '&.Mui-checked': {
                                        color: '#3b82f6',
                                    },
                                    padding: '2px',
                                }}
                            />
                        }
                        label={
                            <Typography sx={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
                                Apply to all & create rule
                            </Typography>
                        }
                        sx={{ margin: 0 }}
                    />
                </Tooltip>
            )}
        </Box>
    );
};

export default CategoryAutocomplete;
