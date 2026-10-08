import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api';
import * as session from '../utils/session.js';

const OrgContext = createContext({
  organisations: [],
  currentOrg: null,        // full org object
  loading: true,
  licenseExpiredInfo: null,
  setCurrentOrg: () => {},
  switchOrg: () => {},
  refresh: () => {},
  clearLicenseExpired: () => {},
});

export function OrgProvider({ children }) {
  const [organisations, setOrganisations] = useState([]);
  const [currentOrg, setCurrentOrgState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [licenseExpiredInfo, setLicenseExpiredInfo] = useState(null);

  useEffect(() => {
    function handleLicenseExpired(event) {
      if (event.detail) {
        setLicenseExpiredInfo(event.detail);
      }
    }
    window.addEventListener('ciso:license_expired', handleLicenseExpired);
    return () => window.removeEventListener('ciso:license_expired', handleLicenseExpired);
  }, []);

  const clearLicenseExpired = useCallback(() => {
    setLicenseExpiredInfo(null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/organisations');
      const list = data.organisations || [];
      setOrganisations(list);

      // Restore previous selection ONLY if it still belongs to this user,
      // or default to the user's primary organisation.
      const savedId = session.getOrgId();
      const found = list.find((o) => o.id === savedId);
      if (found) {
        setCurrentOrgState(found);
        api.defaults.headers.common['X-Org-Id'] = String(found.id);
      } else if (list.length > 0) {
        const defaultOrg = list[0];
        setCurrentOrgState(defaultOrg);
        session.setOrgId(defaultOrg.id);
        api.defaults.headers.common['X-Org-Id'] = String(defaultOrg.id);
      } else {
        setCurrentOrgState(null);
        session.setOrgId(null);
        delete api.defaults.headers.common['X-Org-Id'];
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session.getToken()) {
      refresh();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Single source of truth: writes BOTH context state AND the tab's session.
  // Pass the full org object (not just an id) so we don't depend on the
  // organisations list being loaded yet.
  const setCurrentOrg = useCallback((org) => {
    setLicenseExpiredInfo(null);
    if (org) {
      setCurrentOrgState(org);
      session.setOrgId(org.id);
      // Keep the axios default header in sync so all API calls send the right org
      api.defaults.headers.common['X-Org-Id'] = String(org.id);
    } else {
      setCurrentOrgState(null);
      session.setOrgId(null);
      delete api.defaults.headers.common['X-Org-Id'];
    }
  }, []);

  // Convenience: lookup by id, then set. Use this from pickers where the
  // org list is already loaded (e.g. OrgSwitcher dropdown).
  const switchOrg = useCallback((orgId) => {
    setOrganisations((prev) => {
      const found = prev.find((o) => o.id === orgId);
      if (found) setCurrentOrg(found);
      return prev;
    });
  }, [setCurrentOrg]);

  return (
    <OrgContext.Provider value={{
      organisations,
      currentOrg,
      loading,
      licenseExpiredInfo,
      setCurrentOrg,
      switchOrg,
      refresh,
      clearLicenseExpired,
    }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
