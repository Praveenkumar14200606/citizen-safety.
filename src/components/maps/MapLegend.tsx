import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Info, AlertTriangle, ShieldCheck, UserCheck, Clock } from 'lucide-react';

export const MapLegend: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-lg p-3 text-xs text-slate-200 shadow-xl max-w-xs transition-all">
      <div
        className="flex items-center justify-between cursor-pointer select-none font-medium"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="flex items-center gap-1.5 text-slate-100">
          <Info className="w-4 h-4 text-cyan-400" />
          Map Legend & Telemetry Guide
        </span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </div>

      {isOpen && (
        <div className="mt-2.5 pt-2 border-t border-slate-700 space-y-2">
          <div>
            <div className="font-semibold text-slate-300 mb-1">Incident Severity:</div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 ring-2 ring-red-400/50"></span>
                <span>Critical / Pulse</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
                <span>High</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                <span>Medium</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <span>Low</span>
              </div>
            </div>
          </div>

          <div>
            <div className="font-semibold text-slate-300 mb-1">Responders:</div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Verified Responder (Official)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-blue-400" />
                <span>Community Responder (Trained)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Stale Telemetry (&gt;60s inactive)</span>
              </div>
            </div>
          </div>

          <div className="pt-1.5 border-t border-slate-800 text-[10px] text-slate-400 leading-tight flex items-start gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>PWA Notice:</strong> Continuous background GPS tracking is restricted by browser sandbox. Location refreshes while the application tab is active.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
