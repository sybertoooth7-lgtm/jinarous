// backend/src/middleware/rbac.js
// Role-based access control for admin routes.
// Roles: readonly < admin < superadmin

import db from '../db.js';

const ROLE_HIERARCHY = {
  readonly: 0,
  admin: 1,
  superadmin: 2,
};

/**
 * Returns true if the user's role meets or exceeds the required role.
 */
export function hasRole(userRole, requiredRole) {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Middleware factory: require a minimum role level.
 * Must be used AFTER requireAuth (which sets req.user).
 */
export function requireRole(minRole) {
  return async (req, res, next) => {
    const userRole = req.user?.role || 'readonly';
    if (!hasRole(userRole, minRole)) {
      return res.status(403).json({
        error: 'Forbidden: insufficient privileges.',
        required: minRole,
        current: userRole,
      });
    }
    next();
  };
}

/**
 * Middleware: require admin or higher (blocks readonly).
 */
export const requireAdmin = requireRole('admin');

/**
 * Middleware: require superadmin (blocks admin and readonly).
 */
export const requireSuperAdmin = requireRole('superadmin');

/**
 * Attach the user's role to req.user by looking it up from the DB.
 * Call this inside requireAuth or as a separate middleware after it.
 * Caches the role lookup for the request lifetime.
 */
export async function attachUserRole(req, res, next) {
  if (!req.user?.sub) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { rows } = await db.query(
      'SELECT role FROM admin_users WHERE id = $1',
      [req.user.sub]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    req.user.role = rows[0].role;
    next();
  } catch (err) {
    console.error('[rbac] Failed to attach user role:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
