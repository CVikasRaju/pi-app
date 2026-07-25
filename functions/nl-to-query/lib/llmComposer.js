'use strict';

/**
 * llmComposer.js — Grounded answer composition for nl-to-query (Phase 2 Multilingual)
 *
 * Takes the original question + retrieved DB rows → calls QuickML LLM →
 * returns { answer, sources } where sources cites every row used.
 * Supports generating answers in English or Kannada (ಕನ್ನಡ) based on language choice.
 *
 * Citation contract:
 *   - sources is ALWAYS present (may be empty array if no rows retrieved)
 *   - no_results = true when sources.length === 0
 *   - If QuickML unavailable, uses structured template fallback in requested language
 */

const MAX_ROWS_IN_PROMPT = 10;

/**
 * @param {object}  catalystApp
 * @param {string}  question       - Original NL question
 * @param {Array}   rows           - DB rows retrieved by ZCQL query
 * @param {object}  queryMeta      - { tables, is_aggregate, description, params }
 * @param {object}  intentResult   - from intentParser
 * @param {string}  role           - user role
 * @param {string}  [lang='en']    - 'en' | 'kn'
 * @returns {Promise<{ answer, sources, no_results, tier_used }>}
 */
async function composeAnswer(catalystApp, question, rows, queryMeta, intentResult, role, lang = 'en') {
  const language = intentResult?.language || lang || 'en';

  if (!rows || rows.length === 0) {
    return {
      answer:     buildNoResultsAnswer(question, queryMeta, language),
      sources:    [],
      no_results: true,
      tier_used:  'template',
    };
  }

  // Build sources from rows (always, regardless of LLM)
  const sources = buildSources(rows, queryMeta.tables, queryMeta.is_aggregate);

  // Try LLM for prose answer
  if (process.env.QUICKML_MODEL_ID) {
    try {
      const answer = await composeWithLLM(catalystApp, question, rows, queryMeta, role, language);
      return { answer, sources, no_results: false, tier_used: 'llm' };
    } catch (err) {
      console.warn('[LLMComposer] LLM compose failed, using template:', err.message);
    }
  }

  // Fallback: structured template answer (English or Kannada)
  const answer = composeWithTemplate(question, rows, queryMeta, intentResult, role, language);
  return { answer, sources, no_results: false, tier_used: 'template' };
}

// ---------------------------------------------------------------------------
// Tier 1: QuickML LLM answer composition (Multilingual)
// ---------------------------------------------------------------------------

