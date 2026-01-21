import React, { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import ModalHeader from './ModalHeader';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';

interface ScrapeEvent {
  id: number;
  triggered_by: string | null;
  vendor: string;
  start_date: string;
  status: 'started' | 'success' | 'failed' | string;
  message: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ScrapeAuditModal({ open, onClose }: Props) {
  const [events, setEvents] = useState<ScrapeEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/scrape-events?limit=200');
      const data = await res.json();
      setEvents(data);
    } catch (e) {
      // noop
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchEvents();
  }, [open]);

  const statusColor = (status: string) => {
    if (status === 'success') return 'success';
    if (status === 'failed') return 'error';
    return 'default';
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <ModalHeader title="Scrape Audit" onClose={onClose} />
      <DialogContent>
        {loading ? (
          <Box sx={{ p: 2 }}>Loading...</Box>
        ) : events.length === 0 ? (
          <Box sx={{ p: 2, color: 'text.secondary' }}>No audit events</Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>Vendor</TableCell>
                  <TableCell>Start Date</TableCell>
                  <TableCell>Triggered By</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Message</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map(ev => (
                  <TableRow key={ev.id}>
                    <TableCell>{new Date(ev.created_at).toLocaleString()}</TableCell>
                    <TableCell>{ev.vendor}</TableCell>
                    <TableCell>{new Date(ev.start_date).toLocaleDateString()}</TableCell>
                    <TableCell>{ev.triggered_by || '-'}</TableCell>
                    <TableCell>
                      <Chip label={ev.status} color={statusColor(ev.status) as any} size="small" />
                    </TableCell>
                    <TableCell>{ev.message || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
