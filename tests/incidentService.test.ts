import { describe, it, expect, beforeEach } from 'vitest';
import { incidentService } from '../src/services/incidents/incidentService';
import { ResponderTrustCategory } from '../src/types';

describe('Incident Service & Atomic Claim Handling', () => {
  const responderAlex = {
    id: 'resp-alex-001',
    fullName: 'Alex Rivera',
    trustCategory: 'COMMUNITY' as ResponderTrustCategory,
  };

  const responderOfficer = {
    id: 'resp-chen-002',
    fullName: 'Officer Chen',
    trustCategory: 'VERIFIED' as ResponderTrustCategory,
  };

  it('filters incidents within coverage radius', async () => {
    const responderLoc = { lat: 37.7765, lng: -122.4175 };
    const eligible = await incidentService.fetchEligibleIncidents(
      responderLoc,
      'COMMUNITY'
    );

    expect(eligible.length).toBeGreaterThan(0);
    // Incidents returned must be active (REPORTED or ASSIGNED)
    eligible.forEach((inc) => {
      expect(['REPORTED', 'ASSIGNED']).toContain(inc.status);
    });
  });

  it('atomically claims an available reported incident', async () => {
    // inc-001-med starts as REPORTED
    const claimRes = await incidentService.claimIncident('inc-001-med', responderAlex);

    expect(claimRes.success).toBe(true);
    expect(claimRes.statusCode).toBe(200);
    expect(claimRes.incident?.status).toBe('ASSIGNED');
    expect(claimRes.incident?.assignedResponderId).toBe(responderAlex.id);
  });

  it('rejects duplicate/concurrent claim with 409 ALREADY_COVERED conflict', async () => {
    // Attempting to claim inc-001-med again with a different responder
    const conflictRes = await incidentService.claimIncident(
      'inc-001-med',
      responderOfficer
    );

    expect(conflictRes.success).toBe(false);
    expect(conflictRes.statusCode).toBe(409);
    expect(conflictRes.error).toBe('ALREADY_COVERED');
    expect(conflictRes.message).toContain('already claimed');
  });

  it('allows assigned responder to transition status: ASSIGNED -> ON_SCENE', async () => {
    const updateRes = await incidentService.updateIncidentStatus(
      'inc-001-med',
      responderAlex.id,
      'ON_SCENE'
    );

    expect(updateRes.success).toBe(true);

    const updated = await incidentService.fetchIncidentById('inc-001-med');
    expect(updated?.status).toBe('ON_SCENE');
  });

  it('rejects unauthorized responder attempting to update status', async () => {
    // Officer Chen is not assigned to inc-001-med
    const rejectRes = await incidentService.updateIncidentStatus(
      'inc-001-med',
      'unauthorized-hacker-id',
      'RESOLVED'
    );

    expect(rejectRes.success).toBe(false);
    expect(rejectRes.error).toBe('UNAUTHORIZED');
  });

  it('allows assigned responder to transition status: ON_SCENE -> RESOLVED', async () => {
    const resolveRes = await incidentService.updateIncidentStatus(
      'inc-001-med',
      responderAlex.id,
      'RESOLVED'
    );

    expect(resolveRes.success).toBe(true);

    const resolved = await incidentService.fetchIncidentById('inc-001-med');
    expect(resolved?.status).toBe('RESOLVED');
  });

  it('subscribes to real-time incident changes and cleans up on unmount', () => {
    let callCount = 0;
    const unsubscribe = incidentService.subscribeToIncidents((incidents) => {
      callCount += 1;
    });

    expect(callCount).toBe(1);

    // Call cleanup
    unsubscribe();

    // Trigger an escalation
    incidentService.escalateRadius('inc-002-fire');

    // Should not receive subsequent callbacks after unsubscribe
    expect(callCount).toBe(1);
  });
});
