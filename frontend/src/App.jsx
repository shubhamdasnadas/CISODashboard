import { Routes, Route, Navigate } from 'react-router-dom';
import { OrgProvider, useOrg } from './context/OrgContext.jsx';
import { DashboardProvider } from './context/DashboardContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ProviderProvider } from './context/ProviderContext.jsx';

// Auth + core pages
import Login from './pages/Login.jsx';
import Login2FA from './pages/Login2FA.jsx';
import OtpVerify from './pages/OtpVerify.jsx';
import SelectOrganisation from './pages/SelectOrganisation.jsx';
import Dashboard from './pages/Dashboard.jsx';
import MDM from './pages/MDM.jsx';
import MDMDetailView from './pages/MDMDetailView.jsx';
import Microsoft365 from './pages/Microsoft365.jsx';
import Microsoft365DetailView from './pages/Microsoft365DetailView.jsx';
import Organisations from './pages/Organisations.jsx';
import Users from './pages/Users.jsx';
import ApiTokens from './pages/ApiTokens.jsx';
import ApiResponses from './pages/ApiResponses.jsx';
import Osint from './pages/Osint.jsx';
import Settings from './pages/Settings.jsx';
import AppLayout from './components/AppLayout.jsx';

// Security (SentinelOne)
import SecurityPage from './pages/security/SecurityPage.jsx';
import Threats from './pages/security/Threats.jsx';
import Agent from './pages/security/Agent.jsx';
import S1Agent from './pages/security/S1Agent.jsx';
import S1Cve from './pages/security/S1Cve.jsx';
import RiskyEndpoint from './pages/security/RiskyEndpoint.jsx';
import DetailView from './pages/security/DetailView.jsx';

// Provider Config Pages
import SentinelOneConfig from './pages/settings/SentinelOneConfig.jsx';
import HexnodeConfig from './pages/settings/HexnodeConfig.jsx';
import HarmonyConfig from './pages/settings/HarmonyConfig.jsx';
import FirewallConfig from './pages/settings/FirewallConfig.jsx';
import ZohoConfig from './pages/settings/ZohoConfig.jsx';
import CrowdStrikeConfig from './pages/settings/CrowdStrikeConfig.jsx';
import MimecastConfig from './pages/settings/MimecastConfig.jsx';
import FortinetConfig from './pages/settings/FortinetConfig.jsx';
import ServiceNowConfig from './pages/settings/ServiceNowConfig.jsx';
import MicrosoftConfig from './pages/settings/MicrosoftConfig.jsx';

// Integrations
import PaloAltoPage from './pages/paloalto/PaloAltoPage.jsx';
import CheckpointPage from './pages/checkpoint/CheckpointPage.jsx';
import Zohoone from './pages/zoho/zohoOne/Zohoone.jsx';

// Operations
import Projects from './pages/Projects.jsx';
import Reports from './pages/Reports.jsx';
import Analytics from './pages/Analytics.jsx';
import News from './pages/News.jsx';
import Nvd from './pages/Nvd.jsx';
import UpdatedNvd from './pages/UpdatedNvd.jsx';
import UpdatedCpes from './pages/UpdatedCpes.jsx';
import Support from './pages/Support.jsx';
import Notifications from './pages/Notifications.jsx';
import Billing from './pages/Billing.jsx';

// Members
import Members from './pages/Members.jsx';

// Admin
import AdminOrganizations from './pages/admin/AdminOrganizations.jsx';
import AdminOrgUsers from './pages/admin/AdminOrgUsers.jsx';

function ProtectedRoute({ children, requireSuperAdmin = false }) {
  const token = localStorage.getItem('ciso_token');
  if (!token) return <Navigate to="/login" replace />;
  if (requireSuperAdmin) {
    try {
      const user = JSON.parse(localStorage.getItem('ciso_user') || '{}');
      if (user.role !== 'superAdmin') return <Navigate to="/dashboard" replace />;
    } catch {
      return <Navigate to="/login" replace />;
    }
  }
  return children;
}

