import React, { useEffect, useState, useRef } from 'react';
import api from '../../api';

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
    const openPercentage = 100 - percentage;
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

    // Calculate stroke dasharray for both portions
    const circumference = 219.8; // Arc length for semi-circle
    const greenDash = (clampedPercentage / 100) * circumference;
    const redDash = (openPercentage / 100) * circumference;

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
                    {/* Gauge background (dark gray track) */}
                    <path
                        d="M 30 100 A 70 70 0 0 1 170 100"
                        fill="none"
                        stroke="#1e293b"
                        strokeWidth="16"
                        strokeLinecap="round"
                    />

                    {/* Green portion (closed/mitigated) */}
                    <path
                        d="M 30 100 A 70 70 0 0 1 170 100"
                        fill="none"
                        stroke="#2ED573"
                        strokeWidth="16"
                        strokeLinecap="round"
                        strokeDasharray={`${greenDash} ${circumference}`}
                        opacity="1"
                    />

                    {/* Red portion (open/unmitigated) */}
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