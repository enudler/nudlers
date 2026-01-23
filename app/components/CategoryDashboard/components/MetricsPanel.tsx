import React from 'react';
import { logger } from '../../../utils/client-logger';
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import { styled } from "@mui/material/styles";
import { useEffect } from "react";
import { BoxPanelData } from '../types';
import { dateUtils } from '../utils/dateUtils';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import CategoryIcon from '@mui/icons-material/Category';
import ReceiptIcon from '@mui/icons-material/Receipt';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';

const MetricCard = styled(Paper)(({ theme }) => ({
  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
  backdropFilter: 'blur(20px)',
  borderRadius: '20px',
  padding: '20px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  cursor: 'pointer',
  position: 'relative',
  overflow: 'hidden',
  '&:hover': {
    transform: 'translateY(-4px) scale(1.02)',
    boxShadow: '0 16px 48px rgba(96, 165, 250, 0.4)',
    borderColor: 'rgba(96, 165, 250, 0.5)',
    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.1) 100%)',
  },
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    right: 0,
    width: '120px',
    height: '120px',
    background: 'radial-gradient(circle at top right, rgba(96, 165, 250, 0.25), transparent 70%)',
    filter: 'blur(20px)',
  },
}));

const HeaderBox = styled(Box)({
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  marginBottom: '12px',
  padding: '0 4px',
});

const MetricItem: React.FC<{
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}> = ({ title, value, icon, color, subtitle }) => {
  return (
    <MetricCard>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: '8px'
      }}>
        <div style={{
          background: `linear-gradient(135deg, ${color}25 0%, ${color}15 100%)`,
          borderRadius: '12px',
          padding: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '4px',
          boxShadow: `0 4px 12px ${color}20`,
          border: `1px solid ${color}20`,
          position: 'relative',
          zIndex: 1
        }}>
          {React.cloneElement(icon as React.ReactElement<{ sx?: object }>, {
            sx: {
              fontSize: '20px',
              color: color
            }
          })}
        </div>
        <div>
          <h3 style={{
            margin: '0 0 4px 0',
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.6)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>{title}</h3>
          <p style={{
            margin: 0,
            fontSize: '24px',
            color: color,
            fontWeight: 700,
            lineHeight: '1.1',
            textShadow: `0 2px 8px ${color}40`
          }}>{value}</p>
          {subtitle && (
            <p style={{
              margin: '4px 0 0 0',
              fontSize: '11px',
              color: 'rgba(255, 255, 255, 0.5)',
              fontWeight: 500
            }}>{subtitle}</p>
          )}
        </div>
      </div>
    </MetricCard>
  );
};

const MetricsPanel: React.FC = () => {
  const [data, setData] = React.useState<BoxPanelData>({
    allTransactions: "",
    nonMapped: "",
    categories: "",
    lastMonth: "",
  });
  const [open, setOpen] = React.useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/reports/box-panel");
        const result = await response.json();
        setData(result as BoxPanelData);
      } catch (error) {
        logger.error('Error fetching metrics data', error as Error);
      }
    };

    fetchData();
  }, []);

  return (
    <Box sx={{ flexGrow: 1, mb: 4, mt: 2, pt: '96px' }}>
      <HeaderBox>

        <IconButton
          onClick={() => setOpen(!open)}
          size="small"
          sx={{
            color: 'rgba(255, 255, 255, 0.7)',
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              background: 'rgba(96, 165, 250, 0.2)',
              borderColor: 'rgba(96, 165, 250, 0.4)',
              color: '#ffffff',
              transform: 'translateY(-2px)',
              boxShadow: '0 8px 24px rgba(96, 165, 250, 0.3)',
            },
          }}
        >
          {open ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
        </IconButton>
      </HeaderBox>
      <Collapse in={open}>
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          maxWidth: '800px',
          margin: '0 auto'
        }}>
          <MetricItem
            title="Total Transactions"
            value={data?.allTransactions ? data.allTransactions : "N/A"}
            icon={<ReceiptIcon />}
            color="#3b82f6"
            subtitle="All time"
          />
          <MetricItem
            title="Active Categories"
            value={data?.categories ? data.categories : "N/A"}
            icon={<CategoryIcon />}
            color="#3b82f6"
            subtitle="In use"
          />
          <MetricItem
            title="Latest Activity"
            value={data.lastMonth ? data.lastMonth : "N/A"}
            icon={<CalendarTodayIcon />}
            color="#3b82f6"
            subtitle="Last transaction"
          />
        </Box>
      </Collapse>
    </Box>
  );
};

export default MetricsPanel; 