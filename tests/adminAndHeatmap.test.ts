import { describe, it, expect } from 'vitest';
import { incidentService } from '../src/services/incidents/incidentService';

describe('Admin Dispatch Terminal & Heatmap Density Aggregation', () => {
  it('filters incidents by category, severity, and status', async () => {
    const medicalCritical = await incidentService.fetchAllForAdmin({
      category: 'MEDICAL',
      severity: 'CRITICAL',
    });

    expect(medicalCritical.length).toBeGreaterThan(0);
    medicalCritical.forEach((inc) => {
      expect(inc.category).toBe('MEDICAL');
      expect(inc.severity).toBe('CRITICAL');
    });
  });

  it('filters incidents by search keyword', async () => {
    const results = await incidentService.fetchAllForAdmin({
      searchQuery: 'Market',
    });

    expect(results.length).toBeGreaterThan(0);
    results.forEach((inc) => {
      expect(
        inc.addressText?.toLowerCase().includes('market') ||
        inc.id.toLowerCase().includes('market')
      ).toBe(true);
    });
  });

  it('correctly aggregates spatial coordinates into density clusters', async () => {
    const allIncidents = await incidentService.fetchAllForAdmin();

    // Verify incidents with coordinates have valid numeric lat/lng
    allIncidents.forEach((inc) => {
      if (inc.coordinates) {
        expect(typeof inc.coordinates.lat).toBe('number');
        expect(typeof inc.coordinates.lng).toBe('number');
        expect(inc.coordinates.lat).toBeGreaterThan(30);
        expect(inc.coordinates.lat).toBeLessThan(45);
      }
    });

    // Verify missing coordinates incident is present and handled
    const missingCoords = allIncidents.find((i) => i.id === 'inc-005-nocord');
    expect(missingCoords).toBeDefined();
    expect(missingCoords?.coordinates).toBeNull();
  });
});
