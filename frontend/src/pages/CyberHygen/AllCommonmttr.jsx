import React, { useEffect, useState } from 'react';
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

const AllCommonmttr = () => {
  const [loading, setLoading] = useState(true);
  const [edrPct, setEdrPct] = useState(0);
  const [emailPct, setEmailPct] = useState(0);

  useEffect(() => {
    const fetchAllScores = async () => {
      try {
        setLoading(true);

        // Try fetching stored scores from compliance_health_scores table
        const scoreRes = await api.get('/compliance-health-scores');
        const score = scoreRes.data?.score;

        if (score) {
          const e = parseFloat(score.edr_percentage) || 0;
          const em = parseFloat(score.email_percentage) || 0;
          // If any score is > 0, use stored values
          if (e > 0 || em > 0) {
            setEdrPct(e);
            setEmailPct(em);
            setLoading(false);
            return;
          }
        }

        // Fallback: fetch from all three raw endpoints and compute
        const [edrRes, emailRes] = await Promise.allSettled([
          api.get('/compliance-health-scores/edr'),
          api.get('/compliance-health-scores/email-security'),
        ]);

        const edr = edrRes.status === 'fulfilled' ? edrRes.value.data : {};
        const email = emailRes.status === 'fulfilled' ? emailRes.value.data : {};

        const ePct = edr.total > 0 ? Math.min(Math.max((edr.mitigated / edr.total) * 100, 0), 100) : 0;
        const emPct = email.total > 0 ? Math.min(Math.max((email.remediated / email.total) * 100, 0), 100) : 0;

        setEdrPct(ePct);
        setEmailPct(emPct);

        // Also save computed values to DB for next time.
        // Save sequentially (not concurrently) so a brand-new day creates exactly one row
        // that then gets updated, instead of racing into multiple INSERTs.
        if (ePct > 0 || emPct > 0) {
          try {
            await api.patch('/compliance-health-scores/update', { field: 'edr_percentage', value: parseFloat(ePct.toFixed(2)) });
            await api.patch('/compliance-health-scores/update', { field: 'email_percentage', value: parseFloat(emPct.toFixed(2)) });
          } catch (err) {
            console.error('[AllCommonmttr] Failed to persist scores:', err?.message);
          }
        }

        // Also sync localStorage
        localStorage.setItem("s1Mttr", ePct.toFixed(0));
        localStorage.setItem("emailMttr", emPct.toFixed(0));

      } catch (err) {
        console.error('[AllCommonmttr] Failed to fetch scores:', err.message);
        // Final fallback: use localStorage
        const emailMttr = parseFloat(localStorage.getItem("emailMttr")) || 0;
        const s1Mttr = parseFloat(localStorage.getItem("s1Mttr")) || 0;
        setEdrPct(s1Mttr);
        setEmailPct(emailMttr);
      } finally {
        setLoading(false);
      }
    };

    fetchAllScores();
  }, []);

  // Calculate average MTTR percentage
  const averagePercentage = (edrPct + emailPct) / 2;
  const clampedPercentage = Math.min(Math.max(averagePercentage, 0), 100);
  const unmitigatedPercentage = 100 - clampedPercentage;

  // Needle geometry: 0% points left (180deg), 100% points right (0deg)
  const needleLength = 55;
  const angleDeg = 180 - (clampedPercentage / 100) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  const needleX = 100 + needleLength * Math.cos(angleRad);
  const needleY = 100 - needleLength * Math.sin(angleRad);
  const needleColor = getNeedleColor(clampedPercentage);

  // Inline styles
  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 16px',
    backgroundColor: '#0f172a',
    borderRadius: '8px',
    width: '100%',
    minHeight: 'auto'
  };

  const gaugeContainerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    width: '100%'
  };

  const percentageStyle = {
    color: needleColor,
    fontSize: '36px',
    fontWeight: '600',
    textAlign: 'center',
    margin: '8px 0 0 0',
    transition: 'color 0.3s ease'
  };

  const statsStyle = {
    color: '#94a3b8',
    fontSize: '12px',
    textAlign: 'center',
    margin: '4px 0 0 0'
  };

  const legendContainerStyle = {
    display: 'flex',
    gap: '20px',
    marginTop: '8px',
    fontSize: '12px',
    justifyContent: 'center',
    flexWrap: 'wrap',
    width: '100%'
  };

  const legendItemStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  };

  const legendCircleStyle = (color) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: color
  });

  const legendTextStyle = {
    color: '#cbd5e1',
    fontSize: '11px'
  };

  // For debugging
  console.log("AllCommonmttr values:", {
    emailPct,
    edrPct,
    averagePercentage: clampedPercentage.toFixed(2)
  });

  return (
    <div style={containerStyle}>
      {loading ? (
        <div style={{ color: '#94a3b8', textAlign: 'center', padding: '32px 16px' }}>Loading health score...</div>
      ) : (
      <div style={gaugeContainerStyle}>
        <svg
          width="240"
          height="160"
          viewBox="0 0 200 150"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))', display: 'block' }}
        >
          <defs>
            <linearGradient id="allCommonMttrGradient" x1="0%" y1="0%" x2="100%" y2="0%">
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
            stroke="url(#allCommonMttrGradient)"
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

        {/* Percentage Display */}
        <p style={percentageStyle}>{clampedPercentage.toFixed(0)}%</p>

        {/* Stats Display */}
        <p style={statsStyle}>
          Average MTTR across SentinelOne & Email Security
        </p>

        {/* Status Labels */}
        <div style={legendContainerStyle}>
          <div style={legendItemStyle}>
            <div style={legendCircleStyle('#2ED573')}></div>
            <span style={legendTextStyle}>Avg Resolved ({clampedPercentage.toFixed(0)}%)</span>
          </div>
          <div style={legendItemStyle}>
            <div style={legendCircleStyle('#FF4757')}></div>
            <span style={legendTextStyle}>Avg Open ({unmitigatedPercentage.toFixed(0)}%)</span>
          </div>
        </div>

        {/* Individual percentages for reference */}
        <div style={{ marginTop: '12px', fontSize: '10px', color: '#64748b', textAlign: 'center', width: '100%' }}>
          <div>SentinelOne: {edrPct.toFixed(0)}% | Email Security: {emailPct.toFixed(0)}%</div>
        </div>
      </div>
      )}
    </div>
  );
};

export default AllCommonmttr;