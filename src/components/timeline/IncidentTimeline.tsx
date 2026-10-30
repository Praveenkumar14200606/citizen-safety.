import React, { useState, useEffect } from 'react';
import {
  Clock,
  AlertTriangle,
  Brain,
  Bell,
  Radio,
  Maximize2,
  CheckCircle,
  MapPin,
  Flag,
  User,
  Shield,
  Layers,
} from 'lucide-react';
import { TimelineEvent, TimelineEventType } from '../../types';
import { timelineService } from '../../services/timeline/timelineService';
import { formatDateTime, formatRelativeTime } from '../../utils/formatting';

interface IncidentTimelineProps {
  incidentId: string;
}

const getEventIcon = (type: TimelineEventType) => {
  switch (type) {
    case 'INCIDENT_CREATED':
      return <AlertTriangle className="w-4 h-4 text-red-400" />;
    case 'AI_TRIAGE_COMPLETED':
      return <Brain className="w-4 h-4 text-indigo-400" />;
    case 'CONTACT_ALERT_INITIATED':
      return <Bell className="w-4 h-4 text-purple-400" />;
    case 'RESPONDERS_NOTIFIED':
      return <Radio className="w-4 h-4 text-cyan-400" />;
    case 'RADIUS_EXPANDED':
      return <Maximize2 className="w-4 h-4 text-amber-400" />;
    case 'RESPONDER_ACCEPTED':
      return <Shield className="w-4 h-4 text-blue-400" />;
    case 'RESPONDER_ARRIVED':
      return <MapPin className="w-4 h-4 text-emerald-400" />;
    case 'INCIDENT_RESOLVED':
      return <Flag className="w-4 h-4 text-emerald-400" />;
    case 'INCIDENT_CANCELLED':
      return <CheckCircle className="w-4 h-4 text-slate-400" />;
    default:
      return <Clock className="w-4 h-4 text-slate-400" />;
  }
};

const getEventBadgeColor = (type: TimelineEventType) => {
  switch (type) {
    case 'INCIDENT_CREATED':
      return 'border-red-500/40 bg-red-950/40 text-red-300';
    case 'AI_TRIAGE_COMPLETED':
      return 'border-indigo-500/40 bg-indigo-950/40 text-indigo-300';
    case 'CONTACT_ALERT_INITIATED':
      return 'border-purple-500/40 bg-purple-950/40 text-purple-300';
    case 'RESPONDERS_NOTIFIED':
      return 'border-cyan-500/40 bg-cyan-950/40 text-cyan-300';
    case 'RADIUS_EXPANDED':
      return 'border-amber-500/40 bg-amber-950/40 text-amber-300';
    case 'RESPONDER_ACCEPTED':
      return 'border-blue-500/40 bg-blue-950/40 text-blue-300';
    case 'RESPONDER_ARRIVED':
      return 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300';
    case 'INCIDENT_RESOLVED':
      return 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300';
    case 'INCIDENT_CANCELLED':
      return 'border-slate-500/40 bg-slate-900/60 text-slate-400';
    default:
      return 'border-slate-700 bg-slate-800 text-slate-300';
  }
};

export const IncidentTimeline: React.FC<IncidentTimelineProps> = ({
  incidentId,
}) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);

  useEffect(() => {
    const unsubscribe = timelineService.subscribeToTimeline(
      incidentId,
      (fetchedEvents) => {
        setEvents(fetchedEvents);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [incidentId]);

  if (events.length === 0) {
    return (
      <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-8 text-center text-xs text-slate-400">
        No recorded events yet for incident reference {incidentId}.
      </div>
    );
  }

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-slate-700 pb-3">
        <h4 className="font-semibold text-xs text-slate-200 uppercase tracking-wide flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          Incident Activity Audit Timeline
        </h4>
        <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
          {events.length} Recorded Milestones
        </span>
      </div>

      <div className="relative pl-6 space-y-5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-700">
        {events.map((event) => (
          <div key={event.id} className="relative group">
            {/* Timeline node bullet */}
            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-slate-900 border-2 border-cyan-400 flex items-center justify-center shadow">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            </div>

            <div className="bg-slate-900/70 border border-slate-700/80 rounded-xl p-3.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-slate-800 border border-slate-700">
                    {getEventIcon(event.eventType)}
                  </div>
                  <span className="font-semibold text-xs text-slate-100">
                    {event.title}
                  </span>
                </div>

                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border ${getEventBadgeColor(
                    event.eventType
                  )}`}
                >
                  {event.eventType}
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                {event.description}
              </p>

              <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
                <div className="flex items-center gap-1.5">
                  <User className="w-3 h-3 text-slate-500" />
                  <span>
                    Actor:{' '}
                    <strong className="text-slate-300">
                      {event.actor?.name || 'Automated Orchestrator'}
                    </strong>
                    {event.actor?.role && (
                      <span className="text-slate-500 ml-1">
                        ({event.actor.role})
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-1 font-mono text-slate-500">
                  <Clock className="w-3 h-3" />
                  <span>
                    {formatDateTime(event.timestamp)} ({formatRelativeTime(event.timestamp)})
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
