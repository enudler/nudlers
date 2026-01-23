import React, { useEffect, useState } from 'react';
import { Chip, Tooltip, Link } from '@mui/material';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import { styled } from '@mui/material/styles';

interface VersionData {
    hasNewVersion: boolean;
    latestVersion: string;
    currentVersion: string;
    releaseUrl: string;
}

const StyledChip = styled(Chip)(({ theme }) => ({
    backgroundColor: theme.palette.error.main,
    color: theme.palette.error.contrastText,
    fontWeight: 'bold',
    '&:hover': {
        backgroundColor: theme.palette.error.dark,
    },
    cursor: 'pointer',
    animation: 'pulse 2s infinite',
    '@keyframes pulse': {
        '0%': {
            boxShadow: '0 0 0 0 rgba(255, 82, 82, 0.7)',
        },
        '70%': {
            boxShadow: '0 0 0 10px rgba(255, 82, 82, 0)',
        },
        '100%': {
            boxShadow: '0 0 0 0 rgba(255, 82, 82, 0)',
        },
    },
}));

const VersionIndicator: React.FC = () => {
    const [versionData, setVersionData] = useState<VersionData | null>(null);

    useEffect(() => {
        const checkVersion = async () => {
            try {
                const response = await fetch('/api/check-version');
                if (response.ok) {
                    const data = await response.json();
                    setVersionData(data);
                }
            } catch (error) {
                console.error('Failed to check version:', error);
            }
        };

        checkVersion();
        // Check every hour
        const interval = setInterval(checkVersion, 60 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    if (!versionData || !versionData.hasNewVersion) {
        return null;
    }

    return (
        <Tooltip title={`New version available: v${versionData.latestVersion}. Click to see release notes.`}>
            <Link href={versionData.releaseUrl} target="_blank" rel="noopener noreferrer" sx={{ textDecoration: 'none' }}>
                <StyledChip
                    icon={<NewReleasesIcon style={{ color: 'inherit' }} />}
                    label={`Update Available`}
                    size="small"
                />
            </Link>
        </Tooltip>
    );
};

export default VersionIndicator;