function OrgGate({ children }) {
  const { loading, currentOrg } = useOrg();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] text-[var(--muted)]">
        Loading…
      </div>
    );
  }
  // SuperAdmin can access all routes even without a selected org
  try {
    const user = JSON.parse(localStorage.getItem('ciso_user') || '{}');
    if (user.role === 'superAdmin') return children;
  } catch {}
  if (!currentOrg) {
    return <Navigate to="/select-organisation" replace />;
  }
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <OrgProvider>
        <DashboardProvider>
          <ProviderProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/login-2fa" element={<Login2FA />} />
              <Route path="/verify-otp" element={<OtpVerify />} />
              <Route path="/select-organisation" element={<SelectOrganisation />} />
              <Route
                element={
                  <ProtectedRoute>
                    <OrgGate>
                      <AppLayout />
                    </OrgGate>
                  </ProtectedRoute>
                }
              >
                {/* Core */}
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/mdm" element={<MDM />} />
                <Route path="/mdm/detail" element={<MDMDetailView />} />
                <Route path="/microsoft365" element={<Microsoft365 />} />
                <Route path="/microsoft365/detail" element={<Microsoft365DetailView />} />
                <Route path="/organisations" element={<Organisations />} />
                <Route path="/tokens" element={<ApiTokens />} />
                <Route path="/responses" element={<ApiResponses />} />
                <Route path="/osint" element={<Osint />} />
                <Route path="/settings" element={<Settings />} />

                {/* Security (SentinelOne) */}
                <Route path="/security" element={<SecurityPage />} />
                <Route path="/security/threats" element={<Threats />} />
                <Route path="/security/agent" element={<Agent />} />
                <Route path="/security/s1agent" element={<S1Agent />} />
                <Route path="/security/s1cve" element={<S1Cve />} />
                <Route path="/security/riskyendpoint" element={<RiskyEndpoint />} />
                <Route path="/security/detail" element={<DetailView />} />

                {/* Integrations */}
                <Route path="/paloalto" element={<PaloAltoPage />} />
                <Route path="/checkpoint" element={<CheckpointPage />} />
                <Route path="/zoho" element={<Zohoone />} />
                <Route path="/zoho/one" element={<Zohoone />} />

                {/* Members */}
                <Route path="/members" element={<Members />} />

                {/* Operations */}
                <Route path="/projects" element={<Projects />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/news" element={<News />} />
                <Route path="/nvd" element={<Nvd />} />
        <Route path="/updated-nvd" element={<UpdatedNvd />} />
        <Route path="/updated-cpes" element={<UpdatedCpes />} />
                <Route path="/support" element={<Support />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/billing" element={<Billing />} />

                {/* Admin (superAdmin only) */}
                <Route path="/users" element={<ProtectedRoute requireSuperAdmin><Users /></ProtectedRoute>} />
                <Route path="/admin/organizations" element={<ProtectedRoute requireSuperAdmin><AdminOrganizations /></ProtectedRoute>} />
                <Route path="/admin/organizations/:id/users" element={<ProtectedRoute requireSuperAdmin><AdminOrgUsers /></ProtectedRoute>} />

                {/* Provider Config Pages */}
                <Route path="/settings/sentinelone" element={<SentinelOneConfig />} />
                <Route path="/settings/hexnode" element={<HexnodeConfig />} />
                <Route path="/settings/crowdstrike" element={<CrowdStrikeConfig />} />
                <Route path="/settings/harmony" element={<HarmonyConfig />} />
                <Route path="/settings/mimecast" element={<MimecastConfig />} />
                <Route path="/settings/firewall" element={<FirewallConfig />} />
                <Route path="/settings/fortinet" element={<FortinetConfig />} />
                <Route path="/settings/zoho" element={<ZohoConfig />} />
                <Route path="/settings/servicenow" element={<ServiceNowConfig />} />
                <Route path="/settings/microsoft" element={<MicrosoftConfig />} />
              </Route>

              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </ProviderProvider>
        </DashboardProvider>
      </OrgProvider>
    </ThemeProvider>
  );
}
