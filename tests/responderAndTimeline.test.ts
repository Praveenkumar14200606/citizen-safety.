import { describe, it, expect } from 'vitest';
import { responderService } from '../src/services/responders/responderService';
import { timelineService } from '../src/services/timeline/timelineService';

describe('Responder Telemetry & Incident Activity Timeline', () => {
  const responderId = 'resp-001-com';

  it('updates responder availability status', async () => {
    const success = await responderService.updateAvailability(responderId, 'ON_DUTY');
    expect(success).toBe(true);

    const profile = await responderService.getResponderProfile(responderId);
    expect(profile?.availabilityStatus).toBe('ON_DUTY');
  });

  it('updates live responder location coordinates and notifies listeners', async () => {
    let receivedLoc: any = null;
    const unsubscribe = responderService.subscribeToLocation(responderId, (loc) => {
      receivedLoc = loc;
    });

    const newLoc = await responderService.updateLiveLocation(responderId, {
      lat: 37.7788,
      lng: -122.4166,
      accuracyMeters: 4,
    });

    expect(receivedLoc).not.toBeNull();
    expect(receivedLoc.lat).toBe(37.7788);
    expect(receivedLoc.lng).toBe(-122.4166);
    expect(receivedLoc.isStale).toBe(false);

    unsubscribe();
  });

  it('fetches recorded timeline events for an incident', async () => {
    const events = await timelineService.getIncidentTimeline('inc-001-med');
    expect(events.length).toBeGreaterThan(0);

    const eventTypes = events.map((e) => e.eventType);
    expect(eventTypes).toContain('INCIDENT_CREATED');
  });

  it('records a new timeline event and delivers via subscription', async () => {
    let notifiedEvents: any[] = [];
    const unsubscribe = timelineService.subscribeToTimeline('inc-001-med', (events) => {
      notifiedEvents = events;
    });

    const recorded = await timelineService.recordEvent({
      incidentId: 'inc-001-med',
      eventType: 'RESPONDER_ARRIVED',
      title: 'Responder Arrived On Scene',
      description: 'First aid kit deployed.',
      timestamp: new Date().toISOString(),
      actor: {
        id: responderId,
        name: 'Alex Rivera',
        role: 'RESPONDER',
      },
    });

    expect(recorded.id).toBeDefined();
    expect(notifiedEvents.some((e) => e.eventType === 'RESPONDER_ARRIVED')).toBe(true);

    unsubscribe();
  });
});
