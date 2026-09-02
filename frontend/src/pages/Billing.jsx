import { useState, useEffect } from 'react';
import api from '../api';
import WidgetSkeleton from './dashboard/WidgetSkeleton.jsx';

const PLANS = [
  {
    id: 'free', name: 'Free', price: 0,
    features: ['5 members', '3 projects', 'Basic reports', 'Email support'],
    color: 'border-gray-200 dark:border-gray-700', badge: '',
  },
  {
    id: 'starter', name: 'Starter', price: 29,
    features: ['25 members', '10 projects', 'Advanced reports', 'Analytics', 'Priority support'],
    color: 'border-sky-200 dark:border-sky-800', badge: '',
  },
  {
    id: 'pro', name: 'Pro', price: 99,
    features: ['100 members', 'Unlimited projects', 'All reports', 'Analytics', 'API access', 'SLA'],
    color: 'border-indigo-500', badge: 'Most Popular',
  },
  {
    id: 'enterprise', name: 'Enterprise', price: 299,
    features: ['Unlimited members', 'Custom reports', 'Dedicated support', 'Custom SLA', 'Custom integrations', 'On-premise option'],
    color: 'border-violet-500', badge: 'Best Value',
  },
];

export default function Billing() {
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get('/billing')
      .then(r => setBilling(r.data.billing ?? r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const changePlan = async (planId) => {
    setSaving(true);
    const plan = PLANS.find(p => p.id === planId);
    try {
      await api.put('/billing', { plan: planId, amount: plan?.price ?? 0, currency: 'USD', status: 'active' });
      load();
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <div className="h-5 w-1/4 bg-[var(--muted-bg)] rounded animate-pulse" />
        <div className="h-3 w-1/3 bg-[var(--muted-bg)] rounded animate-pulse mt-2" />
      </div>
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm">
        <WidgetSkeleton variant="chart" />
      </div>
    </div>
  );

  const currentPlan = PLANS.find(p => p.id === billing?.plan);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Billing</h1>
        <p className="text-[var(--muted)] text-sm mt-1">Subscription & payment information</p>
      </div>

      {/* Current subscription */}
      {billing && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 mb-6">
          <h3 className="font-semibold text-[var(--foreground)] mb-4">Current Subscription</h3>
          <div className="flex items-center gap-8 flex-wrap">
            <div>
              <p className="text-xs text-[var(--muted)] mb-1">Plan</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 capitalize">{billing.plan || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)] mb-1">Amount</p>
              <p className="text-2xl font-bold text-[var(--foreground)]">
                {billing.currency === 'INR' ? '₹' : '$'}{billing.amount ?? 0}
                <span className="text-sm font-normal text-[var(--muted)]">/mo</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)] mb-1">Status</p>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium capitalize ${
                billing.status === 'active'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${billing.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
                {billing.status || 'active'}
              </span>
            </div>
            {currentPlan && (
              <div>
                <p className="text-xs text-[var(--muted)] mb-1">Features</p>
                <p className="text-sm text-[var(--foreground)]">{currentPlan.features.length} features included</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Plans */}
      <h3 className="font-semibold text-[var(--foreground)] mb-4">
        {billing ? 'Change Plan' : 'Available Plans'}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {PLANS.map(plan => {
          const isCurrent = billing?.plan === plan.id;
          return (
            <div
              key={plan.id}
              className={`bg-[var(--card-bg)] rounded-2xl border-2 p-6 transition-all relative ${
                isCurrent ? plan.color + ' shadow-md' : 'border-[var(--card-border)]'
              }`}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                  {plan.badge}
                </span>
              )}
              <h4 className="font-bold text-[var(--foreground)] text-lg">{plan.name}</h4>
              <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mt-2">
                ${plan.price}
                <span className="text-sm font-normal text-[var(--muted)]">/mo</span>
              </p>
              <ul className="mt-4 space-y-2">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-[var(--muted)]">
                    <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              {!isCurrent ? (
                <button
                  onClick={() => changePlan(plan.id)}
                  disabled={saving}
                  className="w-full mt-5 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Updating…' : `Switch to ${plan.name}`}
                </button>
              ) : (
                <div className="w-full mt-5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 py-2.5 rounded-xl text-center text-sm font-semibold">
                  ✓ Current Plan
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
