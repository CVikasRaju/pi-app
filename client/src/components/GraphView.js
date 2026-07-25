'use client';

import { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';

/**
 * GraphView — Cytoscape.js interactive network visualizer
 *
 * Props:
 *   graphData - { nodes, edges, sources }
 *   onNodeSelect - function(nodeData)
 */
export default function GraphView({ graphData, onNodeSelect }) {
  const containerRef = useRef(null);
  const cyRef        = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !graphData?.nodes) return;

    // Transform nodes for Cytoscape format
    const cyElements = [
      ...graphData.nodes.map(n => ({
        data: {
          id: n.id,
          label: n.label,
          nodeType: n.type,
          properties: n.properties || {},
        }
      })),
      ...(graphData.edges || []).map((e, idx) => ({
        data: {
          id: `edge_${idx}`,
          source: e.source,
          target: e.target,
          label: e.label || e.type,
          edgeType: e.type,
        }
      }))
    ];

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements: cyElements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'color': '#F8FAFC',
            'font-size': '11px',
            'font-weight': '600',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'background-color': '#6366F1',
            'width': 36,
            'height': 36,
            'border-width': 2,
            'border-color': '#818CF8',
            'transition-property': 'background-color, border-color, bounds',
            'transition-duration': '0.2s',
          }
        },
        {
          selector: 'node[nodeType = "Accused"]',
          style: { 'background-color': '#EF4444', 'border-color': '#F87171', 'shape': 'ellipse' }
        },
        {
          selector: 'node[nodeType = "Victim"]',
          style: { 'background-color': '#10B981', 'border-color': '#34D399', 'shape': 'ellipse' }
        },
        {
          selector: 'node[nodeType = "FIR"]',
          style: { 'background-color': '#4338CA', 'border-color': '#6366F1', 'shape': 'rectangle' }
        },
        {
          selector: 'node[nodeType = "FinancialAccount"]',
          style: { 'background-color': '#F59E0B', 'border-color': '#FBBF24', 'shape': 'diamond', 'width': 38, 'height': 38 }
        },
        {
          selector: 'node[nodeType = "Vehicle"]',
          style: { 'background-color': '#06B6D4', 'border-color': '#22D3EE', 'shape': 'hexagon' }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#FFFFFF',
            'shadow-blur': 12,
            'shadow-color': '#6366F1',
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': 'rgba(255, 255, 255, 0.25)',
            'target-arrow-color': 'rgba(255, 255, 255, 0.35)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '9px',
            'color': '#94A3B8',
            'text-rotation': 'autorotate',
            'text-margin-y': -8,
          }
        },
        {
          selector: 'edge[edgeType = "TRANSFERRED_TO"]',
          style: {
            'line-color': '#F59E0B',
            'target-arrow-color': '#F59E0B',
            'width': 3,
            'line-style': 'dashed'
          }
        }
      ],
      layout: {
        name: 'cose',
        animate: true,
        padding: 40,
        nodeOverlap: 20,
        componentSpacing: 100,
      }
    });

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      onNodeSelect?.(node.data());
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [graphData, onNodeSelect]);

  function handleResetLayout() {
    cyRef.current?.layout({ name: 'cose', animate: true }).run();
  }

  function handleFit() {
    cyRef.current?.fit();
  }

  return (
    <div className="graph-container">
      <div className="graph-toolbar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={handleResetLayout}>
          🔄 Reset Layout
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={handleFit}>
          🔍 Fit View
        </button>
      </div>

      <div ref={containerRef} className="graph-canvas" id="graph-canvas" />

      <div className="graph-legend">
        <span className="legend-item"><span className="legend-dot dot-accused" /> Accused</span>
        <span className="legend-item"><span className="legend-dot dot-victim" /> Victim</span>
        <span className="legend-item"><span className="legend-dot dot-fir" /> FIR</span>
        <span className="legend-item"><span className="legend-dot dot-account" /> Account</span>
        <span className="legend-item"><span className="legend-dot dot-vehicle" /> Vehicle</span>
      </div>
    </div>
  );
}
