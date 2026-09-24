import { useState, useEffect, useRef } from 'react';

/**
 * Modern floating top-right notification toast displaying the newly received OTP code.
 * Stays for 30 seconds, then slides out smoothly with an exit animation.
 *
 * @param {object} props
 * @param {string} props.otp - The 6-digit OTP code received from backend
 * @param {string} [props.email] - Registered email address or masked destination
 * @param {function} [props.onClose] - Callback when toast is dismissed
 * @param {function} [props.onAutoFill] - Optional callback to auto-fill the code into input
 * @param {number} [props.duration=30000] - Duration in ms before auto-dismissing (30 seconds)
 */
export default function OtpNotificationToast({
  otp,
  email,
  onClose,
  onAutoFill,
  duration = 30000, // 30 seconds
}) {
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState(100);
  const [remainingSec, setRemainingSec] = useState(30);
  const [isExiting, setIsExiting] = useState(false);
  const exitTimerRef = useRef(null);

  const triggerExit = () => {
    if (isExiting) return;
    setIsExiting(true);
    exitTimerRef.current = setTimeout(() => {
      if (onClose) onClose();
    }, 380); // match slideOutRight duration
  };

  useEffect(() => {
    if (!otp) return;
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remainingMs = Math.max(0, duration - elapsed);
      const remainingPercentage = (remainingMs / duration) * 100;

      setProgress(remainingPercentage);
      setRemainingSec(Math.ceil(remainingMs / 1000));

      if (remainingMs <= 0) {
        clearInterval(interval);
        triggerExit();
      }
    }, 100);

    return () => {
      clearInterval(interval);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, [otp, duration]);

  const handleCopy = async () => {
    if (!otp) return;
    try {
      await navigator.clipboard.writeText(String(otp).trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleAutoFill = () => {
    if (onAutoFill && otp) {
      onAutoFill(otp);
    }
    handleCopy();
  };

  if (!otp) return null;

  return (
    <div
      className={`fixed top-4 right-4 sm:top-6 sm:right-6 z-[9999] max-w-sm sm:max-w-md w-[calc(100vw-32px)] transition-all ${
        isExiting ? 'animate-slideOutRight' : 'animate-slideInRight'
      }`}
    >
      <div className="relative overflow-hidden rounded-2xl bg-[#0e1629]/95 border border-indigo-500/40 shadow-[0_12px_40px_rgba(79,70,229,0.35)] backdrop-blur-xl p-4 sm:p-5 text-slate-100 ring-1 ring-indigo-400/25">
        {/* Top subtle gradient accent line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400" />

        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="relative flex-shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white text-base shadow-md">
                🛡️
              </div>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold tracking-tight text-white">Verification Code (OTP)</h4>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  LIVE
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {email ? `Sent to ${email}` : 'Your secure one-time passcode'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={triggerExit}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/60 transition-colors"
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>

        {/* OTP Code Display Box */}
        <div className="mt-3.5 p-3 sm:p-3.5 rounded-xl bg-[#090d18] border border-indigo-500/25 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">CODE:</span>
            <span className="font-mono text-xl sm:text-2xl font-black text-cyan-300 tracking-[0.25em] sm:tracking-[0.35em] drop-shadow-[0_0_12px_rgba(6,182,212,0.4)]">
              {otp}
            </span>
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
            {onAutoFill && (
              <button
                type="button"
                onClick={handleAutoFill}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
              >
                <span>⚡</span> Auto-fill
              </button>
            )}
            <button
              type="button"
              onClick={handleCopy}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer ${
                copied
                  ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
            >
              {copied ? (
                <>
                  <span>✓</span> Copied!
                </>
              ) : (
                <>
                  <span>📋</span> Copy
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer info & 30-second timer countdown */}
        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <span>⏱️</span> Valid for 5 minutes
          </span>
          <span className="text-[10px] font-medium text-slate-400">
            Auto-closes in <span className="text-indigo-400 font-bold">{remainingSec}s</span>
          </span>
        </div>

        {/* Animated countdown bar for exactly 30 seconds */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800/80">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
