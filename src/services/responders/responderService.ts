import {
  ResponderProfile,
  ResponderAvailability,
  LiveLocation,
  LocationPermissionState,
} from '../../types';
import { supabase, isLiveBackendConfigured } from '../supabaseClient';
import { INITIAL_DEMO_RESPONDERS } from '../mockData';
import { isLocationStale } from '../../utils/geo';

let mockResponders: ResponderProfile[] = [...INITIAL_DEMO_RESPONDERS];
type LocationListener = (location: LiveLocation) => void;
const locationListeners: Map<string, Set<LocationListener>> = new Map();

export const responderService = {
  /**
   * Retrieves responder profile.
   * Note: Trust category (COMMUNITY vs VERIFIED) is strictly read-only and backend-governed.
   */
  async getResponderProfile(responderId: string): Promise<ResponderProfile | null> {
    if (isLiveBackendConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('responder_profiles')
          .select('*')
          .eq('id', responderId)
          .single();

        if (error) return null;
        return data as ResponderProfile;
      } catch (err) {
        console.warn('Live fetch responder failed, using mock:', err);
      }
    }

    const found = mockResponders.find((r) => r.id === responderId);
    return found ? { ...found } : null;
  },

  /**
   * Updates availability state (AVAILABLE, UNAVAILABLE, ON_DUTY)
   */
  async updateAvailability(
    responderId: string,
    status: ResponderAvailability
  ): Promise<boolean> {
    if (isLiveBackendConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('responder_profiles')
          .update({ availability_status: status, updated_at: new Date().toISOString() })
          .eq('id', responderId);

        if (error) throw error;
        return true;
      } catch (err) {
        console.warn('Live update availability failed:', err);
      }
    }

    const responder = mockResponders.find((r) => r.id === responderId);
    if (responder) {
      responder.availabilityStatus = status;
      return true;
    }
    return false;
  },

  /**
   * Updates location permission state
   */
  async updateLocationPermission(
    responderId: string,
    perm: LocationPermissionState
  ): Promise<void> {
    const responder = mockResponders.find((r) => r.id === responderId);
    if (responder) {
      responder.locationPermission = perm;
    }
  },

  /**
   * Pushes a new live GPS coordinate ping.
   * Enforces freshness checking and alerts subscribers.
   */
  async updateLiveLocation(
    responderId: string,
    coords: { lat: number; lng: number; accuracyMeters?: number; heading?: number }
  ): Promise<LiveLocation> {
    const liveLoc: LiveLocation = {
      lat: coords.lat,
      lng: coords.lng,
      accuracyMeters: coords.accuracyMeters,
      heading: coords.heading,
      lastUpdated: new Date().toISOString(),
      isStale: false,
    };

    if (isLiveBackendConfigured && supabase) {
      try {
        await supabase.from('responder_locations').upsert({
          responder_id: responderId,
          lat: coords.lat,
          lng: coords.lng,
          accuracy_meters: coords.accuracyMeters,
          heading: coords.heading,
          updated_at: liveLoc.lastUpdated,
        });
      } catch (err) {
        console.warn('Live location push failed:', err);
      }
    }

    // Update in-memory responder
    const responder = mockResponders.find((r) => r.id === responderId);
    if (responder) {
      responder.currentLocation = liveLoc;
    }

    // Notify active location listeners
    const listeners = locationListeners.get(responderId);
    if (listeners) {
      listeners.forEach((fn) => fn(liveLoc));
    }

    return liveLoc;
  },

  /**
   * Subscribes to live location pings of a specific responder with unmount cleanup
   */
  subscribeToLocation(
    responderId: string,
    callback: LocationListener
  ): () => void {
    if (!locationListeners.has(responderId)) {
      locationListeners.set(responderId, new Set());
    }
    locationListeners.get(responderId)!.add(callback);

    // Immediately emit current location if available
    const responder = mockResponders.find((r) => r.id === responderId);
    if (responder && responder.currentLocation) {
      const isStale = isLocationStale(responder.currentLocation.lastUpdated);
      callback({ ...responder.currentLocation, isStale });
    }

    let supabaseChannel: any = null;
    if (isLiveBackendConfigured && supabase) {
      supabaseChannel = supabase
        .channel(`responder_loc:${responderId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'responder_locations',
            filter: `responder_id=eq.${responderId}`,
          },
          (payload: any) => {
            const loc: LiveLocation = {
              lat: payload.new.lat,
              lng: payload.new.lng,
              accuracyMeters: payload.new.accuracy_meters,
              heading: payload.new.heading,
              lastUpdated: payload.new.updated_at,
              isStale: isLocationStale(payload.new.updated_at),
            };
            callback(loc);
          }
        )
        .subscribe();
    }

    // Cleanup function
    return () => {
      const set = locationListeners.get(responderId);
      if (set) {
        set.delete(callback);
      }
      if (supabaseChannel && supabase) {
        supabase.removeChannel(supabaseChannel);
      }
    };
  },
};