async function composeWithLLM(catalystApp, question, rows, queryMeta, role, lang) {
  const rowSnippet = rows
    .slice(0, MAX_ROWS_IN_PROMPT)
    .map((r, i) => `[Row ${i + 1}] ${JSON.stringify(r)}`)
    .join('\n');

  const isKn = lang === 'kn';

  const systemPrompt = `You are a crime intelligence assistant for the Karnataka State Crime Records Bureau (ಕರ್ನಾಟಕ ರಾಜ್ಯ ಅಪರಾಧ ದಾಖಲೆಗಳ ಬ್ಯೂರೋ).
Answer the investigator's question using ONLY the database records provided below.
Do not add information not present in the records.
Be concise, factual, and professional.
Refer to records by their crime number or ROWID when citing specifics.
${isKn ? 'Provide the entire response in clear, formal Kannada (ಕನ್ನಡ).' : 'Provide the response in English.'}
${role === 'policymaker' ? 'Provide only aggregate/statistical insights. Do not name individuals.' : ''}`;

  const userPrompt = `Question (${isKn ? 'Kannada' : 'English'}): ${question}

Database records retrieved (${rows.length} rows from ${queryMeta.tables.join(', ')}):
${rowSnippet}

Provide a clear, factual answer based strictly on the above records${isKn ? ' in Kannada' : ''}.`;

  const modelId   = process.env.QUICKML_MODEL_ID;
  const projectId = process.env.CATALYST_PROJECT_ID;

  const llmUrl = `https://api.catalyst.zoho.com/baas/v1/project/${projectId}/ml/llm/${modelId}/generate`;

  const response = await fetch(llmUrl, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Zoho-oauthtoken ${process.env.CATALYST_SERVICE_TOKEN || ''}`,
    },
    body: JSON.stringify({
      system_prompt: systemPrompt,
      user_prompt:   userPrompt,
      max_tokens:    1024,
      temperature:   0.3,
    }),
  });

  if (!response.ok) throw new Error(`QuickML ${response.status}`);

  const data = await response.json();
  return data?.data?.response || data?.response || '(No response from LLM)';
}

// ---------------------------------------------------------------------------
// Tier 2: Structured template answer (English & Kannada)
// ---------------------------------------------------------------------------

function composeWithTemplate(question, rows, queryMeta, intentResult, role, lang) {
  const { intent } = intentResult;
  const count = rows.length;
  const isKn = lang === 'kn';

  if (queryMeta.is_aggregate) {
    if (isKn) {
      const lines = rows.map(r => {
        const parts = [];
        if (r.year)                 parts.push(`ವರ್ಷ ${r.year}`);
        if (r.total_firs != null)   parts.push(`ಒಟ್ಟು ಎಫ್‌ಐಆರ್‌ಗಳು: ${r.total_firs}`);
        if (r.chargesheeted != null) parts.push(`ಚಾರ್ಜ್‌ಶೀಟ್ ಆಗಿರುವುದು: ${r.chargesheeted}`);
        if (r.under_investigation != null) parts.push(`ತನಿಖೆಯಲ್ಲಿದೆ: ${r.under_investigation}`);
        return parts.join(' | ');
      });
      return `ಒಟ್ಟು ಅಂಕಿಅಂಶಗಳ ವಿವರಗಳು ಇಲ್ಲಿವೆ:\n${lines.join('\n')}`;
    } else {
      const lines = rows.map(r => {
        const parts = [];
        if (r.year)                 parts.push(`Year ${r.year}`);
        if (r.total_firs != null)   parts.push(`Total FIRs: ${r.total_firs}`);
        if (r.chargesheeted != null) parts.push(`Chargesheeted: ${r.chargesheeted}`);
        if (r.under_investigation != null) parts.push(`Under Investigation: ${r.under_investigation}`);
        return parts.join(' | ');
      });
      return `Here are the aggregate statistics:\n${lines.join('\n')}`;
    }
  }

  switch (intent) {
    case 'fir_lookup':
    case 'case_status': {
      if (count === 1) {
        const r = rows[0];
        if (isKn) {
          return [
            `ನಿಮ್ಮ ಪ್ರಶ್ನೆಗೆ 1 ಎಫ್‌ಐಆರ್ ದಾಖಲೆ ದೊರೆತಿದೆ.`,
            r.crime_number ? `ಅಪರಾಧ ಸಂಖ್ಯೆ: ${r.crime_number}` : null,
            r.fir_date     ? `ಎಫ್‌ಐಆರ್ ದಿನಾಂಕ: ${formatDate(r.fir_date)}` : null,
            r.brief_facts  ? `ಸಂಕ್ಷಿಪ್ತ ವಿವರಗಳು: ${r.brief_facts.slice(0, 300)}${r.brief_facts.length > 300 ? '…' : ''}` : null,
            r.chargesheet_filed != null ? `ಚಾರ್ಜ್‌ಶೀಟ್ ಸಲ್ಲಿಕೆ: ${r.chargesheet_filed ? 'ಹೌದು' : 'ಇಲ್ಲ'}` : null,
          ].filter(Boolean).join('\n');
        }
        return [
          `Found 1 FIR matching your query.`,
          r.crime_number ? `Crime Number: ${r.crime_number}` : null,
          r.fir_date     ? `FIR Date: ${formatDate(r.fir_date)}` : null,
          r.brief_facts  ? `Brief Facts: ${r.brief_facts.slice(0, 300)}${r.brief_facts.length > 300 ? '…' : ''}` : null,
          r.chargesheet_filed != null ? `Chargesheet Filed: ${r.chargesheet_filed ? 'Yes' : 'No'}` : null,
        ].filter(Boolean).join('\n');
      }
      if (isKn) {
        return `ನಿಮ್ಮ ಶೋಧನೆಗೆ ${count} ಎಫ್‌ಐಆರ್‌ಗಳು ದೊರೆತಿವೆ. ಅಪರಾಧ ಸಂಖ್ಯೆಗಳು: ${
          rows.map(r => r.crime_number).filter(Boolean).join(', ') || '(ಕೆಳಗಿನ ಮೂಲಗಳನ್ನು ನೋಡಿ)'
        }.`;
      }
      return `Found ${count} FIR(s) matching your query. Crime numbers: ${
        rows.map(r => r.crime_number).filter(Boolean).join(', ') || '(see sources below)'
      }.`;
    }

    case 'accused_lookup': {
      const names = rows.map(r => r.full_name).filter(Boolean);
      if (count === 1) {
        const r = rows[0];
        if (isKn) {
          return [
            `1 ಆರೋಪಿಯ ವಿವರಗಳು ದೊರೆತಿವೆ.`,
            r.full_name  ? `ಹೆಸರು: ${r.full_name}` : null,
            r.alias      ? `ಉಪನಾಮ: ${r.alias}` : null,
            r.age        ? `ವಯಸ್ಸು: ${r.age}` : null,
            r.gender     ? `ಲಿಂಗ: ${r.gender}` : null,
            r.is_repeat_offender ? `ಪುನರಾವರ್ತಿತ ಅಪರಾಧಿ: ಹೌದು (${r.prior_cases_count || 0} ಹಳೆಯ ಪ್ರಕರಣಗಳು)` : null,
            r.is_arrested != null ? `ಬಂಧನಕ್ಕೊಳಗಾಗಿದ್ದಾರೆಯೇ: ${r.is_arrested ? 'ಹೌದು' : 'ಇಲ್ಲ'}` : null,
          ].filter(Boolean).join('\n');
        }
        return [
          `Found 1 accused record.`,
          r.full_name  ? `Name: ${r.full_name}` : null,
          r.alias      ? `Alias: ${r.alias}` : null,
          r.age        ? `Age: ${r.age}` : null,
          r.gender     ? `Gender: ${r.gender}` : null,
          r.is_repeat_offender ? `Repeat Offender: Yes (${r.prior_cases_count || 0} prior cases)` : null,
          r.is_arrested != null ? `Arrested: ${r.is_arrested ? 'Yes' : 'No'}` : null,
        ].filter(Boolean).join('\n');
      }
      if (isKn) {
        return `${count} ಆರೋಪಿಗಳ ವಿವರಗಳು ದೊರೆತಿವೆ: ${names.slice(0, 5).join(', ')}${count > 5 ? ` ಮತ್ತು ${count - 5} ಇತರರು` : ''}.`;
      }
      return `Found ${count} accused record(s): ${names.slice(0, 5).join(', ')}${count > 5 ? ` and ${count - 5} more` : ''}.`;
    }

    case 'victim_lookup': {
      if (count === 1) {
        const r = rows[0];
        if (isKn) {
          return [
            `1 ಸಂತ್ರಸ್ತರ ವಿವರಗಳು ದೊರೆತಿವೆ.`,
            r.full_name          ? `ಹೆಸರು: ${r.full_name}` : null,
            r.age                ? `ವಯಸ್ಸು: ${r.age}` : null,
            r.gender             ? `ಲಿಂಗ: ${r.gender}` : null,
            r.injury_description ? `ಗಾಯದ ವಿವರ: ${r.injury_description.slice(0, 200)}` : null,
          ].filter(Boolean).join('\n');
        }
        return [
          `Found 1 victim record.`,
          r.full_name          ? `Name: ${r.full_name}` : null,
          r.age                ? `Age: ${r.age}` : null,
          r.gender             ? `Gender: ${r.gender}` : null,
          r.injury_description ? `Injury: ${r.injury_description.slice(0, 200)}` : null,
        ].filter(Boolean).join('\n');
      }
      return isKn ? `${count} ಸಂತ್ರಸ್ತರ ದಾಖಲೆಗಳು ದೊರೆತಿವೆ.` : `Found ${count} victim record(s).`;
    }

    default:
      return isKn
        ? `ನಿಮ್ಮ ಶೋಧನೆಗೆ ${count} ದಾಖಲೆಗಳು ದೊರೆತಿವೆ. ಹೆಚ್ಚಿನ ವಿವರಗಳಿಗೆ ಕೆಳಗಿನ ಮೂಲ ಆಧಾರಗಳನ್ನು ನೋಡಿ.`
        : `Found ${count} record(s) matching your query. See the source references below for details.`;
  }
}

// ---------------------------------------------------------------------------
// Source builder
// ---------------------------------------------------------------------------

function buildSources(rows, tables, isAggregate) {
  if (!rows?.length) return [];

  return rows.slice(0, 20).map((row, idx) => {
    const firId   = row.ROWID || row.fir_id || null;
    const crimeNo = row.crime_number || null;

    const excerptFields = ['crime_number', 'fir_date', 'brief_facts', 'full_name', 'status_name',
                           'year', 'total_firs', 'chargesheeted', 'under_investigation'];
    const excerptParts  = excerptFields
      .filter(f => row[f] != null)
      .map(f => `${f}: ${String(row[f]).slice(0, 80)}`);

    return {
      source_index:  idx + 1,
      fir_id:        firId   ? String(firId)   : null,
      crime_number:  crimeNo ? String(crimeNo) : null,
      table:         tables[0] || 'FIR',
      row_ref:       firId   ? `${tables[0]}#${firId}` : `row${idx + 1}`,
      excerpt:       excerptParts.slice(0, 4).join(' | ').slice(0, 300),
      is_aggregate:  isAggregate,
    };
  });
}

// ---------------------------------------------------------------------------
// No-results template
// ---------------------------------------------------------------------------

function buildNoResultsAnswer(question, queryMeta, lang) {
  if (lang === 'kn') {
    return `ನಿಮ್ಮ ಪ್ರಶ್ನೆಗೆ ಸೂಕ್ತವಾದ ಯಾವುದೇ ದಾಖಲೆಗಳು ದತ್ತಸಂಚಯದಲ್ಲಿ ದೊರೆತಿಲ್ಲ.\n` +
      `ಅನ್ವಯಿಸಲಾದ ಶೋಧನೆ: ${queryMeta.description}\n` +
      `ದಯವಿಟ್ಟು ಅಪರಾಧ ಸಂಖ್ಯೆ, ಹೆಸರು ಅಥವಾ ದಿನಾಂಕ ಸರಿಯಾಗಿದೆಯೇ ಎಂದು ಪರಿಶೀಲಿಸಿ.`;
  }
  return `I searched the database but found no records matching your query.\n` +
    `Query applied: ${queryMeta.description}\n` +
    `If you expected records, check that the case number, name, or date is correct.`;
}

function formatDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-IN'); } catch { return String(d); }
}

module.exports = { composeAnswer };
