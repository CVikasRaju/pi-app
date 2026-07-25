'use strict';

/**
 * intentParser.js — NL intent extraction for nl-to-query (Phase 2 Multilingual)
 *
 * Two-tier strategy:
 *   Tier 1 (primary): QuickML LLM call to classify intent + extract entities (supports English & Kannada)
 *   Tier 2 (fallback): Regex/keyword extraction with English & Kannada keyword maps
 *
 * Returns:
 *   {
 *     intent:   'fir_lookup' | 'accused_lookup' | 'victim_lookup' |
 *               'case_status' | 'aggregate_stats' | 'officer_lookup' | 'unknown',
 *     entities: { ... },
 *     language: 'en' | 'kn',
 *     raw_question: string,
 *     tier_used:    'llm' | 'regex',
 *   }
 */

const INTENTS = Object.freeze({
  FIR_LOOKUP:           'fir_lookup',
  ACCUSED_LOOKUP:       'accused_lookup',
  VICTIM_LOOKUP:        'victim_lookup',
  CASE_STATUS:          'case_status',
  AGGREGATE_STATS:      'aggregate_stats',
  OFFICER_LOOKUP:       'officer_lookup',
  GRAPH_NETWORK:        'graph_network',
  RISK_SCORE:           'risk_score',           // Phase 4: recidivism risk
  HOTSPOT:              'hotspot',              // Phase 4: crime hotspot / trend
  DEMOGRAPHIC_INSIGHT:  'demographic_insight',  // Phase 4: sociological cross-ref
  UNKNOWN:              'unknown',
});

/**
 * Detect if text is primarily Kannada script (\u0C80-\u0CFF)
 */
