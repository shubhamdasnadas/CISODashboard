import { useNavigate } from 'react-router-dom';
import api from '../api';
import * as session from '../utils/session.js';
import { useOrg } from '../context/OrgContext.jsx';

export default function SuperAdminBanner({ viewingOrg, onExit }) {
  const navigate = useNavigate();
  const { setCurrentOrg } = useOrg();

  if (!viewingOrg) return null;

  const handleExit = async () => {
    try {
      await api.post('/superadmin/exit-organisation', {
        orgId: viewingOrg.id,
        orgName: viewingOrg.org_name,
      });
    } catch {
      // Non-critical audit exit call
    }
    session.clearSuperAdminViewingOrg();
    if (onExit) onExit();
    navigate('/superadmin-console');
  };

  return (
    <div className="w-full bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white px-4 py-2.5 shadow-md flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold z-40 sticky top-0 transition-all animate-fadeIn">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-6 h-6 rounded-lg bg-black/20 flex items-center justify-center flex-shrink-0 text-white">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </span>
        <p className="truncate">
          <span>You are viewing </span>
          <strong className="underline underline-offset-2 font-bold px-1 py-0.5 rounded bg-black/20">
            {viewingOrg.org_name || `Org #${viewingOrg.id}`}
          </strong>
          <span> as SuperAdmin (Context Locked)</span>
        </p>
      </div>

      <button
        type="button"
        onClick={handleExit}
        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-black/30 hover:bg-black/40 text-white border border-white/20 transition-all font-bold text-xs flex-shrink-0 cursor-pointer shadow-xs active:scale-98"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to SuperAdmin Console
      </button>
    </div>
  );
}
