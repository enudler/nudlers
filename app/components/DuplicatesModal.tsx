import React, { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import ModalHeader from './ModalHeader';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { useNotification } from './NotificationContext';

interface DuplicatePair {
  id1: string;
  vendor1: string;
  id2: string;
  vendor2: string;
  name1: string;
  name2: string;
  date1: string;
  date2: string;
  price1: number;
  price2: number;
  account1: string | null;
  account2: string | null;
  similarity: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function DuplicatesModal({ open, onClose }: Props) {
  const [duplicates, setDuplicates] = useState<DuplicatePair[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [autoResolving, setAutoResolving] = useState(false);
  const { showNotification } = useNotification();

  const fetchDuplicates = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/duplicates');
      const data = await res.json();
      setDuplicates(data.detected || []);
    } catch (e) {
      showNotification('Failed to load duplicates', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchDuplicates();
  }, [open]);

  const handleAction = async (
    dup: DuplicatePair, 
    action: 'delete_first' | 'delete_second' | 'not_duplicate'
  ) => {
    const key = `${dup.id1}-${dup.id2}`;
    setProcessing(key);
    
    try {
      const res = await fetch('/api/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          transaction1: { identifier: dup.id1, vendor: dup.vendor1 },
          transaction2: { identifier: dup.id2, vendor: dup.vendor2 }
        })
      });
      
      if (!res.ok) throw new Error('Failed to process duplicate');
      
      // Remove from list
      setDuplicates(prev => prev.filter(d => 
        !(d.id1 === dup.id1 && d.id2 === dup.id2)
      ));
      
      showNotification(
        action === 'not_duplicate' 
          ? 'Marked as not duplicate' 
          : 'Duplicate resolved',
        'success'
      );
    } catch (e) {
      showNotification('Failed to process', 'error');
    } finally {
      setProcessing(null);
    }
  };

  const handleAutoResolve = async () => {
    if (!confirm('This will automatically delete exact duplicates (keeping the first occurrence). Continue?')) {
      return;
    }
    
    setAutoResolving(true);
    try {
      const res = await fetch('/api/duplicates?autoResolve=true&dryRun=false', {
        method: 'DELETE'
      });
      
      if (!res.ok) throw new Error('Failed to auto-resolve');
      
      const data = await res.json();
      showNotification(`Removed ${data.deleted} duplicates`, 'success');
      fetchDuplicates();
    } catch (e) {
      showNotification('Failed to auto-resolve', 'error');
    } finally {
      setAutoResolving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB');
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('he-IL', { 
      style: 'currency', 
      currency: 'ILS' 
    }).format(Math.abs(price));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <ModalHeader title="Duplicate Transactions" onClose={onClose} />
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : duplicates.length === 0 ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            No duplicate transactions detected! Your data is clean.
          </Alert>
        ) : (
          <>
            <Alert severity="warning" sx={{ mb: 2 }}>
              Found {duplicates.length} potential duplicate pairs. Review each pair and decide which to keep.
            </Alert>
            
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell>Card</TableCell>
                    <TableCell>Match</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {duplicates.map((dup, idx) => {
                    const key = `${dup.id1}-${dup.id2}`;
                    const isProcessing = processing === key;
                    
                    return (
                      <React.Fragment key={key}>
                        {/* First transaction */}
                        <TableRow sx={{ bgcolor: 'action.hover' }}>
                          <TableCell>{formatDate(dup.date1)}</TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                              {dup.name1}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">{formatPrice(dup.price1)}</TableCell>
                          <TableCell>
                            <Chip 
                              label={dup.account1 || '-'} 
                              size="small" 
                              variant="outlined" 
                            />
                          </TableCell>
                          <TableCell rowSpan={2}>
                            <Chip 
                              label={`${Math.round(dup.similarity * 100)}%`}
                              color={dup.similarity >= 0.95 ? 'error' : 'warning'}
                              size="small"
                              icon={<CompareArrowsIcon />}
                            />
                          </TableCell>
                          <TableCell rowSpan={2} align="center">
                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                              <Tooltip title="Keep this, delete the other">
                                <IconButton 
                                  size="small" 
                                  color="primary"
                                  onClick={() => handleAction(dup, 'delete_second')}
                                  disabled={isProcessing}
                                >
                                  {isProcessing ? <CircularProgress size={20} /> : <CheckCircleIcon />}
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete this, keep the other">
                                <IconButton 
                                  size="small" 
                                  color="error"
                                  onClick={() => handleAction(dup, 'delete_first')}
                                  disabled={isProcessing}
                                >
                                  <DeleteIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Not duplicates - keep both">
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => handleAction(dup, 'not_duplicate')}
                                  disabled={isProcessing}
                                  sx={{ minWidth: 'auto', px: 1 }}
                                >
                                  Keep Both
                                </Button>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                        {/* Second transaction */}
                        <TableRow sx={{ 
                          bgcolor: 'action.selected',
                          borderBottom: idx < duplicates.length - 1 ? '2px solid' : undefined,
                          borderColor: 'divider'
                        }}>
                          <TableCell>{formatDate(dup.date2)}</TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                              {dup.name2}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">{formatPrice(dup.price2)}</TableCell>
                          <TableCell>
                            <Chip 
                              label={dup.account2 || '-'} 
                              size="small" 
                              variant="outlined" 
                            />
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {duplicates.length > 0 && (
          <Button
            variant="contained"
            color="warning"
            onClick={handleAutoResolve}
            disabled={autoResolving}
            startIcon={autoResolving ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            Auto-Resolve All Exact Duplicates
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Close</Button>
        <Button 
          variant="outlined" 
          onClick={fetchDuplicates}
          disabled={loading}
        >
          Refresh
        </Button>
      </DialogActions>
    </Dialog>
  );
}
