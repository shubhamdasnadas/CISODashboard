import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api';
import * as session from '../utils/session.js';

const OrgContext = createContext({
  organisations: [],
  currentOrg: null,        // full org object
  loading: true,
  setCurrentOrg: () => {},
  switchOrg: () => {},
  refresh: () => {},
});

export function OrgProvider({ children }) {
  const [organisations, setOrganisations] = useState([]);
  const [currentOrg, setCurrentOrgState] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/organisations');
      const list = data.organisations || [];
      setOrganisations(list);

      // Restore previous selection ONLY if it still belongs to this user.
      // Otherwise leave currentOrg null so the user is forced to the picker.
      const savedId = session.getOrgId();
      const found = list.find((o) => o.id === savedId);
      if (found) {
        setCurrentOrgState(found);
        api.defaults.headers.common['X-Org-Id'] = String(found.id);
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
    <OrgContext.Provider value={{ organisations, currentOrg, loading, setCurrentOrg, switchOrg, refresh }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
