const { centralPool, getOrgPool } = require('../db');
const { verifyOrgToken } = require('../services/tokenService');

// Resolves the active org for the request and attaches req.currentOrgId + req.orgSlug + req.orgPool.
// Reads org from (in order): X-Org-Id header, ?orgId= query param, first in user.org_ids.
// Validates the authenticated user actually belongs to that org.
// Enforces license token validity for non-superadmin users.
async function orgMiddleware(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const rawId =
    req.headers['x-org-id'] ||
    req.query.orgId ||
    (Array.isArray(user.org_ids) && user.org_ids[0]);

  const orgId = parseInt(rawId, 10);
  if (!orgId) {
    return res.status(400).json({ error: 'No active organisation. Set X-Org-Id header.' });
  }

  try {
    const { rows } = await centralPool.query(
      'SELECT id, org_name, slug, is_active, status FROM organisations WHERE id = $1 AND deleted_at IS NULL',
      [orgId]
    );
    const org = rows[0];
    if (!org || !org.slug) {
      return res.status(400).json({ error: 'Organisation not found' });
    }

    const orgSlug = org.slug;

    // superAdmin can access any org; other users must belong to it
    if (
      user.role !== 'superAdmin' &&
      (!Array.isArray(user.org_ids) || !user.org_ids.includes(orgId))
    ) {
      return res.status(403).json({ error: 'Access denied to this organisation' });
    }

    // Validate organization active/suspension status for non-superadmins
    if (user.role !== 'superAdmin') {
      if (org.is_active === false || org.status === 'suspended') {
        return res.status(403).json({
          error: 'ORGANISATION_SUSPENDED',
          code: 'ORGANISATION_SUSPENDED',
          message: `Your organisation "${org.org_name}" has been suspended. Please contact your administrator.`,
          details: {
            orgId,
            orgName: org.org_name,
            slug: orgSlug,
          },
        });
      }

      const tokenResult = await verifyOrgToken(orgId);
      if (!tokenResult.valid) {
        return res.status(403).json({
          error: tokenResult.code || 'TOKEN_EXPIRED',
          code: tokenResult.code || 'TOKEN_EXPIRED',
          message:
            tokenResult.message ||
            `Your organisation "${org.org_name}" subscription / license has expired. Please contact your administrator.`,
          details: tokenResult.details || {
            orgId,
            orgName: org.org_name,
            slug: orgSlug,
          },
        });
      }
      req.orgToken = tokenResult.token;
    }

    req.currentOrgId = orgId;
    req.orgSlug = orgSlug;
    req.orgPool = getOrgPool(orgSlug);
    next();
  } catch (err) {
    console.error('orgMiddleware error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { orgMiddleware };
