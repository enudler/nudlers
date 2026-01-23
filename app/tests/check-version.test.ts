import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from '../pages/api/check-version';
import packageJson from '../package.json';

// Mock Next.js objects
const mockReq = (method: string = 'GET') => ({
    method,
} as any);

const mockRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
};

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

// Mock logger
vi.mock('../utils/logger', () => ({
    default: {
        error: vi.fn(),
    },
}));

describe('check-version API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return 405 if method is not GET', async () => {
        const req = mockReq('POST');
        const res = mockRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(405);
        expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
    });

    it('should identify a new version available', async () => {
        const req = mockReq();
        const res = mockRes();

        // Assume current version is 0.0.12 (from previous file view)
        // Mock GitHub response with a newer version
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                tag_name: 'v1.0.0',
                html_url: 'https://github.com/enudler/nudlers/releases/tag/v1.0.0',
            }),
        });

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            hasNewVersion: true,
            latestVersion: '1.0.0',
            currentVersion: packageJson.version,
            releaseUrl: 'https://github.com/enudler/nudlers/releases/tag/v1.0.0',
        }));
    });

    it('should identify no new version available (same version)', async () => {
        const req = mockReq();
        const res = mockRes();

        const currentVersion = packageJson.version; // e.g., 0.0.12

        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                tag_name: `v${currentVersion}`,
                html_url: `https://github.com/enudler/nudlers/releases/tag/v${currentVersion}`,
            }),
        });

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            hasNewVersion: false,
            latestVersion: currentVersion,
        }));
    });

    it('should identify no new version available (older version)', async () => {
        const req = mockReq();
        const res = mockRes();

        // 0.0.1 < 0.0.12
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                tag_name: 'v0.0.1',
                html_url: 'https://github.com/enudler/nudlers/releases/tag/v0.0.1',
            }),
        });

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            hasNewVersion: false,
        }));
    });

    it('should handle GitHub API errors', async () => {
        const req = mockReq();
        const res = mockRes();

        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 500,
        });

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Failed to check for updates' });
    });

    it('should handle 404 from GitHub API (no releases)', async () => {
        const req = mockReq();
        const res = mockRes();

        const currentVersion = packageJson.version;

        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 404,
        });

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(200); // We decided to handle 404 as "no update" but return info
        expect(res.json).toHaveBeenCalledWith({
            hasNewVersion: false,
            latestVersion: currentVersion,
            currentVersion,
            releaseUrl: `https://github.com/enudler/nudlers/releases`
        });
    });
});
