import { useState, useEffect, useRef } from 'react';
import { subscribeToActiveRequests } from '../api.js';

/**
 * PageTransitionLoader - Animated Shield Logo Transition Loader
 * Renders Image #25 shield logo with ripple waves, heartbeat breathing, and real-time data loading progress.
 * Stays visible until all page data API requests are fully loaded.
 */
export default function PageTransitionLoader({ isLoading, onComplete }) {
  const [progress, setProgress] = useState(25);
  const activeRequestsRef = useRef(0);
  const mountedTimeRef = useRef(Date.now());
  const hasFinishedRef = useRef(false);

  useEffect(() => {
    if (!isLoading) {
      setProgress(0);
      hasFinishedRef.current = false;
      return;
    }

    mountedTimeRef.current = Date.now();
    hasFinishedRef.current = false;
    setProgress(25);

    // Subscribe to real-time API requests count
    const unsubscribe = subscribeToActiveRequests((count) => {
      activeRequestsRef.current = count;
    });

    const minGracePeriod = 200; // ms to let React component mount and initiate network requests
    const maxSafetyTimeout = 1500; // 1.5s max cap so the UI is always snappy and never stuck

    const interval = setInterval(() => {
      const elapsed = Date.now() - mountedTimeRef.current;
      const count = activeRequestsRef.current;

      if (hasFinishedRef.current) return;

      // When requests are still in-flight or during initial grace period:
      if (elapsed < minGracePeriod || (count > 0 && elapsed < maxSafetyTimeout)) {
        // Smoothly advance progress between 25% and 88% while loading data
        setProgress((prev) => {
          if (prev < 50) return prev + 8;
          if (prev < 75) return prev + 5;
          if (prev < 88) return prev + 2;
          return 88; // hold at 88% until all requests finish
        });
      } else {
        // All API requests have finished or safety timeout reached! Accelerate to 100%
        setProgress((prev) => {
          if (prev < 100) {
            const next = Math.min(100, prev + 18);
            if (next >= 100 && !hasFinishedRef.current) {
              hasFinishedRef.current = true;
              setTimeout(() => {
                if (onComplete) onComplete();
              }, 120);
            }
            return next;
          }
          return 100;
        });
      }
    }, 50);

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [isLoading, onComplete]);

  if (!isLoading) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[var(--background)] bg-app-glow transition-all duration-200 animate-fadeIn min-h-full will-change-[opacity]">
      {/* Ambient background glow behind logo */}
      <div className="absolute w-96 h-96 rounded-full bg-indigo-600/20 blur-3xl pointer-events-none animate-pulse will-change-[transform,opacity]" />

      {/* Main Logo Container with Ripple Effect */}
      <div className="relative flex items-center justify-center">
        {/* Animated Ripple Rings */}
        <div className="absolute w-36 h-36 rounded-[2.5rem] bg-indigo-500/15 animate-ping duration-1000 will-change-[transform,opacity]" />
        <div className="absolute w-28 h-28 rounded-3xl bg-indigo-500/25 animate-pulse will-change-[transform,opacity]" />

        {/* Central Shield Logo (Image #25) */}
        <div className="relative z-10 w-24 h-24 rounded-3xl bg-gradient-to-tr from-indigo-700 via-indigo-600 to-indigo-500 flex items-center justify-center shadow-[0_0_40px_rgba(79,70,229,0.6)] border border-indigo-400/40 transform transition-transform hover:scale-105 animate-logoBounce will-change-[transform]">
          {/* Shield Icon with Checkmark */}
          <svg
            className="w-13 h-13 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>

          {/* Inner Shimmer Reflection */}
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-white/25 to-transparent pointer-events-none" />
        </div>
      </div>

      {/* Brand & Loading Indicator */}
      <div className="mt-8 text-center z-10 space-y-2">
        <div className="flex items-center justify-center gap-2">
          <p className="font-extrabold text-lg text-[var(--foreground)] tracking-tight">
            SecureHub
          </p>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            Enterprise
          </span>
        </div>
        <p className="text-xs font-medium text-[var(--muted)] animate-pulse">
          {progress < 40
            ? 'Initializing Workspace Telemetry…'
            : progress < 75
            ? 'Fetching Security Datasets & Threats…'
            : progress < 95
            ? 'Aggregating Posture & Real-Time Metrics…'
            : 'Launching Workspace…'}
        </p>

        {/* Real-Time Progress Bar */}
        <div className="w-56 h-1.5 bg-[var(--card-border)] rounded-full overflow-hidden mx-auto mt-3 border border-indigo-500/20">
          <div
            className="h-full bg-gradient-to-r from-indigo-600 via-indigo-400 to-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.8)] transition-all duration-150 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
