import * as session from '../utils/session.js';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useOrg } from '../context/OrgContext';
import { useProviders } from '../context/ProviderContext';

// Import provider icons from image folder
import sentinelOneImg from '../../image/sentinelone.png';
import paloAltoImg from '../../image/paloalto.png';
import checkpointImg from '../../image/checkpoint.png';
import microsoftImg from '../../image/microsoft.png';
import zohoLogoImg from '../../image/zoho-logo.png';

export default function Settings() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { selectedProviders, setSelectedProvider } = useProviders();
  const user = session.getUser();
  const [activeTab, setActiveTab] = useState('account');

  // Available providers for each category
  const providers = {
    edr: [
      { name: 'SentinelOne', path: '/settings/sentinelone', icon: sentinelOneImg, color: 'emerald' },
      { name: 'CrowdStrike', path: '/settings/crowdstrike', icon: '🔒', color: 'purple' },
    ],
    deviceManagement: [
      { name: 'Hexnode', path: '/settings/hexnode', icon: '📱', color: 'blue' },
    ],
    emailSecurity: [
      { name: 'Check Point Harmony', path: '/settings/harmony', icon: checkpointImg, color: 'indigo' },
      { name: 'Mimecast', path: '/settings/mimecast', icon: '📧', color: 'blue' },
    ],
    firewall: [
      { name: 'Palo Alto', path: '/settings/firewall', icon: paloAltoImg, color: 'orange' },
      { name: 'Fortinet', path: '/settings/fortinet', icon: '🏰', color: 'red' },
    ],
    ticketing: [
      { name: 'Zoho Desk', path: '/settings/zoho', icon: zohoLogoImg, color: 'red' },
      { name: 'ServiceNow', path: '/settings/servicenow', icon: '💼', color: 'green' },
    ],
    identity: [
      { name: 'Microsoft', path: '/settings/microsoft', icon: microsoftImg, color: 'blue' },
    ],
  };

  // Sync All functionality
  const [syncAllStatus, setSyncAllStatus] = useState('idle');
  const [syncStep, setSyncStep] = useState(null);
  const [syncResults, setSyncResults] = useState(null);
  const [syncedAt, setSyncedAt] = useState(null);

  const parseSyncResults = (data) => {
    const results = data?.results || [];
    const byKey = data || {};
    const extract = (keys, fallbackMsg) => {
      for (const key of keys) {
        const found = results.find((r) => r.service?.toLowerCase().includes(key) || r.name?.toLowerCase().includes(key));
        if (found) return { ok: found.success ?? found.ok ?? false, msg: found.message || found.msg || fallbackMsg };
      }
      for (const key of keys) {
        if (byKey[key] !== undefined) {
          const v = byKey[key];
          if (typeof v === 'object') return { ok: v.success ?? v.ok ?? true, msg: v.message || v.msg || JSON.stringify(v).slice(0, 60) };
          return { ok: true, msg: String(v) };
        }
      }
      return null;
    };
    return {
      s1: extract(['sentinelone', 's1', 'sentinel'], 'Synced'),
      firewall: extract(['firewall', 'paloalto', 'palo'], 'Synced'),
      harmony: extract(['harmony', 'checkpoint', 'cp'], 'Synced'),
    };
  };

  const handleSyncAll = async () => {
    setSyncAllStatus('running');
    setSyncResults(null);
    setSyncStep('authenticating');
    try {
      const r = await api.post('/sync/all');
      setSyncStep('done');
      setSyncResults(parseSyncResults(r.data));
      setSyncedAt(new Date().toLocaleString());
      setSyncAllStatus(r.data?.success !== false ? 'done' : 'error');
    } catch (err) {
      setSyncStep('done');
      setSyncResults({ s1: null, firewall: null, harmony: { ok: false, msg: err.response?.data?.message || 'Sync failed' } });
      setSyncAllStatus('error');
    }
  };

  const statusColor = (s) => ({
    idle: 'text-gray-500',
    auth: 'text-indigo-600',
    fetching: 'text-indigo-600',
    saving: 'text-indigo-600',
    syncing: 'text-indigo-600',
    done: 'text-green-600',
    error: 'text-red-500',
  }[s] || '');

  const getColorClass = (color) => {
    const colors = {
      emerald: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600',
      purple: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600',
      indigo: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600',
      blue: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600',
      orange: 'bg-orange-100 dark:bg-orange-900/40 text-orange-600',
      red: 'bg-red-100 dark:bg-red-900/40 text-red-600',
      green: 'bg-green-100 dark:bg-green-900/40 text-green-600',
    };
    return colors[color] || colors.indigo;
  };

  const handleSetProvider = (category, providerName) => {
    setSelectedProvider(category, providerName);
  };

  // Render a provider card
  const renderProviderCard = (provider, category) => {
    const isImageIcon = typeof provider.icon === 'object' || typeof provider.icon === 'string' && provider.icon.startsWith('/');
    const isSentinelOne = provider.name === 'SentinelOne';
    return (
      <div key={provider.name} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 hover:border-indigo-500 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${getColorClass(provider.color)} flex items-center justify-center ${isSentinelOne ? 'dark:bg-white' : ''}`}>
            {isImageIcon ? (
              <img 
                src={provider.icon} 
                alt={provider.name} 
                className="w-10 h-10 object-contain"
              />
            ) : (
              <span className="text-base">{provider.icon}</span>
            )}
          </div>
          <div className="flex-1">
            <h4 className="font-medium text-[var(--foreground)]">{provider.name}</h4>
            <p className="text-xs text-[var(--muted)]">Click to configure</p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={() => navigate(provider.path)} className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-medium">
            Configure
          </button>
          <button onClick={() => handleSetProvider(category, provider.name)} className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg font-medium">
            Set as Active
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Settings</h1>
        {currentOrg && <p className="text-[var(--muted)] text-sm mt-1">{currentOrg.org_name}</p>}
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--card-border)] mb-6">
        <nav className="flex gap-2">
          <button
            onClick={() => setActiveTab('account')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
              activeTab === 'account' ? 'bg-indigo-600 text-white' : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--muted-bg)]'
            }`}
          >
            Account
          </button>
          <button
            onClick={() => setActiveTab('integrations')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
              activeTab === 'integrations' ? 'bg-indigo-600 text-white' : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--muted-bg)]'
            }`}
          >
            Integrations
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'account' && (
          <>
            {/* Account Info */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[var(--card-border)] bg-[var(--muted-bg)]">
                <h3 className="font-semibold text-[var(--foreground)]">Account Information</h3>
              </div>
              <div className="p-6 space-y-0 divide-y divide-[var(--card-border)]">
                {[
                  { label: 'Username', value: user.username },
                  { label: 'Role', value: user.role },
                  { label: 'Organisation', value: currentOrg?.org_name },
                ]
                  .filter((i) => i.value)
                  .map((item) => (
                    <div key={item.label} className="flex items-center justify-between py-3.5">
                      <p className="text-sm font-medium text-[var(--muted)]">{item.label}</p>
                      <p className="text-sm text-[var(--foreground)] capitalize">{item.value}</p>
                    </div>
                  ))}
              </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-2xl p-6">
              <h3 className="font-semibold text-red-900 dark:text-red-400 mb-1">Danger Zone</h3>
              <p className="text-sm text-red-700 dark:text-red-500 mb-4">These actions are irreversible.</p>
              <button className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-700">
                Delete Account
              </button>
            </div>
          </>
        )}

        {activeTab === 'integrations' && (
          <>
            {/* Sync All */}
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-indigo-200 dark:border-indigo-800 bg-indigo-100 dark:bg-indigo-900/30 flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-indigo-900 dark:text-indigo-200">Sync All Integrations</h3>
                  <p className="text-xs text-indigo-700 dark:text-indigo-400 mt-0.5">Runs all configured syncs for this org</p>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <button
                    onClick={handleSyncAll}
                    disabled={syncAllStatus === 'running'}
                    className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl text-sm font-semibold"
                  >
                    {syncAllStatus === 'running' ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                        {syncStep === 'authenticating' ? 'Authenticating…' : 'Syncing…'}
                      </>
                    ) : (
                      'Sync All Now'
                    )}
                  </button>
                </div>
                {/* Per-service results breakdown */}
                {syncResults && (
                  <div className="border border-[var(--card-border)] rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-[var(--muted-bg)] border-b border-[var(--card-border)] flex items-center justify-between">
                      <p className="text-xs font-bold text-[var(--foreground)] uppercase tracking-widest">Sync Results</p>
                      {syncedAt && <p className="text-[10px] text-[var(--muted)]">Last synced: {syncedAt}</p>}
                    </div>
                    <div className="divide-y divide-[var(--card-border)]">
                      {[
                        { key: 's1', label: 'SentinelOne', icon: '🛡️', color: 'border-l-emerald-500' },
                        { key: 'firewall', label: 'Firewall', icon: '🔥', color: 'border-l-orange-500' },
                        { key: 'harmony', label: 'Checkpoint', icon: '✅', color: 'border-l-indigo-500' },
                      ].map(({ key, label, icon, color }) => {
                        const row = syncResults[key];
                        if (!row) return null;
                        return (
                          <div key={key} className={`flex items-start gap-3 px-4 py-3 border-l-4 ${row.ok ? color : 'border-l-red-500'}`}>
                            <span className="text-sm mt-0.5">{icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-[var(--foreground)]">{label}</p>
                              <p className={`text-[11px] mt-0.5 truncate ${row.ok ? 'text-[var(--muted)]' : 'text-red-500'}`}>{row.msg}</p>
                            </div>
                            <span className={`text-[10px] font-bold flex-shrink-0 mt-0.5 ${row.ok ? 'text-green-600' : 'text-red-500'}`}>
                              {row.ok ? '✓ OK' : '✗ Failed'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* EDR Section */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[var(--card-border)] bg-[var(--muted-bg)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                    <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--foreground)]">{selectedProviders.edr || 'EDR (Endpoint Detection & Response)'}</h3>
                    <p className="text-xs text-[var(--muted)] mt-0.5">Configure endpoint protection integration</p>
                  </div>
                </div>
                {selectedProviders.edr && (
                  <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-full font-medium">
                    Active: {selectedProviders.edr}
                  </span>
                )}
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{providers.edr.map((provider) => renderProviderCard(provider, 'edr'))}</div>
              </div>
            </div>

            {/* Device Management Section */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[var(--card-border)] bg-[var(--muted-bg)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--foreground)]">{selectedProviders.deviceManagement || 'Device Management (MDM)'}</h3>
                    <p className="text-xs text-[var(--muted)] mt-0.5">Configure mobile device management integration</p>
                  </div>
                </div>
                {selectedProviders.deviceManagement && (
                  <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full font-medium">
                    Active: {selectedProviders.deviceManagement}
                  </span>
                )}
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{providers.deviceManagement.map((provider) => renderProviderCard(provider, 'deviceManagement'))}</div>
              </div>
            </div>

            {/* Email Security Section */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[var(--card-border)] bg-[var(--muted-bg)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                    <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--foreground)]">{selectedProviders.emailSecurity || 'Email Security'}</h3>
                    <p className="text-xs text-[var(--muted)] mt-0.5">Configure email protection integration</p>
                  </div>
                </div>
                {selectedProviders.emailSecurity && (
                  <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded-full font-medium">
                    Active: {selectedProviders.emailSecurity}
                  </span>
                )}
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {providers.emailSecurity.map((provider) => renderProviderCard(provider, 'emailSecurity'))}
                </div>
              </div>
            </div>

            {/* Firewall Section */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[var(--card-border)] bg-[var(--muted-bg)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                    <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--foreground)]">{selectedProviders.firewall || 'Firewall'}</h3>
                    <p className="text-xs text-[var(--muted)] mt-0.5">Configure network firewall integration</p>
                  </div>
                </div>
                {selectedProviders.firewall && (
                  <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2 py-1 rounded-full font-medium">
                    Active: {selectedProviders.firewall}
                  </span>
                )}
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{providers.firewall.map((provider) => renderProviderCard(provider, 'firewall'))}</div>
              </div>
            </div>

            {/* Ticketing Section */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[var(--card-border)] bg-[var(--muted-bg)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                    <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--foreground)]">{selectedProviders.ticketing || 'Ticketing'}</h3>
                    <p className="text-xs text-[var(--muted)] mt-0.5">Configure support ticketing integration</p>
                  </div>
                </div>
                {selectedProviders.ticketing && (
                  <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-1 rounded-full font-medium">
                    Active: {selectedProviders.ticketing}
                  </span>
                )}
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{providers.ticketing.map((provider) => renderProviderCard(provider, 'ticketing'))}</div>
              </div>
            </div>

            {/* Identity / Directory Section */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[var(--card-border)] bg-[var(--muted-bg)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--foreground)]">Identity & Directory</h3>
                    <p className="text-xs text-[var(--muted)] mt-0.5">Configure identity provider integration</p>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{providers.identity.map((provider) => renderProviderCard(provider, 'identity'))}</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}