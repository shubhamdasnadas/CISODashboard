import React, { useEffect, useState } from 'react';
import api from '../../api';

const AllCommonmttr = () => {
  const [loading, setLoading] = useState(true);
  const [edrPct, setEdrPct] = useState(0);
  const [emailPct, setEmailPct] = useState(0);
  const [ticketPct, setTicketPct] = useState(0);

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
          const t = parseFloat(score.ticketing_percentage) || 0;
          // If any score is > 0, use stored values
          if (e > 0 || em > 0 || t > 0) {
            setEdrPct(e);
            setEmailPct(em);
            setTicketPct(t);
            setLoading(false);
            return;
          }
        }

        // Fallback: fetch from all three raw endpoints and compute
        const [edrRes, emailRes, ticketRes] = await Promise.allSettled([
          api.get('/compliance-health-scores/edr'),
          api.get('/compliance-health-scores/email-security'),
          api.get('/compliance-health-scores/ticketing'),
        ]);

        const edr = edrRes.status === 'fulfilled' ? edrRes.value.data : {};
        const email = emailRes.status === 'fulfilled' ? emailRes.value.data : {};
        const ticket = ticketRes.status === 'fulfilled' ? ticketRes.value.data : {};

        const ePct = edr.total > 0 ? Math.min(Math.max((edr.mitigated / edr.total) * 100, 0), 100) : 0;
        const emPct = email.total > 0 ? Math.min(Math.max((email.remediated / email.total) * 100, 0), 100) : 0;
        const tPct = ticket.total > 0 ? Math.min(Math.max((ticket.closed / ticket.total) * 100, 0), 100) : 0;

        setEdrPct(ePct);
        setEmailPct(emPct);
        setTicketPct(tPct);

        // Also save computed values to DB for next time
        if (ePct > 0 || emPct > 0 || tPct > 0) {
          const avg = Math.round(((ePct + emPct + tPct) / 3) * 100) / 100;
          api.patch('/compliance-health-scores/update', { field: 'edr_percentage', value: parseFloat(ePct.toFixed(2)) }).catch(() => {});
          api.patch('/compliance-health-scores/update', { field: 'email_percentage', value: parseFloat(emPct.toFixed(2)) }).catch(() => {});
          api.patch('/compliance-health-scores/update', { field: 'ticketing_percentage', value: parseFloat(tPct.toFixed(2)) }).catch(() => {});
        }

        // Also sync localStorage
        localStorage.setItem("s1Mttr", ePct.toFixed(0));
        localStorage.setItem("emailMttr", emPct.toFixed(0));
        localStorage.setItem("ticketingMttr", tPct.toFixed(0));

      } catch (err) {
        console.error('[AllCommonmttr] Failed to fetch scores:', err.message);
        // Final fallback: use localStorage
        const emailMttr = parseFloat(localStorage.getItem("emailMttr")) || 0;
        const s1Mttr = parseFloat(localStorage.getItem("s1Mttr")) || 0;
        const ticketMttr = parseFloat(localStorage.getItem("ticketingMttr")) || 0;
        setEdrPct(s1Mttr);
        setEmailPct(emailMttr);
        setTicketPct(ticketMttr);
      } finally {
        setLoading(false);
      }
    };

    fetchAllScores();
  }, []);

  // Calculate average MTTR percentage
  const averagePercentage = (ticketPct + edrPct + emailPct) / 3;
  const clampedPercentage = Math.min(Math.max(averagePercentage, 0), 100);
  const unmitigatedPercentage = 100 - clampedPercentage;

  // Calculate stroke dasharray for both portions
  const circumference = 219.8; // Arc length for semi-circle
  const greenDash = (clampedPercentage / 100) * circumference;
  const redDash = (unmitigatedPercentage / 100) * circumference;

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
    color: '#ffffff',
    fontSize: '36px',
    fontWeight: '600',
    textAlign: 'center',
    margin: '8px 0 0 0'
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
    ticketPct,
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
          {/* Gauge background (dark gray track) */}
          <path
            d="M 30 100 A 70 70 0 0 1 170 100"
            fill="none"
            stroke="#1e293b"
            strokeWidth="16"
            strokeLinecap="round"
          />

          {/* Mitigated/Closed portion (green) */}
          <path
            d="M 30 100 A 70 70 0 0 1 170 100"
            fill="none"
            stroke="#2ED573"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${greenDash} ${circumference}`}
            opacity="1"
          />

          {/* Unmitigated/Open portion (red) */}
          <path
            d="M 30 100 A 70 70 0 0 1 170 100"
            fill="none"
            stroke="#FF4757"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${redDash} ${circumference}`}
            strokeDashoffset={`${-greenDash}`}
            opacity="0.8"
          />

          {/* Center circle (pivot point) */}
          <circle cx="100" cy="100" r="6" fill="#FFFFFF" />
        </svg>

        {/* Percentage Display */}
        <p style={percentageStyle}>{clampedPercentage.toFixed(0)}%</p>
        
        {/* Stats Display */}
        <p style={statsStyle}>
          Average MTTR across Ticketing, SentinelOne & Email Security
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
          <div>Ticketing: {ticketPct.toFixed(0)}% | SentinelOne: {edrPct.toFixed(0)}% | Email Security: {emailPct.toFixed(0)}%</div>
        </div>
      </div>
      )}
    </div>
  );
};

export default AllCommonmttr;