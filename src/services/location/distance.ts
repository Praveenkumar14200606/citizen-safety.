/**
 * Geospatial Haversine Distance Utility.
 * Computes the great-circle distance between two GPS coordinates in meters.
 * Validates coordinates to prevent NaN or out-of-bounds calculations.
 */

import { validateCoordinates } from "../../utils/coordinateValidation.js";

const EARTH_RADIUS_METERS = 6371000.0;

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const v1 = validateCoordinates(lat1, lon1);
  if (!v1.valid) {
    throw new Error(`Invalid source coordinate: ${v1.error}`);
  }

  const v2 = validateCoordinates(lat2, lon2);
  if (!v2.valid) {
    throw new Error(`Invalid destination coordinate: ${v2.error}`);
  }

  const toRad = (degrees: number) => (degrees * Math.PI) / 180.0;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2.0) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2.0) ** 2;

  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));

  return Math.round(EARTH_RADIUS_METERS * c * 100) / 100;
}
