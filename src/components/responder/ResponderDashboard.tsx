import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Radio,
  Map as MapIcon,
  List,
  RefreshCw,
  Bell,
  Smartphone,
  Info,
} from 'lucide-react';
import { Incident, ResponderProfile } from '../../types';
import { ResponderStatus } from './ResponderStatus';
import { IncidentFeed } from './IncidentFeed';
import { IncidentDetails } from './IncidentDetails';
import { ResponderMap } from '../maps/ResponderMap';
import { incidentService } from '../../services/incidents/incidentService';
import { responderService } from '../../services/responders/responderService';
import { INITIAL_DEMO_RESPONDERS } from '../../services/mockData';

export const ResponderDashboard: React.FC = () => {
  const [responder, setResponder] = useState<ResponderProfile>(
    INITIAL_DEMO_RESPONDERS[0]
  );
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [activeTab, setActiveTab] = useState<'MAP' | 'FEED'>('MAP');
  const [loading, setLoading] = useState(false);

  // Subscribe to incidents and responder live location with unmount cleanup
  useEffect(() => {
    setLoading(true);

    const unsubscribeIncidents = incidentService.subscribeToIncidents(
      (allIncidents) => {
        // Filter eligible incidents based on responder's location
        incidentService
          .fetchEligibleIncidents(
            responder.currentLocation,
            responder.trustCategory
          )
          .then((eligible) => {
            setIncidents(eligible);
            setLoading(false);
          });
      }
    );

    const unsubscribeLocation = responderService.subscribeToLocation(
      responder.id,
      (loc) => {
        setResponder((prev) => ({
          ...prev,
          currentLocation: loc,
        }));
      }
    );

    return () => {
      unsubscribeIncidents();
      unsubscribeLocation();
    };
  }, [responder.id]);

  const handleIncidentSelect = (inc: Incident) => {
    setSelectedIncident(inc);
  };

  const handleIncidentUpdated = (updated: Incident) => {
    setSelectedIncident(updated);
    setIncidents((prev: Incident[]) =>
      prev.map((i) => (i.id === updated.id ? updated : i))
    );
  };

  // Role toggle for hackathon demonstration: switch between COMMUNITY & VERIFIED
  const handleSwitchDemoProfile = (index: number) => {
    const profile = INITIAL_DEMO_RESPONDERS[index];
    setResponder(profile);
    setSelectedIncident(null);
  };

  return (
    <div className="space-y-4">
      {/* Top Bar with Demo Responder Profile Switcher */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">Active Responder Persona:</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleSwitchDemoProfile(0)}
              className={`px-2.5 py-1 rounded font-medium transition ${
                responder.id === INITIAL_DEMO_RESPONDERS[0].id
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Alex (Community)
            </button>
            <button
              onClick={() => handleSwitchDemoProfile(1)}
              className={`px-2.5 py-1 rounded font-medium transition ${
                responder.id === INITIAL_DEMO_RESPONDERS[1].id
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Officer Chen (Verified)
            </button>
          </div>
        </div>

        {/* View mode toggle on mobile */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-700 lg:hidden">
          <button
            onClick={() => setActiveTab('MAP')}
            className={`px-3 py-1 rounded flex items-center gap-1 transition ${
              activeTab === 'MAP' ? 'bg-cyan-600 text-white' : 'text-slate-400'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span>Map</span>
          </button>
          <button
            onClick={() => setActiveTab('FEED')}
            className={`px-3 py-1 rounded flex items-center gap-1 transition ${
              activeTab === 'FEED' ? 'bg-cyan-600 text-white' : 'text-slate-400'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Feed ({incidents.length})</span>
          </button>
        </div>
      </div>

      {/* Responder Profile & Telemetry Status Card */}
      <ResponderStatus
        responder={responder}
        onUpdate={(upd) => setResponder(upd)}
      />

      {/* Main Grid: Map & Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Map View */}
        <div
          className={`lg:col-span-7 space-y-3 ${
            activeTab === 'FEED' ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span className="flex items-center gap-1.5 font-medium text-slate-300">
              <Radio className="w-4 h-4 text-cyan-400" />
              Live Radar & Incident Coverage
            </span>
            <span>300m / 500m Escalation Zones</span>
          </div>

          <ResponderMap
            responder={responder}
            nearbyIncidents={incidents}
            onSelectIncident={handleIncidentSelect}
            height="520px"
          />
        </div>

        {/* Right: Feed or Detail Modal */}
        <div
          className={`lg:col-span-5 space-y-4 ${
            activeTab === 'MAP' ? 'hidden lg:block' : 'block'
          }`}
        >
          {selectedIncident ? (
            <IncidentDetails
              incident={selectedIncident}
              responder={responder}
              onClose={() => setSelectedIncident(null)}
              onIncidentUpdated={handleIncidentUpdated}
            />
          ) : (
            <div className="bg-slate-800/40 border border-slate-700/80 rounded-2xl p-4 shadow-xl">
              <IncidentFeed
                incidents={incidents}
                selectedIncidentId={undefined}
                onSelectIncident={handleIncidentSelect}
                responderAvailability={responder.availabilityStatus}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
