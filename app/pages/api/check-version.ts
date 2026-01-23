import type { NextApiRequest, NextApiResponse } from 'next';
import packageJson from '../../package.json';
import logger from '../../utils/logger';

interface VersionResponse {
    hasNewVersion: boolean;
    latestVersion: string;
    currentVersion: string;
    releaseUrl: string;
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<VersionResponse | { error: string }>
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const currentVersion = packageJson.version;
        const repoOwner = 'enudler';
        const repoName = 'nudlers';

        const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Nudlers-App'
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                // No releases found
                return res.status(200).json({
                    hasNewVersion: false,
                    latestVersion: currentVersion,
                    currentVersion,
                    releaseUrl: `https://github.com/${repoOwner}/${repoName}/releases`
                });
            }
            throw new Error(`GitHub API responded with ${response.status}`);
        }

        const data = await response.json();
        const latestVersionTag = data.tag_name; // e.g., "v1.0.1" or "1.0.1"
        const latestVersion = latestVersionTag.replace(/^v/, '');

        // Simple semantic version comparison
        const hasNewVersion = compareVersions(latestVersion, currentVersion) > 0;

        res.status(200).json({
            hasNewVersion,
            latestVersion,
            currentVersion,
            releaseUrl: data.html_url
        });

    } catch (error) {
        logger.error({ err: error }, 'Failed to check for updates');
        res.status(500).json({ error: 'Failed to check for updates' });
    }
}

function compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }
    return 0;
}
