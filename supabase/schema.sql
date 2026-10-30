-- ============================================================================
-- Supabase PostgreSQL Schema & Realtime Setup
-- Citizen Safety & Emergency Response Platform
-- Shared Schema Contract for Member 2 & Member 4 (Maps & Notifications)
-- ============================================================================

-- Enable PostGIS if available, or use standard numeric lat/lng
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Incidents Table
CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category VARCHAR(50) NOT NULL, -- 'MEDICAL', 'FIRE', 'CRIME', 'ACCIDENT', 'NATURAL_DISASTER', 'GENERAL_SOS'
    severity VARCHAR(20) NOT NULL DEFAULT 'HIGH', -- 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'
    status VARCHAR(30) NOT NULL DEFAULT 'REPORTED', -- 'REPORTED', 'ASSIGNED', 'ON_SCENE', 'RESOLVED', 'CANCELLED'
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    address_text TEXT,
    reporter_id UUID NOT NULL,
    reporter_masked_name VARCHAR(100) DEFAULT 'Citizen in need',
    assigned_responder_id UUID,
    assigned_responder_name VARCHAR(100),
    assigned_responder_category VARCHAR(20), -- 'COMMUNITY' | 'VERIFIED'
    eligibility_radius_meters INTEGER NOT NULL DEFAULT 300,
    escalated_at TIMESTAMPTZ,
    ai_classification JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Responder Profiles Table
CREATE TABLE IF NOT EXISTS public.responder_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(30),
    trust_category VARCHAR(20) NOT NULL DEFAULT 'COMMUNITY', -- 'COMMUNITY' | 'VERIFIED'
    verification_badge VARCHAR(50),
    certifications TEXT[] DEFAULT '{}',
    availability_status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'UNAVAILABLE', 'ON_DUTY'
    location_permission VARCHAR(20) NOT NULL DEFAULT 'PROMPT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Live Responder Locations Table
