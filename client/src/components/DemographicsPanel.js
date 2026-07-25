'use client';

/**
 * DemographicsPanel.js — Occupation/Gender/Sensitive Aggregate Charts (Phase 4)
 * Uses recharts PieChart for donut charts.
 * Sensitive tab (caste/religion) is gated to supervisor/policymaker role client-side.
 */

import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { analyticsApi } from '../lib/analyticsApi';

const PALETTE = ['#6366F1', '#818CF8', '#22D3EE', '#F59E0B', '#EC4899', '#10B981', '#8B5CF6', '#F87171'];

export default function DemographicsPanel({ userRole }) {
  const [tab,      setTab]      = useState('gender');
  const [data,     setData]     = useState(null);
  const [sensitive, setSensitive] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const canSeeSensitive = ['supervisor', 'policymaker'].includes(userRole);

  useEffect(() => {
    loadDemographics();
  }, []);

  async function loadDemographics() {
    setLoading(true);
    try {
      const res = await analyticsApi.getDemographics();
      setData(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSensitive() {
    if (sensitive) return;
    setLoading(true);
    try {
      const res = await analyticsApi.getSensitiveAggregates();
      setSensitive(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleTabChange(t) {
    setTab(t);
    if (t === 'caste' || t === 'religion') loadSensitive();
  }

  const TABS = [
    { id: 'gender',     label: 'Gender' },
    { id: 'occupation', label: 'Occupation' },
    ...(canSeeSensitive ? [
      { id: 'caste',    label: '🔒 Caste' },
      { id: 'religion', label: '🔒 Religion' },
    ] : []),
  ];

  function getChartData() {
    if (!data && !sensitive) return [];
    if (tab === 'gender')     return (data?.gender     || []).map(d => ({ name: d.category, value: d.count }));
    if (tab === 'occupation') return (data?.occupation || []).map(d => ({ name: d.category, value: d.count }));
    if (tab === 'caste')      return (sensitive?.caste    || []).map(d => ({ name: d.category, value: d.pct }));
    if (tab === 'religion')   return (sensitive?.religion || []).map(d => ({ name: d.category, value: d.pct }));
    return [];
  }

  const chartData = getChartData();
  const isSensitiveTab = tab === 'caste' || tab === 'religion';

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '10px 14px' }}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{payload[0].name}</div>
        <div style={{ color: '#818CF8' }}>{payload[0].value}{isSensitiveTab ? '%' : ''}</div>
      </div>
    );
  };

  return (
    <div className="glass-card" style={{ padding: '28px' }} id="demographics-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <span style={{ fontSize: '1.4rem' }}>👥</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Demographic Insights</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Complainant/victim breakdown · Sensitive fields shown as rounded aggregates only
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            id={`demo-tab-${t.id}`}
            onClick={() => handleTabChange(t.id)}
            style={{
              padding: '6px 14px', fontSize: '0.8rem', borderRadius: 'var(--radius-full)',
              border: `1px solid ${tab === t.id ? '#6366F1' : 'var(--border-subtle)'}`,
              background: tab === t.id ? 'rgba(99,102,241,0.18)' : 'transparent',
              color: tab === t.id ? '#818CF8' : 'var(--text-muted)',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isSensitiveTab && (
        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: '8px', padding: '10px 14px', marginBottom: '16px',
          fontSize: '0.8rem', color: '#F59E0B',
        }}>
          ⚠️ Sensitive data. Percentages are rounded to the nearest 5% for aggregate privacy. Individual-level data is never accessible.
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>Loading…</div>
      )}
      {error && !loading && (
        <div style={{ color: '#EF4444', textAlign: 'center', padding: '30px', fontSize: '0.875rem' }}>⚠️ {error}</div>
      )}

      {!loading && !error && chartData.length > 0 && (
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
          <ResponsiveContainer width="55%" height={220}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%" cy="50%"
                innerRadius={60} outerRadius={90}
                dataKey="value"
                strokeWidth={0}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          <div style={{ flex: 1, minWidth: 160 }}>
            {chartData.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', flex: 1 }}>{item.name}</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {item.value}{isSensitiveTab ? '%' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!canSeeSensitive && (
        <div style={{ marginTop: '16px', fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
          🔒 Caste/religion breakdown requires Supervisor or Policymaker role.
        </div>
      )}
    </div>
  );
}
