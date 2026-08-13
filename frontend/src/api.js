import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Restore active org from localStorage so the header survives page refreshes
const _savedOrgId = localStorage.getItem('ciso_current_org_id');
if (_savedOrgId) {
  api.defaults.headers.common['X-Org-Id'] = _savedOrgId;
}

// Attach JWT + active org to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ciso_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
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
      url.includes('/auth/2fa/') ||
      url.includes('/organisations');

    if (status === 401 && !isAuthFlow && !_authRedirecting) {
      _authRedirecting = true;
      localStorage.removeItem('ciso_token');
      localStorage.removeItem('ciso_user');
      localStorage.removeItem('ciso_current_org_id');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;