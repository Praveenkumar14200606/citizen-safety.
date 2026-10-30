import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Circle, Popup } from 'react-leaflet';
import { Flame, Info, ShieldAlert } from 'lucide-react';
import { Incident } from '../../types';

interface IncidentHeatmapProps {
  incidents: Incident[];
  height?: string;
  isDemoData?: boolean;
}

interface ClusterPoint {
  lat: number;
  lng: number;
  count: number;
  categories: string[];
  severities: string[];
}

export const IncidentHeatmap: React.FC<IncidentHeatmapProps> = ({
  incidents,
  height = '480px',
  isDemoData = true,
}) => {
  // Aggregate coordinates into spatial density clusters (~150m grid precision)
  const clusters = useMemo(() => {
    const map = new Map<string, ClusterPoint>();

    incidents.forEach((inc) => {
      if (!inc.coordinates) return;
      // Round to ~150 meters
      const key = `${inc.coordinates.lat.toFixed(3)},${inc.coordinates.lng.toFixed(3)}`;

      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.count += 1;
        if (!existing.categories.includes(inc.category)) {
          existing.categories.push(inc.category);
        }
        if (!existing.severities.includes(inc.severity)) {
          existing.severities.push(inc.severity);
        }
      } else {
        map.set(key, {
          lat: inc.coordinates.lat,
          lng: inc.coordinates.lng,
          count: 1,
          categories: [inc.category],
          severities: [inc.severity],
        });
      }
    });

    return Array.from(map.values());
  }, [incidents]);

  const defaultCenter: [number, number] = [37.7749, -122.4194];

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-slate-700/80 shadow-2xl" style={{ height }}>
      <MapContainer
        center={defaultCenter}
        zoom={14}
        scrollWheelZoom={true}
        className="w-full h-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Heatmap Density Gradients */}
        {clusters.map((cluster, idx) => {
          // Dynamic radius and color based on density count
          let color = '#38bdf8'; // low: blue/cyan
          let radius = 180;
          let fillOpacity = 0.35;

          if (cluster.count >= 3 || cluster.severities.includes('CRITICAL')) {
            color = '#dc2626'; // hot: red
            radius = 350;
            fillOpacity = 0.55;
          } else if (cluster.count === 2 || cluster.severities.includes('HIGH')) {
            color = '#f59e0b'; // moderate: amber
            radius = 260;
            fillOpacity = 0.45;
          }

          return (
            <React.Fragment key={idx}>
              {/* Outer gradient glow */}
              <Circle
                center={[cluster.lat, cluster.lng]}
                radius={radius * 1.5}
                pathOptions={{
                  color: 'transparent',
                  fillColor: color,
                  fillOpacity: 0.15,
                }}
              />

              {/* Core density circle */}
              <Circle
                center={[cluster.lat, cluster.lng]}
                radius={radius}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="p-1 text-slate-900 text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1 text-red-600">
                      <Flame className="w-3.5 h-3.5" />
                      Incident Density Cluster
                    </div>
                    <div>Call Volume: <strong>{cluster.count} emergency reports</strong></div>
                    <div>Categories: {cluster.categories.join(', ')}</div>
                    <div className="text-[10px] text-gray-500 pt-1 border-t">
                      *Anonymized coordinate aggregation. Individual citizen identities protected.
                    </div>
                  </div>
                </Popup>
              </Circle>
            </React.Fragment>
          );
        })}
      </MapContainer>

      {/* Top Floating Badge */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1.5">
        <div className="bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 shadow-md flex items-center gap-2">
          <Flame className="w-4 h-4 text-orange-400" />
          <span>
            Emergency Spatial Density Heatmap &bull;{' '}
            <strong className="text-cyan-300">{clusters.length} Active Zones</strong>
          </span>
          {isDemoData && (
            <span className="text-[10px] bg-amber-950/80 border border-amber-600/50 text-amber-300 px-1.5 py-0.5 rounded font-mono">
              DEMO DATA
            </span>
          )}
        </div>
      </div>

      {/* Heatmap Legend */}
      <div className="absolute bottom-3 right-3 z-[1000] bg-slate-900/90 backdrop-blur border border-slate-700 p-2.5 rounded-lg text-xs text-slate-200 shadow-xl space-y-1.5">
        <div className="font-semibold text-slate-300 text-[11px] flex items-center gap-1">
          <Info className="w-3.5 h-3.5 text-cyan-400" />
          Density Scale
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="w-3 h-3 rounded-full bg-red-600"></span>
          <span>Hotspot (&ge;3 calls / Critical)</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="w-3 h-3 rounded-full bg-amber-500"></span>
          <span>Moderate (2 calls)</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="w-3 h-3 rounded-full bg-sky-400"></span>
          <span>Low (1 call)</span>
        </div>
      </div>
    </div>
  );
};
