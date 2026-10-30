import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline } from 'react-leaflet';
import { AlertCircle, Navigation, Clock, Shield, CheckCircle2 } from 'lucide-react';
import { Incident } from '../../types';
import { getIncidentIcon, getResponderIcon } from './MapMarker';
import { MapLegend } from './MapLegend';
import { formatDistance, isLocationStale } from '../../utils/geo';
import { formatDateTime, formatRelativeTime } from '../../utils/formatting';

interface IncidentMapProps {
  incident: Incident;
  height?: string;
  className?: string;
}

export const IncidentMap: React.FC<IncidentMapProps> = ({
  incident,
  height = '420px',
  className = '',
}) => {
  // Gracefully handle missing coordinates (e.g. underground or disabled GPS)
  if (!incident.coordinates) {
    return (
      <div
        className={`w-full rounded-xl border border-amber-500/30 bg-amber-950/20 p-6 flex flex-col items-center justify-center text-center ${className}`}
        style={{ minHeight: height }}
      >
        <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-3">
          <AlertCircle className="w-6 h-6 text-amber-400" />
        </div>
        <h4 className="text-base font-semibold text-amber-200 mb-1">
          GPS Coordinates Unavailable
        </h4>
        <p className="text-sm text-slate-300 max-w-md mb-3">
          The reporting device did not provide precise GPS coordinates (e.g., underground station or location permissions declined).
        </p>
        {incident.addressText && (
          <div className="bg-slate-900/80 px-4 py-2 rounded-lg border border-slate-700 text-xs text-slate-300">
            <span className="font-medium text-slate-400">Reported Address/Location:</span>{' '}
            {incident.addressText}
          </div>
        )}
      </div>
    );
  }

  const incidentCoords: [number, number] = [
    incident.coordinates.lat,
    incident.coordinates.lng,
  ];

  const hasResponderLoc = Boolean(
    incident.assignedResponderLocation?.lat && incident.assignedResponderLocation?.lng
  );

  const responderCoords: [number, number] | null = hasResponderLoc
    ? [
        incident.assignedResponderLocation!.lat,
        incident.assignedResponderLocation!.lng,
      ]
    : null;

  const responderIsStale = incident.assignedResponderLocation
    ? isLocationStale(incident.assignedResponderLocation.lastUpdated)
    : false;

  return (
    <div className={`relative w-full rounded-xl overflow-hidden border border-slate-700/80 shadow-2xl ${className}`} style={{ height }}>
      <MapContainer
        center={incidentCoords}
        zoom={15}
        scrollWheelZoom={true}
        className="w-full h-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Eligibility Radius Ring (300m or 500m) */}
        <Circle
          center={incidentCoords}
          radius={incident.eligibilityRadiusMeters}
          pathOptions={{
            color: incident.eligibilityRadiusMeters > 300 ? '#f59e0b' : '#ef4444',
            fillColor: incident.eligibilityRadiusMeters > 300 ? '#f59e0b' : '#ef4444',
            fillOpacity: 0.12,
            weight: 1.5,
            dashArray: '4, 6',
          }}
        />

        {/* Incident Marker */}
        <Marker
          position={incidentCoords}
          icon={getIncidentIcon(incident.category, incident.severity)}
        >
          <Popup className="custom-popup">
            <div className="p-1 space-y-1.5 text-slate-900">
              <div className="flex items-center justify-between gap-2 border-b pb-1">
                <span className="font-bold text-xs uppercase tracking-wide text-red-600">
                  {incident.category} EMERGENCY
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-semibold">
                  {incident.severity}
                </span>
              </div>
              <p className="text-xs text-gray-700 leading-snug">
                {incident.addressText || 'Reported Incident Location'}
              </p>
              <div className="text-[11px] text-gray-500 space-y-0.5">
                <div>Status: <strong className="text-gray-800">{incident.status}</strong></div>
                <div>Reported: {formatDateTime(incident.createdAt)} ({formatRelativeTime(incident.createdAt)})</div>
                <div>Alert Radius: <strong>{incident.eligibilityRadiusMeters}m</strong></div>
              </div>
            </div>
          </Popup>
        </Marker>

        {/* Assigned Responder Marker & Straight-line path */}
        {responderCoords && incident.assignedResponderLocation && (
          <>
            <Marker
              position={responderCoords}
              icon={getResponderIcon(
                incident.assignedResponderCategory || 'COMMUNITY',
                false,
                responderIsStale
              )}
            >
              <Popup>
                <div className="p-1 text-slate-900 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1 text-blue-700">
                    <Shield className="w-3.5 h-3.5" />
                    {incident.assignedResponderName || 'Assigned Responder'}
                  </div>
                  <div>Category: <strong>{incident.assignedResponderCategory}</strong></div>
                  <div>
                    Telemetry:{' '}
                    {responderIsStale ? (
                      <span className="text-amber-600 font-semibold">Stale (&gt;60s)</span>
                    ) : (
                      <span className="text-emerald-600 font-semibold">Live GPS Active</span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    Updated: {formatRelativeTime(incident.assignedResponderLocation.lastUpdated)}
                  </div>
                </div>
              </Popup>
            </Marker>

            {/* Straight-line connector */}
            <Polyline
              positions={[incidentCoords, responderCoords]}
              pathOptions={{
                color: '#0284c7',
                weight: 2.5,
                dashArray: '6, 8',
                opacity: 0.8,
              }}
            />
          </>
        )}
      </MapContainer>

      {/* Floating Status / Distance Pill */}
      {hasResponderLoc && (
        <div className="absolute top-3 left-3 z-[1000] bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-700 shadow-lg text-xs flex items-center gap-2">
          <Navigation className="w-4 h-4 text-cyan-400" />
          <span>
            Responder Distance:{' '}
            <strong className="text-cyan-300">
              {formatDistance(incident.distanceMeters)}
            </strong>
          </span>
          {responderIsStale && (
            <span className="text-[10px] text-amber-400 flex items-center gap-1 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-600/30">
              <Clock className="w-3 h-3" /> Stale GPS
            </span>
          )}
        </div>
      )}

      {/* Legend Positioned at Bottom Right */}
      <div className="absolute bottom-3 right-3 z-[1000]">
        <MapLegend />
      </div>
    </div>
  );
};
