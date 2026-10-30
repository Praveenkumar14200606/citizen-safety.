import React from 'react';
import {
  AlertCircle,
  Clock,
  Navigation,
  ChevronRight,
  ShieldAlert,
  Flame,
  HeartPulse,
  Car,
  Compass,
  AlertTriangle,
} from 'lucide-react';
import { Incident, IncidentCategory, IncidentSeverity } from '../../types';
import { formatDistance } from '../../utils/geo';
import { formatRelativeTime } from '../../utils/formatting';

interface IncidentFeedProps {
  incidents: Incident[];
  selectedIncidentId?: string | null;
  onSelectIncident: (incident: Incident) => void;
  responderAvailability: string;
}

const getCategoryIcon = (category: IncidentCategory) => {
  switch (category) {
    case 'MEDICAL':
      return <HeartPulse className="w-4 h-4 text-rose-400" />;
    case 'FIRE':
      return <Flame className="w-4 h-4 text-orange-400" />;
    case 'ACCIDENT':
      return <Car className="w-4 h-4 text-amber-400" />;
    case 'CRIME':
      return <ShieldAlert className="w-4 h-4 text-red-400" />;
    default:
      return <AlertCircle className="w-4 h-4 text-cyan-400" />;
  }
};

const getSeverityBadge = (severity: IncidentSeverity) => {
  switch (severity) {
    case 'CRITICAL':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950/80 text-red-300 border border-red-500/50 flex items-center gap-1 animate-pulse">
          CRITICAL
        </span>
      );
    case 'HIGH':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-950/80 text-orange-300 border border-orange-500/50">
          HIGH
        </span>
      );
    case 'MEDIUM':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-950/80 text-amber-300 border border-amber-500/40">
          MEDIUM
        </span>
      );
    case 'LOW':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-950/80 text-blue-300 border border-blue-500/40">
          LOW
        </span>
      );
  }
};

export const IncidentFeed: React.FC<IncidentFeedProps> = ({
  incidents,
  selectedIncidentId,
  onSelectIncident,
  responderAvailability,
}) => {
  if (responderAvailability === 'UNAVAILABLE') {
    return (
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-8 text-center space-y-2">
        <Compass className="w-10 h-10 text-slate-500 mx-auto" />
        <h4 className="font-semibold text-slate-300 text-sm">Responder Offline</h4>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Switch your status to <strong>Available</strong> above to receive active emergency calls within your vicinity.
        </p>
      </div>
    );
  }

  if (incidents.length === 0) {
    return (
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-8 text-center space-y-2">
        <div className="w-10 h-10 rounded-full bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
          <Navigation className="w-5 h-5" />
        </div>
        <h4 className="font-semibold text-slate-200 text-sm">Vicinity Clear</h4>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          No active emergency alerts within your designated coverage perimeter. Stand by for real-time dispatch alerts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>Active Incidents in Vicinity ({incidents.length})</span>
        <span className="text-[11px] text-cyan-400">Realtime Feed</span>
      </div>

      <div className="space-y-2.5">
        {incidents.map((incident) => {
          const isSelected = incident.id === selectedIncidentId;
          const isAssigned = incident.status !== 'REPORTED';
          const isEscalated = incident.eligibilityRadiusMeters > 300;

          return (
            <div
              key={incident.id}
              onClick={() => onSelectIncident(incident)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
                isSelected
                  ? 'bg-slate-800 border-cyan-500/80 shadow-lg shadow-cyan-950/30 ring-1 ring-cyan-500/40'
                  : 'bg-slate-800/70 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600'
              }`}
            >
              {/* Category & Severity Bar */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <div className="p-1 rounded bg-slate-900 border border-slate-700">
                    {getCategoryIcon(incident.category)}
                  </div>
                  <span className="font-semibold text-xs text-slate-100 uppercase tracking-wide">
                    {incident.category}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {isEscalated && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950/90 text-amber-300 border border-amber-500/40 font-medium">
                      500m Escalated
                    </span>
                  )}
                  {getSeverityBadge(incident.severity)}
                </div>
              </div>

              {/* Location or Description */}
              <div className="text-xs text-slate-300 font-medium line-clamp-1 mb-2">
                {incident.addressText || 'Reported Incident in Area'}
              </div>

              {/* Distance and Metadata Footer */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-700/60">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-cyan-300">
                    <Navigation className="w-3 h-3" />
                    {formatDistance(incident.distanceMeters)}
                  </span>
                  <span className="flex items-center gap-1 text-slate-400">
                    <Clock className="w-3 h-3" />
                    {formatRelativeTime(incident.createdAt)}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {isAssigned ? (
                    <span className="text-[10px] text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-600/30">
                      {incident.status}
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-600/30">
                      CLAIMABLE
                    </span>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
