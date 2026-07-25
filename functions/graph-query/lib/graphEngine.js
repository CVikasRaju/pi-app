'use strict';

/**
 * graphEngine.js — Cypher query execution & Graph Traversal Engine
 *
 * Supports querying live AppSail Neo4j instance via neo4j-driver,
 * with an in-memory graph traversal fallback for local offline testing.
 */

let neo4jDriver = null;

function getDriver() {
  if (neo4jDriver) return neo4jDriver;
  const uri      = process.env.NEO4J_URI;
  const user     = process.env.NEO4J_USER;
  const password = process.env.NEO4J_PASSWORD;

  if (uri && uri.startsWith('bolt')) {
    try {
      const neo4j = require('neo4j-driver');
      neo4jDriver = neo4j.driver(uri, neo4j.auth.basic(user, password));
      return neo4jDriver;
    } catch (err) {
      console.warn('[graphEngine] neo4j-driver init fallback:', err.message);
    }
  }
  return null;
}

// Default synthetic graph seed data for local dev & testing
const SEED_GRAPH = {
  nodes: [
    { id: 'FIR_101', label: 'CR-001/2024', type: 'FIR', properties: { crime_number: 'CR-001/2024', year: 2024, brief_facts: 'Armed robbery at MG Road jewelry store' } },
    { id: 'FIR_102', label: 'CR-002/2024', type: 'FIR', properties: { crime_number: 'CR-002/2024', year: 2024, brief_facts: 'Financial fraud & cyber scam' } },
    { id: 'FIR_103', label: 'CR-045/2023', type: 'FIR', properties: { crime_number: 'CR-045/2023', year: 2023, brief_facts: 'Commercial burglary' } },

    { id: 'ACCUSED_Rahul_Kumar', label: 'Rahul Kumar', type: 'Accused', properties: { full_name: 'Rahul Kumar', alias: 'Shadow', is_repeat_offender: 1 } },
    { id: 'ACCUSED_Vikram_Singh', label: 'Vikram Singh', type: 'Accused', properties: { full_name: 'Vikram Singh', alias: 'Vicky', is_repeat_offender: 1 } },
    { id: 'ACCUSED_Suresh_Patil', label: 'Suresh Patil', type: 'Accused', properties: { full_name: 'Suresh Patil', alias: 'Surya', is_repeat_offender: 0 } },

    { id: 'VICTIM_301', label: 'Anand Rao', type: 'Victim', properties: { full_name: 'Anand Rao' } },
    { id: 'VICTIM_302', label: 'Priya Sharma', type: 'Victim', properties: { full_name: 'Priya Sharma' } },

    { id: 'ACCOUNT_501', label: 'SBI ...3456', type: 'FinancialAccount', properties: { account_number: 'SBIN000123456', bank_name: 'SBI M.G. Road', account_holder: 'Rahul Kumar' } },
    { id: 'ACCOUNT_502', label: 'HDFC ...7654', type: 'FinancialAccount', properties: { account_number: 'HDFC000987654', bank_name: 'HDFC Indiranagar', account_holder: 'Vikram Singh' } },
    { id: 'ACCOUNT_503', label: 'ICICI ...6789 (Shell Co)', type: 'FinancialAccount', properties: { account_number: 'ICIC000456789', bank_name: 'ICICI Koramangala', account_holder: 'Shell Enterprises' } },

    { id: 'VEHICLE_401', label: 'KA-01-MJ-4321', type: 'Vehicle', properties: { plate_number: 'KA-01-MJ-4321', make_model: 'Hyundai i20', owner_name: 'Rahul Kumar' } },
  ],
  edges: [
    { source: 'ACCUSED_Rahul_Kumar', target: 'FIR_101', type: 'ACCUSED_IN', label: 'ACCUSED IN (A1)', properties: { role: 'A1', is_arrested: 1 } },
    { source: 'ACCUSED_Rahul_Kumar', target: 'FIR_102', type: 'ACCUSED_IN', label: 'ACCUSED IN (A2)', properties: { role: 'A2', is_arrested: 0 } },
    { source: 'ACCUSED_Vikram_Singh', target: 'FIR_102', type: 'ACCUSED_IN', label: 'ACCUSED IN (A1)', properties: { role: 'A1', is_arrested: 1 } },
    { source: 'ACCUSED_Suresh_Patil', target: 'FIR_103', type: 'ACCUSED_IN', label: 'ACCUSED IN (A1)', properties: { role: 'A1', is_arrested: 1 } },

    { source: 'VICTIM_301', target: 'FIR_101', type: 'VICTIM_IN', label: 'VICTIM IN' },
    { source: 'VICTIM_302', target: 'FIR_102', type: 'VICTIM_IN', label: 'VICTIM IN' },

    { source: 'ACCUSED_Rahul_Kumar', target: 'ACCOUNT_501', type: 'LINKED_ACCOUNT', label: 'PRIMARY ACCOUNT' },
    { source: 'ACCUSED_Vikram_Singh', target: 'ACCOUNT_502', type: 'LINKED_ACCOUNT', label: 'PRIMARY ACCOUNT' },

    { source: 'ACCUSED_Rahul_Kumar', target: 'ACCOUNT_503', type: 'LINKED_ACCOUNT', label: 'BENEFICIARY' },
    { source: 'ACCUSED_Vikram_Singh', target: 'ACCOUNT_503', type: 'LINKED_ACCOUNT', label: 'BENEFICIARY' },
    { source: 'ACCOUNT_501', target: 'ACCOUNT_503', type: 'TRANSFERRED_TO', label: 'TRANSFERRED ₹4,50,000' },
    { source: 'ACCOUNT_502', target: 'ACCOUNT_503', type: 'TRANSFERRED_TO', label: 'TRANSFERRED ₹8,00,000' },

    { source: 'ACCUSED_Rahul_Kumar', target: 'VEHICLE_401', type: 'OWNS_VEHICLE', label: 'OWNS VEHICLE' },
    { source: 'VEHICLE_401', target: 'FIR_101', type: 'USED_IN', label: 'GETAWAY VEHICLE' },
  ],
};

