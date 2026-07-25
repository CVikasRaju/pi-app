# PI App — Product Specification
**Intelligent Conversational AI & Crime Analytics Platform for the Karnataka State Crime Records Bureau (SCRB)**

## 1. Problem
1100+ police stations across Karnataka feed a growing crime data repository that today can only be interrogated through static dashboards and manual SQL/report requests. Investigators can't ask a question and get an answer — they have to file a request and wait, or dig through disconnected tables themselves. Patterns across cases (repeat offenders, shared associates, financial links, hotspots) stay invisible unless someone happens to notice them by hand.

## 2. Vision
A conversational layer over the crime database that lets an investigator ask a question in plain English or Kannada — by typing or speaking — and get a grounded, cited answer, plus the ability to drill into networks, trends, and risk scores the same way. Every answer traces back to the exact FIR rows or reasoning path that produced it.

## 3. Users & Roles
| Role | Primary need | Access level |
|---|---|---|
| Investigator | Query FIRs/accused/victims, get leads, similar-case matches | Case-scoped, full detail on assigned cases |
| Analyst | Cross-case patterns, hotspot/trend analysis, network graphs | Read access across a jurisdiction, no PII edit |
| Supervisor | Oversight, case reassignment, risk-scored offender lists | Station/district-wide read, approval actions |
| Policymaker | Aggregate/statistical insight only, no case-level PII | Anonymized/aggregated views only |

## 4. Core Capabilities (mapped to the PS)
1. **Conversational Crime Intelligence Interface** — NL chatbot (English + Kannada), voice in/out, context-aware follow-ups, PDF export of conversation/case summary.
2. **Criminal Network & Relationship Analysis** — graph of accused/victims/locations/vehicles/financial accounts; visualize gangs, repeat-offender clusters, money trails.
3. **Crime Pattern & Trend Analytics** — hotspots, MO clustering, seasonal/event-driven trend detection.
4. **Sociological Crime Insights** — crime frequency cross-referenced against demographic/socio-economic indicators.
5. **Criminology-Based Offender Profiling** — repeat-offender detection, MO-based behavioral clustering, recidivism risk score.
6. **Investigator Decision Support** — auto case summaries/timelines, similar-past-case retrieval, lead suggestions.
7. **Financial Crime & Transaction Link Analysis** — shared-account detection, money-trail visualization across FIRs.
8. **Crime Forecasting & Early Warning** — anomaly detection triggering alerts on emerging patterns/gang activity.
9. **Explainable AI & Transparent Analytics** — every answer cites source rows/reasoning path.
10. **Secure Role-Based Access & Governance** — RBAC, immutable audit log of every query and data access.

## 5. Phased Scope (build order — see architecture.md §6 and agent.md for detail)
- **Phase 0 — Foundation:** Catalyst project, auth, RBAC, core relational schema (FIR/Accused/Victim/Officer/Station), audit logging skeleton.
- **Phase 1 — MVP Conversational Core:** English-only NL→data-retrieval chatbot over FIR/accused/victim/case-status, with citations, session context, PDF export. This is the first demoable slice.
- **Phase 2 — Voice + Kannada:** STT/TTS, Kannada NL understanding and response.
- **Phase 3 — Graph Intelligence:** knowledge graph, network visualization, financial link analysis.
- **Phase 4 — Analytics & ML:** hotspot/trend detection, sociological cross-referencing, offender risk scoring, early-warning alerts.
- **Phase 5 — XAI & Governance hardening:** full reasoning-path visualization, immutable audit trail, policymaker aggregate-only views.

Phases 1–5 are each independently demoable; don't start Phase 2 before Phase 1's citations and RBAC are solid — everything downstream depends on "every answer is traceable" being true from day one, not bolted on later.

## 6. Non-Functional Requirements
- **Scale:** data from 1100+ stations; queries must stay responsive as case volume grows — index and paginate from day one, don't defer it.
- **Security:** all case data touches PII (victims, minors in some cases) — RBAC + audit log are Phase 0, not a later add-on.
- **Explainability:** no chatbot answer ships without a citation back to source records; this is a hard product constraint, not a nice-to-have.
- **Bilingual parity:** Kannada isn't a translation layer bolted onto English — intent understanding should be evaluated in both languages independently.

## 7. Explicitly Out of Scope (for now)
- Predictive individual-level "pre-crime" scoring beyond aggregate risk bands (ethically and legally fraught — keep scoring at the offender-history/recidivism-risk level, not predictive-of-future-specific-crime).
- Cross-state data integration (Karnataka-only for this build).
- Public-facing access — this is an internal SCRB tool only.

## 8. Open Questions (need your input before Phase 1 is fully locked)
- Existing SCRB data volume/format (is there an existing export, or is this greenfield on Catalyst Data Store from day one?).
- Which LLM backend behind Catalyst QuickML — Zia-hosted models only, or bring-your-own (e.g., an Anthropic/OpenAI key via a Catalyst Function)?
- How to handle offender entity resolution — the real schema has no stable person ID linking the same individual across multiple FIRs (see architecture.md §0). Repeat-offender/network features are only as good as this resolution step.
