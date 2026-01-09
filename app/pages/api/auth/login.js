import crypto from 'crypto';

/**
 * Simple authentication endpoint
 * For production use, consider using NextAuth.js or similar
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;

  // Get password from environment variable
  const AUTH_PASSWORD = process.env.NUDLERS_AUTH_PASSWORD;

  if (!AUTH_PASSWORD) {
    console.error('NUDLERS_AUTH_PASSWORD not configured');
    return res.status(500).json({ error: 'Authentication not configured' });
  }

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  // Compare passwords using constant-time comparison to prevent timing attacks
  const providedHash = crypto.createHash('sha256').update(password).digest('hex');
  const expectedHash = crypto.createHash('sha256').update(AUTH_PASSWORD).digest('hex');
  
  const isValid = crypto.timingSafeEqual(
    Buffer.from(providedHash),
    Buffer.from(expectedHash)
  );

  if (!isValid) {
    // Add delay to prevent brute force attacks
    await new Promise(resolve => setTimeout(resolve, 1000));
    return res.status(401).json({ error: 'Invalid password' });
  }

  // Generate session token
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

  // Store session in secure, httpOnly cookie
  res.setHeader('Set-Cookie', [
    `session=${sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${24 * 60 * 60}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    `sessionExpiry=${expiresAt}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${24 * 60 * 60}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
  ]);

  return res.status(200).json({ 
    success: true,
    message: 'Authentication successful',
    expiresAt
  });
}