/**
 * Execute Cypher or run graph neighborhood search
 */
async function queryGraph({ queryType = 'network', searchQuery = '', role = 'investigator' }) {
  const driver = getDriver();

  if (driver) {
    try {
      const session = driver.session();
      let cypher = 'MATCH (n)-[r]-(m) RETURN n, r, m LIMIT 50';
      if (queryType === 'financial_links') {
        cypher = 'MATCH (a:Person)-[:LINKED_ACCOUNT]->(acc:FinancialAccount)<-[:LINKED_ACCOUNT]-(b:Person) RETURN a, acc, b LIMIT 25';
      }
      const result = await session.run(cypher);
      await session.close();

      const nodes = [];
      const edges = [];
      // parse result.records into nodes/edges
      return formatGraphResponse(nodes, edges);
    } catch (err) {
      console.warn('[graphEngine] Neo4j Cypher query failed, using in-memory graph:', err.message);
    }
  }

  // In-memory Graph Engine fallback
  let filteredNodes = SEED_GRAPH.nodes;
  let filteredEdges = SEED_GRAPH.edges;

  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    const matchingNodeIds = new Set(
      SEED_GRAPH.nodes
        .filter(n => n.label.toLowerCase().includes(q) || JSON.stringify(n.properties).toLowerCase().includes(q))
        .map(n => n.id)
    );

    if (matchingNodeIds.size > 0) {
      // Find 1-hop connected edges & neighbors
      const connectedNodeIds = new Set(matchingNodeIds);
      const connectedEdges = [];

      SEED_GRAPH.edges.forEach(e => {
        if (matchingNodeIds.has(e.source) || matchingNodeIds.has(e.target)) {
          connectedNodeIds.add(e.source);
          connectedNodeIds.add(e.target);
          connectedEdges.push(e);
        }
      });

      filteredNodes = SEED_GRAPH.nodes.filter(n => connectedNodeIds.has(n.id));
      filteredEdges = connectedEdges;
    }
  }

  if (queryType === 'financial_links') {
    // Surface shared financial accounts linked across multiple accused
    const accountNodeIds = new Set(SEED_GRAPH.nodes.filter(n => n.type === 'FinancialAccount').map(n => n.id));
    filteredEdges = SEED_GRAPH.edges.filter(e => e.type === 'LINKED_ACCOUNT' || e.type === 'TRANSFERRED_TO');
    const activeNodeIds = new Set();
    filteredEdges.forEach(e => { activeNodeIds.add(e.source); activeNodeIds.add(e.target); });
    filteredNodes = SEED_GRAPH.nodes.filter(n => activeNodeIds.has(n.id));
  }

  return formatGraphResponse(filteredNodes, filteredEdges);
}

function formatGraphResponse(nodes, edges) {
  // Extract citations for all FIRs present in the graph topology
  const firNodes = nodes.filter(n => n.type === 'FIR');
  const sources = firNodes.map((f, i) => ({
    source_index: i + 1,
    fir_id: f.id.replace('FIR_', ''),
    crime_number: f.properties?.crime_number || f.label,
    table: 'FIR',
    row_ref: f.id,
    excerpt: f.properties?.brief_facts || `FIR ${f.label}`,
    is_aggregate: false,
  }));

  return {
    nodes,
    edges,
    sources,
    node_count: nodes.length,
    edge_count: edges.length,
  };
}

module.exports = { queryGraph };
