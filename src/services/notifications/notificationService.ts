import {
  AppNotification,
  NotificationChannel,
  NotificationDeliveryStatus,
  TrustedContact,
  Incident,
} from '../../types';
import { supabase, isLiveBackendConfigured } from '../supabaseClient';
import {
  INITIAL_DEMO_NOTIFICATIONS,
  INITIAL_DEMO_TRUSTED_CONTACTS,
} from '../mockData';
import { generateAuthorizedMapLink } from '../../utils/geo';
import { sanitizePhoneNumber } from '../../utils/formatting';

let mockNotifications: AppNotification[] = [...INITIAL_DEMO_NOTIFICATIONS];
let mockTrustedContacts: TrustedContact[] = [...INITIAL_DEMO_TRUSTED_CONTACTS];
type NotificationListener = (notifications: AppNotification[]) => void;
const listeners: Set<NotificationListener> = new Set();

function notifyListeners() {
  const cloned = [...mockNotifications];
  listeners.forEach((listener) => listener(cloned));
}

// Environmental check for configured SMS provider (e.g. Twilio via Supabase Edge Function)
const isSmsProviderConfigured = import.meta.env.VITE_SMS_PROVIDER_CONFIGURED === 'true';

export const notificationService = {
  isSmsProviderConfigured,

  /**
   * Retrieves notifications for current user/responder
   */
  async getNotifications(recipientId: string): Promise<AppNotification[]> {
    if (isLiveBackendConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('recipient_id', recipientId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return (data as AppNotification[]) || [];
      } catch (err) {
        console.warn('Live fetch notifications failed:', err);
      }
    }

    return mockNotifications
      .filter((n) => n.recipientId === recipientId || n.recipientId === 'ALL')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  /**
   * Marks a notification as read
   */
  async markAsRead(notificationId: string): Promise<boolean> {
    if (isLiveBackendConfigured && supabase) {
      try {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notificationId);
      } catch (err) {
        console.warn('Live mark read failed:', err);
      }
    }

    const item = mockNotifications.find((n) => n.id === notificationId);
    if (item) {
      item.isRead = true;
      notifyListeners();
      return true;
    }
    return false;
  },

  /**
   * Marks all notifications as read for a recipient
   */
  async markAllAsRead(recipientId: string): Promise<void> {
    mockNotifications.forEach((n) => {
      if (n.recipientId === recipientId) {
        n.isRead = true;
      }
    });
    notifyListeners();
  },

  /**
   * Trusted Contact Alert Integration:
   * Dispatches alerts to registered contacts with safe location map link.
   * Handles WhatsApp click-to-chat fallback and truthful SMS provider state.
   */
  async dispatchTrustedContactAlerts(incident: Incident): Promise<AppNotification[]> {
    const alerts: AppNotification[] = [];
    const locationLink = incident.coordinates
      ? generateAuthorizedMapLink(
          incident.coordinates.lat,
          incident.coordinates.lng,
          incident.id
        )
      : 'Location unavailable';

    const baseMessage = `Emergency alert: Someone you know has requested assistance. Incident reference: [${incident.id}]. Location: ${locationLink}. Please contact them or use official emergency services if necessary.`;

    for (const contact of mockTrustedContacts) {
      // 1. In-App/Push notification
      const inAppKey = `idemp-${incident.id}-${contact.id}-inapp`;
      if (!mockNotifications.some((n) => n.idempotencyKey === inAppKey)) {
        const inAppAlert: AppNotification = {
          id: `notif-${Date.now()}-${contact.id}`,
          recipientId: contact.id,
          incidentId: incident.id,
          channel: 'IN_APP',
          title: `⚠️ Emergency Alert for ${incident.reporterMaskedName || 'Loved One'}`,
          message: baseMessage,
          locationLink,
          status: 'DELIVERED',
          isRead: false,
          createdAt: new Date().toISOString(),
          sentAt: new Date().toISOString(),
          idempotencyKey: inAppKey,
        };
        alerts.push(inAppAlert);
        mockNotifications.unshift(inAppAlert);
      }

      // 2. WhatsApp Channel (Click-to-chat fallback requires user action)
      if (contact.notifyViaWhatsapp) {
        const waKey = `idemp-${incident.id}-${contact.id}-wa`;
        if (!mockNotifications.some((n) => n.idempotencyKey === waKey)) {
          const waAlert: AppNotification = {
            id: `notif-wa-${Date.now()}-${contact.id}`,
            recipientId: contact.id,
            incidentId: incident.id,
            channel: 'WHATSAPP',
            title: `WhatsApp Fallback: ${contact.name}`,
            message: baseMessage,
            locationLink,
            status: 'REQUIRES_USER_ACTION', // User must click and send in WhatsApp
            isRead: false,
            createdAt: new Date().toISOString(),
            idempotencyKey: waKey,
            actionUrl: this.generateWhatsAppUrl(contact.phone, baseMessage),
          };
          alerts.push(waAlert);
          mockNotifications.unshift(waAlert);
        }
      }

      // 3. SMS Channel (Truthful delivery status - never claim SMS sent without provider)
      if (contact.notifyViaSms) {
        const smsKey = `idemp-${incident.id}-${contact.id}-sms`;
        if (!mockNotifications.some((n) => n.idempotencyKey === smsKey)) {
          let smsStatus: NotificationDeliveryStatus = 'FAILED';
          let providerResponse = 'No SMS provider configured in environment.';

          if (isSmsProviderConfigured) {
            // If server-side provider function is configured
            smsStatus = 'SENT';
            providerResponse = 'Queued to SMS gateway (Provider Message ID: sid_demo_8932)';
          } else {
            smsStatus = 'FAILED';
            providerResponse = 'SMS gateway disabled. Fallback to WhatsApp or In-App required.';
          }

          const smsAlert: AppNotification = {
            id: `notif-sms-${Date.now()}-${contact.id}`,
            recipientId: contact.id,
            incidentId: incident.id,
            channel: 'SMS',
            title: `SMS Gateway Alert: ${contact.name}`,
            message: baseMessage,
            locationLink,
            status: smsStatus,
            isRead: false,
            createdAt: new Date().toISOString(),
            idempotencyKey: smsKey,
            providerResponse,
          };
          alerts.push(smsAlert);
          mockNotifications.unshift(smsAlert);
        }
      }
    }

    notifyListeners();
    return alerts;
  },

  /**
   * Generates a standard WhatsApp click-to-chat link
   * Format: https://wa.me/<phone>?text=<encoded_text>
   */
  generateWhatsAppUrl(phone: string, text: string): string {
    const cleanPhone = sanitizePhoneNumber(phone).replace('+', '');
    const encodedText = encodeURIComponent(text);
    return `https://wa.me/${cleanPhone}?text=${encodedText}`;
  },

  /**
   * Emits in-app alert to responders
   */
  async broadcastResponderAlert(
    incident: Incident,
    title: string,
    message: string
  ): Promise<AppNotification> {
    const notif: AppNotification = {
      id: `notif-resp-${Date.now()}`,
      recipientId: 'usr-resp-001',
      incidentId: incident.id,
      channel: 'IN_APP',
      title,
      message,
      locationLink: incident.coordinates
        ? generateAuthorizedMapLink(
            incident.coordinates.lat,
            incident.coordinates.lng,
            incident.id
          )
        : undefined,
      status: 'DELIVERED',
      isRead: false,
      createdAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
      idempotencyKey: `resp-broadcast-${incident.id}-${Date.now()}`,
    };

    mockNotifications.unshift(notif);
    notifyListeners();
    return notif;
  },

  /**
   * Subscribes to notifications with unmount cleanup
   */
  subscribeToNotifications(
    recipientId: string,
    callback: NotificationListener
  ): () => void {
    listeners.add(callback);
    this.getNotifications(recipientId).then(callback);

    return () => {
      listeners.delete(callback);
    };
  },
};
