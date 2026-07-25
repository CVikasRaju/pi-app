'use client';

/**
 * HotspotMap.js — Crime Hotspot Choropleth Map (Phase 4)
 *
 * Uses react-leaflet for the map, loaded client-side only (SSR disabled).
 * While the map is loading SSR-side, a beautiful fallback table is shown.
 */

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { analyticsApi } from '../lib/analyticsApi';

// Leaflet must be loaded client-side only
const MapRenderer = dynamic(() => import('./HotspotMapLeaflet'), { ssr: false, loading: () => <MapPlaceholder /> });

export default function HotspotMap() {
  const [hotspots, setHotspots] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [days,     setDays]     = useState(90);
  const [view,     setView]     = useState('map'); // 'map' | 'table'

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await analyticsApi.getHotspots({ topN: 10, days });
      setHotspots(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="glass-card" style={{ padding: '28px' }} id="hotspot-map-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.4rem' }}>🗺️</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Crime Hotspot Map</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>Geospatial FIR density by district</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[30, 60, 90].map(d => (
            <button
              key={d}
              id={`hotspot-days-${d}`}
              onClick={() => setDays(d)}
              style={{
                padding: '6px 14px', fontSize: '0.8rem', borderRadius: 'var(--radius-full)',
                border: `1px solid ${days === d ? '#6366F1' : 'var(--border-subtle)'}`,
                background: days === d ? 'rgba(99,102,241,0.18)' : 'transparent',
                color: days === d ? '#818CF8' : 'var(--text-muted)',
                cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              {d}d
            </button>
          ))}
          <button
            id="hotspot-view-toggle"
            onClick={() => setView(v => v === 'map' ? 'table' : 'map')}
            style={{
              padding: '6px 14px', fontSize: '0.8rem', borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border-subtle)',
              background: 'transparent', color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {view === 'map' ? '📋 Table' : '🗺️ Map'}
          </button>
        </div>
      </div>

      {loading && <MapPlaceholder />}
      {error && !loading && (
        <div style={{ color: '#EF4444', textAlign: 'center', padding: '40px', fontSize: '0.875rem' }}>⚠️ {error}</div>
      )}

      {!loading && !error && view === 'map' && (
        <MapRenderer hotspots={hotspots} />
      )}

      {!loading && !error && view === 'table' && (
        <HotspotTable hotspots={hotspots} />
      )}
    </div>
  );
}

function HotspotTable({ hotspots }) {
  const TREND_COLOR = { rising: '#EF4444', stable: '#F59E0B', falling: '#22C55E' };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {['Rank', 'District', 'FIRs', 'Trend', '30d Δ'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.06em' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hotspots.map((h, i) => (
            <tr key={h.district_id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>#{i + 1}</td>
              <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 500 }}>{h.district_name}</td>
              <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 700 }}>{h.count}</td>
              <td style={{ padding: '10px 12px', color: TREND_COLOR[h.trend] || 'var(--text-secondary)', fontWeight: 500, textTransform: 'capitalize' }}>
                {h.trend === 'rising' ? '↑' : h.trend === 'falling' ? '↓' : '→'} {h.trend}
              </td>
              <td style={{ padding: '10px 12px', color: TREND_COLOR[h.trend] || 'var(--text-secondary)' }}>{h.trend_pct}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MapPlaceholder() {
  return (
    <div style={{
      height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)',
      border: '1px dashed var(--border-subtle)',
      color: 'var(--text-muted)', fontSize: '0.875rem',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🗺️</div>
        <div>Loading map…</div>
      </div>
    </div>
  );
}
