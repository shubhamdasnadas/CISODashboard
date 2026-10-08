import React, { useState } from 'react';
import { useOrg } from '../context/OrgContext.jsx';
import api from '../api';
import { clearSession } from '../utils/session.js';

export default function LicenseExpiredBarrier({ expiredDetails }) {
  const { currentOrg, organisations, switchOrg, clearLicenseExpired } = useOrg();
  const [copiedCode, setCopiedCode] = useState(false);
  const [requestCode, setRequestCode] = useState('');
  const [loadingCode, setLoadingCode] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [signedLicenseInput, setSignedLicenseInput] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [applySuccess, setApplySuccess] = useState('');

  const orgName = expiredDetails?.orgName || currentOrg?.org_name || 'Organisation';
  const orgSlug = expiredDetails?.slug || currentOrg?.slug || '';
  const licenseId = expiredDetails?.licenseId || currentOrg?.license_id || 'N/A';
  const endDate = expiredDetails?.endDate || currentOrg?.end_date || '—';
  const orgId = expiredDetails?.orgId || currentOrg?.id;
  const isOffline = expiredDetails?.deploymentMode === 'offline' || (typeof window !== 'undefined' && window.__DEPLOYMENT_MODE__ === 'offline');

  const handleCopyRequestCode = async () => {
    try {
      setLoadingCode(true);
      if (requestCode) {
        await navigator.clipboard.writeText(requestCode);
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 3000);
        return;
      }

      if (orgId) {
        try {
          const { data } = await api.get(`/superadmin/license/request-code/${orgId}`);
          if (data?.requestCode) {
            setRequestCode(data.requestCode);
            await navigator.clipboard.writeText(data.requestCode);
            setCopiedCode(true);
            setTimeout(() => setCopiedCode(false), 3000);
            return;
          }
        } catch {
          // fallback to client-side encoded request blob
        }
      }

      const clientPayload = {
        requestCodeVersion: '1.0',
        orgId,
        orgName,
        slug: orgSlug,
        licenseId,
        currentEndDate: endDate,
        requestedAt: new Date().toISOString(),
      };
      const fallbackCode = `CISO-REQ-${btoa(JSON.stringify(clientPayload))}`;
      setRequestCode(fallbackCode);
      await navigator.clipboard.writeText(fallbackCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 3000);
    } catch (err) {
      console.error('Failed to copy license request code:', err);
    } finally {
      setLoadingCode(false);
    }
  };

  const handleApplySignedLicense = async (e) => {
    e.preventDefault();
    if (!signedLicenseInput.trim()) {
      setApplyError('Please paste the signed license token string.');
      return;
    }

    try {
      setApplying(true);
      setApplyError('');
      setApplySuccess('');

      const { data } = await api.post('/superadmin/license/apply', {
        signedLicense: signedLicenseInput.trim(),
      });

      setApplySuccess(data.message || 'License applied successfully! Reloading...');
      setTimeout(() => {
        clearLicenseExpired();
        window.location.reload();
      }, 1500);
    } catch (err) {
      setApplyError(err.response?.data?.error || err.message || 'Failed to apply license token.');
    } finally {
      setApplying(false);
    }
  };

  const handleSignOut = () => {
    clearSession();
    window.location.href = '/login';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070a12]/95 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl bg-[#0f172a] border border-red-500/30 rounded-2xl p-8 shadow-2xl shadow-red-950/40 text-center">
        {/* Glow effect */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Warning Icon Badge */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 mb-6 shadow-lg shadow-red-500/10">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Header */}
        <h2 className="text-2xl font-bold text-white tracking-tight mb-2">
          Organisation License Expired
        </h2>
        <p className="text-sm text-slate-400 mb-6">
          Access to security operations for <span className="font-semibold text-white">{orgName}</span> has been suspended because the enterprise license validity period has ended.
        </p>

        {/* License Metadata Card */}
        <div className="bg-[#1e293b]/70 border border-slate-700/60 rounded-xl p-4 mb-6 text-left space-y-2">
          <div className="flex justify-between text-xs py-1 border-b border-slate-700/50">
            <span className="text-slate-400">Organisation:</span>
            <span className="font-medium text-slate-200">{orgName} ({orgSlug})</span>
          </div>
          <div className="flex justify-between text-xs py-1 border-b border-slate-700/50">
            <span className="text-slate-400">License ID:</span>
            <span className="font-mono text-indigo-400 font-semibold">{licenseId}</span>
          </div>
          <div className="flex justify-between text-xs py-1 border-b border-slate-700/50">
            <span className="text-slate-400">Expiration Date:</span>
            <span className="font-semibold text-red-400">{endDate}</span>
          </div>
          <div className="flex justify-between text-xs py-1">
            <span className="text-slate-400">Status:</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-red-500/20 text-red-300 border border-red-500/40 uppercase">
              Expired
            </span>
          </div>
        </div>

        {/* Offline / Online Help Text */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 text-left flex items-start space-x-3">
          <span className="text-amber-400 text-lg">💡</span>
          <p className="text-xs text-amber-200/90 leading-relaxed">
            {isOffline
              ? 'This is an On-Premise / Offline install. To renew, copy the License Request Code below and send it to your TechSec Security Administrator to receive a new signed license token.'
              : 'Please contact your SuperAdmin to extend the license validity in the SuperAdmin Console to restore operational access.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {/* Copy Request Code (Offline / Self-service) */}
          <button
            onClick={handleCopyRequestCode}
            disabled={loadingCode}
            className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/30 active:scale-95 cursor-pointer"
          >
            {copiedCode ? (
              <>
                <svg className="w-4 h-4 mr-1.5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied License Request Code!
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy License Request Code
              </>
            )}
          </button>

          {/* Apply Token Button (Offline Modal Trigger) */}
          <button
            onClick={() => setShowApplyModal(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer"
          >
            <svg className="w-4 h-4 mr-1.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload / Paste New Token
          </button>

          {/* Switch Org Dropdown if user has multiple orgs */}
          {organisations && organisations.length > 1 && (
            <select
              value={currentOrg?.id || ''}
              onChange={(e) => {
                const selected = organisations.find((o) => String(o.id) === String(e.target.value));
                if (selected) {
                  clearLicenseExpired();
                  switchOrg(selected.id);
                }
              }}
              className="w-full sm:w-auto px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="" disabled>Switch Organisation...</option>
              {organisations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.org_name}
                </option>
              ))}
            </select>
          )}

          {/* Sign Out Button */}
          <button
            onClick={handleSignOut}
            className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Modal: Apply / Upload Offline License Token */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[#0f172a] border border-slate-700 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>🔑</span> Apply New License Token
              </h3>
              <button
                onClick={() => {
                  setShowApplyModal(false);
                  setApplyError('');
                  setApplySuccess('');
                }}
                className="text-slate-400 hover:text-white text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleApplySignedLicense} className="space-y-4">
              <p className="text-xs text-slate-400">
                Paste the signed license token string or upload the <code className="text-indigo-300">.lic</code> file received from the vendor SuperAdmin.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Signed License Token String:
                </label>
                <textarea
                  rows={4}
                  value={signedLicenseInput}
                  onChange={(e) => setSignedLicenseInput(e.target.value)}
                  placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {/* File upload input fallback */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Or Upload License File:
                </label>
                <input
                  type="file"
                  accept=".lic,.txt,.json,.jwt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        setSignedLicenseInput(String(evt.target?.result || ''));
                      };
                      reader.readAsText(file);
                    }
                  }}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-indigo-400 hover:file:bg-slate-700 cursor-pointer"
                />
              </div>

              {applyError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                  {applyError}
                </div>
              )}

              {applySuccess && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400">
                  {applySuccess}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowApplyModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={applying}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition shadow-md shadow-indigo-600/30 disabled:opacity-50 cursor-pointer"
                >
                  {applying ? 'Verifying & Applying...' : 'Apply License'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
