import axios from 'axios';
import { initSession, getToken, getOrgId, clearSession } from './utils/session.js';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Make sure this tab has a session id before any request goes out.
initSession();

// Attach the tab's own token + org on every request (per-tab sessions).
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const orgId = getOrgId();
  if (orgId) config.headers['X-Org-Id'] = String(orgId);
  return config;
});

// Auto-logout on 401 — but ONLY for calls that genuinely mean "not authenticated"
// (not the auth/login, auth/check-username, or /organisations endpoints, which
// the login / org-selection screens depend on). A blind redirect here would bounce
// a fresh user away from the organisation picker the moment any single request 401s.
// A guard flag also prevents redirect loops on repeated 401s.
let _authRedirecting = false;
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const url = err.config?.url || '';
    const isAuthFlow =
      url.includes('/auth/login') ||
      url.includes('/auth/check-username') ||
      url.includes('/auth/otp') ||
      url.includes('/auth/2fa/') ||
      url.includes('/organisations');

    if (status === 401 && !isAuthFlow && !_authRedirecting) {
      _authRedirecting = true;
      clearSession(); // drops only THIS tab's session
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
