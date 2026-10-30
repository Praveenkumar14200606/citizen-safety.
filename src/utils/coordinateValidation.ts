/**
 * Coordinate validation utility.
 * Strictly checks numerical bounds for latitude [-90, 90] and longitude [-180, 180].
 * Rejects missing, null, undefined, NaN, or infinite coordinates.
 */

export interface CoordinateValidationResult {
  valid: boolean;
  error?: string;
}

export function validateCoordinates(
  latitude: unknown,
  longitude: unknown
): CoordinateValidationResult {
  if (latitude === null || latitude === undefined || typeof latitude !== "number") {
    return { valid: false, error: "Latitude must be a valid number." };
  }

  if (longitude === null || longitude === undefined || typeof longitude !== "number") {
    return { valid: false, error: "Longitude must be a valid number." };
  }

  if (Number.isNaN(latitude) || !Number.isFinite(latitude)) {
    return { valid: false, error: "Latitude cannot be NaN or infinite." };
  }

  if (Number.isNaN(longitude) || !Number.isFinite(longitude)) {
    return { valid: false, error: "Longitude cannot be NaN or infinite." };
  }

  if (latitude < -90.0 || latitude > 90.0) {
    return { valid: false, error: `Latitude ${latitude} is out of range [-90, 90].` };
  }

  if (longitude < -180.0 || longitude > 180.0) {
    return { valid: false, error: `Longitude ${longitude} is out of range [-180, 180].` };
  }

  return { valid: true };
}
