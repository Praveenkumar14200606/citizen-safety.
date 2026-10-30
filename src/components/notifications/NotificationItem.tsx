import React from 'react';
import {
  Bell,
  MessageSquare,
  Smartphone,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  Check,
} from 'lucide-react';
import { AppNotification, NotificationChannel, NotificationDeliveryStatus } from '../../types';
import { formatRelativeTime } from '../../utils/formatting';

interface NotificationItemProps {
  notification: AppNotification;
  onMarkAsRead?: (id: string) => void;
  onNavigateToIncident?: (incidentId: string) => void;
}

const getChannelIcon = (channel: NotificationChannel) => {
  switch (channel) {
    case 'IN_APP':
      return <Bell className="w-4 h-4 text-cyan-400" />;
    case 'WHATSAPP':
      return <MessageSquare className="w-4 h-4 text-emerald-400" />;
    case 'SMS':
      return <Smartphone className="w-4 h-4 text-purple-400" />;
  }
};

const getStatusBadge = (status: NotificationDeliveryStatus) => {
  switch (status) {
    case 'DELIVERED':
      return (
        <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/70 border border-emerald-500/30 px-2 py-0.5 rounded">
          <CheckCircle2 className="w-3 h-3" />
          Delivered
        </span>
      );
    case 'SENT':
      return (
        <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-400 bg-blue-950/70 border border-blue-500/30 px-2 py-0.5 rounded">
          <Send className="w-3 h-3" />
          Sent to Gateway
        </span>
      );
    case 'REQUIRES_USER_ACTION':
      return (
        <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-300 bg-amber-950/80 border border-amber-500/50 px-2 py-0.5 rounded animate-pulse">
          <AlertTriangle className="w-3 h-3" />
          Action Required
        </span>
      );
    case 'FAILED':
      return (
        <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-400 bg-rose-950/70 border border-rose-500/30 px-2 py-0.5 rounded">
          <AlertTriangle className="w-3 h-3" />
          Provider Offline
        </span>
      );
    case 'PENDING':
    default:
      return (
        <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded">
          <Clock className="w-3 h-3" />
          Pending
        </span>
      );
  }
};

export const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkAsRead,
  onNavigateToIncident,
}) => {
  const isWhatsAppAction =
    notification.channel === 'WHATSAPP' &&
    notification.status === 'REQUIRES_USER_ACTION' &&
    Boolean(notification.actionUrl);

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        notification.isRead
          ? 'bg-slate-800/40 border-slate-700/60 opacity-80'
          : 'bg-slate-800 border-slate-700 shadow-md ring-1 ring-cyan-500/20'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-700">
            {getChannelIcon(notification.channel)}
          </div>
          <span className="font-semibold text-xs text-slate-100">
            {notification.title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {getStatusBadge(notification.status)}
          {!notification.isRead && onMarkAsRead && (
            <button
              onClick={() => onMarkAsRead(notification.id)}
              className="text-slate-400 hover:text-cyan-400 transition"
              title="Mark as read"
            >
              <Check className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Message Text */}
      <p className="text-xs text-slate-300 leading-relaxed mb-3">
        {notification.message}
      </p>

      {/* WhatsApp Click-to-Chat Action Callout */}
      {isWhatsAppAction && (
        <div className="mb-3 p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-200 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-emerald-100">Manual Confirmation Required:</strong>
              Browser security policies prevent automated background WhatsApp messaging. Tap the button below to open WhatsApp with your pre-filled emergency alert and press Send.
            </div>
          </div>

          <a
            href={notification.actionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-xs shadow transition active:scale-95"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Open WhatsApp & Send Alert</span>
            <ExternalLink className="w-3 h-3 ml-0.5" />
          </a>
        </div>
      )}

      {/* SMS Provider Response / Info */}
      {notification.providerResponse && (
        <div className="mb-3 text-[11px] text-slate-400 bg-slate-900/70 p-2 rounded border border-slate-700/60 font-mono">
          Gateway Log: {notification.providerResponse}
        </div>
      )}

      {/* Footer Info */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-700/60">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatRelativeTime(notification.createdAt)}
        </span>

        {onNavigateToIncident && notification.incidentId && (
          <button
            onClick={() => onNavigateToIncident(notification.incidentId)}
            className="text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1"
          >
            <span>View Incident Ref</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};
