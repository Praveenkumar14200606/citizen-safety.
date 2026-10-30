import React, { useState } from 'react';
import {
  ShieldCheck,
  UserCheck,
  MapPin,
  RefreshCw,
  Power,
  AlertTriangle,
  Radio,
} from 'lucide-react';
import { ResponderProfile, ResponderAvailability } from '../../types';
import { responderService } from '../../services/responders/responderService';
import { formatRelativeTime } from '../../utils/formatting';
import { isLocationStale } from '../../utils/geo';

interface ResponderStatusProps {
  responder: ResponderProfile;
  onUpdate: (updated: ResponderProfile) => void;
}

export const ResponderStatus: React.FC<ResponderStatusProps> = ({
  responder,
  onUpdate,
}) => {
  const [updating, setUpdating] = useState(false);

  const isStale = responder.currentLocation
    ? isLocationStale(responder.currentLocation.lastUpdated)
    : true;

  const handleToggleAvailability = async (newStatus: ResponderAvailability) => {
    setUpdating(true);
    try {
      await responderService.updateAvailability(responder.id, newStatus);
      onUpdate({ ...responder, availabilityStatus: newStatus });
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(false);
    }
  };

  const handleSimulateGpsPing = async () => {
    setUpdating(true);
    try {
      // Small jitter simulation around current location
      const baseLat = responder.currentLocation?.lat || 37.7765;
      const baseLng = responder.currentLocation?.lng || -122.4175;
      const jitterLat = (Math.random() - 0.5) * 0.001;
      const jitterLng = (Math.random() - 0.5) * 0.001;

      const updatedLoc = await responderService.updateLiveLocation(responder.id, {
        lat: baseLat + jitterLat,
        lng: baseLng + jitterLng,
        accuracyMeters: 5 + Math.floor(Math.random() * 10),
      });

      onUpdate({ ...responder, currentLocation: updatedLoc });
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 shadow-lg space-y-4">
      {/* Header Profile */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-slate-700 flex items-center justify-center text-slate-200 font-bold border border-slate-600">
            {responder.fullName
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-100 text-sm">
                {responder.fullName}
              </h3>
              {responder.trustCategory === 'VERIFIED' ? (
                <span className="flex items-center gap-1 text-[11px] bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full font-medium">
                  <ShieldCheck className="w-3 h-3" />
                  Verified
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] bg-blue-950/80 text-blue-400 border border-blue-500/40 px-2 py-0.5 rounded-full font-medium">
                  <UserCheck className="w-3 h-3" />
                  Community
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              ID: <code className="text-slate-300 font-mono">{responder.id}</code>
            </p>
          </div>
        </div>

        {/* Availability Switch */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-700">
          <button
            onClick={() => handleToggleAvailability('AVAILABLE')}
            disabled={updating || responder.availabilityStatus === 'ON_DUTY'}
            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
              responder.availabilityStatus === 'AVAILABLE'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Available
          </button>
          <button
            onClick={() => handleToggleAvailability('UNAVAILABLE')}
            disabled={updating || responder.availabilityStatus === 'ON_DUTY'}
            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
              responder.availabilityStatus === 'UNAVAILABLE'
                ? 'bg-amber-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Unavailable
          </button>
          {responder.availabilityStatus === 'ON_DUTY' && (
            <span className="px-3 py-1 rounded text-xs font-medium bg-red-600 text-white">
              On Duty
            </span>
          )}
        </div>
      </div>

      {/* Telemetry & PWA Location Bar */}
      <div className="pt-2 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-300">
            GPS Telemetry:{' '}
            {responder.currentLocation ? (
              <span className="font-mono text-cyan-300">
                {responder.currentLocation.lat.toFixed(4)},{' '}
                {responder.currentLocation.lng.toFixed(4)}
              </span>
            ) : (
              <span className="text-slate-500">Not Acquired</span>
            )}
          </span>

          {responder.currentLocation && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded ${
                isStale
                  ? 'bg-amber-950/60 text-amber-300 border border-amber-600/30'
                  : 'bg-emerald-950/60 text-emerald-300 border border-emerald-600/30'
              }`}
            >
              {isStale
                ? 'Telemetry Stale (>60s)'
                : `Fresh (${formatRelativeTime(responder.currentLocation.lastUpdated)})`}
            </span>
          )}
        </div>

        <button
          onClick={handleSimulateGpsPing}
          disabled={updating}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs transition"
          title="Simulate active device GPS telemetry ping"
        >
          <Radio className="w-3.5 h-3.5 text-cyan-400" />
          <span>Ping GPS</span>
        </button>
      </div>

      {/* Trust Notice */}
      <div className="text-[11px] text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-700/50 flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
        <span>
          Verification status is cryptographically controlled by the dispatch authority. Community responders assist with first-aid & escort within initial 300m range.
        </span>
      </div>
    </div>
  );
};
