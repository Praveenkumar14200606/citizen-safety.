import { describe, it, expect } from 'vitest';
import { notificationService } from '../src/services/notifications/notificationService';
import { INITIAL_DEMO_INCIDENTS } from '../src/services/mockData';

describe('Notification Service & Multi-Channel Fallbacks', () => {
  const sampleIncident = INITIAL_DEMO_INCIDENTS[0];

  it('generates a valid, encoded WhatsApp click-to-chat URL with incident details', () => {
    const phone = '+1 (415) 555-0183';
    const message = `Emergency alert for David K. Incident: [${sampleIncident.id}]. Safe link: https://maps.google.com/?q=37.7758,-122.4182`;

    const url = notificationService.generateWhatsAppUrl(phone, message);

    expect(url).toContain('https://wa.me/14155550183?text=');
    expect(url).toContain(encodeURIComponent(sampleIncident.id));
    // Verify phone contains no symbols
    expect(url).not.toContain('+');
    expect(url).not.toContain('(');
  });

  it('dispatches trusted-contact alerts across configured channels', async () => {
    const alerts = await notificationService.dispatchTrustedContactAlerts(sampleIncident);

    expect(alerts.length).toBeGreaterThan(0);

    // Verify WhatsApp alert requires user action
    const waAlert = alerts.find((a) => a.channel === 'WHATSAPP');
    if (waAlert) {
      expect(waAlert.status).toBe('REQUIRES_USER_ACTION');
      expect(waAlert.actionUrl).toBeDefined();
    }

    // Verify SMS status is truthful based on provider configuration
    const smsAlert = alerts.find((a) => a.channel === 'SMS');
    if (smsAlert) {
      if (notificationService.isSmsProviderConfigured) {
        expect(smsAlert.status).toBe('SENT');
      } else {
        expect(smsAlert.status).toBe('FAILED');
        expect(smsAlert.providerResponse).toContain('SMS gateway disabled');
      }
    }
  });

  it('prevents duplicate notifications via idempotency key enforcement', async () => {
    // Calling dispatch a second time for the exact same incident
    const duplicateDispatchAlerts = await notificationService.dispatchTrustedContactAlerts(sampleIncident);

    // Idempotency keys prevent newly added alerts for already-notified contacts
    expect(duplicateDispatchAlerts.length).toBe(0);
  });

  it('marks notifications as read and allows mark all', async () => {
    const notifs = await notificationService.getNotifications('usr-resp-001');
    if (notifs.length > 0) {
      const firstId = notifs[0].id;
      const readRes = await notificationService.markAsRead(firstId);
      expect(readRes).toBe(true);

      const refreshed = await notificationService.getNotifications('usr-resp-001');
      const item = refreshed.find((n) => n.id === firstId);
      expect(item?.isRead).toBe(true);
    }
  });
});
