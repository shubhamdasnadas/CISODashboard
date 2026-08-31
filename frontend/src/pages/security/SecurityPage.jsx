import { useState } from 'react';
import Threats from './Threats.jsx';
import S1Cve from './S1Cve.jsx';
import S1Agent from './S1Agent.jsx';
import { useProviders } from '../../context/ProviderContext.jsx';
import AnalyticsLaunchButton from '../../components/AnalyticsLaunchButton.jsx';

const TABS = [
  {
    id: 'threats',
    label: 'Threat Analytics',
    icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    color: 'red',
  },
  {
    id: 'cve',
    label: 'Application CVEs',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    color: 'purple',
  },
  {
    id: 'agents',
    label: 'Agent Analytics',
    icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    color: 'emerald',
  },
];

const ACTIVE_CLS = {
  red:     'border-b-2 border-red-500 text-red-600 dark:text-red-400 bg-[var(--card-bg)]',
  purple:  'border-b-2 border-purple-500 text-purple-600 dark:text-purple-400 bg-[var(--card-bg)]',
  emerald: 'border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-[var(--card-bg)]',
};
const IDLE_CLS = 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)]';

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState('threats');
  const { selectedProviders } = useProviders();
  const activeTool = selectedProviders.edr || 'SentinelOne';

  return (
    <div className="flex flex-col min-h-full">

      {/* Page header */}
      <div className="px-6 pt-6 pb-0 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{activeTool}</h1>
          <p className="text-sm text-[var(--muted)] mt-1">{activeTool} endpoint protection — threats, CVEs, agents</p>
        </div>
        <AnalyticsLaunchButton moduleKey="security" />
      </div>

      {/* Tab bar */}
      <div className="px-6 mt-5 border-b border-[var(--card-border)] flex items-center gap-1">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all rounded-t-lg -mb-px ${
                isActive ? ACTIVE_CLS[tab.color] : IDLE_CLS
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={tab.icon} />
              </svg>
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1">
        {activeTab === 'threats' && <Threats />}
        {activeTab === 'cve'     && <S1Cve />}
        {activeTab === 'agents'  && <S1Agent />}
      </div>

    </div>
  );
}
