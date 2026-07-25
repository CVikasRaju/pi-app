# PI App — Architecture
**Stack constraint: 100% Zoho Catalyst deployment (mandatory). No non-Catalyst hosting for anything Catalyst has a service for.**

## 0. Real schema (Karnataka Police FIR System — confirmed)
Core: `CaseMaster` (the FIR itself — crime no., dates, lat/long, brief facts, FKs to station/officer/category/gravity/crime-head/sub-head/status/court) is the hub everything hangs off.
Around it: `ComplainantDetails` (incl. occupation/religion/caste/gender — sensitive, see §6a), `Victim`, `Accused`, `ArrestSurrender` (+ junction `inv_arrestsurrenderaccused`), `ActSectionAssociation` (→ `Act`, `Section`), `ChargesheetDetails`, `Inv_OccuranceTime` (1:1 with CaseMaster).
Classification/lookup tables: `CaseCategory`, `GravityOffence`, `CrimeHead`/`CrimeSubHead`/`CrimeHeadActSection`, `CaseStatusMaster`, `CasteMaster`, `ReligionMaster`, `OccupationMaster`.
Org/geo hierarchy: `State` → `District` → `Unit` (police station, self-referencing `ParentUnit`) → `UnitType`; `Employee` (→ `Rank`, `Designation`, `Unit`, `District`); `Court` (→ `District`).

**Gaps vs. the product spec** (build as new tables, not in the current schema):
- No `Vehicle` or `FinancialAccount`/transaction entity — needed for §7 financial-crime/money-trail analysis and vehicle-based network links. Add these plus link tables to `Accused`/`CaseMaster` in Phase 3.
- No `Evidence`/document-storage table — needed to back Stratus-hosted scanned FIRs/photos/audio. Add in Phase 0/3.
- No explicit `AuditLog` table — required for §10 governance; add in Phase 0, append-only.
- Repeat-offender/network linkage today only exists implicitly (same `AccusedName`, no unique person ID across cases — `PersonID` is just a per-case sort label like A1, A2). Real network analysis needs an offender-resolution step (entity resolution/dedup across `Accused` rows) before the graph in Phase 3 means anything — flag this early, it's the hardest data problem in the whole project.

## 1. Layer → Catalyst Service Map

### Layer 1 — Conversational & Voice Interface
| Need | Catalyst Service |
|---|---|
| Frontend SPA (Next.js) | Catalyst Slate / Web Client Hosting |
| Custom domain + SSL | Catalyst Domain Mappings |
| Login / RBAC identity | Catalyst Authentication |
| API layer in front of Functions | Catalyst API Gateway |
| Query understanding + RAG over FIR data | Catalyst QuickML (LLM Serving, RAG) |
| Speech-to-text / text-to-speech, Kannada | Catalyst Zia Services |
| Session/context state (conversation memory) | Catalyst Cache |
| Conversation history storage | Catalyst NoSQL |
| PDF export of transcripts/case summaries | Catalyst SmartBrowz (headless render → PDF) |
| Backend orchestration logic | Catalyst Serverless Functions |

### Layer 2 — Graph & Relationship Intelligence
| Need | Catalyst Service |
|---|---|
| Knowledge graph engine | **Catalyst AppSail (custom OCI runtime) running Neo4j Community** — Catalyst has no native graph DB, this is the one deliberate non-native piece, hosted *inside* Catalyst per the mandatory-deployment rule |
| Source-of-truth entities/edges sync into graph | Catalyst Serverless Functions (ETL job) + Catalyst Cron (scheduled sync) |
| Graph visualization (node-link) | Frontend lib (cytoscape.js or react-force-graph) inside the Slate/Web Client app, fed by Functions querying the AppSail-hosted Neo4j |
| Financial link/money-trail detection | Graph algorithms (community detection, shortest path) run as Functions against Neo4j, orchestrated via Catalyst Circuits |

