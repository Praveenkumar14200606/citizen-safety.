import React, { useState } from 'react';
import {
  X,
  Brain,
  ShieldAlert,
  MapPin,
  CheckCircle,
  Flag,
  Navigation,
  Loader2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Incident, ResponderProfile } from '../../types';
import { IncidentMap } from '../maps/IncidentMap';
import { ClaimIncidentButton } from './ClaimIncidentButton';
import { incidentService } from '../../services/incidents/incidentService';
import { formatDateTime, formatRelativeTime } from '../../utils/formatting';
import { formatDistance } from '../../utils/geo';

interface IncidentDetailsProps {
  incident: Incident;
  responder: ResponderProfile;
  onClose: () => void;
  onIncidentUpdated: (updated: Incident) => void;
}

export const IncidentDetails: React.FC<IncidentDetailsProps> = ({
  incident,
  responder,
  onClose,
  onIncidentUpdated,
}) => {
  const [transitioning, setTransitioning] = useState(false);
  const isAssignedToMe = incident.assignedResponderId === responder.id;

  const handleStatusTransition = async (newStatus: 'ON_SCENE' | 'RESOLVED') => {
    setTransitioning(true);
    try {
      const res = await incidentService.updateIncidentStatus(
        incident.id,
        responder.id,
        newStatus
      );
      if (res.success) {
        onIncidentUpdated({ ...incident, status: newStatus });
      } else {
        alert(`Failed to update status: ${res.message}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTransitioning(false);
    }
  };

  return (
    <div className="bg-slate-800/95 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
      {/* Top Header */}
      <div className="px-5 py-4 border-b border-slate-700/80 flex items-center justify-between bg-slate-900/60">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-red-600/10 border border-red-500/20 text-red-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                {incident.category} Emergency Call
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                {incident.id}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Reported {formatRelativeTime(incident.createdAt)} &bull; {formatDateTime(incident.createdAt)}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Interactive Map */}
        <div>
          <IncidentMap incident={incident} height="280px" />
        </div>

        {/* Location & Proximity Information */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-slate-900/60 border border-slate-700/70 rounded-xl p-3 text-xs">
            <div className="text-slate-400 mb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" />
              <span>Location Coordinates</span>
            </div>
            <div className="font-medium text-slate-200">
              {incident.addressText || 'Reported street location'}
            </div>
            {incident.coordinates && (
              <div className="text-[11px] font-mono text-slate-400 mt-1">
                {incident.coordinates.lat.toFixed(5)}, {incident.coordinates.lng.toFixed(5)}
              </div>
            )}
          </div>

          <div className="bg-slate-900/60 border border-slate-700/70 rounded-xl p-3 text-xs">
            <div className="text-slate-400 mb-1 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-emerald-400" />
              <span>Proximity & Radius</span>
            </div>
            <div className="font-semibold text-emerald-400 text-sm">
              {formatDistance(incident.distanceMeters)} away
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Coverage Radius: <strong>{incident.eligibilityRadiusMeters} meters</strong>
              {incident.eligibilityRadiusMeters > 300 && (
                <span className="text-amber-400 block mt-0.5">Expanded after 30s threshold</span>
              )}
            </div>
          </div>
        </div>

        {/* AI Triage & Classification Card (Member 3 Integration) */}
        {incident.aiClassification && (
          <div className="bg-gradient-to-br from-indigo-950/40 to-slate-900/90 border border-indigo-500/30 rounded-xl p-4 text-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold text-indigo-300">
                <Brain className="w-4 h-4 text-indigo-400" />
                AI Triage Classification (Member 3 Engine)
              </span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-200 font-semibold border border-indigo-500/30 text-[10px]">
                Risk Score: {incident.aiClassification.riskScore}/100
              </span>
            </div>

            <p className="text-slate-300 leading-relaxed font-medium">
              {incident.aiClassification.summary}
            </p>

            {incident.aiClassification.recommendedActions?.length > 0 && (
              <div className="pt-2 border-t border-indigo-900/50 space-y-1.5">
                <div className="font-semibold text-indigo-200 flex items-center gap-1 text-[11px]">
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  Recommended Protocols:
                </div>
                <ul className="space-y-1">
                  {incident.aiClassification.recommendedActions.map((action, idx) => (
                    <li key={idx} className="flex items-start gap-1.5 text-slate-300">
                      <span className="text-cyan-400 mt-0.5">&bull;</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Assigned Responder Status Transition Controls */}
        {isAssignedToMe && (
          <div className="bg-slate-900/80 border border-emerald-500/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" />
                Incident Assigned to You
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 bg-emerald-950 text-emerald-300 rounded border border-emerald-800">
                CURRENT: {incident.status}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {incident.status === 'ASSIGNED' && (
                <button
                  onClick={() => handleStatusTransition('ON_SCENE')}
                  disabled={transitioning}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition flex items-center justify-center gap-2 shadow"
                >
                  {transitioning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
                  <span>Mark Arrived On Scene</span>
                </button>
              )}

              {incident.status === 'ON_SCENE' && (
                <button
                  onClick={() => handleStatusTransition('RESOLVED')}
                  disabled={transitioning}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition flex items-center justify-center gap-2 shadow"
                >
                  {transitioning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />}
                  <span>Mark Safely Resolved & Close</span>
                </button>
              )}

              {incident.status === 'RESOLVED' && (
                <div className="w-full text-center py-2 text-xs text-slate-400 bg-slate-800 rounded-lg">
                  Incident closed and archived. Thank you for your service.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Claim Action */}
      {!isAssignedToMe && incident.status === 'REPORTED' && (
        <div className="p-4 border-t border-slate-700/80 bg-slate-900/60">
          <ClaimIncidentButton
            incident={incident}
            responder={responder}
            onClaimSuccess={(upd) => onIncidentUpdated(upd)}
          />
        </div>
      )}
    </div>
  );
};
