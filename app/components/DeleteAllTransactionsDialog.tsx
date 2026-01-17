import React, { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Typography,
    TextField,
    Checkbox,
    FormControlLabel,
    CircularProgress,
    Alert
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';

interface DeleteAllTransactionsDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const DeleteAllTransactionsDialog: React.FC<DeleteAllTransactionsDialogProps> = ({
    open,
    onClose,
    onSuccess
}) => {
    const theme = useTheme();
    const [confirmText, setConfirmText] = useState('');
    const [createBackup, setCreateBackup] = useState(true);
    const [backupDownloaded, setBackupDownloaded] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleClose = () => {
        if (!isDownloading && !isDeleting) {
            setConfirmText('');
            setCreateBackup(true);
            setBackupDownloaded(false);
            setError(null);
            onClose();
        }
    };

    const handleDownloadBackup = async () => {
        setIsDownloading(true);
        setError(null);

        try {
            const response = await fetch('/api/transactions/export_all_transactions');
            if (!response.ok) {
                throw new Error('Failed to export transactions');
            }

            const data = await response.json();

            // Create a blob and download it
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `transactions-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            setBackupDownloaded(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to download backup');
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDelete = async () => {
        if (confirmText !== 'DELETE') {
            setError('Please type DELETE to confirm');
            return;
        }

        if (createBackup && !backupDownloaded) {
            setError('Please download backup first or uncheck the backup option');
            return;
        }

        setIsDeleting(true);
        setError(null);

        try {
            const response = await fetch('/api/transactions/delete_all_transactions', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error('Failed to delete transactions');
            }

            const result = await response.json();
            onSuccess();
            handleClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete transactions');
        } finally {
            setIsDeleting(false);
        }
    };

    const isDeleteEnabled = confirmText === 'DELETE' && (!createBackup || backupDownloaded);

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                style: {
                    borderRadius: '16px',
                    background: theme.palette.mode === 'dark'
                        ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)'
                        : 'rgba(255, 255, 255, 0.98)',
                    backdropFilter: 'blur(20px)',
                    border: `2px solid ${theme.palette.error.main}`
                }
            }}
        >
            <DialogTitle sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                color: theme.palette.error.main,
                fontWeight: 600,
                borderBottom: `1px solid ${theme.palette.divider}`,
                pb: 2
            }}>
                <WarningAmberIcon />
                Delete All Transactions
            </DialogTitle>

            <DialogContent sx={{ pt: 3 }}>
                {error && (
                    <Alert severity="error" icon={<ErrorIcon />} sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                <Box sx={{ mb: 3 }}>
                    <Typography variant="body1" sx={{ mb: 2, fontWeight: 500 }}>
                        ⚠️ This action will permanently delete <strong>ALL</strong> transactions from your database.
                    </Typography>
                    <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mb: 2 }}>
                        This cannot be undone. All transaction history will be lost forever.
                    </Typography>
                </Box>

                <FormControlLabel
                    control={
                        <Checkbox
                            checked={createBackup}
                            onChange={(e) => {
                                setCreateBackup(e.target.checked);
                                if (!e.target.checked) {
                                    setBackupDownloaded(false);
                                }
                            }}
                            sx={{
                                color: theme.palette.primary.main,
                                '&.Mui-checked': {
                                    color: theme.palette.primary.main,
                                },
                            }}
                        />
                    }
                    label="Download backup before deleting (recommended)"
                    sx={{ mb: 2 }}
                />

                {createBackup && (
                    <Box sx={{ mb: 3, pl: 4 }}>
                        <Button
                            variant="outlined"
                            startIcon={isDownloading ? <CircularProgress size={16} /> : backupDownloaded ? <CheckCircleIcon /> : <DownloadIcon />}
                            onClick={handleDownloadBackup}
                            disabled={isDownloading || backupDownloaded}
                            sx={{
                                borderColor: backupDownloaded ? '#22c55e' : theme.palette.primary.main,
                                color: backupDownloaded ? '#22c55e' : theme.palette.primary.main,
                                '&:hover': {
                                    borderColor: backupDownloaded ? '#22c55e' : theme.palette.primary.dark,
                                    backgroundColor: backupDownloaded ? 'rgba(34, 197, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)'
                                }
                            }}
                        >
                            {isDownloading ? 'Downloading...' : backupDownloaded ? 'Backup Downloaded ✓' : 'Download Backup'}
                        </Button>
                    </Box>
                )}

                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
                        Type <strong>DELETE</strong> to confirm:
                    </Typography>
                    <TextField
                        fullWidth
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                        placeholder="Type DELETE here"
                        variant="outlined"
                        size="small"
                        autoComplete="off"
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                color: theme.palette.text.primary,
                                '& fieldset': {
                                    borderColor: confirmText === 'DELETE' ? theme.palette.error.main : theme.palette.divider,
                                },
                            }
                        }}
                    />
                </Box>
            </DialogContent>

            <DialogActions sx={{ p: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
                <Button
                    onClick={handleClose}
                    disabled={isDownloading || isDeleting}
                    sx={{ color: theme.palette.text.secondary }}
                >
                    Cancel
                </Button>
                <Button
                    onClick={handleDelete}
                    disabled={!isDeleteEnabled || isDeleting}
                    variant="contained"
                    startIcon={isDeleting ? <CircularProgress size={16} color="inherit" /> : <DeleteSweepIcon />}
                    sx={{
                        backgroundColor: theme.palette.error.main,
                        '&:hover': {
                            backgroundColor: theme.palette.error.dark,
                        },
                        '&:disabled': {
                            backgroundColor: theme.palette.action.disabledBackground,
                            color: theme.palette.action.disabled
                        }
                    }}
                >
                    {isDeleting ? 'Deleting...' : 'Delete All Transactions'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default DeleteAllTransactionsDialog;
