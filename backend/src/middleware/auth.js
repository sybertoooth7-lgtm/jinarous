const jwt = require('jsonwebtoken');
const { tokenBlocklist } = require('../routes/admin');

async function requireAuth(req, res, next) {
  const token = req.cookies?.adminToken || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }

  try {
    if (decoded.jti && await tokenBlocklist.has(decoded.jti)) {
      return res.status(401).json({ error: 'Unauthorized: Token has been revoked' });
    }
  } catch (err) {
    console.error('[auth] Blocklist check failed:', err.message);
    // Token is cryptographically valid; allow through rather than hard-lock admins during Redis outage
  }

  req.token = token;
  req.user = decoded;
  next();
}

module.exports = { requireAuth };
