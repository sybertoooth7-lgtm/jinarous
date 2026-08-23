// backend/src/middleware/rbac.js

import db from '../db.js';

const ROLE_HIERARCHY = { readonly: 0, admin: 1, superadmin: 2 };

export function hasRole(userRole, requiredRole) {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function requireRole(minRole) {
  return async (req, res, next) => {
    const userRole = req.user?.role || 'readonly';
    if (!hasRole(userRole, minRole)) {
      return res.status(403).json({ error: 'Forbidden: insufficient privileges.', required: minRole, current: userRole });
    }
    next();
  };
}

export const requireAdmin = requireRole('admin');
export const requireSuperAdmin = requireRole('superadmin');

export async function attachUserRole(req, res, next) {
  if (!req.user?.sub) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { rows } = await db.query('SELECT role FROM admin_users WHERE id = $1', [req.user.sub]);
    if (rows.length === 0) return res.status(401).json({ error: 'User not found' });
    req.user.role = rows[0].role;
    next();
  } catch (err) {
    console.error('[rbac] Failed to attach role:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
