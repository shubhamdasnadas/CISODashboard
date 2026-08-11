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

const Ticketingmttr = ({ total: propTotal, closed: propClosed, tickets: propTickets }) => {
    const [total, setTotal] = useState(propTotal || 0);
    const [closed, setClosed] = useState(propClosed || 0);
    const [loading, setLoading] = useState(!(propTotal > 0 || propClosed > 0));
    const savedRef = useRef(false);

    useEffect(() => {
        // If props already have data, skip fetching — just mark as loaded
        if (propTotal > 0 || propClosed > 0) {
            setLoading(false);
            return;
        }

        // If tickets array is provided, derive total/closed from it
        if (propTickets && propTickets.length > 0) {
            const closedStatuses = ['Closed', 'Technically Closed', 'Resolved', 'closed', 'technically closed', 'resolved'];
            const closedCount = propTickets.filter(t => closedStatuses.includes(t.status)).length;
            setTotal(propTickets.length);
            setClosed(closedCount);
            setLoading(false);
            return;
        }

        const fetchData = async () => {
            try {
                setLoading(true);
                const response = await api.get('/compliance-health-scores/ticketing');
                const { total: t, closed: c } = response.data;
                setTotal(t || 0);
                setClosed(c || 0);
            } catch (err) {
                console.error('[Ticketingmttr] Failed to fetch ticketing data:', err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [propTotal, propClosed, propTickets]);

    // Calculate the percentage
    const percentage = total > 0 ? (closed / total) * 100 : 0;
    const clampedPercentage = Math.min(Math.max(percentage, 0), 100);

    // Save to localStorage and DB after data is loaded (once per data change)
    useEffect(() => {
        if (loading) return;
        localStorage.setItem("ticketingMttr", clampedPercentage.toFixed(0));
        if (total > 0 && !savedRef.current) {
            savedRef.current = true;
            api.patch('/compliance-health-scores/update', {
                field: 'ticketing_percentage',
                value: parseFloat(clampedPercentage.toFixed(2)),
            }).then(() => {
                console.log('[Ticketingmttr] Saved ticketing_percentage to DB:', clampedPercentage.toFixed(2));
            }).catch(err => console.error('[Ticketingmttr] Failed to save ticketing score:', err.message));
        }
    }, [loading, total, closed, clampedPercentage]);

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

    return (
        <div style={containerStyle}>
            {loading ? (
                <div style={{ color: '#94a3b8', textAlign: 'center' }}>Loading...</div>
            ) : (
            <div style={gaugeContainerStyle}>
                <svg
                    width="240"
                    height="160"
                    viewBox="0 0 200 150"
                    style={{ filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))', display: 'block' }}
                >
                    <defs>
                        <linearGradient id="ticketingMttrGradient" x1="0%" y1="0%" x2="100%" y2="0%">
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
                        stroke="url(#ticketingMttrGradient)"
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

                {/* Status Labels */}
                <div style={legendContainerStyle}>
                    <div style={legendItemStyle}>
                        <div style={legendCircleStyle('#2ED573')}></div>
                        <span style={legendTextStyle}>Closed ({closed})</span>
                    </div>
                    <div style={legendItemStyle}>
                        <div style={legendCircleStyle('#FF4757')}></div>
                        <span style={legendTextStyle}>Open ({total - closed})</span>
                    </div>
                </div>
            </div>
            )}
        </div>
    );
};

export default Ticketingmttr;