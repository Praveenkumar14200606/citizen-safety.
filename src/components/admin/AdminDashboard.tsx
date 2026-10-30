import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Flame,
  Radio,
  Users,
  CheckCircle2,
  Clock,
  Layers,
  Lock,
  Unlock,
  AlertTriangle,
  MapPin,
  ExternalLink,
  ChevronRight,
  X,
  Maximize2,
} from 'lucide-react';
import {
  Incident,
  IncidentFilterOptions,
  DispatchStats,
} from '../../types';
import { IncidentFilters } from './IncidentFilters';
import { IncidentOverview } from './IncidentOverview';
import { IncidentHeatmap } from './IncidentHeatmap';
import { IncidentTimeline } from '../timeline/IncidentTimeline';
import { IncidentMap } from '../maps/IncidentMap';
import { incidentService } from '../../services/incidents/incidentService';
import { notificationService } from '../../services/notifications/notificationService';
import { isLiveBackendConfigured } from '../../services/supabaseClient';

export const AdminDashboard: React.FC = () => {
  // Authorization State (RBAC Protection)
  const defaultPasscode = import.meta.env.VITE_ADMIN_PASSCODE || 'DISPATCH2026';
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [passcodeAttempt, setPasscodeAttempt] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [filters, setFilters] = useState<IncidentFilterOptions>({
    category: 'ALL',
    severity: 'ALL',
    status: 'ALL',
    searchQuery: '',
  });

  const [selectedIncidentForTimeline, setSelectedIncidentForTimeline] = useState<Incident | null>(null);
  const [selectedIncidentForMap, setSelectedIncidentForMap] = useState<Incident | null>(null);
  const [viewMode, setViewMode] = useState<'OVERVIEW' | 'HEATMAP'>('OVERVIEW');

  // Load and subscribe to incidents
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribe = incidentService.subscribeToIncidents((all) => {
      setIncidents(all);
    });

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated]);

  const handleAuthenticate = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcodeAttempt.trim() === defaultPasscode) {
      setIsAuthenticated(true);
      setAuthError(null);
    } else {
      setAuthError('Unauthorized: Invalid Dispatch Coordinator Passcode.');
    }
  };

  // Compute Dispatch Statistics
  const stats: DispatchStats = {
    totalIncidents: incidents.length,
    activeIncidents: incidents.filter((i) => i.status !== 'RESOLVED' && i.status !== 'CANCELLED').length,
    assignedCount: incidents.filter((i) => i.status === 'ASSIGNED').length,
    onSceneCount: incidents.filter((i) => i.status === 'ON_SCENE').length,
    resolvedCount: incidents.filter((i) => i.status === 'RESOLVED').length,
    avgResponseTimeMinutes: 4.2,
    activeCommunityResponders: 14,
    activeVerifiedResponders: 6,
  };

  // Filter incidents for table and heatmap
  const filteredIncidents = incidents.filter((inc) => {
    if (filters.category && filters.category !== 'ALL' && inc.category !== filters.category) return false;
    if (filters.severity && filters.severity !== 'ALL' && inc.severity !== filters.severity) return false;
    if (filters.status && filters.status !== 'ALL' && inc.status !== filters.status) return false;
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase();
      const matchId = inc.id.toLowerCase().includes(q);
      const matchCat = inc.category.toLowerCase().includes(q);
      const matchAddr = inc.addressText ? inc.addressText.toLowerCase().includes(q) : false;
      if (!matchId && !matchCat && !matchAddr) return false;
    }
    return true;
  });

  // Authorization Wall if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto my-12 bg-slate-800/90 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="w-12 h-12 rounded-xl bg-red-600/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>

        <div className="text-center space-y-1">
          <h3 className="text-base font-bold text-slate-100">
            Emergency Dispatch Access Control
          </h3>
          <p className="text-xs text-slate-400">
            Protected Coordinator Terminal. Authentication token required.
          </p>
        </div>

        <form onSubmit={handleAuthenticate} className="space-y-3 pt-2">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Dispatch Coordinator Passcode
            </label>
            <input
              type="password"
              placeholder="Enter passcode (Demo default: DISPATCH2026)"
              value={passcodeAttempt}
              onChange={(e) => setPasscodeAttempt(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-red-500 placeholder-slate-500"
            />
          </div>

          {authError && (
            <div className="p-2.5 rounded bg-red-950/60 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white font-semibold text-xs rounded-lg transition shadow-lg shadow-red-950/50"
          >
            Authenticate & Open Terminal
          </button>
        </form>

        <div className="text-[11px] text-slate-500 text-center pt-2 border-t border-slate-700/60">
          Demo passcode: <code className="text-cyan-400 font-mono">DISPATCH2026</code>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Disclaimer Banner */}
      <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-3.5 flex items-start gap-3 text-xs text-amber-200">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="block text-amber-100 uppercase tracking-wide">
            Simulated Emergency Dispatch Dashboard &bull; Hackathon Demonstration Mode
          </strong>
          <span>
            This interface is an experimental coordination prototype. It does not connect directly to official municipal 911/112 police, fire, or ambulance computer-aided dispatch (CAD) infrastructure unless an authorized integration exists.
          </span>
          <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-amber-300">
            <span>DATA SOURCE:</span>
            <span className="px-1.5 py-0.2 rounded bg-amber-900/60 border border-amber-600/40">
              {isLiveBackendConfigured ? 'LIVE SUPABASE INSTANCE' : 'TESTING DATA ADAPTER (MOCK)'}
            </span>
          </div>
        </div>
      </div>

      {/* High-Level Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 space-y-1">
          <div className="text-[11px] text-slate-400 font-medium">Total Emergencies</div>
          <div className="text-xl font-bold text-slate-100">{stats.totalIncidents}</div>
        </div>

        <div className="bg-slate-800/80 border border-red-500/30 rounded-xl p-3.5 space-y-1 bg-red-950/10">
          <div className="text-[11px] text-red-400 font-medium flex items-center gap-1">
            <Radio className="w-3 h-3 text-red-400" />
            Active Emergencies
          </div>
          <div className="text-xl font-bold text-red-400">{stats.activeIncidents}</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 space-y-1">
          <div className="text-[11px] text-slate-400 font-medium">Assigned / In Route</div>
          <div className="text-xl font-bold text-blue-400">{stats.assignedCount}</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 space-y-1">
          <div className="text-[11px] text-slate-400 font-medium">Arrived On Scene</div>
          <div className="text-xl font-bold text-purple-400">{stats.onSceneCount}</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 space-y-1">
          <div className="text-[11px] text-slate-400 font-medium">Safely Resolved</div>
          <div className="text-xl font-bold text-emerald-400">{stats.resolvedCount}</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 space-y-1">
          <div className="text-[11px] text-slate-400 font-medium">Active Responders</div>
          <div className="text-xl font-bold text-cyan-400">
            {stats.activeCommunityResponders + stats.activeVerifiedResponders}
          </div>
        </div>
      </div>

      {/* View Mode & Heatmap Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/80 border border-slate-700/80 p-3 rounded-xl text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-300">Spatial Visualization:</span>
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-700">
            <button
              onClick={() => setViewMode('OVERVIEW')}
              className={`px-3 py-1 rounded transition font-medium ${
                viewMode === 'OVERVIEW'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              List & Audit View
            </button>
            <button
              onClick={() => setViewMode('HEATMAP')}
              className={`px-3 py-1 rounded transition font-medium flex items-center gap-1.5 ${
                viewMode === 'HEATMAP'
                  ? 'bg-orange-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Incident Heatmap (P2)</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-slate-400">
          <span>Coordinator: <strong className="text-slate-200">Terminal #04</strong></span>
          <button
            onClick={() => setIsAuthenticated(false)}
            className="text-xs text-red-400 hover:text-red-300 ml-2"
          >
            Lock Terminal
          </button>
        </div>
      </div>

      {/* Heatmap View */}
      {viewMode === 'HEATMAP' && (
        <div className="space-y-3">
          <IncidentHeatmap
            incidents={filteredIncidents}
            height="500px"
            isDemoData={!isLiveBackendConfigured}
          />
        </div>
      )}

      {/* Standard Overview & Filter View */}
      {viewMode === 'OVERVIEW' && (
        <div className="space-y-4">
          <IncidentFilters
            filters={filters}
            onChange={(upd) => setFilters(upd)}
            onReset={() =>
              setFilters({
                category: 'ALL',
                severity: 'ALL',
                status: 'ALL',
                searchQuery: '',
              })
            }
          />

          <IncidentOverview
            incidents={filteredIncidents}
            onSelectIncident={(inc) => setSelectedIncidentForMap(inc)}
            onViewTimeline={(inc) => setSelectedIncidentForTimeline(inc)}
          />
        </div>
      )}

      {/* Modal / Drawer for Activity Audit Timeline */}
      {selectedIncidentForTimeline && (
        <div className="fixed inset-0 z-[2000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm text-slate-100">
                  Incident Activity Timeline &bull; {selectedIncidentForTimeline.id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedIncidentForTimeline(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              <IncidentTimeline incidentId={selectedIncidentForTimeline.id} />
            </div>
          </div>
        </div>
      )}

      {/* Modal for Map Telemetry Inspection */}
      {selectedIncidentForMap && (
        <div className="fixed inset-0 z-[2000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wide">
                  {selectedIncidentForMap.category} Telemetry Map ({selectedIncidentForMap.id})
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedIncidentForMap.addressText || 'Coordinates view'}
                </p>
              </div>
              <button
                onClick={() => setSelectedIncidentForMap(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              <IncidentMap incident={selectedIncidentForMap} height="360px" />
              
              {/* Manual radius escalation trigger button for test/demo */}
              {selectedIncidentForMap.status === 'REPORTED' && selectedIncidentForMap.eligibilityRadiusMeters < 500 && (
                <div className="bg-slate-800/80 p-3 rounded-xl border border-amber-500/30 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-amber-300 block">Radius Escalation Simulation</span>
                    <span className="text-slate-400">Test Member 3 escalation from 300m to 500m</span>
                  </div>
                  <button
                    onClick={() => {
                      incidentService.escalateRadius(selectedIncidentForMap.id);
                      setSelectedIncidentForMap({
                        ...selectedIncidentForMap,
                        eligibilityRadiusMeters: 500,
                      });
                    }}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg shadow transition"
                  >
                    Escalate to 500m
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
