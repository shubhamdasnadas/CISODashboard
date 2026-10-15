import { useState, useEffect, useRef } from 'react';
import { subscribeToActiveRequests } from '../api.js';
import drishtiLightImg from '../../image/Drishti360DarkMode.png';
import drishtiDarkImg from '../../image/Drishti360Lightmode.png';

/**
 * PageTransitionLoader - Animated Brand Logo Transition Loader
 * Renders Drishti360 logo with ripple waves, heartbeat breathing, and real-time data loading progress.
 * Stays visible until all page data API requests are fully loaded or during auth/OTP operations.
 */
export default function PageTransitionLoader({
  isLoading = true,
  onComplete,
  fullScreen = false,
  title = 'Drishti360',
  badge = 'Enterprise',
  statusText,
  messages,
}) {
  const [progress, setProgress] = useState(25);
  const activeRequestsRef = useRef(0);
  const hasSeenRequestsRef = useRef(false);
  const mountedTimeRef = useRef(Date.now());
  const hasFinishedRef = useRef(false);

  useEffect(() => {
    if (!isLoading) {
      setProgress(0);
      hasFinishedRef.current = false;
      hasSeenRequestsRef.current = false;
      return;
    }

    mountedTimeRef.current = Date.now();
    hasFinishedRef.current = false;
    hasSeenRequestsRef.current = false;
    setProgress(25);

    // Subscribe to real-time API requests count
    const unsubscribe = subscribeToActiveRequests((count) => {
      activeRequestsRef.current = count;
      if (count > 0) {
        hasSeenRequestsRef.current = true;
      }
    });

    const minGracePeriod = 250; // ms to let React child components mount and initiate network requests
    const maxSafetyTimeout = 2500; // max time before safety finish (2.5s)

    const interval = setInterval(() => {
      const elapsed = Date.now() - mountedTimeRef.current;
      const count = activeRequestsRef.current;

      if (hasFinishedRef.current) return;

      // When route/tab transitions provide an onComplete callback:
      if (onComplete) {
        const isRequestsPending = count > 0 || (elapsed < minGracePeriod);
        const isWithinSafetyTimeout = elapsed < maxSafetyTimeout;

        if (isRequestsPending && isWithinSafetyTimeout) {
          // Smoothly advance progress between 25% and 88% while loading data
          setProgress((prev) => {
            if (prev < 50) return prev + 6;
            if (prev < 75) return prev + 4;
            if (prev < 88) return prev + 1.5;
            return 88; // hold at 88% until all requests finish
          });
        } else {
          // All API requests have finished or safety timeout reached! Accelerate to 100%
          setProgress((prev) => {
            if (prev < 100) {
              const next = Math.min(100, prev + 16);
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
      } else {
        // Controlled isLoading (e.g. during Sign In / sending OTP to email)
        setProgress((prev) => {
          if (prev < 45) return prev + 6;
          if (prev < 70) return prev + 3;
          if (prev < 88) return prev + 1.5;
          if (prev < 94) return prev + 0.5;
          return 94; // Hold smoothly near 94% until the request completes
        });
      }
    }, 45);

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [isLoading, onComplete]);

  if (!isLoading) return null;

  // Determine current status message
  let currentStatus = '';
  if (statusText) {
    currentStatus = statusText;
  } else if (messages && Array.isArray(messages) && messages.length > 0) {
    const stepIdx = Math.min(
      messages.length - 1,
      Math.floor((progress / 100) * messages.length)
    );
    currentStatus = messages[stepIdx];
  } else {
    currentStatus =
      progress < 40
        ? 'Initializing Workspace Telemetry…'
        : progress < 75
        ? 'Fetching Security Datasets & Threats…'
        : progress < 95
        ? 'Aggregating Posture & Real-Time Metrics…'
        : 'Launching Workspace…';
  }

  const containerPosition = fullScreen ? 'fixed inset-0 z-[9999] min-h-screen' : 'absolute inset-0 z-40 min-h-full';

  return (
    <div className={`${containerPosition} flex flex-col items-center justify-center bg-[var(--background)] bg-app-glow transition-all duration-200 animate-fadeIn will-change-[opacity]`}>
      <div className="sticky top-1/2 -translate-y-1/2 flex flex-col items-center justify-center my-auto w-full max-w-lg px-4 pointer-events-auto">
        {/* Ambient background glow behind logo */}
        <div className="absolute w-80 h-44 rounded-full bg-gradient-to-r from-blue-600/30 via-indigo-500/30 to-cyan-400/30 blur-3xl pointer-events-none animate-pulse will-change-[transform,opacity]" />

        {/* Main Logo Container with Matching Pill Ripple & Lighting Effect */}
        <div className="relative flex items-center justify-center">
          {/* Animated Matching Pill Ripple Waves */}
          <div className="absolute -inset-2.5 rounded-[2rem] bg-gradient-to-r from-blue-500/15 via-indigo-500/20 to-cyan-400/20 animate-ping duration-1000 pointer-events-none will-change-[transform,opacity]" />
          <div className="absolute -inset-1.5 rounded-[1.75rem] bg-gradient-to-r from-blue-500/30 via-indigo-500/35 to-cyan-400/35 blur-md animate-pulse pointer-events-none will-change-[transform,opacity]" />

          {/* Central Drishti360 Brand Logo with Direct Cyan/Blue Lighting Glow */}
          <div className="relative z-10 px-8 py-5 rounded-3xl bg-[var(--card-bg)]/90 backdrop-blur-md flex items-center justify-center shadow-[0_0_35px_rgba(59,130,246,0.35),0_0_60px_rgba(6,182,212,0.25)] border border-cyan-400/30 dark:border-cyan-400/40 transform transition-transform hover:scale-105 animate-logoBounce will-change-[transform]">
            <img
              src={drishtiLightImg}
              alt="Drishti360"
              className="h-11 w-auto max-w-[220px] object-contain dark:hidden drop-shadow-[0_0_12px_rgba(59,130,246,0.35)]"
            />
            <img
              src={drishtiDarkImg}
              alt="Drishti360"
              className="h-11 w-auto max-w-[220px] object-contain hidden dark:block drop-shadow-[0_0_16px_rgba(56,189,248,0.55)]"
            />
          </div>
        </div>

        {/* Brand & Loading Indicator */}
        <div className="mt-8 text-center z-10 space-y-2 px-4 max-w-sm">
          <div className="flex items-center justify-center gap-2">
            <p className="font-extrabold text-lg text-[var(--foreground)] tracking-tight">
              {title}
            </p>
            {badge && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs font-medium text-[var(--muted)] animate-pulse">
            {currentStatus}
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
    </div>
  );
}
