import React, { useEffect, useState, useRef } from 'react';
import api from '../../api';

// Returns an interpolated red -> orange -> yellow -> green color for a 0-100 value
const getNeedleColor = (pct) => {
  const stops = [
    { p: 0, c: [255, 71, 87] },    // red
    { p: 33, c: [255, 165, 2] },   // orange
    { p: 66, c: [255, 211, 42] },  // yellow
    { p: 100, c: [46, 213, 115] }, // green
  ];
  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (pct >= stops[i].p && pct <= stops[i + 1].p) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }
  const range = upper.p - lower.p || 1;
  const ratio = (pct - lower.p) / range;
  const r = Math.round(lower.c[0] + ratio * (upper.c[0] - lower.c[0]));
  const g = Math.round(lower.c[1] + ratio * (upper.c[1] - lower.c[1]));
  const b = Math.round(lower.c[2] + ratio * (upper.c[2] - lower.c[2]));
  return `rgb(${r}, ${g}, ${b})`;
};

const Emailsecuritymttr = () => {
  const [total, setTotal] = useState(0);
  const [remediated, setRemediated] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const savedRef = useRef(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await api.get('/compliance-health-scores/email-security');
        const { total: t, remediated: r } = response.data;
        setTotal(t || 0);
        setRemediated(r || 0);
      } catch (err) {
        console.error('[Emailsecuritymttr] Failed to fetch email security data:', err.message);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Calculate the percentage
  const percentage = total > 0 ? (remediated / total) * 100 : 0;
  const clampedPercentage = Math.min(Math.max(percentage, 0), 100);

  // Save to localStorage and DB after data is loaded (once per data change)
  useEffect(() => {
    if (loading) return;
    localStorage.setItem("emailMttr", clampedPercentage.toFixed(0));
    if (total > 0 && !savedRef.current) {
      savedRef.current = true;
      api.patch('/compliance-health-scores/update', {
        field: 'email_percentage',
        value: parseFloat(clampedPercentage.toFixed(2)),
      }).then(() => {
        console.log('[Emailsecuritymttr] Saved email_percentage to DB:', clampedPercentage.toFixed(2));
      }).catch(err => console.error('[Emailsecuritymttr] Failed to save email score:', err.message));
    }
  }, [loading, total, remediated, clampedPercentage]);

  // Needle geometry: 0% points left (180deg), 100% points right (0deg)
  const needleLength = 55;
  const angleDeg = 180 - (clampedPercentage / 100) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  const needleX = 100 + needleLength * Math.cos(angleRad);
  const needleY = 100 - needleLength * Math.sin(angleRad);
  const needleColor = getNeedleColor(clampedPercentage);

  if (loading) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm p-6 flex items-center justify-center min-h-[200px]">
        <div className="text-[var(--muted)] text-center">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm p-6 flex items-center justify-center min-h-[200px]">
        <div className="text-red-500 text-center">{error}</div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
      {/* Gauge Section - reduced padding */}
      <div className="flex flex-col items-center justify-center p-4">
        <svg
          width="220"
          height="140"
          viewBox="0 0 200 150"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))', display: 'block' }}
        >
          <defs>
            <linearGradient id="emailMttrGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FF4757" />
              <stop offset="100%" stopColor="#2ED573" />
            </linearGradient>
          </defs>

          {/* Gauge background (dark gray track) */}
          <path
            d="M 30 100 A 70 70 0 0 1 170 100"
            fill="none"
            stroke="#1e293b"
            strokeWidth="16"
            strokeLinecap="round"
          />

          {/* Full gradient arc (red -> orange -> yellow -> green) */}
          <path
            d="M 30 100 A 70 70 0 0 1 170 100"
            fill="none"
            stroke="url(#emailMttrGradient)"
            strokeWidth="16"
            strokeLinecap="round"
          />

          {/* Needle */}
          <line
            x1="100"
            y1="100"
            x2={needleX}
            y2={needleY}
            stroke="#FFFFFF"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Center pivot point */}
          <circle cx="100" cy="100" r="6" fill="#FFFFFF" />
        </svg>

        {/* Percentage Display - reduced margin */}
        <p
          className="text-3xl font-semibold text-center mt-2 mb-1"
          style={{ color: needleColor, transition: 'color 0.3s ease' }}
        >
          {clampedPercentage.toFixed(0)}%
        </p>

        {/* Status Labels - reduced gap and margin */}
        <div className="flex gap-6 mt-2 justify-center flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#2ED573]"></div>
            <span className="text-xs text-[var(--muted)]">Remediated ({remediated})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#FF4757]"></div>
            <span className="text-xs text-[var(--muted)]">Unremediated ({total - remediated})</span>
          </div>
        </div>

        {/* Total Count - reduced margin */}
        <div className="text-xs text-[var(--muted)] mt-2 text-center">
          Total Events: {total}
        </div>
      </div>
    </div>
  );
};

export default Emailsecuritymttr;