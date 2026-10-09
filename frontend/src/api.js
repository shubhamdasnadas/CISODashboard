import axios from 'axios';
import { initSession, getToken, getOrgId, clearSession } from './utils/session.js';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Make sure this tab has a session id before any request goes out.
initSession();

// ── Active API Request Tracking for Real-Time Page Loading ───────────────────
let activeRequestsCount = 0;
const subscribers = new Set();

function notifySubscribers() {
  subscribers.forEach((callback) => {
    try {
      callback(activeRequestsCount);
    } catch {
      // ignore callback error
    }
  });
}

export function subscribeToActiveRequests(callback) {
  subscribers.add(callback);
  callback(activeRequestsCount);
  return () => subscribers.delete(callback);
}

export function getActiveRequestsCount() {
  return activeRequestsCount;
}

// Attach the tab's own token + org on every request (per-tab sessions).
api.interceptors.request.use(
  (config) => {
    activeRequestsCount++;
    notifySubscribers();

    let token = getToken();
    let orgId = getOrgId();

    // Check query parameters fallback in print mode or headless environments
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      try {
        const sp = new URLSearchParams(window.location.search);
        const qToken = sp.get('token');
        const qOrgId = sp.get('orgId');
        if ((!token || token === 'undefined' || token === 'null') && qToken && qToken !== 'undefined' && qToken !== 'null') {
          token = qToken;
        }
        if ((!orgId || orgId === 'undefined' || orgId === 'null') && qOrgId && qOrgId !== 'undefined' && qOrgId !== 'null') {
          orgId = qOrgId;
        }
      } catch {
        // ignore
      }
    }

    if (token && token !== 'undefined' && token !== 'null') {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (orgId && orgId !== 'undefined' && orgId !== 'null') {
      config.headers['X-Org-Id'] = String(orgId);
    }
    return config;
  },
  (err) => {
    activeRequestsCount = Math.max(0, activeRequestsCount - 1);
    notifySubscribers();
    return Promise.reject(err);
  }
);

// Auto-logout on 401 & decrement active request count
let _authRedirecting = false;
api.interceptors.response.use(
  (res) => {
    activeRequestsCount = Math.max(0, activeRequestsCount - 1);
    notifySubscribers();
    return res;
  },
  (err) => {
    activeRequestsCount = Math.max(0, activeRequestsCount - 1);
    notifySubscribers();

    const status = err.response?.status;
    const url = err.config?.url || '';
    const isAuthFlow =
      url.includes('/auth/login') ||
      url.includes('/auth/check-username') ||
      url.includes('/auth/otp') ||
      url.includes('/auth/2fa/') ||
      url.includes('/organisations');

    // Do not redirect to /login when rendering in print mode
    const isPrintMode =
      typeof window !== 'undefined' &&
      window.location &&
      (window.location.pathname.includes('print') || window.location.search.includes('print=true'));

    const isDeactivated =
      err.response?.data?.code === 'ACCOUNT_DEACTIVATED' ||
      err.response?.data?.error === 'ACCOUNT_DEACTIVATED';

    const isOrgSuspended =
      err.response?.data?.code === 'ORGANISATION_SUSPENDED' ||
      err.response?.data?.error === 'ORGANISATION_SUSPENDED' ||
      err.response?.data?.code === 'ORG_SUSPENDED';

    const isOrgExpired =
      err.response?.data?.code === 'ORGANISATION_EXPIRED' ||
      err.response?.data?.error === 'ORGANISATION_EXPIRED' ||
      err.response?.data?.code === 'ORG_EXPIRED';

    const isAccessBlocked = isDeactivated || isOrgSuspended || isOrgExpired;

    if ((status === 401 || (status === 403 && isAccessBlocked)) && !isAuthFlow && !_authRedirecting && !isPrintMode) {
      _authRedirecting = true;
      clearSession(); // drops only THIS tab's session
      if (typeof window !== 'undefined' && window.location && window.location.pathname !== '/login') {
        if (isOrgSuspended) {
          window.location.href = '/login?org_suspended=true';
        } else if (isOrgExpired) {
          window.location.href = '/login?org_expired=true';
        } else if (isDeactivated) {
          window.location.href = '/login?deactivated=true';
        } else {
          window.location.href = '/login';
        }
      }
    }

    // ── License Expired Interception (403 with code TOKEN_EXPIRED) ─────────────
    if (status === 403 && err.response?.data?.code === 'TOKEN_EXPIRED') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('ciso:license_expired', {
            detail: err.response.data,
          })
        );
      }
    }

    return Promise.reject(err);
  }
);

export default api;
