import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Tabs,
  Tab,
  FormControl,
  Typography,
  Autocomplete,
  createFilterOptions,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import ModalHeader from './ModalHeader';

interface ManualModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (transactionData: {
    name: string;
    amount: number;
    date: Date;
    type: 'income' | 'expense';
    category?: string;
  }) => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`manual-tabpanel-${index}`}
      aria-labelledby={`manual-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ pt: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const ManualModal: React.FC<ManualModalProps> = ({ open, onClose, onSave }) => {
  const [tabValue, setTabValue] = useState(0);
  const [transactionName, setTransactionName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('');
  const [nameError, setNameError] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [categoryError, setCategoryError] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Fetch categories from database
  useEffect(() => {
    const fetchCategories = async () => {
      setLoadingCategories(true);
      try {
        const response = await fetch('/api/get_all_categories');
        if (response.ok) {
          const data = await response.json();
          // Filter out 'Bank' category for expenses since it's used for income
          const expenseCategories = data.filter((cat: string) => cat !== 'Bank');
          setCategories(expenseCategories);
        }
      } catch (error) {
        console.error('Error fetching categories:', error);
        // Fallback to default categories if API fails
        setCategories([
          'Food & Dining',
          'Transportation',
          'Shopping',
          'Entertainment',
          'Utilities',
          'Healthcare',
          'Education',
          'Travel',
          'Other'
        ]);
      } finally {
        setLoadingCategories(false);
      }
    };

    if (open) {
      fetchCategories();
    }
  }, [open]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    // Reset errors when switching tabs
    setNameError(false);
    setAmountError(false);
    setCategoryError(false);
  };

  const handleSubmit = () => {
    let valid = true;
    
    if (!transactionName.trim()) {
      setNameError(true);
      valid = false;
    } else {
      setNameError(false);
    }
    
    if (amount === '' || isNaN(Number(amount)) || Number(amount) <= 0) {
      setAmountError(true);
      valid = false;
    } else {
      setAmountError(false);
    }

    // Only require category for expenses
    if (tabValue === 1 && !category) {
      setCategoryError(true);
      valid = false;
    } else {
      setCategoryError(false);
    }
    
    if (valid) {
      const transactionType = tabValue === 0 ? 'income' : 'expense';
      const transactionAmount = Number(amount); // Always positive amount
      
      onSave({
        name: transactionName,
        amount: transactionAmount,
        date: new Date(date),
        type: transactionType,
        category: tabValue === 1 ? category : undefined
      });

      // Reset form
      setTransactionName('');
      setAmount('');
      setDate(new Date().toISOString().split('T')[0]);
      setCategory('');
      onClose();
    }
  };

  const handleClose = () => {
    // Reset form and errors
    setTransactionName('');
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    setCategory('');
    setNameError(false);
    setAmountError(false);
    setCategoryError(false);
    onClose();
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        style: {
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%)',
          backdropFilter: 'blur(20px)',
          borderRadius: '28px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.15)',
          border: '1px solid rgba(148, 163, 184, 0.2)'
        }
      }}
      BackdropProps={{
        style: {
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)'
        }
      }}
    >
      <ModalHeader title="Manual Transaction Entry" onClose={handleClose} />

      <DialogContent style={{ padding: '0 24px 24px' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 2 }}>
          <Tabs 
            value={tabValue} 
            onChange={handleTabChange}
            aria-label="manual transaction tabs"
            sx={{
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '14px',
                minHeight: '48px',
                color: '#666',
                '&.Mui-selected': {
                  color: '#3b82f6',
                },
              },
              '& .MuiTabs-indicator': {
                backgroundColor: '#3b82f6',
              },
            }}
          >
            <Tab 
              icon={<TrendingUpIcon />} 
              label="Income" 
              iconPosition="start"
            />
            <Tab 
              icon={<TrendingDownIcon />} 
              label="Expense" 
              iconPosition="start"
            />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 2.5,
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(96, 165, 250, 0.15) 0%, rgba(59, 130, 246, 0.1) 100%)',
              border: '1px solid rgba(96, 165, 250, 0.3)',
              color: '#1e293b',
              boxShadow: '0 8px 24px rgba(59, 130, 246, 0.3)',
              position: 'relative',
              overflow: 'hidden',
              backdropFilter: 'blur(10px)',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                right: 0,
                width: '100px',
                height: '100px',
                background: 'radial-gradient(circle at top right, rgba(96, 165, 250, 0.3), transparent 70%)',
                filter: 'blur(20px)'
              }
            }}>
              <LightbulbOutlinedIcon sx={{ color: '#0284c7' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>Manual Income</div>
                <div style={{ fontSize: '13px', color: '#475569' }}>
                  Add income that will appear in your bank transactions
                </div>
              </div>
            </Box>
            
            <TextField
              label="Income Name"
              value={transactionName}
              onChange={(e) => setTransactionName(e.target.value)}
              fullWidth
              error={nameError}
              helperText={nameError ? "Income name is required" : ""}
              InputLabelProps={{
                style: { color: '#666' },
              }}
              InputProps={{
                style: { color: '#333' },
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  '& fieldset': {
                    borderColor: '#e2e8f0',
                  },
                  '&:hover fieldset': {
                    borderColor: '#cbd5e1',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#4ADE80',
                  },
                },
                '& .MuiFormHelperText-root': {
                  color: '#ef4444',
                },
              }}
            />
            
            <TextField
              label="Amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              fullWidth
              error={amountError}
              helperText={amountError ? "Valid amount is required" : ""}
              InputLabelProps={{
                style: { color: '#666' },
              }}
              InputProps={{
                style: { color: '#333' },
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  '& fieldset': {
                    borderColor: '#e2e8f0',
                  },
                  '&:hover fieldset': {
                    borderColor: '#cbd5e1',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#4ADE80',
                  },
                },
                '& .MuiFormHelperText-root': {
                  color: '#ef4444',
                },
              }}
            />
            
            <TextField
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              fullWidth
              InputLabelProps={{
                style: { color: '#666' },
                shrink: true
              }}
              InputProps={{
                style: { color: '#333' },
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  '& fieldset': {
                    borderColor: '#e2e8f0',
                  },
                  '&:hover fieldset': {
                    borderColor: '#cbd5e1',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#4ADE80',
                  },
                },
              }}
            />
          </div>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 2.5,
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.1) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#1e293b',
              boxShadow: '0 8px 24px rgba(239, 68, 68, 0.3)',
              position: 'relative',
              overflow: 'hidden',
              backdropFilter: 'blur(10px)',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                right: 0,
                width: '100px',
                height: '100px',
                background: 'radial-gradient(circle at top right, rgba(239, 68, 68, 0.3), transparent 70%)',
                filter: 'blur(20px)'
              }
            }}>
              <LightbulbOutlinedIcon sx={{ color: '#dc2626' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>Manual Expense</div>
                <div style={{ fontSize: '13px', color: '#475569' }}>
                  Add expenses to categorize and track in reports
                </div>
              </div>
            </Box>
            
            <TextField
              label="Expense Name"
              value={transactionName}
              onChange={(e) => setTransactionName(e.target.value)}
              fullWidth
              error={nameError}
              helperText={nameError ? "Expense name is required" : ""}
              InputLabelProps={{
                style: { color: '#666' },
              }}
              InputProps={{
                style: { color: '#333' },
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  '& fieldset': {
                    borderColor: '#e2e8f0',
                  },
                  '&:hover fieldset': {
                    borderColor: '#cbd5e1',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#ef4444',
                  },
                },
                '& .MuiFormHelperText-root': {
                  color: '#ef4444',
                },
              }}
            />
            
            <TextField
              label="Amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              fullWidth
              error={amountError}
              helperText={amountError ? "Valid amount is required" : ""}
              InputLabelProps={{
                style: { color: '#666' },
              }}
              InputProps={{
                style: { color: '#333' },
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  '& fieldset': {
                    borderColor: '#e2e8f0',
                  },
                  '&:hover fieldset': {
                    borderColor: '#cbd5e1',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#ef4444',
                  },
                },
                '& .MuiFormHelperText-root': {
                  color: '#ef4444',
                },
              }}
            />

            <FormControl fullWidth error={categoryError}>
              <Autocomplete
                value={category}
                onChange={(event, newValue) => {
                  if (typeof newValue === 'string') {
                    // Handle when user types and selects
                    setCategory(newValue);
                  } else if (newValue && typeof newValue === 'object' && 'inputValue' in newValue) {
                    // Handle "Add new" option
                    setCategory((newValue as { inputValue: string }).inputValue);
                  } else {
                    setCategory(newValue || '');
                  }
                }}
                filterOptions={(options, params) => {
                  const filter = createFilterOptions<string>();
                  const filtered = filter(options, params);

                  const { inputValue } = params;
                  // Suggest the creation of a new value
                  const isExisting = options.some((option) => inputValue.toLowerCase() === option.toLowerCase());
                  if (inputValue !== '' && !isExisting) {
                    filtered.push(inputValue);
                  }

                  return filtered;
                }}
                selectOnFocus
                clearOnBlur
                handleHomeEndKeys
                freeSolo
                options={categories}
                getOptionLabel={(option) => {
                  if (typeof option === 'string') {
                    return option;
                  }
                  if (option && typeof option === 'object' && 'inputValue' in option) {
                    return (option as { inputValue: string }).inputValue;
                  }
                  return '';
                }}
                renderOption={(props, option) => {
                  const isNewOption = !categories.includes(option);
                  return (
                    <li {...props}>
                      {isNewOption ? (
                        <span style={{ color: '#22c55e', fontWeight: 600 }}>
                          + Add "{option}"
                        </span>
                      ) : (
                        option
                      )}
                    </li>
                  );
                }}
                disabled={loadingCategories}
                loading={loadingCategories}
                loadingText="Loading categories..."
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Category"
                    placeholder="Select or type a new category"
                    error={categoryError}
                    InputLabelProps={{
                      style: { color: '#666' },
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        background: 'rgba(255, 255, 255, 0.8)',
                        backdropFilter: 'blur(10px)',
                        borderRadius: '12px',
                        '& fieldset': {
                          borderColor: 'rgba(148, 163, 184, 0.2)',
                        },
                        '&:hover fieldset': {
                          borderColor: 'rgba(96, 165, 250, 0.5)',
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#ef4444',
                        },
                      },
                      '& .MuiInputBase-input': {
                        color: '#333',
                      },
                    }}
                  />
                )}
                sx={{
                  '& .MuiAutocomplete-popupIndicator': {
                    color: '#666',
                  },
                }}
                componentsProps={{
                  paper: {
                    sx: {
                      background: 'rgba(255, 255, 255, 0.98)',
                      backdropFilter: 'blur(20px)',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                    }
                  }
                }}
              />
              {categoryError && (
                <Typography variant="caption" color="error" style={{ marginTop: '4px', marginLeft: '14px' }}>
                  Category is required
                </Typography>
              )}
            </FormControl>
            
            <TextField
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              fullWidth
              InputLabelProps={{
                style: { color: '#666' },
                shrink: true
              }}
              InputProps={{
                style: { color: '#333' },
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  '& fieldset': {
                    borderColor: '#e2e8f0',
                  },
                  '&:hover fieldset': {
                    borderColor: '#cbd5e1',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#ef4444',
                  },
                },
              }}
            />
          </div>
        </TabPanel>
      </DialogContent>

      <DialogActions style={{ padding: '0 24px 24px' }}>
        <Button 
          onClick={handleClose}
          sx={{
            color: '#475569',
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
            borderRadius: '14px',
            padding: '10px 24px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            fontWeight: 600,
            textTransform: 'none',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              background: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)',
              transform: 'translateY(-2px)',
              boxShadow: '0 8px 16px rgba(0, 0, 0, 0.1)',
            },
            '&:active': {
              transform: 'translateY(0)',
            },
          }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loadingCategories && tabValue === 1}
          sx={{
            background: tabValue === 0 
              ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
              : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            borderRadius: '14px',
            padding: '10px 24px',
            fontWeight: 600,
            textTransform: 'none',
            boxShadow: tabValue === 0 
              ? '0 8px 24px rgba(16, 185, 129, 0.4)' 
              : '0 8px 24px rgba(239, 68, 68, 0.4)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              background: tabValue === 0 
                ? 'linear-gradient(135deg, #059669 0%, #047857 100%)' 
                : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
              transform: 'translateY(-2px)',
              boxShadow: tabValue === 0 
                ? '0 12px 32px rgba(16, 185, 129, 0.5)' 
                : '0 12px 32px rgba(239, 68, 68, 0.5)',
            },
            '&:active': {
              transform: 'translateY(0)',
            },
            '&:disabled': {
              background: 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)',
              boxShadow: 'none',
            },
          }}
        >
          Save {tabValue === 0 ? 'Income' : 'Expense'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ManualModal; 