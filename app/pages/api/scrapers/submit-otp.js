import { resolveOtpRequest } from '../../../utils/otpState';
import logger from '../../../utils/logger';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const { requestId, code } = req.body;

    if (!requestId || !code) {
        return res.status(400).json({ message: 'Missing requestId or code' });
    }

    logger.info({ requestId }, '[OTP API] Received OTP submission');

    const resolved = resolveOtpRequest(requestId, code);

    if (resolved) {
        return res.status(200).json({ success: true, message: 'OTP submitted successfully' });
    } else {
        return res.status(404).json({
            success: false,
            message: 'Request ID not found or expired. Please trigger a new sync.'
        });
    }
}
