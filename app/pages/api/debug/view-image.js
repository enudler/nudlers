import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
    const { file } = req.query;

    if (!file || typeof file !== 'string') {
        return res.status(400).json({ error: 'Filename is required' });
    }

    // Security check: prevent directory traversal & ensure it looks like our screenshot files
    // Format: companyId-stepName-timestamp.png
    if (!/^[a-zA-Z0-9-]+\.png$/.test(file)) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = path.join(process.cwd(), 'public', 'debug', 'screenshots', file);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(filePath);

    res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
}
