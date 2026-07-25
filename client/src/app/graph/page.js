/**
 * /graph — Network Intelligence & Relationship Graph Page
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute   from '../../components/ProtectedRoute';
import RoleBadge        from '../../components/RoleBadge';
import GraphView        from '../../components/GraphView';
import SourcesPanel     from '../../components/SourcesPanel';
import { getGraphData, triggerGraphSync } from '../../lib/chatApi';
import { logout }        from '../../lib/catalystAuth';

export default function GraphPage() {
  return (
    <ProtectedRoute>
      {({ user }) => <GraphUI user={user} />}
    </ProtectedRoute>
  );
}

function GraphUI({ user }) {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [queryType,   setQueryType]   = useState('network');
  const [graphData,   setGraphData]   = useState({ nodes: [], edges: [], sources: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [syncing,     setSyncing]     = useState(false);
  const [error,       setError]       = useState('');

  useEffect(() => {
    fetchGraph('network', '');
  }, []);

  async function fetchGraph(type = 'network', query = '') {
    setLoading(true);
    setError('');
    try {
      const data = await getGraphData(type, query);
      setGraphData(data);
      setSelectedNode(null);
    } catch (err) {
      setError(err.message || 'Failed to load graph data.');
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e) {
    e?.preventDefault();
    fetchGraph(queryType, searchQuery);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await triggerGraphSync();
      await fetchGraph(queryType, searchQuery);
    } catch (err) {
      setError('Graph sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="chat-page" id="graph-page">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="app-header" id="graph-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div>
            <div className="app-logo">PI App</div>
            <div className="app-logo-sub">Graph Intelligence</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="chat-btn"
            className="btn btn-primary"
            style={{ padding: '8px 14px', fontSize: '0.8rem' }}
            onClick={() => router.push('/chat')}
          >
            💬 Chat
          </button>
          <RoleBadge role={user.role} size="sm" />
          <button
            id="graph-back-btn"
            className="btn btn-ghost"
            style={{ padding: '8px 14px', fontSize: '0.8rem' }}
            onClick={() => router.push('/dashboard')}
          >
            ← Dashboard
          </button>
          <button
            id="graph-logout-btn"
            className="btn btn-ghost"
            style={{ padding: '8px 14px', fontSize: '0.8rem' }}
            onClick={logout}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── Main Body ────────────────────────────────────────────────────── */}
      <div className="graph-page-body">

        {/* Top Control Bar */}
        <div className="graph-control-bar">
          <form onSubmit={handleSearch} className="graph-search-form">
            <input
              type="text"
              className="chat-input"
              style={{ minHeight: '38px', padding: '8px 14px' }}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search accused name, FIR number, account, or vehicle..."
            />
            <button type="submit" className="btn btn-primary btn-sm">
              🔍 Search
            </button>
          </form>

          <div className="graph-preset-chips">
            <button
              type="button"
              className={`preset-chip ${queryType === 'network' ? 'preset-chip-active' : ''}`}
              onClick={() => { setQueryType('network'); fetchGraph('network', searchQuery); }}
            >
              🌐 Full Network
            </button>
            <button
              type="button"
              className={`preset-chip ${queryType === 'financial_links' ? 'preset-chip-active' : ''}`}
              onClick={() => { setQueryType('financial_links'); fetchGraph('financial_links', searchQuery); }}
            >
              💸 Financial Money Trail
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? 'Syncing...' : '⚡ Re-sync ETL'}
            </button>
          </div>
        </div>

        {error && (
          <div className="login-error-banner" style={{ margin: '12px 24px' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Graph Canvas & Side Inspector Panel */}
        <div className="graph-workspace">
          <main className="graph-main-canvas">
            {loading ? (
              <div className="graph-loading">
                <span className="btn-spinner" style={{ width: '28px', height: '28px' }} />
                <span>Loading Knowledge Graph...</span>
              </div>
            ) : (
              <GraphView graphData={graphData} onNodeSelect={setSelectedNode} />
            )}
          </main>

          {/* Node Inspector Side Panel */}
          <aside className="graph-inspector-panel glass-card">
            {selectedNode ? (
              <div className="inspector-content">
                <div className="inspector-header">
                  <span className={`inspector-badge node-type-${selectedNode.nodeType}`}>
                    {selectedNode.nodeType}
                  </span>
                  <h3 className="inspector-title">{selectedNode.label}</h3>
                </div>

                <div className="inspector-section">
                  <h4 className="inspector-section-label">Properties</h4>
                  <div className="inspector-props">
                    {Object.entries(selectedNode.properties || {}).map(([k, v]) => (
                      <div key={k} className="inspector-prop-row">
                        <span className="prop-key">{k}:</span>
                        <span className="prop-val">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {graphData.sources?.length > 0 && (
                  <div className="inspector-section" style={{ marginTop: '16px' }}>
                    <h4 className="inspector-section-label">Connected FIR Citations</h4>
                    <SourcesPanel
                      sources={graphData.sources}
                      confidence="high"
                      sources_label={`${graphData.sources.length} FIRs connected`}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="inspector-empty">
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>👆</div>
                <h4>Select a Node</h4>
                <p>Click any node in the graph to inspect entity details, relationships, and FIR citations.</p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
