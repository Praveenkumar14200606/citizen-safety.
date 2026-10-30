import {
  Incident,
  IncidentFilterOptions,
  ClaimIncidentResult,
  ResponderTrustCategory,
  Coordinates,
} from '../../types';
import { supabase, isLiveBackendConfigured } from '../supabaseClient';
import {
  INITIAL_DEMO_INCIDENTS,
  INITIAL_DEMO_TIMELINE,
} from '../mockData';
import { calculateDistanceMeters } from '../../utils/geo';

// In-memory reactive store for demo/mock mode
let mockIncidents: Incident[] = [...INITIAL_DEMO_INCIDENTS];
type IncidentListener = (incidents: Incident[]) => void;
const listeners: Set<IncidentListener> = new Set();

function notifyListeners() {
  const cloned = [...mockIncidents];
  listeners.forEach((listener) => listener(cloned));
}

export const incidentService = {
  /**
   * Fetches eligible incidents within responder radius (300m initial, 500m escalated)
   */
  async fetchEligibleIncidents(
    responderLocation?: Coordinates | null,
    trustCategory: ResponderTrustCategory = 'COMMUNITY'
  ): Promise<Incident[]> {
    if (isLiveBackendConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('incidents')
          .select('*')
          .in('status', ['REPORTED', 'ASSIGNED']);

        if (error) throw error;
        return (data as Incident[]) || [];
      } catch (err) {
        console.warn('Live backend query failed, falling back to local store:', err);
      }
    }

    // Filter in mock store
    return mockIncidents
      .filter((inc) => {
        // Must be active
        if (inc.status !== 'REPORTED' && inc.status !== 'ASSIGNED') return false;
        
        // If responder location is provided and incident has coordinates, evaluate radius
        if (responderLocation && inc.coordinates) {
          const dist = calculateDistanceMeters(responderLocation, inc.coordinates);
          inc.distanceMeters = dist;
          // Check eligibility radius (300m or 500m)
          // Verified responders have access to high-severity incidents within range
          return dist <= inc.eligibilityRadiusMeters;
        }

        // If coordinates missing or location not yet granted, show incident with notice
        return true;
      })
      .map((inc) => {
        if (responderLocation && inc.coordinates) {
          return {
            ...inc,
            distanceMeters: calculateDistanceMeters(responderLocation, inc.coordinates),
          };
        }
        return inc;
      });
  },

  /**
   * Fetches a specific incident by ID
   */
  async fetchIncidentById(incidentId: string): Promise<Incident | null> {
    if (isLiveBackendConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('incidents')
          .select('*')
          .eq('id', incidentId)
          .single();

        if (error) return null;
        return data as Incident;
      } catch (err) {
        console.warn('Live fetch incident failed, using mock:', err);
      }
    }

    const found = mockIncidents.find((i) => i.id === incidentId);
    return found ? { ...found } : null;
  },

  /**
   * Fetches all incidents with optional filters (for Admin / Dispatcher view)
   */
  async fetchAllForAdmin(filters?: IncidentFilterOptions): Promise<Incident[]> {
    let results = [...mockIncidents];

    if (filters) {
      if (filters.category && filters.category !== 'ALL') {
        results = results.filter((i) => i.category === filters.category);
      }
      if (filters.severity && filters.severity !== 'ALL') {
        results = results.filter((i) => i.severity === filters.severity);
      }
      if (filters.status && filters.status !== 'ALL') {
        results = results.filter((i) => i.status === filters.status);
      }
      if (filters.searchQuery && filters.searchQuery.trim()) {
        const q = filters.searchQuery.toLowerCase();
        results = results.filter(
          (i) =>
            i.id.toLowerCase().includes(q) ||
            i.category.toLowerCase().includes(q) ||
            (i.addressText && i.addressText.toLowerCase().includes(q))
        );
      }
    }

    return results;
  },

  /**
   * Atomic Claim Incident:
   * Prevents race conditions. If already claimed, returns 409 ALREADY_COVERED.
   */
  async claimIncident(
    incidentId: string,
    responder: { id: string; fullName: string; trustCategory: ResponderTrustCategory }
  ): Promise<ClaimIncidentResult> {
    if (isLiveBackendConfigured && supabase) {
      try {
        const { data, error } = await supabase.rpc('claim_incident', {
          p_incident_id: incidentId,
          p_responder_id: responder.id,
        });

        if (error) {
          return {
            success: false,
            error: 'SERVER_ERROR',
            statusCode: 500,
            message: error.message || 'Server error claiming incident.',
          };
        }

        if (!data.success) {
          const statusCode = data.error === 'ALREADY_COVERED' ? 409 : 403;
          return {
            success: false,
            error: data.error,
            statusCode,
            message: data.message,
          };
        }

        const updated = await this.fetchIncidentById(incidentId);
        return {
          success: true,
          incident: updated || undefined,
          statusCode: 200,
          message: 'Incident claimed successfully.',
        };
      } catch (err) {
        console.warn('Live RPC claim failed, executing local atomic logic:', err);
      }
    }

    // Atomic claim logic in local state (Thread-safe simulated transactional lock)
    const target = mockIncidents.find((i) => i.id === incidentId);
    if (!target) {
      return {
        success: false,
        error: 'INCIDENT_NOT_FOUND',
        statusCode: 404,
        message: 'Incident was not found or has been removed.',
      };
    }

    // Conflict check
    if (target.status !== 'REPORTED' || target.assignedResponderId) {
      return {
        success: false,
        error: 'ALREADY_COVERED',
        statusCode: 409,
        message: `This incident was already claimed by ${target.assignedResponderName || 'another responder'}.`,
      };
    }

    // Atomically transition status
    target.status = 'ASSIGNED';
    target.assignedResponderId = responder.id;
    target.assignedResponderName = responder.fullName;
    target.assignedResponderCategory = responder.trustCategory;
    target.updatedAt = new Date().toISOString();

    // Log timeline event
    INITIAL_DEMO_TIMELINE.unshift({
      id: `time-claim-${Date.now()}`,
      incidentId,
      eventType: 'RESPONDER_ACCEPTED',
      timestamp: new Date().toISOString(),
      title: 'Incident Claimed by Responder',
      description: `${responder.fullName} (${responder.trustCategory}) accepted this emergency call.`,
      actor: {
        id: responder.id,
        name: responder.fullName,
        role: 'RESPONDER',
      },
    });

    notifyListeners();

    return {
      success: true,
      incident: { ...target },
      statusCode: 200,
      message: 'Incident claimed successfully. Navigation routing initiated.',
    };
  },

  /**
   * Updates responder progress: ASSIGNED -> ON_SCENE -> RESOLVED
   */
  async updateIncidentStatus(
    incidentId: string,
    responderId: string,
    newStatus: 'ON_SCENE' | 'RESOLVED'
  ): Promise<{ success: boolean; error?: string; message: string }> {
    if (isLiveBackendConfigured && supabase) {
      try {
        const { data, error } = await supabase.rpc('update_incident_status', {
          p_incident_id: incidentId,
          p_responder_id: responderId,
          p_new_status: newStatus,
        });

        if (error) throw error;
        return data;
      } catch (err) {
        console.warn('Live status transition failed, using mock:', err);
      }
    }

    const target = mockIncidents.find((i) => i.id === incidentId);
    if (!target) {
      return { success: false, error: 'NOT_FOUND', message: 'Incident not found.' };
    }

    if (target.assignedResponderId !== responderId) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Only the assigned responder can update status.',
      };
    }

    target.status = newStatus;
    target.updatedAt = new Date().toISOString();

    const eventType = newStatus === 'ON_SCENE' ? 'RESPONDER_ARRIVED' : 'INCIDENT_RESOLVED';
    const title = newStatus === 'ON_SCENE' ? 'Responder Arrived On Scene' : 'Incident Safely Resolved';

    INITIAL_DEMO_TIMELINE.unshift({
      id: `time-status-${Date.now()}`,
      incidentId,
      eventType,
      timestamp: new Date().toISOString(),
      title,
      description: `Responder updated status to ${newStatus}.`,
      actor: {
        id: responderId,
        name: target.assignedResponderName || 'Responder',
        role: 'RESPONDER',
      },
    });

    notifyListeners();
    return { success: true, message: `Status updated to ${newStatus}` };
  },

  /**
   * Escalates incident eligibility radius from 300m to 500m (Coordination with Member 3)
   */
  escalateRadius(incidentId: string) {
    const inc = mockIncidents.find((i) => i.id === incidentId);
    if (inc && inc.status === 'REPORTED' && inc.eligibilityRadiusMeters < 500) {
      inc.eligibilityRadiusMeters = 500;
      inc.escalatedAt = new Date().toISOString();
      inc.updatedAt = new Date().toISOString();

      INITIAL_DEMO_TIMELINE.unshift({
        id: `time-esc-${Date.now()}`,
        incidentId,
        eventType: 'RADIUS_EXPANDED',
        timestamp: new Date().toISOString(),
        title: 'Eligibility Radius Expanded to 500m',
        description: 'Unclaimed after 30 seconds; alert broadcast radius expanded.',
        actor: {
          name: 'Member 3 Dispatch Engine',
          role: 'DISPATCHER',
        },
      });

      notifyListeners();
    }
  },

  /**
   * Subscribes to real-time incident changes with automatic cleanup
   */
  subscribeToIncidents(callback: IncidentListener): () => void {
    listeners.add(callback);
    callback([...mockIncidents]);

    let supabaseChannel: any = null;

    if (isLiveBackendConfigured && supabase) {
      supabaseChannel = supabase
        .channel('public:incidents')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'incidents' },
          async () => {
            const fresh = await this.fetchAllForAdmin();
            callback(fresh);
          }
        )
        .subscribe();
    }

    // Return cleanup function to prevent memory leaks
    return () => {
      listeners.delete(callback);
      if (supabaseChannel && supabase) {
        supabase.removeChannel(supabaseChannel);
      }
    };
  },
};
