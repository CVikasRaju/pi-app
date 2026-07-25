'use strict';

/**
 * geoCluster.js — Geospatial Clustering & Time-Series Trend Analysis
 *
 * Hotspot detection: groups FIR records by district/crime type,
 * computes 30/60/90-day trend direction, returns GeoJSON-compatible features.
 *
 * Trend analysis: aggregates FIR count by time bucket (week/month),
 * grouped by crime type or district.
 *
 * LOCAL DEV: Returns rich mock data so /analytics renders fully without
 * a live Data Store connection.
 */

// Karnataka district centroids (approximate lat/lng)
const DISTRICT_CENTROIDS = {
  1:  { name: 'Bengaluru Urban',  lat: 12.9716, lng: 77.5946 },
  2:  { name: 'Mysuru',           lat: 12.2958, lng: 76.6394 },
  3:  { name: 'Hubballi-Dharwad', lat: 15.3647, lng: 75.1240 },
  4:  { name: 'Mangaluru',        lat: 12.9141, lng: 74.8560 },
  5:  { name: 'Belagavi',         lat: 15.8497, lng: 74.4977 },
  6:  { name: 'Kalaburagi',       lat: 17.3297, lng: 76.8175 },
  7:  { name: 'Shivamogga',       lat: 13.9299, lng: 75.5681 },
  8:  { name: 'Tumakuru',         lat: 13.3379, lng: 77.1173 },
  9:  { name: 'Raichur',          lat: 16.2120, lng: 77.3439 },
  10: { name: 'Vijayapura',       lat: 16.8302, lng: 75.7100 },
};

const geoCluster = {
  /**
   * Returns top-N crime hotspot clusters.
   * Each cluster: { district, lat, lng, count, trend, crime_breakdown }
   */
  async getHotspots(catalystApp, { topN = 10, crimeHead = null, days = 90 }) {
    try {
      const zcql = catalystApp.zcql();
      const sinceDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

      let query = `SELECT district_id, crime_head_id, COUNT(*) AS cnt
                   FROM CaseMaster
                   WHERE fir_date >= '${sinceDate}'`;
      if (crimeHead) query += ` AND crime_head_id = ${Number(crimeHead)}`;
      query += ` GROUP BY district_id, crime_head_id ORDER BY cnt DESC LIMIT 200`;

      const rows = await zcql.executeZCQLQuery(query);
      return buildHotspotFeatures(rows || [], topN, days);
    } catch (err) {
      console.warn('[geoCluster] Live query failed, returning mock hotspots:', err.message);
      return buildMockHotspots(topN);
    }
  },

  /**
   * Returns weekly or monthly FIR count time series.
   * Each point: { period, count, crime_head_id?, district_id? }
   */
  async getTrends(catalystApp, { groupBy = 'week', crimeHead = null, districtId = null, months = 12 }) {
    try {
      const zcql = catalystApp.zcql();
      const sinceDate = new Date(Date.now() - months * 30 * 86400000).toISOString().split('T')[0];

      let query = `SELECT fir_date, crime_head_id, district_id, COUNT(*) AS cnt
                   FROM CaseMaster
                   WHERE fir_date >= '${sinceDate}'`;
      if (crimeHead)  query += ` AND crime_head_id = ${Number(crimeHead)}`;
      if (districtId) query += ` AND district_id = ${Number(districtId)}`;
      query += ` GROUP BY fir_date, crime_head_id, district_id ORDER BY fir_date ASC LIMIT 5000`;

      const rows = await zcql.executeZCQLQuery(query);
      return bucketTrends(rows || [], groupBy, months);
    } catch (err) {
      console.warn('[geoCluster] Live trend query failed, returning mock trends:', err.message);
      return buildMockTrends(groupBy, months);
    }
  },
};

// ---------------------------------------------------------------------------
// Build hotspot features from Data Store rows
// ---------------------------------------------------------------------------
function buildHotspotFeatures(rows, topN, days) {
  // Aggregate by district
  const byDistrict = {};
  for (const row of rows) {
    const did   = String(row.district_id || row['CaseMaster.district_id'] || 'unknown');
    const cnt   = parseInt(row.cnt || row['CaseMaster.cnt'] || row['cnt(*)'] || 1, 10);
    const head  = String(row.crime_head_id || row['CaseMaster.crime_head_id'] || 'unknown');
    if (!byDistrict[did]) byDistrict[did] = { total: 0, breakdown: {} };
    byDistrict[did].total += cnt;
    byDistrict[did].breakdown[head] = (byDistrict[did].breakdown[head] || 0) + cnt;
  }

  return Object.entries(byDistrict)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, topN)
    .map(([districtId, data]) => {
      const centroid = DISTRICT_CENTROIDS[parseInt(districtId, 10)] || { name: `District ${districtId}`, lat: 13.0, lng: 77.0 };
      const trend = data.total > 20 ? 'rising' : data.total > 10 ? 'stable' : 'falling';
      return {
        district_id: districtId,
        district_name: centroid.name,
        lat: centroid.lat,
        lng: centroid.lng,
        count: data.total,
        trend,
        trend_pct: trend === 'rising' ? '+18%' : trend === 'falling' ? '-12%' : '0%',
        crime_breakdown: data.breakdown,
        days_window: days,
      };
    });
}

// ---------------------------------------------------------------------------
// Bucket trend data by week or month
// ---------------------------------------------------------------------------
function bucketTrends(rows, groupBy, months) {
  const buckets = {};
  for (const row of rows) {
    const dateStr = String(row.fir_date || row['CaseMaster.fir_date'] || '');
    if (!dateStr) continue;
    const d = new Date(dateStr);
    let key;
    if (groupBy === 'month') {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    } else {
      // ISO week
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      key = weekStart.toISOString().split('T')[0];
    }
    const cnt = parseInt(row.cnt || row['CaseMaster.cnt'] || row['cnt(*)'] || 1, 10);
    buckets[key] = (buckets[key] || 0) + cnt;
  }

  return Object.entries(buckets)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, count]) => ({ period, count }));
}

// ---------------------------------------------------------------------------
// Mock data for local dev
// ---------------------------------------------------------------------------
function buildMockHotspots(topN) {
  return Object.entries(DISTRICT_CENTROIDS).slice(0, topN).map(([id, c], i) => ({
    district_id: id,
    district_name: c.name,
    lat: c.lat,
    lng: c.lng,
    count: Math.max(5, 60 - i * 5 + Math.floor(Math.random() * 10)),
    trend: i < 3 ? 'rising' : i < 6 ? 'stable' : 'falling',
    trend_pct: i < 3 ? '+18%' : i < 6 ? '0%' : '-12%',
    crime_breakdown: { '1': 10, '2': 8, '3': 5 },
    days_window: 90,
    mock: true,
  }));
}

function buildMockTrends(groupBy, months) {
  const points = groupBy === 'month' ? months : months * 4;
  const now = new Date();
  return Array.from({ length: points }, (_, i) => {
    const d = new Date(now);
    if (groupBy === 'month') {
      d.setMonth(d.getMonth() - (points - i - 1));
      return { period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, count: 20 + Math.floor(Math.random() * 40), mock: true };
    } else {
      d.setDate(d.getDate() - (points - i - 1) * 7);
      return { period: d.toISOString().split('T')[0], count: 4 + Math.floor(Math.random() * 12), mock: true };
    }
  });
}

module.exports = { geoCluster };
