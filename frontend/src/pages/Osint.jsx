import * as session from '../utils/session.js';
import { useEffect, useState } from 'react';
import api from '../api';
import { Card, PageHeader, PrimaryButton, Badge } from '../components/UI.jsx';
import { useOrg } from '../context/OrgContext.jsx';
import WatchlistPanel from './osint/WatchlistPanel.jsx';
import OsintKpiStrip from './osint/OsintKpiStrip.jsx';
import GenericCard from './osint/GenericCard.jsx';
import CrtShCard from './osint/CrtShCard.jsx';
import VirusTotalCard from './osint/VirusTotalCard.jsx';
import ShodanCard from './osint/ShodanCard.jsx';
import VulnCard from './osint/VulnCard.jsx';
import SanctionsCard from './osint/SanctionsCard.jsx';
import PhishingCard from './osint/PhishingCard.jsx';
import UrlScanCard from './osint/UrlScanCard.jsx';

const CATEGORIES = ['Attack Surface', 'Vulnerability', 'Threat/IP Reputation', 'Phishing/Brand', 'Compliance/Sanctions'];

function ToolCardBody({ tool, latest, history, screenedTerm }) {
  switch (tool.id) {
    case 'CrtSh': return <CrtShCard latest={latest} history={history} />;
    case 'VirusTotal': return <VirusTotalCard latest={latest} history={history} />;
    case 'Shodan': return <ShodanCard latest={latest} />;
    case 'OSV':
    case 'NVD': return <VulnCard toolId={tool.id} latest={latest} />;
    case 'OpenSanctions': return <SanctionsCard latest={latest} screenedTerm={screenedTerm} />;
    case 'PhishStats': return <PhishingCard latest={latest} history={history} />;
    case 'UrlScan': return <UrlScanCard latest={latest} />;
    default: return <GenericCard latest={latest} />;
  }
}

export default function Osint() {
  const { currentOrg } = useOrg();
  const [tools, setTools] = useState([]);
  const [configuredApiNames, setConfiguredApiNames] = useState([]);
  const [historyByTool, setHistoryByTool] = useState({});
  const [watchlist, setWatchlist] = useState([]);
  const [fetchingId, setFetchingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);

  const user = session.getUser();
  const isAdmin = user.role === 'superAdmin' || user.role === 'admin';

  async function load() {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const [{ data: osintData }, { data: wlData }] = await Promise.all([
        api.get(`/osint/${currentOrg.id}`),
        api.get(`/osint-watchlist/${currentOrg.id}`),
      ]);
      setTools(osintData.tools || []);
      setConfiguredApiNames(osintData.configuredApiNames || []);
      setWatchlist(wlData.watchlist || []);

      const grouped = {};
      (osintData.responses || []).forEach((r) => {
        (grouped[r.api_name] ??= []).push(r);
      });
      setHistoryByTool(grouped);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentOrg]);

  async function fetchTool(toolId) {
    if (!currentOrg) return;
    setFetchingId(toolId);
    try {
      const { data } = await api.post('/osint/fetch', { org_id: currentOrg.id, tool_id: toolId });
      if (data.configured === false) {
        setConfiguredApiNames((prev) => prev.filter((n) => n !== toolId));
      } else {
        setHistoryByTool((prev) => ({ ...prev, [toolId]: [...(prev[toolId] || []), data] }));
        setConfiguredApiNames((prev) => (prev.includes(toolId) ? prev : [...prev, toolId]));
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Fetch failed');
    } finally {
      setFetchingId(null);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="OSINT Intel" subtitle="Loading tools…" />
      </div>
    );
  }

  const latestByTool = {};
  Object.entries(historyByTool).forEach(([id, arr]) => { latestByTool[id] = arr[arr.length - 1]; });
  const allResponses = Object.values(historyByTool).flat();
  const primaryKeyword = watchlist.find((w) => w.type === 'keyword' && w.is_primary)?.value
    || watchlist.find((w) => w.type === 'keyword')?.value;

  const visibleTools = tools.filter((t) => t.category === activeCategory);

  return (
    <div>
      <PageHeader
        title="OSINT Intel"
        subtitle={currentOrg ? `Threat intel lookups for ${currentOrg.org_name}` : 'Threat intel lookups'}
      />

      <WatchlistPanel orgId={currentOrg?.id} watchlist={watchlist} isAdmin={isAdmin} onChange={load} />

      <OsintKpiStrip latestByTool={latestByTool} allResponses={allResponses} />

      <div className="flex gap-2 mb-4 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              activeCategory === cat ? 'bg-accent text-white' : 'bg-navy-800 text-muted hover:bg-navy-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleTools.map((tool) => {
          const isConfigured = !tool.needsKey || configuredApiNames.includes(tool.id);
          const history = historyByTool[tool.id] || [];
          const latest = latestByTool[tool.id];
          const isFetching = fetchingId === tool.id;

          return (
            <Card key={tool.id}>
              <div className="flex justify-between items-start mb-1 gap-2">
                <div className="font-semibold">{tool.label}</div>
                <Badge color={tool.needsKey ? 'accent' : 'green'}>
                  {tool.needsKey ? 'API key' : 'Free'}
                </Badge>
              </div>
              {tool.description && (
                <div className="text-xs text-muted mb-3">{tool.description}</div>
              )}

              {!isConfigured ? (
                <div className="text-xs text-muted">
                  No API key configured. Add one on the{' '}
                  <a href="/tokens" className="underline">API Tokens</a> page
                  {' '}(api_name: <span className="font-mono">{tool.id}</span>
                  {tool.keyFields === 2 ? ', format: id:secret' : ''}).
                </div>
              ) : (
                <>
                  <PrimaryButton onClick={() => fetchTool(tool.id)} disabled={isFetching} className="mb-3">
                    {isFetching ? 'Fetching…' : latest ? '↻ Refresh' : 'Fetch'}
                  </PrimaryButton>

                  <ToolCardBody tool={tool} latest={latest} history={history} screenedTerm={primaryKeyword} />
                </>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
