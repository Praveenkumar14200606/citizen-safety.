import { Coordinates } from '../types';

/**
 * Calculates straight-line distance in meters using Haversine formula
 */
export function calculateDistanceMeters(
  coord1: Coordinates,
  coord2: Coordinates
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (coord1.lat * Math.PI) / 180;
  const phi2 = (coord2.lat * Math.PI) / 180;
  const deltaPhi = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const deltaLambda = ((coord2.lng - coord1.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Human-readable distance formatting
 */
export function formatDistance(meters?: number | null): string {
  if (meters === undefined || meters === null || isNaN(meters)) {
    return 'Distance unavailable';
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Checks if a live location ping is stale (> 60 seconds old)
 */
export function isLocationStale(
  lastUpdatedIso: string,
  thresholdSeconds = 60
): boolean {
  if (!lastUpdatedIso) return true;
  const timeDiffMs = Date.now() - new Date(lastUpdatedIso).getTime();
  return timeDiffMs > thresholdSeconds * 1000;
}

/**
 * Safe, privacy-preserving Google Maps / OpenStreetMap link for incident coordinates
 */
export function generateAuthorizedMapLink(
  lat: number,
  lng: number,
  incidentId: string
): string {
  // Uses standard coordinates navigation link
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&ref=${encodeURIComponent(
    incidentId
  )}`;
}
