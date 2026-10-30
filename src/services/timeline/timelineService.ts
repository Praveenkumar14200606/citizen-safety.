import { TimelineEvent, TimelineEventType } from '../../types';
import { supabase, isLiveBackendConfigured } from '../supabaseClient';
import { INITIAL_DEMO_TIMELINE } from '../mockData';

let mockTimeline: TimelineEvent[] = [...INITIAL_DEMO_TIMELINE];
type TimelineListener = (events: TimelineEvent[]) => void;
const listeners: Map<string, Set<TimelineListener>> = new Map();

function notifyListeners(incidentId: string) {
  const events = mockTimeline
    .filter((e) => e.incidentId === incidentId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const set = listeners.get(incidentId);
  if (set) {
    set.forEach((fn) => fn(events));
  }
}

export const timelineService = {
  /**
   * Fetches timeline events for an incident
   */
  async getIncidentTimeline(incidentId: string): Promise<TimelineEvent[]> {
    if (isLiveBackendConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('incident_timeline_events')
          .select('*')
          .eq('incident_id', incidentId)
          .order('timestamp', { ascending: false });

        if (error) throw error;
        return (data as TimelineEvent[]) || [];
      } catch (err) {
        console.warn('Live fetch timeline failed, using mock store:', err);
      }
    }

    return mockTimeline
      .filter((e) => e.incidentId === incidentId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  /**
   * Records a new timeline audit event
   */
  async recordEvent(event: Omit<TimelineEvent, 'id'>): Promise<TimelineEvent> {
    const newEvent: TimelineEvent = {
      ...event,
      id: `time-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };

    if (isLiveBackendConfigured && supabase) {
      try {
        await supabase.from('incident_timeline_events').insert({
          incident_id: newEvent.incidentId,
          event_type: newEvent.eventType,
          title: newEvent.title,
          description: newEvent.description,
          actor_id: newEvent.actor?.id,
          actor_name: newEvent.actor?.name,
          actor_role: newEvent.actor?.role,
          timestamp: newEvent.timestamp,
        });
      } catch (err) {
        console.warn('Live timeline insert failed:', err);
      }
    }

    mockTimeline.unshift(newEvent);
    notifyListeners(newEvent.incidentId);
    return newEvent;
  },

  /**
   * Subscribes to timeline changes for an incident with unmount cleanup
   */
  subscribeToTimeline(
    incidentId: string,
    callback: TimelineListener
  ): () => void {
    if (!listeners.has(incidentId)) {
      listeners.set(incidentId, new Set());
    }
    listeners.get(incidentId)!.add(callback);

    // Immediately emit current events synchronously
    const current = mockTimeline
      .filter((e) => e.incidentId === incidentId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    callback(current);

    let supabaseChannel: any = null;
    if (isLiveBackendConfigured && supabase) {
      supabaseChannel = supabase
        .channel(`timeline:${incidentId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'incident_timeline_events',
            filter: `incident_id=eq.${incidentId}`,
          },
          async () => {
            const updated = await this.getIncidentTimeline(incidentId);
            callback(updated);
          }
        )
        .subscribe();
    }

    return () => {
      const set = listeners.get(incidentId);
      if (set) {
        set.delete(callback);
      }
      if (supabaseChannel && supabase) {
        supabase.removeChannel(supabaseChannel);
      }
    };
  },
};
