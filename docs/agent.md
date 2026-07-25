# AGENT.md — Build Instructions for Antigravity 2.0
This file is the standing context Antigravity should read before touching this repo. Keep it updated as decisions change.

## 0. What this project is
PI App — conversational crime intelligence platform for Karnataka SCRB. Full spec in `product.md`, full stack mapping in `architecture.md`. Read both before generating code.

## 1. Hard constraints (do not violate)
- **Deployment target is Zoho Catalyst, exclusively.** Never suggest AWS/Vercel/Firebase/Supabase for anything Catalyst has a service for (see the service table in `architecture.md`). The one intentional exception is Neo4j, which itself runs *inside* Catalyst via AppSail's custom OCI runtime — not a separate host.
- **No chatbot response ships without a citation** (FIR IDs / row refs / graph path). This is checked in code review, not left to the model's discretion at inference time.
- **RBAC and audit logging are Phase 0**, built before any conversational feature — not retrofitted.
- Frontend: Next.js, deployed via Catalyst Slate / Web Client Hosting.
- Backend: Catalyst Serverless Functions (Node.js or Python — pick one and stay consistent; Node recommended for parity with Next.js frontend types).

## 2. Repo structure (target)
```
/pi-app
  /client                 # Next.js frontend
    /app
    /components
    /lib                  # API client, i18n (en/kn)
  /functions              # Catalyst Serverless Functions
    /chat-router
    /nl-to-query
    /response-composer
    /graph-sync           # ETL into Neo4j (AppSail)
    /risk-scoring
    /pdf-export
    /audit-logger
  /catalyst.json           # Catalyst project config
  /product.md
  /architecture.md
  /agent.md
```

## 3. How Catalyst CLI and Antigravity work together
They cover different halves of the job — Antigravity writes and edits code inside the repo; Catalyst CLI provisions and deploys the cloud resources that code runs against. Rough division:

- **Catalyst CLI** (`catalyst` command): project init, resource provisioning (Data Store tables, Functions scaffolding, AppSail deploy, environment/auth setup), local dev serving, deploy/push.
- **Antigravity**: writes the actual Function handlers, frontend components, schema migration files, Cypher queries, ML pipeline code — inside the folders Catalyst CLI scaffolds.

Practical flow for each build phase:
1. You run the relevant `catalyst` CLI command to scaffold/provision the resource (e.g., `catalyst function:create nl-to-query`).
2. You hand Antigravity the resulting stub file + the relevant prompt below, and let it fill in the logic.
3. `catalyst serve` to test locally against Catalyst's dev environment.
4. `catalyst deploy` once the phase's slice works.

### Step-by-step to start
```bash
# 1. Install and log in
npm install -g zcatalyst-cli
catalyst login

# 2. Initialize the project (interactive — pick Functions, Data Store, Authentication, Web Client Hosting to start)
mkdir pi-app && cd pi-app
catalyst init

# 3. Scaffold Phase 0 resources
catalyst function:create audit-logger --type nodejs
catalyst function:create chat-router --type nodejs
# Data Store tables are created via the Catalyst Console or catalyst datastore commands —
# create Station, Officer, FIR, Accused, Victim, FIR_Accused, FIR_Victim, AuditLog first

# 4. Serve locally while Antigravity fills in function logic
catalyst serve

# 5. Deploy once Phase 0 (auth + RBAC + audit skeleton) works
catalyst deploy
```
Open the repo in Antigravity 2.0 *after* step 3 — give it real scaffolded files to work with rather than an empty folder; it produces much more targeted code when it can see the Catalyst function signature/handler shape already in place.

## 4. Ready-to-paste Antigravity prompts, by phase

### Phase 0 — Foundation (paste as-is)
```
Read product.md, architecture.md, and agent.md in this repo before doing anything else.

Build Phase 0 of the PI App:
1. Define the Catalyst Data Store schema for: Station, Officer, FIR, Accused, Victim,
   FIR_Accused (link table), FIR_Victim (link table), AuditLog. Use the assumed schema
   in architecture.md §0 as the starting point.
2. Implement Catalyst Authentication with four roles: investigator, analyst, supervisor,
   policymaker. Enforce role checks inside Function handlers, not just the frontend.
3. Implement the `audit-logger` Function: append-only writes to AuditLog on every
   data-access call. No update/delete path should exist for this table anywhere in the code.
4. Scaffold the Next.js client with a basic login flow wired to Catalyst Authentication.

Do not build any chatbot/conversational logic yet — that's Phase 1. Stop after RBAC
and audit logging are working end-to-end and demoable.
```

