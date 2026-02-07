import { takeManualScreenshot } from '../../../scrapers/core.js';
import logger from '../../../utils/logger.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        const filename = await takeManualScreenshot();
        if (filename) {
            return res.status(200).json({
                success: true,
                message: 'Screenshot captured successfully',
                filename
            });
        } else {
            return res.status(500).json({
                success: false,
                message: 'Failed to capture screenshot'
            });
        }
    } catch (err) {
        logger.error({ error: err.message }, '[API] Manual screenshot error');
        return res.status(500).json({
            success: false,
            message: 'An error occurred while taking a screenshot'
        });
    }
}
