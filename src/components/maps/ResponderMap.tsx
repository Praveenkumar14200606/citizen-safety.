import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import { Crosshair, AlertTriangle, ShieldCheck, Clock } from 'lucide-react';
import { ResponderProfile, Incident } from '../../types';
import { getIncidentIcon, getResponderIcon } from './MapMarker';
import { MapLegend } from './MapLegend';
import { isLocationStale, formatDistance } from '../../utils/geo';
import { formatRelativeTime } from '../../utils/formatting';

interface ResponderMapProps {
  responder: ResponderProfile;
  nearbyIncidents: Incident[];
  onSelectIncident?: (incident: Incident) => void;
  height?: string;
}

export const ResponderMap: React.FC<ResponderMapProps> = ({
  responder,
  nearbyIncidents,
  onSelectIncident,
  height = '480px',
}) => {
  const ownLoc = responder.currentLocation;

  // Fallback coordinates if location not yet acquired (Demo center or default city)
  const defaultCoords: [number, number] = ownLoc
    ? [ownLoc.lat, ownLoc.lng]
    : [37.7749, -122.4194];

  const isStale = ownLoc ? isLocationStale(ownLoc.lastUpdated) : true;

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-slate-700/80 shadow-2xl" style={{ height }}>
      <MapContainer
        center={defaultCoords}
        zoom={14}
        scrollWheelZoom={true}
        className="w-full h-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Responder's Own Location & Accuracy Ring */}
        {ownLoc && (
          <>
            <Circle
              center={[ownLoc.lat, ownLoc.lng]}
              radius={ownLoc.accuracyMeters || 15}
              pathOptions={{
                color: '#38bdf8',
                fillColor: '#38bdf8',
                fillOpacity: 0.15,
                weight: 1.5,
              }}
            />
            <Marker
              position={[ownLoc.lat, ownLoc.lng]}
              icon={getResponderIcon(responder.trustCategory, true, isStale)}
            >
              <Popup>
                <div className="p-1 text-slate-900 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1 text-cyan-700">
                    <Crosshair className="w-3.5 h-3.5" />
                    Your Location (Responder)
                  </div>
                  <div>Category: <strong>{responder.trustCategory}</strong></div>
                  <div>Status: <strong>{responder.availabilityStatus}</strong></div>
                  <div>
                    Last GPS ping: {formatRelativeTime(ownLoc.lastUpdated)}
                    {isStale && <span className="text-amber-600 block">Warning: Stale telemetry</span>}
                  </div>
                </div>
              </Popup>
            </Marker>
          </>
        )}

        {/* Nearby Active Incidents */}
        {nearbyIncidents.map((inc) => {
          if (!inc.coordinates) return null;
          return (
            <React.Fragment key={inc.id}>
              {/* Coverage radius circle */}
              <Circle
                center={[inc.coordinates.lat, inc.coordinates.lng]}
                radius={inc.eligibilityRadiusMeters}
                pathOptions={{
                  color: inc.eligibilityRadiusMeters > 300 ? '#f59e0b' : '#ef4444',
                  fillColor: inc.eligibilityRadiusMeters > 300 ? '#f59e0b' : '#ef4444',
                  fillOpacity: 0.08,
                  weight: 1,
                  dashArray: '3, 6',
                }}
              />
              <Marker
                position={[inc.coordinates.lat, inc.coordinates.lng]}
                icon={getIncidentIcon(inc.category, inc.severity)}
                eventHandlers={{
                  click: () => onSelectIncident?.(inc),
                }}
              >
                <Popup>
                  <div className="p-1 text-slate-900 text-xs space-y-1.5">
                    <div className="flex items-center justify-between border-b pb-1 font-bold">
                      <span className="text-red-600 uppercase">{inc.category}</span>
                      <span className="text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded">
                        {inc.severity}
                      </span>
                    </div>
                    <div>{inc.addressText || 'Incident Location'}</div>
                    <div className="text-[11px] text-gray-600">
                      Distance: <strong>{formatDistance(inc.distanceMeters)}</strong>
                    </div>
                    {onSelectIncident && (
                      <button
                        onClick={() => onSelectIncident(inc)}
                        className="w-full mt-1 px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold"
                      >
                        View & Claim
                      </button>
                    )}
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}
      </MapContainer>

      {/* Top Telemetry Status Overlay */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1.5">
        <div className="bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 shadow-md flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>
            {responder.fullName} &bull;{' '}
            <strong className="text-emerald-300">{responder.trustCategory}</strong>
          </span>
        </div>

        {/* Stale or GPS status banner */}
        {isStale ? (
          <div className="bg-amber-950/90 backdrop-blur border border-amber-600/50 px-3 py-1.5 rounded-lg text-xs text-amber-200 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>GPS Telemetry Stale (&gt;60s). Keep app in active foreground.</span>
          </div>
        ) : (
          <div className="bg-slate-900/90 backdrop-blur border border-slate-700 px-3 py-1.5 rounded-lg text-xs text-slate-300 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Live GPS Synchronized ({formatRelativeTime(ownLoc!.lastUpdated)})</span>
          </div>
        )}
      </div>

      {/* Legend Positioned at Bottom Right */}
      <div className="absolute bottom-3 right-3 z-[1000]">
        <MapLegend />
      </div>
    </div>
  );
};
