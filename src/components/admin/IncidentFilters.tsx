import React from 'react';
import { Search, Filter, RefreshCw } from 'lucide-react';
import { IncidentFilterOptions, IncidentCategory, IncidentSeverity, IncidentStatus } from '../../types';

interface IncidentFiltersProps {
  filters: IncidentFilterOptions;
  onChange: (updated: IncidentFilterOptions) => void;
  onReset: () => void;
}

export const IncidentFilters: React.FC<IncidentFiltersProps> = ({
  filters,
  onChange,
  onReset,
}) => {
  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-2">
        <span className="font-semibold text-xs text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-cyan-400" />
          Dispatch Filters & Queries
        </span>

        <button
          onClick={onReset}
          className="text-xs text-slate-400 hover:text-cyan-400 flex items-center gap-1 transition"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Reset Filters</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search ID, street, or keyword..."
            value={filters.searchQuery || ''}
            onChange={(e) => onChange({ ...filters, searchQuery: e.target.value })}
            className="w-full pl-8 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Category */}
        <div>
          <select
            value={filters.category || 'ALL'}
            onChange={(e) =>
              onChange({ ...filters, category: e.target.value as IncidentCategory | 'ALL' })
            }
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Categories</option>
            <option value="MEDICAL">Medical Emergency</option>
            <option value="FIRE">Fire</option>
            <option value="CRIME">Crime & Security</option>
            <option value="ACCIDENT">Traffic / Collision</option>
            <option value="GENERAL_SOS">General SOS</option>
          </select>
        </div>

        {/* Severity */}
        <div>
          <select
            value={filters.severity || 'ALL'}
            onChange={(e) =>
              onChange({ ...filters, severity: e.target.value as IncidentSeverity | 'ALL' })
            }
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical (Life Threatening)</option>
            <option value="HIGH">High Priority</option>
            <option value="MEDIUM">Medium Priority</option>
            <option value="LOW">Low Priority</option>
          </select>
        </div>

        {/* Status */}
        <div>
          <select
            value={filters.status || 'ALL'}
            onChange={(e) =>
              onChange({ ...filters, status: e.target.value as IncidentStatus | 'ALL' })
            }
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="REPORTED">Reported (Unassigned)</option>
            <option value="ASSIGNED">Assigned (In Route)</option>
            <option value="ON_SCENE">On Scene</option>
            <option value="RESOLVED">Resolved / Archived</option>
          </select>
        </div>
      </div>
    </div>
  );
};
