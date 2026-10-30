import React from 'react';
import {
  AlertTriangle,
  Clock,
  Shield,
  Layers,
  ChevronRight,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import { Incident } from '../../types';
import { formatDateTime, formatRelativeTime } from '../../utils/formatting';

interface IncidentOverviewProps {
  incidents: Incident[];
  onSelectIncident: (incident: Incident) => void;
  onViewTimeline: (incident: Incident) => void;
}

export const IncidentOverview: React.FC<IncidentOverviewProps> = ({
  incidents,
  onSelectIncident,
  onViewTimeline,
}) => {
  if (incidents.length === 0) {
    return (
      <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-8 text-center text-xs text-slate-400">
        No incidents match the active filter criteria.
      </div>
    );
  }

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl overflow-hidden shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/60 text-slate-400 font-semibold">
              <th className="py-3 px-4">Incident ID</th>
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4">Severity</th>
              <th className="py-3 px-4">Location</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Assigned Responder</th>
              <th className="py-3 px-4">Reported</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60">
            {incidents.map((incident) => {
              return (
                <tr
                  key={incident.id}
                  className="hover:bg-slate-750/50 transition-colors"
                >
                  <td className="py-3 px-4 font-mono font-medium text-slate-300">
                    {incident.id}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-200">
                    {incident.category}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        incident.severity === 'CRITICAL'
                          ? 'bg-red-950/80 text-red-300 border border-red-500/50'
                          : incident.severity === 'HIGH'
                          ? 'bg-orange-950/80 text-orange-300 border border-orange-500/50'
                          : incident.severity === 'MEDIUM'
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                          : 'bg-blue-950/80 text-blue-300 border border-blue-500/40'
                      }`}
                    >
                      {incident.severity}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300 max-w-xs truncate">
                    {incident.addressText || (
                      <span className="text-slate-500 italic">No street address</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        incident.status === 'REPORTED'
                          ? 'bg-red-950/60 text-red-300 border border-red-500/30'
                          : incident.status === 'ASSIGNED'
                          ? 'bg-blue-950/60 text-blue-300 border border-blue-500/30'
                          : incident.status === 'ON_SCENE'
                          ? 'bg-purple-950/60 text-purple-300 border border-purple-500/30'
                          : 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {incident.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    {incident.assignedResponderName ? (
                      <span className="flex items-center gap-1">
                        <Shield className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{incident.assignedResponderName}</span>
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                    {formatRelativeTime(incident.createdAt)}
                  </td>
                  <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                    <button
                      onClick={() => onSelectIncident(incident)}
                      className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition"
                      title="Inspect Map & Telemetry"
                    >
                      <Eye className="w-3 h-3 inline mr-1" />
                      Map
                    </button>
                    <button
                      onClick={() => onViewTimeline(incident)}
                      className="px-2.5 py-1 bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/60 rounded transition"
                      title="View Activity Audit Timeline"
                    >
                      <Layers className="w-3 h-3 inline mr-1" />
                      Timeline
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
