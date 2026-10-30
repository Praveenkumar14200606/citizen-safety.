// ============================================================================
// Core Domain Types for Citizen Safety & Emergency Response Platform
// Member 4: Maps, Notifications & Integration Engineer
// ============================================================================

export type IncidentCategory =
  | 'MEDICAL'
  | 'FIRE'
  | 'CRIME'
  | 'ACCIDENT'
  | 'NATURAL_DISASTER'
  | 'GENERAL_SOS';

export type IncidentSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type IncidentStatus =
  | 'REPORTED'
  | 'ASSIGNED'
  | 'ON_SCENE'
  | 'RESOLVED'
  | 'CANCELLED';

export type ResponderTrustCategory = 'COMMUNITY' | 'VERIFIED';

export type ResponderAvailability = 'AVAILABLE' | 'UNAVAILABLE' | 'ON_DUTY';

export type LocationPermissionState = 'GRANTED' | 'DENIED' | 'PROMPT';

export type NotificationChannel = 'IN_APP' | 'WHATSAPP' | 'SMS';

export type NotificationDeliveryStatus =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'REQUIRES_USER_ACTION';

export type TimelineEventType =
  | 'INCIDENT_CREATED'
  | 'AI_TRIAGE_COMPLETED'
  | 'CONTACT_ALERT_INITIATED'
  | 'RESPONDERS_NOTIFIED'
  | 'RADIUS_EXPANDED'
  | 'RESPONDER_ACCEPTED'
  | 'RESPONDER_ARRIVED'
  | 'INCIDENT_RESOLVED'
  | 'INCIDENT_CANCELLED';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface LiveLocation extends Coordinates {
  accuracyMeters?: number;
  lastUpdated: string; // ISO 8601
  isStale?: boolean; // Evaluated true if lastUpdated > 60 seconds ago
  heading?: number;
}

export interface AITriageClassification {
  category: IncidentCategory;
  confidence: number; // 0.00 to 1.00
  riskScore: number; // 1 to 100
  summary: string;
  recommendedActions: string[];
  isSpamOrFalseAlarm: boolean;
  evaluatedAt: string;
}

export interface Incident {
  id: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  coordinates: Coordinates | null;
  addressText?: string;
  reporterId: string;
  reporterMaskedName?: string;
  assignedResponderId?: string | null;
  assignedResponderName?: string | null;
  assignedResponderCategory?: ResponderTrustCategory | null;
  assignedResponderLocation?: LiveLocation | null;
  aiClassification?: AITriageClassification | null;
  eligibilityRadiusMeters: number; // starts at 300m, expands to 500m
  escalatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  distanceMeters?: number; // Calculable relative to current responder
}

export interface ResponderProfile {
  id: string;
  userId: string;
  fullName: string;
  email?: string;
  phone?: string;
  trustCategory: ResponderTrustCategory; // Client NEVER sets this
  verificationBadge?: string;
  certifications?: string[];
  availabilityStatus: ResponderAvailability;
  locationPermission: LocationPermissionState;
  currentLocation?: LiveLocation | null;
  activeAssignedIncidentId?: string | null;
}

export interface TrustedContact {
  id: string;
  userId: string;
  name: string;
  phone: string;
  relationship: string;
  notifyViaSms: boolean;
  notifyViaWhatsapp: boolean;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  incidentId: string;
  channel: NotificationChannel;
  title: string;
  message: string;
  locationLink?: string;
  status: NotificationDeliveryStatus;
  isRead: boolean;
  createdAt: string;
  sentAt?: string;
  providerResponse?: string;
  error?: string;
  actionUrl?: string;
  idempotencyKey?: string;
}

export interface TimelineEvent {
  id: string;
  incidentId: string;
  eventType: TimelineEventType;
  timestamp: string;
  title: string;
  description: string;
  actor?: {
    id?: string;
    name?: string;
    role: 'CITIZEN' | 'RESPONDER' | 'AI_SYSTEM' | 'DISPATCHER';
  };
}

export interface DispatchStats {
  totalIncidents: number;
  activeIncidents: number;
  assignedCount: number;
  onSceneCount: number;
  resolvedCount: number;
  avgResponseTimeMinutes: number;
  activeCommunityResponders: number;
  activeVerifiedResponders: number;
}

export interface IncidentFilterOptions {
  category?: IncidentCategory | 'ALL';
  severity?: IncidentSeverity | 'ALL';
  status?: IncidentStatus | 'ALL';
  searchQuery?: string;
  timeRange?: 'TODAY' | 'LAST_24_HOURS' | 'PAST_WEEK' | 'ALL';
}

export interface ClaimIncidentResult {
  success: boolean;
  incident?: Incident;
  error?: 'ALREADY_COVERED' | 'NOT_ELIGIBLE' | 'INCIDENT_NOT_FOUND' | 'SERVER_ERROR' | string;
  statusCode: number;
  message: string;
}
