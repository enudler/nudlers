import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export default async function handler(req, res) {
    const screenshotsDir = path.join(process.cwd(), 'public', 'debug', 'screenshots');

    if (req.method === 'GET') {
        try {
            if (!existsSync(screenshotsDir)) {
                return res.status(200).json({ screenshots: [] });
            }

            const files = await fs.readdir(screenshotsDir);
            const screenshots = await Promise.all(
                files
                    .filter(file => file.endsWith('.png'))
                    .map(async (file) => {
                        const stats = await fs.stat(path.join(screenshotsDir, file));
                        // Filename format: companyId-stepName-timestamp.png
                        const parts = file.replace('.png', '').split('-');
                        const companyId = parts[0];
                        const stepName = parts[1];
                        const timestampStr = parts.slice(2).join('-');

                        return {
                            filename: file,
                            url: `/api/debug/view-image?file=${file}`,
                            companyId,
                            stepName,
                            timestamp: stats.mtime,
                            size: stats.size
                        };
                    })
            );

            // Sort by latest first
            screenshots.sort((a, b) => b.timestamp - a.timestamp);

            return res.status(200).json({ screenshots });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    if (req.method === 'DELETE') {
        try {
            if (existsSync(screenshotsDir)) {
                const files = await fs.readdir(screenshotsDir);
                await Promise.all(
                    files
                        .filter(file => file.endsWith('.png'))
                        .map(file => fs.unlink(path.join(screenshotsDir, file)))
                );
            }
            return res.status(200).json({ success: true });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(405).json({ message: 'Method not allowed' });
}
