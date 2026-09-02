/**
 * Per-tab login sessions.
 *
 * Problem this solves: localStorage is shared by every tab/window of the same
 * origin. Two users logged in on two windows overwrote each other's
 * ciso_token / ciso_user / ciso_current_org_id, so refreshing one window
 * bounced it to the wrong page / wrong user.
 *
 * Solution: every successful login creates a unique sessionId. The TAB keeps
 * its own pointer to that session in sessionStorage (per-tab by definition,
 * survives F5/refresh in the same tab). The actual auth data lives in
 * localStorage namespaced under the sessionId:
 *
 *   sessionStorage['ciso_active_session']            -> "<id>"   (tab-private pointer)
 *   localStorage['ciso_s_<id>_token']                -> JWT
 *   localStorage['ciso_s_<id>_user']                 -> JSON user object
 *   localStorage['ciso_s_<id>_org']                  -> active org id
 *
 * Result: window A stays User A, window B stays User B — refreshes included.
 */

const POINTER_KEY = 'ciso_active_session';
const PREFIX = 'ciso_s_';
// Flat keys used before sessions existed; adopted once, then ignored.
const LEGACY = { token: 'ciso_token', user: 'ciso_user', org: 'ciso_current_org_id' };
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // prune orphans after 7 days

function sessionId() {
  return sessionStorage.getItem(POINTER_KEY);
}

function key(name) {
  const id = sessionId();
  return id ? `${PREFIX}${id}_${name}` : LEGACY[name]; // no session yet -> legacy path
}

/**
 * Ensure this tab has a usable session id and return it.
 * Reuses the tab's existing session if it still holds a token;
 * otherwise mints a fresh id. Adopts legacy flat credentials once
 * (for browsers where someone was already logged in pre-sessions).
 */
export function initSession() {
  let id = sessionId();
  const hasOwnToken = id && localStorage.getItem(`${PREFIX}${id}_token`);
  if (hasOwnToken) return id;

  const legacyToken = localStorage.getItem(LEGACY.token);
  if (legacyToken && !hasOwnToken) {
    // Adopt the pre-existing flat login into THIS tab's own session copy,
    // so an already-open second window doesn't lose its state on refresh.
    id = mintId();
    sessionStorage.setItem(POINTER_KEY, id);
    localStorage.setItem(`${PREFIX}${id}_token`, legacyToken);
    const legacyUser = localStorage.getItem(LEGACY.user);
    if (legacyUser) localStorage.setItem(`${PREFIX}${id}_user`, legacyUser);
    const legacyOrg = localStorage.getItem(LEGACY.org);
    if (legacyOrg) localStorage.setItem(`${PREFIX}${id}_org`, legacyOrg);
    return id;
  }

  id = mintId();
  sessionStorage.setItem(POINTER_KEY, id);
  pruneOldSessions();
  return id;
}

function mintId() {
  // Leading timestamp lets pruneOldSessions age out abandoned logins.
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Store (or replace) the logged-in identity for this tab's session. */
export function setAuth({ token, user }) {
  initSession();
  localStorage.setItem(key('token'), token);
  localStorage.setItem(key('user'), JSON.stringify(user));
}

export function getToken() {
  return localStorage.getItem(key('token'));
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(key('user')) || '{}');
  } catch {
    return {};
  }
}

export function getOrgId() {
  const v = localStorage.getItem(key('org'));
  return v ? parseInt(v, 10) : null;
}

export function setOrgId(orgId) {
  if (orgId === null || orgId === undefined) localStorage.removeItem(key('org'));
  else localStorage.setItem(key('org'), String(orgId));
}

/** Log this tab out: drop its session data and the tab's pointer. */
export function clearSession() {
  const id = sessionId();
  if (id) {
    ['token', 'user', 'org'].forEach((n) => localStorage.removeItem(`${PREFIX}${id}_${n}`));
  }
  sessionStorage.removeItem(POINTER_KEY);
  // Best-effort cleanup of pre-session flat keys so stale logins don't linger.
  Object.values(LEGACY).forEach((k) => localStorage.removeItem(k));
}

/** Remove session blobs whose login is older than SESSION_MAX_AGE_MS. */
function pruneOldSessions() {
  const cutoff = Date.now() - SESSION_MAX_AGE_MS;
  const dead = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) {
      const ts = parseInt(k.slice(PREFIX.length + 1, k.indexOf('_', PREFIX.length + 1)), 36);
      if (!Number.isNaN(ts) && ts < cutoff) dead.push(k);
    }
  }
  dead.forEach((k) => localStorage.removeItem(k));
}
