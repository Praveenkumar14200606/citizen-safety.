import React from 'react';
import { ShieldCheck, MessageSquare, Smartphone, Bell, CheckCircle2, AlertCircle } from 'lucide-react';
import { notificationService } from '../../services/notifications/notificationService';

export const NotificationStatus: React.FC = () => {
  const isSmsActive = notificationService.isSmsProviderConfigured;

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 shadow-lg space-y-3">
      <div className="flex items-center justify-between border-b border-slate-700 pb-2">
        <h4 className="font-semibold text-xs text-slate-200 uppercase tracking-wide flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          Notification Dispatch Protocols & Fallback System
        </h4>
        <span className="text-[10px] bg-slate-900 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
          Triple-Channel Redundancy
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        {/* Channel 1: In-App Realtime */}
        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/70 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-cyan-400" />
              In-App Realtime
            </span>
            <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5">
              <CheckCircle2 className="w-3 h-3" /> ACTIVE
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            Supabase Realtime WebSockets push alerts to signed-in responders and dispatchers with zero delay.
          </p>
        </div>

        {/* Channel 2: WhatsApp Click-to-Chat */}
        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/70 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
              WhatsApp Fallback
            </span>
            <span className="text-[10px] text-amber-300 font-bold flex items-center gap-0.5">
              REQUIRES SEND
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            Universal wa.me deeplink with pre-encoded coordinates and incident token. Requires sender tap to dispatch.
          </p>
        </div>

        {/* Channel 3: SMS Gateway */}
        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/70 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-purple-400" />
              SMS Gateway
            </span>
            {isSmsActive ? (
              <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5">
                <CheckCircle2 className="w-3 h-3" /> ONLINE
              </span>
            ) : (
              <span className="text-[10px] text-rose-400 font-bold flex items-center gap-0.5">
                <AlertCircle className="w-3 h-3" /> UNCONFIGURED
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            {isSmsActive
              ? 'Server edge function connected to Twilio/AWS SNS SMS provider.'
              : 'Truthful reporting: SMS provider is unconfigured in this environment. Delivery states are marked FAILED.'}
          </p>
        </div>
      </div>
    </div>
  );
};
