import React, { useState } from 'react';
import { ShieldAlert, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Incident, ResponderProfile, ClaimIncidentResult } from '../../types';
import { incidentService } from '../../services/incidents/incidentService';

interface ClaimIncidentButtonProps {
  incident: Incident;
  responder: ResponderProfile;
  onClaimSuccess?: (updatedIncident: Incident) => void;
  onClaimConflict?: (errorMsg: string) => void;
  className?: string;
}

export const ClaimIncidentButton: React.FC<ClaimIncidentButtonProps> = ({
  incident,
  responder,
  onClaimSuccess,
  onClaimConflict,
  className = '',
}) => {
  const [loading, setLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const isAssigned = incident.status !== 'REPORTED';
  const isAssignedToMe = incident.assignedResponderId === responder.id;

  const handleClaim = async () => {
    if (loading || isAssigned) return;

    setLoading(true);
    setResultMessage(null);

    try {
      const res: ClaimIncidentResult = await incidentService.claimIncident(
        incident.id,
        {
          id: responder.id,
          fullName: responder.fullName,
          trustCategory: responder.trustCategory,
        }
      );

      if (res.success && res.incident) {
        setResultMessage({
          type: 'success',
          text: res.message || 'Successfully claimed! Dispatch route locked.',
        });
        onClaimSuccess?.(res.incident);
      } else {
        const errorText =
          res.error === 'ALREADY_COVERED'
            ? 'Conflict (409): This incident was already accepted by another responder.'
            : res.error === 'NOT_ELIGIBLE'
            ? 'Ineligible (403): Your responder credentials do not permit claiming this incident.'
            : res.message || 'Failed to claim incident.';

        setResultMessage({
          type: 'error',
          text: errorText,
        });
        onClaimConflict?.(errorText);
      }
    } catch (err: any) {
      const errorText = err.message || 'Network error claiming incident. Please retry.';
      setResultMessage({
        type: 'error',
        text: errorText,
      });
      onClaimConflict?.(errorText);
    } finally {
      setLoading(false);
    }
  };

  if (isAssignedToMe) {
    return (
      <div className="flex items-center gap-2 bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 px-4 py-2 rounded-lg text-sm font-medium">
        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
        <span>Assigned to You — Response Active</span>
      </div>
    );
  }

  if (isAssigned) {
    return (
      <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 text-slate-400 px-4 py-2 rounded-lg text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>Already Claimed ({incident.assignedResponderName || 'Another Responder'})</span>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <button
        onClick={handleClaim}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold shadow-lg shadow-red-950/50 transition-all text-sm"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Locking Dispatch Claim...</span>
          </>
        ) : (
          <>
            <ShieldAlert className="w-4 h-4" />
            <span>Accept & Claim Emergency Call</span>
          </>
        )}
      </button>

      {resultMessage && (
        <div
          className={`p-2.5 rounded-lg text-xs flex items-start gap-2 border ${
            resultMessage.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-300'
              : 'bg-red-950/50 border-red-500/30 text-red-300'
          }`}
        >
          {resultMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
          )}
          <span>{resultMessage.text}</span>
        </div>
      )}
    </div>
  );
};