CREATE TABLE IF NOT EXISTS public.responder_locations (
    responder_id UUID PRIMARY KEY REFERENCES public.responder_profiles(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    accuracy_meters DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Incident Timeline Events Table
CREATE TABLE IF NOT EXISTS public.incident_timeline_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, 
    -- 'INCIDENT_CREATED', 'AI_TRIAGE_COMPLETED', 'CONTACT_ALERT_INITIATED', 
    -- 'RESPONDERS_NOTIFIED', 'RADIUS_EXPANDED', 'RESPONDER_ACCEPTED', 
    -- 'RESPONDER_ARRIVED', 'INCIDENT_RESOLVED', 'INCIDENT_CANCELLED'
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    actor_id UUID,
    actor_name VARCHAR(100),
    actor_role VARCHAR(30), -- 'CITIZEN', 'RESPONDER', 'AI_SYSTEM', 'DISPATCHER'
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Notifications Table (Idempotent & Deduplicated)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_id UUID NOT NULL,
    incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL, -- 'IN_APP', 'WHATSAPP', 'SMS'
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    location_link TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SENT', 'DELIVERED', 'FAILED', 'REQUIRES_USER_ACTION'
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    idempotency_key VARCHAR(120) UNIQUE, -- Prevents duplicate notifications
    provider_response TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

-- Indexes for high-performance geospatial queries & feed polling
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_coords ON public.incidents(lat, lng);
CREATE INDEX IF NOT EXISTS idx_timeline_incident_id ON public.incident_timeline_events(incident_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_idempotency ON public.notifications(idempotency_key);

-- ============================================================================
-- Atomic Claim Function (RPC)
-- Handles concurrency and prevents race conditions (409 ALREADY_COVERED)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.claim_incident(
    p_incident_id UUID,
    p_responder_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_incident RECORD;
    v_responder RECORD;
BEGIN
    -- 1. Fetch responder details
    SELECT * INTO v_responder 
    FROM public.responder_profiles 
    WHERE id = p_responder_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE, 
            'error', 'NOT_ELIGIBLE',
            'message', 'Responder profile not found or ineligible.'
        );
    END IF;

    -- 2. Lock the incident row to prevent concurrent race condition
    SELECT * INTO v_incident 
    FROM public.incidents 
    WHERE id = p_incident_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE, 
            'error', 'INCIDENT_NOT_FOUND',
            'message', 'Incident was not found or has been cancelled.'
        );
    END IF;

    -- 3. Check if incident is still claimable
    IF v_incident.status != 'REPORTED' OR v_incident.assigned_responder_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE, 
            'error', 'ALREADY_COVERED',
            'message', 'This incident has already been claimed by another responder.'
        );
    END IF;

    -- 4. Atomically claim the incident
    UPDATE public.incidents
    SET status = 'ASSIGNED',
        assigned_responder_id = v_responder.id,
        assigned_responder_name = v_responder.full_name,
        assigned_responder_category = v_responder.trust_category,
        updated_at = NOW()
    WHERE id = p_incident_id;

    -- 5. Set responder status to ON_DUTY
    UPDATE public.responder_profiles
    SET availability_status = 'ON_DUTY',
        updated_at = NOW()
    WHERE id = p_responder_id;

    -- 6. Insert timeline audit event
    INSERT INTO public.incident_timeline_events (
        incident_id,
        event_type,
        title,
        description,
        actor_id,
        actor_name,
        actor_role
    ) VALUES (
        p_incident_id,
        'RESPONDER_ACCEPTED',
        'Incident Accepted by Responder',
        v_responder.full_name || ' (' || v_responder.trust_category || ') has accepted this emergency.',
        v_responder.id,
        v_responder.full_name,
        'RESPONDER'
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Incident claimed successfully.'
    );
END;
$$;

-- ============================================================================
-- Status Transition Function (RPC)
-- ASSIGNED -> ON_SCENE -> RESOLVED
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_incident_status(
    p_incident_id UUID,
    p_responder_id UUID,
    p_new_status VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_incident RECORD;
    v_responder RECORD;
BEGIN
    SELECT * INTO v_incident 
    FROM public.incidents 
    WHERE id = p_incident_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'INCIDENT_NOT_FOUND', 'message', 'Incident not found.');
    END IF;

    IF v_incident.assigned_responder_id != p_responder_id THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'UNAUTHORIZED', 'message', 'Only the assigned responder can update this incident.');
    END IF;

    SELECT * INTO v_responder 
    FROM public.responder_profiles 
    WHERE id = p_responder_id;

    -- Valid transitions
    IF p_new_status = 'ON_SCENE' AND v_incident.status = 'ASSIGNED' THEN
        UPDATE public.incidents SET status = 'ON_SCENE', updated_at = NOW() WHERE id = p_incident_id;
        
        INSERT INTO public.incident_timeline_events (
            incident_id, event_type, title, description, actor_id, actor_name, actor_role
        ) VALUES (
            p_incident_id, 'RESPONDER_ARRIVED', 'Responder Arrived On Scene',
            v_responder.full_name || ' has arrived at the emergency location.',
            v_responder.id, v_responder.full_name, 'RESPONDER'
        );
        
        RETURN jsonb_build_object('success', TRUE, 'new_status', 'ON_SCENE');

    ELSIF p_new_status = 'RESOLVED' AND (v_incident.status = 'ON_SCENE' OR v_incident.status = 'ASSIGNED') THEN
        UPDATE public.incidents SET status = 'RESOLVED', updated_at = NOW() WHERE id = p_incident_id;
        
        -- Free the responder
        UPDATE public.responder_profiles SET availability_status = 'AVAILABLE', updated_at = NOW() WHERE id = p_responder_id;

        INSERT INTO public.incident_timeline_events (
            incident_id, event_type, title, description, actor_id, actor_name, actor_role
        ) VALUES (
            p_incident_id, 'INCIDENT_RESOLVED', 'Incident Safely Resolved',
            'Emergency has been resolved and closed by ' || v_responder.full_name || '.',
            v_responder.id, v_responder.full_name, 'RESPONDER'
        );

        RETURN jsonb_build_object('success', TRUE, 'new_status', 'RESOLVED');

    ELSE
        RETURN jsonb_build_object('success', FALSE, 'error', 'INVALID_TRANSITION', 'message', 'Invalid status transition requested.');
    END IF;
END;
$$;
