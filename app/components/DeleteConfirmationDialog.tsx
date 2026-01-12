import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import { formatNumber } from './CategoryDashboard/utils/formatUtils';
import { dateUtils } from './CategoryDashboard/utils/dateUtils';

interface Transaction {
    name: string;
    price: number;
    date: string;
    category?: string;
}

interface DeleteConfirmationDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    transaction: Transaction | null;
}

const DeleteConfirmationDialog: React.FC<DeleteConfirmationDialogProps> = ({
    open,
    onClose,
    onConfirm,
    transaction
}) => {
    if (!transaction) return null;

    const handleConfirm = () => {
        onConfirm();
        onClose();
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: '24px',
                    padding: '8px',
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%)',
                    backdropFilter: 'blur(20px)',
                    boxShadow: '0 24px 64px rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                }
            }}
            BackdropProps={{
                style: {
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    backdropFilter: 'blur(8px)'
                }
            }}
        >
            <DialogTitle sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontWeight: 700,
                color: '#ef4444',
                paddingBottom: '8px'
            }}>
                <Box sx={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '16px',
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 24px rgba(239, 68, 68, 0.3)'
                }}>
                    <WarningAmberIcon sx={{ color: '#fff', fontSize: '28px' }} />
                </Box>
                Delete Transaction?
            </DialogTitle>

            <DialogContent>
                <Box sx={{
                    marginTop: '16px',
                    padding: '20px',
                    borderRadius: '16px',
                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(239, 68, 68, 0.04) 100%)',
                    border: '1px solid rgba(239, 68, 68, 0.15)'
                }}>
                    <Typography sx={{
                        fontSize: '14px',
                        color: '#64748b',
                        marginBottom: '16px',
                        fontWeight: 500
                    }}>
                        Are you sure you want to delete this transaction? This action cannot be undone.
                    </Typography>

                    <Box sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        padding: '16px',
                        borderRadius: '12px',
                        background: 'rgba(255, 255, 255, 0.8)',
                        border: '1px solid rgba(148, 163, 184, 0.2)'
                    }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography sx={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                                Description:
                            </Typography>
                            <Typography sx={{ fontSize: '14px', color: '#1e293b', fontWeight: 600 }}>
                                {transaction.name}
                            </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography sx={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                                Amount:
                            </Typography>
                            <Typography sx={{
                                fontSize: '16px',
                                color: transaction.price < 0 ? '#ef4444' : '#10b981',
                                fontWeight: 700
                            }}>
                                ₪{formatNumber(Math.abs(transaction.price))}
                            </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography sx={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                                Date:
                            </Typography>
                            <Typography sx={{ fontSize: '14px', color: '#1e293b', fontWeight: 600 }}>
                                {dateUtils.formatDate(transaction.date)}
                            </Typography>
                        </Box>

                        {transaction.category && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography sx={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                                    Category:
                                </Typography>
                                <Typography sx={{
                                    fontSize: '13px',
                                    color: '#3b82f6',
                                    fontWeight: 600,
                                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                    padding: '4px 10px',
                                    borderRadius: '6px'
                                }}>
                                    {transaction.category}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                </Box>
            </DialogContent>

            <DialogActions sx={{ padding: '16px 24px', gap: '12px' }}>
                <Button
                    onClick={onClose}
                    startIcon={<CloseIcon />}
                    sx={{
                        borderRadius: '12px',
                        padding: '10px 20px',
                        textTransform: 'none',
                        fontWeight: 600,
                        color: '#64748b',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        '&:hover': {
                            backgroundColor: 'rgba(148, 163, 184, 0.1)',
                            border: '1px solid rgba(148, 163, 184, 0.3)',
                        }
                    }}
                >
                    Cancel
                </Button>
                <Button
                    onClick={handleConfirm}
                    variant="contained"
                    startIcon={<DeleteIcon />}
                    sx={{
                        borderRadius: '12px',
                        padding: '10px 20px',
                        textTransform: 'none',
                        fontWeight: 600,
                        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                        boxShadow: '0 4px 16px rgba(239, 68, 68, 0.3)',
                        '&:hover': {
                            background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                            boxShadow: '0 6px 20px rgba(239, 68, 68, 0.4)',
                        }
                    }}
                >
                    Delete Transaction
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default DeleteConfirmationDialog;
