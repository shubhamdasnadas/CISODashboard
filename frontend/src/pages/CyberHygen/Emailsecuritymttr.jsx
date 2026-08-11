
import React, { useEffect, useState } from 'react';
import api from '../../api';

const Emailsecuritymttr = () => {
  const [total, setTotal] = useState(0);
  const [remediated, setRemediated] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await api.get('/harmony/events-db');
        const events = response.data.events || response.data.responseData || [];
        
        if (Array.isArray(events)) {
          const totalCount = events.length;
          const remediatedCount = events.filter(e => 
            e.state === 'remediated' || e.state === 'closed' || e.state === 'done'
          ).length;
          
          setTotal(totalCount);
          setRemediated(remediatedCount);
        }
      } catch (err) {
        console.error('Error fetching email security MTTR data:', err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Calculate the percentage
  const percentage = total > 0 ? (remediated / total) * 100 : 0;
  const unmitigatedPercentage = 100 - percentage;
  const clampedPercentage = Math.min(Math.max(percentage, 0), 100);
  localStorage.setItem("emailMttr", clampedPercentage.toFixed(0))

  // Calculate stroke dasharray for both portions
  const circumference = 219.8; // Arc length for semi-circle
  const greenDash = (clampedPercentage / 100) * circumference;
  const redDash = (unmitigatedPercentage / 100) * circumference;

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
          {/* Gauge background (dark gray track) */}
          <path
            d="M 30 100 A 70 70 0 0 1 170 100"
            fill="none"
            stroke="#1e293b"
            strokeWidth="16"
            strokeLinecap="round"
          />

          {/* Green portion (remediated) */}
          <path
            d="M 30 100 A 70 70 0 0 1 170 100"
            fill="none"
            stroke="#2ED573"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={greenDash + ' ' + circumference}
            opacity="1"
          />

          {/* Red portion (unremediated) */}
          <path
            d="M 30 100 A 70 70 0 0 1 170 100"
            fill="none"
            stroke="#FF4757"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={redDash + ' ' + circumference}
            strokeDashoffset={-greenDash}
            opacity="0.8"
          />

          {/* Center circle (pivot point) */}
          <circle cx="100" cy="100" r="6" fill="#FFFFFF" />
        </svg>

        {/* Percentage Display - reduced margin */}
        <p className="text-white text-3xl font-semibold text-center mt-2 mb-1">{clampedPercentage.toFixed(0)}%</p>

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