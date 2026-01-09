import { useState, useEffect } from 'react';
import Head from 'next/head';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';

export default function VNCViewer() {
  const [vncUrl, setVncUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Construct the VNC URL based on current window location
    // noVNC runs on port 6080 of the same host
    const host = window.location.hostname;
    const url = `http://${host}:6080/vnc.html?autoconnect=true&resize=scale`;
    setVncUrl(url);
    setLoading(false);
  }, []);

  const handleRefresh = () => {
    const iframe = document.getElementById('vnc-frame') as HTMLIFrameElement;
    if (iframe) {
      iframe.src = iframe.src;
    }
  };

  return (
    <>
      <Head>
        <title>Browser Viewer - Clarify Expenses</title>
      </Head>
      
      <Box sx={{ 
        minHeight: '100vh',
        backgroundColor: '#f3f4f6',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <Box sx={{ 
          backgroundColor: '#1f2937',
          color: 'white',
          px: 3,
          py: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Link href="/" passHref>
              <Button 
                startIcon={<ArrowBackIcon />}
                sx={{ color: 'white', textTransform: 'none' }}
              >
                Back to App
              </Button>
            </Link>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              🔍 Browser Debug Viewer
            </Typography>
          </Box>
          
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button 
              variant="outlined" 
              startIcon={<RefreshIcon />}
              onClick={handleRefresh}
              sx={{ 
                color: 'white', 
                borderColor: 'rgba(255,255,255,0.3)',
                textTransform: 'none',
                '&:hover': { borderColor: 'white' }
              }}
            >
              Refresh
            </Button>
            {vncUrl && (
              <Button 
                variant="outlined" 
                startIcon={<OpenInNewIcon />}
                onClick={() => window.open(vncUrl, '_blank')}
                sx={{ 
                  color: 'white', 
                  borderColor: 'rgba(255,255,255,0.3)',
                  textTransform: 'none',
                  '&:hover': { borderColor: 'white' }
                }}
              >
                Open in New Tab
              </Button>
            )}
          </Box>
        </Box>

        {/* Info Banner */}
        <Alert 
          severity="info" 
          sx={{ 
            borderRadius: 0,
            '& .MuiAlert-message': { width: '100%' }
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span>
              This viewer shows the Chromium browser running inside Docker. 
              You can interact with it for 2FA or debugging.
            </span>
            <Typography variant="caption" sx={{ color: '#0369a1' }}>
              Requires <code>ENABLE_VNC=true</code> in your environment
            </Typography>
          </Box>
        </Alert>

        {/* VNC Frame */}
        <Box sx={{ 
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          p: 2
        }}>
          {loading ? (
            <Box sx={{ 
              flex: 1, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              backgroundColor: '#1f2937',
              borderRadius: 2
            }}>
              <Typography sx={{ color: 'white' }}>Loading...</Typography>
            </Box>
          ) : error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : (
            <Box sx={{ 
              flex: 1,
              backgroundColor: '#1f2937',
              borderRadius: 2,
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
            }}>
              <iframe
                id="vnc-frame"
                src={vncUrl || ''}
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: 'calc(100vh - 180px)',
                  border: 'none',
                  borderRadius: '8px'
                }}
                title="VNC Browser Viewer"
                onError={() => setError('Failed to connect to VNC server. Make sure ENABLE_VNC=true is set.')}
              />
            </Box>
          )}
        </Box>

        {/* Footer with tips */}
        <Box sx={{ 
          backgroundColor: '#e5e7eb',
          px: 3,
          py: 2,
          borderTop: '1px solid #d1d5db'
        }}>
          <Typography variant="body2" sx={{ color: '#4b5563' }}>
            <strong>Tips:</strong> 
            {' '}• Click inside the viewer to interact with the browser
            {' '}• The browser shows the scraper automation in real-time
            {' '}• Enter 2FA codes directly in the viewer when prompted
            {' '}• If the connection fails, ensure Docker is running with ENABLE_VNC=true
          </Typography>
        </Box>
      </Box>
    </>
  );
}
