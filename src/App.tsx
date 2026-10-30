import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Compass,
  Bell,
  Layers,
  MapPin,
  Radio,
  ExternalLink,
  Flame,
  Info,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { ResponderDashboard } from './components/responder/ResponderDashboard';
import { NotificationList } from './components/notifications/NotificationList';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { IncidentMap } from './components/maps/IncidentMap';
import { IncidentTimeline } from './components/timeline/IncidentTimeline';
import { INITIAL_DEMO_INCIDENTS } from './services/mockData';
import { notificationService } from './services/notifications/notificationService';

type ActiveModule = 'RESPONDER' | 'NOTIFICATIONS' | 'DISPATCH' | 'MAP_EXPLORER';

export function App() {
  const [activeModule, setActiveModule] = useState<ActiveModule>('RESPONDER');
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);
  const [selectedDemoIncident, setSelectedDemoIncident] = useState(
    INITIAL_DEMO_INCIDENTS[0]
  );

  useEffect(() => {
    const unsubscribe = notificationService.subscribeToNotifications(
      'usr-resp-001',
      (items) => {
        setUnreadNotifCount(items.filter((i) => !i.isRead).length);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      {/* Top Application Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-red-900/40 ring-2 ring-red-500/30">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-sm sm:text-base tracking-tight text-white">
                  AegisEmergency
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-500/30 font-semibold">
                  MEMBER 4
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Maps, Responder Coordination & Fallback Notifications
              </p>
            </div>
          </div>

          {/* Module Navigation Tabs */}
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setActiveModule('RESPONDER')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                activeModule === 'RESPONDER'
                  ? 'bg-red-600 text-white shadow-md shadow-red-950/40'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span className="hidden sm:inline">Responder Radar</span>
            </button>

            <button
              onClick={() => setActiveModule('NOTIFICATIONS')}
              className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                activeModule === 'NOTIFICATIONS'
                  ? 'bg-red-600 text-white shadow-md shadow-red-950/40'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span className="hidden sm:inline">Alerts & Fallbacks</span>
              {unreadNotifCount > 0 && (
                <span className="px-1.5 py-0.2 bg-cyan-500 text-slate-950 text-[10px] font-bold rounded-full">
                  {unreadNotifCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveModule('DISPATCH')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                activeModule === 'DISPATCH'
                  ? 'bg-red-600 text-white shadow-md shadow-red-950/40'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span className="hidden sm:inline">Dispatch & Heatmap</span>
            </button>

            <button
              onClick={() => setActiveModule('MAP_EXPLORER')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                activeModule === 'MAP_EXPLORER'
                  ? 'bg-red-600 text-white shadow-md shadow-red-950/40'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              }`}
            >
              <MapPin className="w-4 h-4" />
              <span className="hidden sm:inline">Incident Map</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeModule === 'RESPONDER' && <ResponderDashboard />}

        {activeModule === 'NOTIFICATIONS' && (
          <NotificationList
            onNavigateToIncident={(id) => {
              const inc = INITIAL_DEMO_INCIDENTS.find((i) => i.id === id);
              if (inc) {
                setSelectedDemoIncident(inc);
                setActiveModule('MAP_EXPLORER');
              }
            }}
          />
        )}

        {activeModule === 'DISPATCH' && <AdminDashboard />}

        {activeModule === 'MAP_EXPLORER' && (
          <div className="space-y-5">
            {/* Incident selector */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-slate-300">
                Inspect Emergency Incident Coordinates:
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {INITIAL_DEMO_INCIDENTS.map((inc) => (
                  <button
                    key={inc.id}
                    onClick={() => setSelectedDemoIncident(inc)}
                    className={`px-2.5 py-1 rounded font-medium transition ${
                      selectedDemoIncident.id === inc.id
                        ? 'bg-cyan-600 text-white shadow'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {inc.id} ({inc.category})
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Leaflet Map */}
            <IncidentMap incident={selectedDemoIncident} height="460px" />

            {/* Incident Timeline Audit Trail */}
            <IncidentTimeline incidentId={selectedDemoIncident.id} />
          </div>
        )}
      </main>

      {/* Footer & PWA Status info */}
      <footer className="border-t border-slate-800 bg-slate-900/60 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
          <span>
            Citizen Safety & Emergency Response Platform &bull; Member 4 Implementation
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Realtime Telemetry & Deduplication Engine Ready
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