function detectLanguage(text) {
  if (!text) return 'en';
  const knCount = (text.match(/[\u0C80-\u0CFF]/g) || []).length;
  return knCount > 0 ? 'kn' : 'en';
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * @param {object} catalystApp
 * @param {string} question     - The NL question from the user (English or Kannada)
 * @param {object} sessionCtx   - Prior turns for context
 * @param {string} role         - User role
 * @param {string} [preferredLang] - Optional explicit language preference ('en'|'kn')
 * @returns {Promise<IntentResult>}
 */
async function parseIntent(catalystApp, question, sessionCtx, role, preferredLang) {
  const detected = detectLanguage(question);
  const lang = preferredLang === 'kn' || detected === 'kn' ? 'kn' : 'en';

  // Try LLM first
  if (process.env.QUICKML_MODEL_ID) {
    try {
      const res = await parseWithLLM(catalystApp, question, sessionCtx, role, lang);
      return { ...res, language: lang };
    } catch (err) {
      console.warn('[IntentParser] LLM parse failed, falling back to regex:', err.message);
    }
  }

  // Regex fallback — always works
  const res = parseWithRegex(question, sessionCtx, role, lang);
  return { ...res, language: lang };
}

// ---------------------------------------------------------------------------
// Tier 1: QuickML LLM intent parsing (Multilingual)
// ---------------------------------------------------------------------------

async function parseWithLLM(catalystApp, question, sessionCtx, _role, _lang) {
  const contextSnippet = buildContextSnippet(sessionCtx);

  const systemPrompt = `You are a multilingual intent parser for a Karnataka Police crime intelligence system.
The question may be in English or Kannada (ಕನ್ನಡ).
Extract intent and entities from the investigator's question regardless of language.
Return ONLY valid JSON in this exact format:
{
  "intent": "<one of: fir_lookup, accused_lookup, victim_lookup, case_status, aggregate_stats, officer_lookup, graph_network, risk_score, hotspot, demographic_insight, unknown>",
  "entities": {
    "crime_numbers": [],
    "names": [],
    "stations": [],
    "years": [],
    "dates": [],
    "crime_types": [],
    "districts": [],
    "statuses": []
  }
}

Intent definitions:
- fir_lookup: looking for specific FIR(s), case details (ಎಫ್‌‌ಐಆರ್/ಪ್ರಕರಣ/ಮೊಕದ್ದಮೆ)
- accused_lookup: searching for accused person(s) info (ಆರೋಪಿ/ಸಂದಿಗ್ಧ/ಬಂಧಿತ)
- victim_lookup: searching for victim(s) info (ಸಂತ್ರಸ್ತ/ಸಂತ್ರಸ್ತೆ/ದೂರುದಾರ)
- case_status: asking about case status, chargesheet, court (ಸ್ಥಿತಿ/ಚಾರ್ಜ್‌‌ಶೀಟ್/ನ್ಯಾಯಾಲಯ)
- aggregate_stats: counts, statistics, trends (ಎಷ್ಟು/ಒಟ್ಟು/ಸಂಖ್ಯೆ/ಅಂಕಿಅಂಶ)
- officer_lookup: searching for officer/investigator (ಅಧಿಕಾರಿ/ತನಿಖಾಧಿಕಾರಿ)
- graph_network: relationship/network/connection/money trail queries
- risk_score: recidivism risk, reoffend likelihood, danger level of accused (ಅಪಾಯ ಸ್ಕೋರ್, ಮರುಅಪರಾಧ)
- hotspot: crime hotspot, where crimes happen, area trends, surge (ಅಪರಾಧ ಕೇಂದ್ರ, ಹಾಟ್‌ಸ್ಪಾಟ್)
- demographic_insight: occupation/gender/social breakdown, percentage, demographic (ಜನಸಂಖ್ಯಾ ಮಾಹಿತಿ, ವೃತ್ತಿ)
- unknown: cannot determine

Conversation context (for pronoun resolution):
${contextSnippet}`;

  const userPrompt = `Question: ${question}`;

  const modelId   = process.env.QUICKML_MODEL_ID;
  const projectId = process.env.CATALYST_PROJECT_ID;

  const llmUrl = `https://api.catalyst.zoho.com/baas/v1/project/${projectId}/ml/llm/${modelId}/generate`;

  const response = await fetch(llmUrl, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Zoho-oauthtoken ${await getCatalystToken(catalystApp)}`,
    },
    body: JSON.stringify({
      system_prompt: systemPrompt,
      user_prompt:   userPrompt,
      max_tokens:    512,
      temperature:   0.1,
    }),
  });

  if (!response.ok) {
    throw new Error(`QuickML LLM responded ${response.status}`);
  }

  const data = await response.json();
  const raw  = data?.data?.response || data?.response || '';

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('LLM returned non-JSON response');

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    intent:       parsed.intent || INTENTS.UNKNOWN,
    entities:     normalizeEntities(parsed.entities || {}),
    raw_question: question,
    tier_used:    'llm',
  };
}

// ---------------------------------------------------------------------------
// Tier 2: Regex / keyword fallback (English + Kannada)
// ---------------------------------------------------------------------------

const CRIME_NUMBER_RE    = /\bCR[-/]?\d{3,}\/?\d{0,4}\b/gi;
const YEAR_RE            = /\b(20\d{2})\b/g;
const DATE_RE            = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/g;

const AGGREGATE_KEYWORDS = [
  'how many', 'count', 'total', 'statistics', 'stats', 'trend', 'breakdown', 'summary', 'rate', 'percentage', 'distribution',
  'ಎಷ್ಟು', 'ಒಟ್ಟು', 'ಸಂಖ್ಯೆ', 'ಅಂಕಿಅಂಶ', 'ವಿವರಗಳು', 'ಪ್ರಮಾಣ'
];

const FIR_KEYWORDS       = [
  'fir', 'case', 'crime number', 'incident', 'complaint', 'reported',
  'ಎಫ್‌ಐಆರ್', 'ಪ್ರಕರಣ', 'ಮೊಕದ್ದಮೆ', 'ದೂರು', 'ಅಪರಾಧ ಸಂಖ್ಯೆ'
];

const ACCUSED_KEYWORDS   = [
  'accused', 'suspect', 'offender', 'criminal', 'arrested', 'absconding',
  'ಆರೋಪಿ', 'ಸಂದಿಗ್ಧ', 'ಅಪರಾಧಿ', 'ಬಂಧಿತ', 'ತಲೆಮರೆಸಿಕೊಂಡ'
];

const VICTIM_KEYWORDS    = [
  'victim', 'complainant', 'injured', 'deceased',
  'ಸಂತ್ರಸ್ತ', 'ಸಂತ್ರಸ್ತೆ', 'ದೂರುದಾರ', 'ಗಾಯಗೊಂಡ', 'ಮೃತ'
];

const STATUS_KEYWORDS    = [
  'status', 'chargesheet', 'court', 'trial', 'conviction', 'closed', 'pending',
  'ಸ್ಥಿತಿ', 'ಚಾರ್ಜ್‌ಶೀಟ್', 'ನ್ಯಾಯಾಲಯ', 'ವಿಚಾರಣೆ', 'ದೋಷಾರೋಪಣೆ', 'ವಿಲೇವಾರಿ'
];

const OFFICER_KEYWORDS   = [
  'officer', 'io', 'investigating officer', 'inspector', 'si', 'pi', 'ips',
  'ಅಧಿಕಾರಿ', 'ತನಿಖಾಧಿಕಾರಿ', 'ಇನ್ಸ್ಪೆಕ್ಟರ್'
];

const GRAPH_KEYWORDS     = [
  'network', 'graph', 'connected', 'connection', 'link', 'shared account', 'money trail', 'transferred',
  'ಜಾಲ', 'ಸಂಪರ್ಕ', 'ಬ್ಯಾಂಕ್ ಖಾತೆ', 'ಖಾತೆಗಳು', 'ಸಂಬಂಧ'
];

const RISK_KEYWORDS = [
  'risk', 'risk score', 'recidivism', 'reoffend', 'danger level', 'likelihood of reoffending',
  'will he offend again', 'repeat offender risk', 'threat level',
  'ಅಪಾಯ ಸ್ಕೋರ್', 'ಮರುಅಪರಾಧ', 'ಅಪಾಯ ಮಟ್ಟ', 'ಮತ್ತೆ ಅಪರಾಧ ಮಾಡುತ್ತಾನೆ'
];

const HOTSPOT_KEYWORDS = [
  'hotspot', 'hot spot', 'crime area', 'where are crimes', 'crime zone', 'crime concentration',
  'which area', 'which district', 'crime surge', 'spike in crimes', 'trend in', 'crime trend',
  'ಅಪರಾಧ ಕೇಂದ್ರ', 'ಹಾಟ್‌ಸ್ಪಾಟ್', 'ಅಪರಾಧ ಪ್ರದೇಶ', 'ಎಲ್ಲಿ ಹೆಚ್ಚು ಅಪರಾಧ', 'ಏರಿಕೆ'
];

const DEMOGRAPHIC_KEYWORDS = [
  'occupation', 'gender', 'demographic', 'social', 'breakdown by', 'percentage of',
  'what percentage', 'how many women', 'how many men', 'caste', 'religion',
  'ವೃತ್ತಿ', 'ಲಿಂಗ', 'ಜನಸಂಖ್ಯಾ', 'ಶೇಕಡಾ', 'ಎಷ್ಟು ಮಹಿಳೆಯರು'
];

const CRIME_TYPE_MAP = {
  murder:     ['murder', 'homicide', 'killing', 'ipc 302', 'ಕೊಲೆ', 'ಹತ್ಯೆ'],
  robbery:    ['robbery', 'dacoity', 'theft', 'ipc 392', 'ipc 395', 'ದರೋಡೆ', 'ಕಳವು', 'ದೋಚಿ'],
  assault:    ['assault', 'hurt', 'grievous hurt', 'ipc 323', 'ipc 325', 'ಹಲ್ಲೆ', 'ಗಾಯ'],
  fraud:      ['fraud', 'cheating', 'forgery', 'ipc 420', 'ವಂಚನೆ', 'ಮೋಸ'],
  kidnapping: ['kidnapping', 'abduction', 'ipc 363', 'ಅಪಹರಣ'],
  rape:       ['rape', 'sexual assault', 'pocso', 'ipc 376', 'ಲೈಂಗಿಕ ದೌರ್ಜನ್ಯ'],
  drug:       ['drug', 'ndps', 'narcotic', 'ganja', 'cocaine', 'ಮಾದಕ ದ್ರವ್ಯ', 'ಗಾಂಜಾ'],
};

const STATUS_MAP = {
  'under investigation': ['under investigation', 'being investigated', 'open case', 'ತನಿಖೆಯಲ್ಲಿದೆ', 'ವಿಚಾರಣೆಯಲ್ಲಿದೆ'],
  'chargesheeted':       ['chargesheeted', 'charge sheet filed', 'chargesheet', 'ಚಾರ್ಜ್‌ಶೀಟ್ ಸಲ್ಲಿಕೆ', 'ದೋಷಾರೋಪಣೆ'],
  'closed':              ['closed', 'final report', 'fr filed', 'ವಿಲೇವಾರಿ', 'ಮುಕ್ತಾಯ'],
  'under trial':         ['under trial', 'in court', 'trial', 'ನ್ಯಾಯಾಲಯದಲ್ಲಿ ವಿಚಾರಣೆ'],
};

function parseWithRegex(question, sessionCtx, _role, _lang) {
  const q = question.toLowerCase();

  let intent = INTENTS.UNKNOWN;

  if (RISK_KEYWORDS.some(k => q.includes(k))) {
    intent = INTENTS.RISK_SCORE;
  } else if (HOTSPOT_KEYWORDS.some(k => q.includes(k))) {
    intent = INTENTS.HOTSPOT;
  } else if (DEMOGRAPHIC_KEYWORDS.some(k => q.includes(k))) {
    intent = INTENTS.DEMOGRAPHIC_INSIGHT;
  } else if (GRAPH_KEYWORDS.some(k => q.includes(k))) {
    intent = INTENTS.GRAPH_NETWORK;
  } else if (AGGREGATE_KEYWORDS.some(k => q.includes(k))) {
    intent = INTENTS.AGGREGATE_STATS;
  } else if (STATUS_KEYWORDS.some(k => q.includes(k))) {
    intent = INTENTS.CASE_STATUS;
  } else if (ACCUSED_KEYWORDS.some(k => q.includes(k))) {
    intent = INTENTS.ACCUSED_LOOKUP;
  } else if (VICTIM_KEYWORDS.some(k => q.includes(k))) {
    intent = INTENTS.VICTIM_LOOKUP;
  } else if (OFFICER_KEYWORDS.some(k => q.includes(k))) {
    intent = INTENTS.OFFICER_LOOKUP;
  } else if (FIR_KEYWORDS.some(k => q.includes(k))) {
    intent = INTENTS.FIR_LOOKUP;
  }

  const crime_numbers = [...question.matchAll(CRIME_NUMBER_RE)].map(m => m[0].toUpperCase());
  const years         = [...question.matchAll(YEAR_RE)].map(m => parseInt(m[1]));
  const dates         = [...question.matchAll(DATE_RE)].map(m => m[1]);

  const crime_types = [];
  for (const [type, keywords] of Object.entries(CRIME_TYPE_MAP)) {
    if (keywords.some(k => q.includes(k))) crime_types.push(type);
  }

  const statuses = [];
  for (const [status, keywords] of Object.entries(STATUS_MAP)) {
    if (keywords.some(k => q.includes(k))) statuses.push(status);
  }

  const resolved = resolvePronouns(question, sessionCtx);

  return {
    intent,
    entities: {
      crime_numbers: [...new Set([...crime_numbers, ...(resolved.crime_numbers || [])])],
      names:         resolved.names    || [],
      stations:      resolved.stations || [],
      years,
      dates,
      crime_types,
      districts:     [],
      statuses,
    },
    raw_question: question,
    tier_used:    'regex',
  };
}

function resolvePronouns(question, sessionCtx) {
  const q = question.toLowerCase();
  const hasPronouns = ['this case', 'that case', 'the case', 'this fir', 'that person',
                       'this accused', 'the accused', 'him', 'her', 'they',
                       'ಈ ಪ್ರಕರಣ', 'ಆ ಪ್ರಕರಣ', 'ಈ ಎಫ್‌ಐಆರ್', 'ಆ ಆರೋಪಿ'].some(p => q.includes(p));

  if (!hasPronouns || !sessionCtx?.last_entities) return {};
  return sessionCtx.last_entities;
}

function normalizeEntities(e) {
  return {
    crime_numbers: (e.crime_numbers || []).map(s => String(s).toUpperCase()),
    names:         (e.names         || []).map(s => String(s)),
    stations:      (e.stations      || []).map(s => String(s)),
    years:         (e.years         || []).map(n => parseInt(n)).filter(Boolean),
    dates:         (e.dates         || []).map(s => String(s)),
    crime_types:   (e.crime_types   || []).map(s => String(s).toLowerCase()),
    districts:     (e.districts     || []).map(s => String(s)),
    statuses:      (e.statuses      || []).map(s => String(s).toLowerCase()),
  };
}

function buildContextSnippet(sessionCtx) {
  if (!sessionCtx?.turns?.length) return 'No prior context.';
  return sessionCtx.turns
    .slice(-3)
    .map(t => `Q: ${t.question}\nA: ${t.answer_summary}`)
    .join('\n---\n');
}

async function getCatalystToken(_catalystApp) {
  return process.env.CATALYST_SERVICE_TOKEN || '';
}

module.exports = { parseIntent, detectLanguage, INTENTS };
