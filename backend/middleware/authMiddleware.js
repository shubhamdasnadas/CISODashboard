const jwt = require('jsonwebtoken');
const { centralPool } = require('../db');
const { validateUserAndOrgStatus } = require('../utils/userOrgValidation');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }

  const userId = decoded.userId || decoded.id;
  if (!userId) {
    return res.status(401).json({ error: 'Invalid token payload.' });
  }

  try {
    const { rows } = await centralPool.query(
      `SELECT id, username, email, role, organisation_id, org_ids, is_active, status, deleted_at, allowed_pages
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (rows.length === 0 || rows[0].deleted_at !== null) {
      return res.status(401).json({
        error: 'ACCOUNT_DEACTIVATED',
        code: 'ACCOUNT_DEACTIVATED',
        message: 'Your account has been deleted or deactivated. Access revoked.',
      });
    }

    const user = rows[0];

    // Instant access revocation if user account is deactivated, or organisation is suspended/expired
    const statusCheck = await validateUserAndOrgStatus(user, centralPool);
    if (statusCheck.blocked) {
      return res.status(401).json({
        error: statusCheck.code,
        code: statusCheck.code,
        orgStatus: statusCheck.orgStatus || 'inactive',
        message: statusCheck.message,
        orgName: statusCheck.orgName || null,
      });
    }

    // Attach fresh user state from central database to the request
    req.user = {
      ...decoded,
      userId: user.id,
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      organisation_id: user.organisation_id,
      org_ids: user.org_ids || (user.organisation_id ? [user.organisation_id] : []),
      allowed_pages: user.allowed_pages,
      is_active: user.is_active,
      status: user.status,
    };

    next();
  } catch (dbErr) {
    console.error('[authMiddleware] User verification DB error:', dbErr.message);
    return res.status(500).json({ error: 'Server error verifying user session' });
  }
};

const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'superAdmin') {
    return res.status(403).json({ error: 'Access denied. SuperAdmin role required.' });
  }
  next();
};

module.exports = { authMiddleware, requireSuperAdmin };