### Layer 3 — Analytics, ML & Forecasting
| Need | Catalyst Service |
|---|---|
| Core relational store + full-text search | Catalyst Data Store |
| Semi-structured evidence/case notes | Catalyst NoSQL |
| Object storage (scanned FIRs, images, audio) | Catalyst Stratus |
| Hotspot/geospatial + time-series trend detection | Custom Functions + Zia AutoML (tabular models) |
| Sociological/demographic cross-referencing | Functions querying Data Store, exposed via chatbot |
| Offender risk scoring (recidivism) | Catalyst Zia AutoML classification model |
| Early-warning anomaly detection | Catalyst Signals + Event Functions (fire on threshold breach) |
| Multi-step pipeline orchestration (ETL → score → alert) | Catalyst Circuits |
| Scheduled retraining/batch jobs | Catalyst Cron |
| Alerts to users | Catalyst Push Notifications + Catalyst Mail |
| OCR/face/image moderation on evidence | Catalyst Zia Services |

### Layer 4 — Security, Explainability & Governance
| Need | Catalyst Service |
|---|---|
| RBAC enforcement | Catalyst Authentication + role table in Data Store, checked at API Gateway and inside each Function |
| Immutable audit log | Append-only `AuditLog` table (Data Store) or NoSQL collection, written by an Event Function on every read/write |
| XAI citations | Every chatbot response Function attaches the FIR IDs / row refs / graph path used, sourced from the QuickML RAG retrieval step, stored alongside the conversation entry in NoSQL |
| CI/CD | Catalyst Pipelines |
| Cross-service event routing | Catalyst Signals |

## 2. Data Flow (Phase 1 MVP slice)
```
User (text/voice) → Slate frontend → API Gateway → Function: "chat-router"
   → Function: "nl-to-query" (QuickML RAG over Data Store schema + FIR content)
   → Data Store query executed
   → Function: "response-composer" attaches citations (FIR IDs used)
   → Cache updated with session context
   → NoSQL: conversation turn logged (for history + audit)
   → Response streamed back to Slate frontend
```

## 3. Why AppSail + Neo4j (the one non-obvious call)
Catalyst's Data Store and NoSQL are excellent for entity storage but neither does native multi-hop graph traversal (shortest path, community detection) at the query language level. Rather than fake a graph with recursive SQL joins (which gets unreadable past 2–3 hops and is exactly the kind of query investigators need — "how is this accused connected to that gang"), host Neo4j Community Edition as a Docker image on **Catalyst AppSail's custom OCI runtime**. This keeps 100% of the deployment inside Catalyst (satisfying the mandatory-deployment constraint) while giving the graph layer a purpose-built query engine (Cypher). Data Store stays the system of record; Neo4j is a derived, periodically-synced view for traversal and visualization.

## 4. Security Model
- Every table/collection touching PII is access-checked by role at the Function layer, not just the frontend.
- Policymaker role only ever hits pre-aggregated views (Functions that return counts/rates, never row-level FIR data).
- AuditLog writes are append-only — no update/delete path exposed to any role, enforced at the Function level.

### 4a. Caste/religion sensitivity (specific to this schema)
`ComplainantDetails` carries `CasteID` and `ReligionID`. The product spec's sociological-insight feature (§4) is exactly the use case for these fields, but they're also the fields most likely to cause harm if exposed loosely — never return them at the individual-record level to any role except the investigator on that specific case. Analyst/supervisor/policymaker sociological queries should only ever reach caste/religion through pre-aggregated, statistically-rounded views (e.g., "X% of complainants in category Y," never a named individual's caste), and every query touching these two columns should be flagged distinctly in the audit log, not lumped in with generic data access.

## 5. Explainability Contract
Every chatbot response must carry a `sources: [fir_id, ...]` or `reasoning_path: [...]` field. The frontend renders this as an expandable "why this answer" panel. This is a Phase 1 requirement, not deferred — retrofitting citations onto an ungrounded chatbot later is much harder than building retrieval-with-citation from the start.

## 6. Build Order (maps to product.md §5)
1. Data Store schema + Authentication + RBAC + AuditLog skeleton
2. Phase 1 conversational MVP (English, text-only, Data Store retrieval + citations)
3. Voice (Zia STT/TTS) + Kannada NL understanding
4. AppSail/Neo4j graph layer + visualization
5. Zia AutoML risk scoring + Signals-based early warning
6. XAI panel polish + governance hardening + Pipelines CI/CD
