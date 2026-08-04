const jwt = require('jsonwebtoken');
const { tokenBlocklist } = require('../routes/admin');

/**
 * Authentication middleware
 * Fix #2: Check token blocklist for revoked tokens
 */
function requireAuth(req, res, next) {
  const token = req.cookies?.adminToken || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fix #2: Reject revoked tokens
    if (decoded.jti && tokenBlocklist.has(decoded.jti)) {
      return res.status(401).json({ error: 'Unauthorized: Token has been revoked' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

module.exports = { requireAuth };
