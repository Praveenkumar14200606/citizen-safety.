import React, { useState, useEffect } from 'react';
import {
  Bell,
  MessageSquare,
  Smartphone,
  CheckCheck,
  Radio,
  Filter,
  Send,
  Loader2,
} from 'lucide-react';
import { AppNotification, NotificationChannel } from '../../types';
import { NotificationItem } from './NotificationItem';
import { NotificationStatus } from './NotificationStatus';
import { notificationService } from '../../services/notifications/notificationService';
import { INITIAL_DEMO_INCIDENTS } from '../../services/mockData';

interface NotificationListProps {
  recipientId?: string;
  onNavigateToIncident?: (incidentId: string) => void;
}

export const NotificationList: React.FC<NotificationListProps> = ({
  recipientId = 'usr-resp-001',
  onNavigateToIncident,
}) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [filterChannel, setFilterChannel] = useState<NotificationChannel | 'ALL'>('ALL');
  const [broadcasting, setBroadcasting] = useState(false);

  useEffect(() => {
    const unsubscribe = notificationService.subscribeToNotifications(
      recipientId,
      (updatedList) => {
        setNotifications(updatedList);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [recipientId]);

  const handleMarkAsRead = async (id: string) => {
    await notificationService.markAsRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const handleMarkAllAsRead = async () => {
    await notificationService.markAllAsRead(recipientId);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleSimulateSosDispatch = async () => {
    setBroadcasting(true);
    try {
      const demoIncident = INITIAL_DEMO_INCIDENTS[0];
      await notificationService.dispatchTrustedContactAlerts(demoIncident);
      await notificationService.broadcastResponderAlert(
        demoIncident,
        '🚨 NEW CRITICAL EMERGENCY: Medical Alert in Vicinity',
        'Citizen triggered SOS at Market & 6th St. Please review radar immediately.'
      );
    } catch (err) {
      console.error(err);
    } finally {
      setBroadcasting(false);
    }
  };

  const filtered = notifications.filter((n) => {
    if (filterChannel === 'ALL') return true;
    return n.channel === filterChannel;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-4">
      {/* Top Banner explaining architecture & channels */}
      <NotificationStatus />

      {/* Action and Filter Toolbar */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            Filter Channel:
          </span>
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-700">
            {(['ALL', 'IN_APP', 'WHATSAPP', 'SMS'] as const).map((ch) => (
              <button
                key={ch}
                onClick={() => setFilterChannel(ch)}
                className={`px-2.5 py-1 rounded transition font-medium ${
                  filterChannel === ch
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {ch.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition"
            >
              <CheckCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Mark All Read ({unreadCount})</span>
            </button>
          )}

          <button
            onClick={handleSimulateSosDispatch}
            disabled={broadcasting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-semibold rounded-lg shadow-md transition"
          >
            {broadcasting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>Simulate SOS Broadcast</span>
          </button>
        </div>
      </div>

      {/* Notification Stream */}
      {filtered.length === 0 ? (
        <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-10 text-center space-y-2">
          <Bell className="w-10 h-10 text-slate-600 mx-auto" />
          <h4 className="font-semibold text-slate-300 text-sm">No Notifications</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            You are completely caught up. Incoming emergency broadcasts and trusted contact alerts will stream here.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((item) => (
            <NotificationItem
              key={item.id}
              notification={item}
              onMarkAsRead={handleMarkAsRead}
              onNavigateToIncident={onNavigateToIncident}
            />
          ))}
        </div>
      )}
    </div>
  );
};
