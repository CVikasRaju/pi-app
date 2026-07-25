'use client';

/**
 * HotspotMapLeaflet.js — Leaflet map renderer (loaded client-side only via dynamic import)
 * Renders Karnataka district markers color-coded by FIR density.
 * react-leaflet v4 compatible.
 */

import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const TREND_COLORS = {
  rising:  '#EF4444',
  stable:  '#F59E0B',
  falling: '#22C55E',
};

function getRadius(count) {
  if (count > 50) return 28;
  if (count > 25) return 20;
  if (count > 10) return 14;
  return 9;
}

function FitBounds({ hotspots }) {
  const map = useMap();
  useEffect(() => {
    if (hotspots.length > 0) {
      const bounds = hotspots.map(h => [h.lat, h.lng]);
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [hotspots, map]);
  return null;
}

export default function HotspotMapLeaflet({ hotspots = [] }) {
  const center = [14.5, 76.0]; // Karnataka centroid

  return (
    <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', height: 360 }}>
      <MapContainer
        center={center}
        zoom={7}
        style={{ height: '100%', width: '100%', background: '#0d0d1a' }}
        zoomControl
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <FitBounds hotspots={hotspots} />
        {hotspots.map(h => (
          <CircleMarker
            key={h.district_id}
            center={[h.lat, h.lng]}
            radius={getRadius(h.count)}
            pathOptions={{
              color: TREND_COLORS[h.trend] || '#6366F1',
              fillColor: TREND_COLORS[h.trend] || '#6366F1',
              fillOpacity: 0.55,
              weight: 1.5,
            }}
          >
            <Popup>
              <div style={{ minWidth: 160 }}>
                <strong>{h.district_name}</strong><br />
                <span style={{ color: TREND_COLORS[h.trend], fontWeight: 600 }}>
                  {h.trend === 'rising' ? '↑' : h.trend === 'falling' ? '↓' : '→'} {h.trend}
                </span>
                <br />
                <strong>{h.count}</strong> FIRs in last {h.days_window}d<br />
                <span style={{ color: TREND_COLORS[h.trend] }}>{h.trend_pct}</span>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
