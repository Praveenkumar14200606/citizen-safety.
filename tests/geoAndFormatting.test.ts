import { describe, it, expect } from 'vitest';
import {
  calculateDistanceMeters,
  formatDistance,
  isLocationStale,
  generateAuthorizedMapLink,
} from '../src/utils/geo';
import {
  formatRelativeTime,
  maskCitizenName,
  sanitizePhoneNumber,
} from '../src/utils/formatting';

describe('Geospatial & Formatting Utilities', () => {
  it('correctly calculates Haversine straight-line distance between two coordinates', () => {
    // SF Civic Center to Powell St Station (~1.1 km)
    const c1 = { lat: 37.7793, lng: -122.4193 };
    const c2 = { lat: 37.7844, lng: -122.408 };
    const distance = calculateDistanceMeters(c1, c2);

    expect(distance).toBeGreaterThan(1000);
    expect(distance).toBeLessThan(1300);
  });

  it('formats distance in meters and kilometers correctly', () => {
    expect(formatDistance(250)).toBe('250 m');
    expect(formatDistance(1420)).toBe('1.4 km');
    expect(formatDistance(null)).toBe('Distance unavailable');
  });

  it('detects fresh vs stale GPS telemetry based on 60 second threshold', () => {
    const recentIso = new Date(Date.now() - 1000 * 20).toISOString(); // 20s ago
    const staleIso = new Date(Date.now() - 1000 * 95).toISOString(); // 95s ago

    expect(isLocationStale(recentIso, 60)).toBe(false);
    expect(isLocationStale(staleIso, 60)).toBe(true);
  });

  it('generates authorized map links with incident reference token', () => {
    const url = generateAuthorizedMapLink(37.775, -122.418, 'inc-test-99');
    expect(url).toContain('37.775,-122.418');
    expect(url).toContain('ref=inc-test-99');
  });

  it('masks citizen names for privacy preservation', () => {
    expect(maskCitizenName('David Kim')).toBe('David K.');
    expect(maskCitizenName('')).toBe('Citizen in need');
  });

  it('sanitizes telephone numbers to standard E.164 without dashes or spaces', () => {
    expect(sanitizePhoneNumber('(415) 555-0192')).toBe('+14155550192');
    expect(sanitizePhoneNumber('+44 20 7946 0991')).toBe('+442079460991');
  });

  it('formats relative elapsed time accurately', () => {
    const nowIso = new Date().toISOString();
    expect(formatRelativeTime(nowIso)).toBe('Just now');

    const twoMinutesAgo = new Date(Date.now() - 1000 * 120).toISOString();
    expect(formatRelativeTime(twoMinutesAgo)).toBe('2m ago');
  });
});
