import L from 'leaflet';
import { IncidentCategory, IncidentSeverity, ResponderTrustCategory } from '../../types';

export const getIncidentIcon = (category: IncidentCategory, severity: IncidentSeverity) => {
  let color = '#ef4444'; // Red default
  if (severity === 'CRITICAL') color = '#dc2626';
  else if (severity === 'HIGH') color = '#ea580c';
  else if (severity === 'MEDIUM') color = '#eab308';
  else if (severity === 'LOW') color = '#3b82f6';

  const isCritical = severity === 'CRITICAL' || severity === 'HIGH';

  return L.divIcon({
    className: 'custom-map-marker',
    html: `
      <div class="relative flex items-center justify-center">
        ${
          isCritical
            ? `<div class="absolute -inset-2 rounded-full animate-ping opacity-75" style="background-color: ${color}"></div>`
            : ''
        }
        <div class="relative z-10 w-9 h-9 rounded-full flex items-center justify-center text-white shadow-xl ring-2 ring-white" style="background-color: ${color}">
          <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 10h2v4h-2zm0 6h2v2h-2z"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
};

export const getResponderIcon = (
  trustCategory: ResponderTrustCategory,
  isOwnLocation = false,
  isStale = false
) => {
  const bgColor = isStale ? '#9ca3af' : trustCategory === 'VERIFIED' ? '#10b981' : '#3b82f6';
  const ringColor = isOwnLocation ? 'ring-4 ring-cyan-400' : 'ring-2 ring-white';

  return L.divIcon({
    className: 'custom-responder-marker',
    html: `
      <div class="relative flex items-center justify-center">
        ${
          isOwnLocation && !isStale
            ? `<div class="absolute -inset-3 rounded-full bg-cyan-400 opacity-40 animate-ping"></div>`
            : ''
        }
        <div class="relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-xl ${ringColor}" style="background-color: ${bgColor}">
          <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};