### Phase 1 — Conversational MVP (English, text-only)
```
Phase 1 of the PI App: build the first conversational slice, English only, text only,
no voice, no graph, no ML.

1. `nl-to-query` Function: takes a natural-language question, uses Catalyst QuickML
   (RAG) against the FIR/Accused/Victim tables to retrieve relevant rows, and returns
   both an answer and the list of FIR IDs / row references it used.
2. `response-composer` Function: formats the answer for the chat UI, always including
   a `sources` field with the citations from step 1. Never return an answer with an
   empty sources field — if there's nothing to cite, say so explicitly instead of
   answering.
3. `chat-router` Function: session-aware routing — retains conversation context in
   Catalyst Cache so follow-up questions ("what about his last case?") resolve without
   the user repeating context.
4. Client: chat UI with an expandable "why this answer" panel showing the citations.
5. `pdf-export` Function + client button: export the full conversation transcript to PDF
   via Catalyst SmartBrowz.

Every response must carry citations — treat this as a hard requirement, not a
nice-to-have.
```

### Phase 2 — Voice + Kannada
```
Add to the existing Phase 1 chat:
1. Speech-to-text and text-to-speech via Catalyst Zia Services, wired into the existing
   chat-router flow (voice input transcribes to text, goes through the same
   nl-to-query/response-composer pipeline, response is spoken back via TTS).
2. Kannada support: evaluate NL understanding in Kannada independently, don't just
   translate English prompts — the RAG retrieval step needs to work directly against
   Kannada queries.
3. Language toggle in the client, persisted per session.
```

### Phase 3 — Graph Intelligence
```
1. Deploy Neo4j Community Edition via Catalyst AppSail (custom OCI runtime).
2. Build `graph-sync` Function: ETL job (also registered with Catalyst Cron for
   scheduled re-sync) that pushes Accused/Victim/Vehicle/FinancialAccount entities and
   their FIR-derived relationships into Neo4j as nodes/edges.
3. Client: add a network visualization view (cytoscape.js or react-force-graph) that
   queries a new `graph-query` Function which runs Cypher against the AppSail-hosted
   Neo4j instance.
4. Add financial link analysis: a Cypher query surfacing shared FinancialAccount nodes
   across multiple FIRs, exposed through the chatbot ("show me accounts linked to this
   accused") with the same citation contract as Phase 1.
```

### Phase 4 — Analytics & ML
```
1. Zia AutoML classification model for offender recidivism risk scoring, trained on
   FIR/Accused history in Data Store.
2. Hotspot/trend detection Functions: geospatial clustering + time-series analysis over
   FIR date/location/crime_type fields.
3. Sociological cross-referencing: Functions joining FIR data against demographic
   fields already in Accused/Victim records — expose via chatbot with citations.
4. Early-warning: Catalyst Signals + Event Functions that fire when a threshold is
   crossed (e.g., N similar-MO crimes in a district in T days), triggering Push
   Notifications/Mail to supervisors. Orchestrate the ETL → score → alert pipeline with
   Catalyst Circuits.
```

### Phase 5 — XAI & Governance hardening
```
1. Expand the "why this answer" panel into a full reasoning-path visualization
   (not just a source list — show which retrieval/graph/ML step produced each part
   of the answer).
2. Lock down policymaker role to aggregate-only Functions — audit every existing
   Function to confirm no row-level PII path is reachable by that role.
3. Set up Catalyst Pipelines for CI/CD across all Functions and the client.
```

## 5. Conventions
- One Catalyst Function per responsibility (no monolith handler) — keep `chat-router`, `nl-to-query`, `response-composer` separate so citations stay auditable per step.
- Every Function that touches PII calls the shared RBAC check before doing anything else.
- Commit `product.md`/`architecture.md`/`agent.md` updates alongside any scope change — these are living docs, not one-time specs.
