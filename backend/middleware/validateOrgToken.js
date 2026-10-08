const { verifyOrgToken } = require('../services/tokenService');

/**
 * Middleware: validateOrgToken
 *
 * Verifies that the target organisation has a valid, active, non-expired license token.
 *
 * - SuperAdmins are NEVER blocked.
 * - If token is expired or invalid for non-superadmins: returns HTTP 403 with code 'TOKEN_EXPIRED'.
 */
async function validateOrgToken(req, res, next) {
  // 1. SuperAdmins always bypass license token restrictions
  if (req.user && req.user.role === 'superAdmin') {
    return next();
  }

  // 2. Identify target organisation ID
  const orgId = req.currentOrgId || req.orgId || req.headers['x-org-id'] || req.query.orgId || (req.user && req.user.organisation_id);

  if (!orgId) {
    // If route doesn't have org context (e.g. global profile or auth routes), pass through
    return next();
  }

  try {
    const result = await verifyOrgToken(Number(orgId));

    if (!result.valid) {
      const statusCode = 403;
      const errorCode = result.code || 'TOKEN_EXPIRED';
      const message = result.message || 'Organisation license expired, contact administrator';

      return res.status(statusCode).json({
        error: errorCode,
        code: errorCode,
        message,
        details: result.details || {
          orgId: Number(orgId),
          deploymentMode: result.deploymentMode || process.env.DEPLOYMENT_MODE || 'online',
        },
      });
    }

    // Attach verified token to request for downstream handlers
    req.orgToken = result.token;
    return next();
  } catch (err) {
    console.error('[validateOrgToken] Error validating token:', err);
    // In case of unexpected database errors, log and allow non-destructive continuation or fail-safe
    return next();
  }
}

module.exports = { validateOrgToken };
