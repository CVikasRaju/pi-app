# 🚓 Police Intelligence App (PI App)
### Next-Generation Crime Intelligence, Graph Analytics & Explainable RAG Platform

[![Next.js](https://img.shields.io/badge/Next.js-14.2-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![Zoho Catalyst](https://img.shields.io/badge/Zoho_Catalyst-Serverless-blue?style=for-the-badge&logo=zoho)](https://www.zoho.com/catalyst/)
[![Neo4j](https://img.shields.io/badge/Neo4j-Graph_DB-008CC1?style=for-the-badge&logo=neo4j)](https://neo4j.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![Security Audited](https://img.shields.io/badge/Security-Hardened_&_Audited-success?style=for-the-badge&logo=shield)](file:///C:/Users/vikas/.gemini/antigravity/brain/3b2f4d38-56c6-4b06-b83b-30d503d41166/walkthrough.md)

---

## 🌟 Overview

The **PI App** is a state-of-the-art **Police Crime Intelligence & RAG Chatbot Platform** built for law enforcement agencies (such as Karnataka State Police). It unifies structured criminal records, complex crime networks, predictive risk scoring, and multilingual conversational AI into a secure, role-governed serverless application.

Powered **100% by Zoho Catalyst Serverless Infrastructure**, **AppSail Neo4j Graph DB**, and **Next.js 14**, the platform empowers investigators, crime analysts, supervisors, and policymakers to derive actionable insights from complex crime records while strictly enforcing data privacy and zero-trust audit compliance.

---

## 🔥 Key Capabilities

### 🧠 1. Multilingual Conversational RAG (English & Kannada)
- **Natural Language Query Engine:** Ask complex queries about FIRs, accused individuals, crime trends, and case statuses in English or Kannada (ಕನ್ನಡ).
- **Strict Citation Contract:** Every response attaches grounded `sources` linking back to authentic Data Store records.
- **Dossier & PDF Export:** One-click automated PDF intelligence export for court and investigative reporting.

### 🌐 2. Graph Intelligence & Link Analysis (Neo4j & Cytoscape)
- **Crime Network Visualization:** Interactive node-edge graphs mapping relationships between **Accused**, **FIRs**, **Victims**, **Vehicles**, and **Financial Accounts**.
- **Financial & Modus Operandi (MO) Tracing:** Instantly surface hidden money transfers, shell accounts, getaway vehicle linkages, and co-accused patterns across districts.
- **Automated ETL Sync:** Seamless synchronization between Catalyst Relational Data Store and Neo4j AppSail graph database.

### 📊 3. Predictive Analytics & Early-Warning Systems
- **Zia AutoML Recidivism Scoring:** Machine learning model evaluating repeat offender risk scores based on criminal history, bail status, gravity of offences, and associate networks.
- **Geospatial Hotspot Mapping:** Dynamic Leaflet-based spatial heatmaps mapping crime density across police stations and districts.
- **Early-Warning Alerts:** Real-time warning triggers when crime volume breaches historical baseline thresholds.

### 🔍 4. Explainable AI (XAI) & Reasoning Trace
- **Transparent Decision Pipeline:** Step-by-step reasoning timeline (`Intent Parse` ➔ `ZCQL Query` ➔ `Graph Lookup` ➔ `ML Score` ➔ `Answer Composition`).
- **Confidence Scoring:** Real-time confidence calibration for every generated intelligence summary.

### 🛡️ 5. Zero-Trust Security & Role-Based Access Control (RBAC)
- **Granular Role System:** 4 enforcement roles (**Investigator**, **Analyst**, **Supervisor**, **Policymaker**).
- **Policymaker Aggregate-Only Lockdown:** Policymakers are strictly restricted to aggregate statistical views with automatic PII redaction (names, phone numbers, exact addresses).
- **Immutable Audit Trail:** Append-only logging (`audit-logger`) capturing every data access call, with zero update or delete permissions anywhere in the code.
- **Automated Compliance Scanner:** Route-level RBAC scanner (`/api/audit/lockdown-report`) verifying zero PII exposure to restricted roles.

### 🎤 6. Hands-Free Voice Intelligence
- **Zia Speech Engine:** Speech-to-Text (STT) voice queries and Text-to-Speech (TTS) response audio playback for officers in field operations.

---

## 🏗️ System Architecture

```
                               ┌─────────────────────────────────────────┐
                               │           Next.js 14 Client             │
                               │  (Dashboard, Chat, Graph, Analytics)    │
                               └────────────────────┬────────────────────┘
                                                    │ REST / Auth Token
                                                    ▼
                               ┌─────────────────────────────────────────┐
                               │       Zoho Catalyst API Gateway         │
                               │       (Gateway / RBAC & Audit Check)    │
                               └─────────┬──────────────────────┬────────┘
                                         │                      │
                   ┌─────────────────────┴──────┐        ┌──────┴─────────────────────┐
                   ▼                            ▼        ▼                            ▼
        ┌─────────────────────┐       ┌──────────────────┐    ┌──────────────────────────┐
        │  Catalyst Data Store│       │ Catalyst NoSQL   │    │  Neo4j Graph (AppSail)   │
        │  (FIR, Accused, DB) │       │ (Trace / Session)│    │  (Network & Link Engine) │
        └─────────────────────┘       └──────────────────┘    └──────────────────────────┘
```

---

## 🔐 Role-Based Access Control (RBAC) Matrix

| Feature / Resource | Investigator | Analyst | Supervisor | Policymaker |
| :--- | :---: | :---: | :---: | :---: |
| **Row-Level FIR & Accused Details** | ✅ | ✅ | ✅ | ❌ *(Redacted)* |
| **Aggregate Crime Statistics** | ✅ | ✅ | ✅ | ✅ |
| **Graph Network Visualizer** | ✅ | ✅ | ✅ | ❌ |
| **Zia AutoML Recidivism Scores** | ✅ | ✅ | ✅ | ❌ |
| **PDF Dossier Export** | ✅ | ✅ | ✅ | ❌ |
| **Audit Lockdown Reports** | ❌ | ❌ | ✅ | ❌ |

---

## 📁 Repository Structure

```
pi-app/
├── client/                      # Next.js 14 Frontend Application
│   ├── src/
│   │   ├── app/                # App Router (/chat, /graph, /analytics, /dashboard)
│   │   ├── components/         # UI Components (ReasoningPanel, GraphVisualizer, HotspotMap, etc.)
│   │   └── lib/                # API clients & Catalyst Auth integration
│   └── public/                 # Static assets & emblems
├── functions/                   # Zoho Catalyst Serverless Node.js Functions
│   ├── pi_app_function/        # Core Gateway, Auth, RBAC & Audit Lockdown Handler
│   ├── chat-router/            # Conversational Intelligence Router
│   ├── nl-to-query/            # Natural Language to ZCQL Query Compiler
│   ├── response-composer/      # Grounded Answer Synthesizer & Source Citation Engine
│   ├── graph-query/            # Neo4j Cypher & In-Memory Graph Engine
│   ├── graph-sync/             # Data Store ➔ Neo4j Graph Synchronizer
│   ├── pdf-export/             # Intelligence Dossier PDF Generator
│   ├── audit-logger/           # Append-Only Immutable Security Audit Logger
│   └── zia-voice/              # Zia STT / TTS Audio Processing
├── appsail/                     # Zoho Catalyst AppSail Services
│   └── neo4j/                  # Containerized Neo4j Graph Database
├── schema/                      # MySQL/ZCQL Relational Database Schemas
├── docs/                        # Architecture, API Specifications, & Migration Guides
└── .catalyst/                   # Catalyst Project Configuration & CI/CD Pipelines
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Zoho Catalyst CLI**: Installed globally via `npm install -g zcatalyst-cli`
- **Docker**: (Optional, for local Neo4j development)

---

### Installation & Local Setup

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/your-org/pi-app.git
   cd pi-app
   ```

2. **Configure Environment Variables:**
   Copy `.env.local` to configure your environment variables:
   ```bash
   cp .env.local client/.env.local
   ```
   > ⚠️ **Note:** Never commit `.env` or `.env.local` files to git.

3. **Install Dependencies:**
   ```bash
   # Install root dependencies
   npm install

   # Install client dependencies
   cd client && npm install && cd ..
   ```

4. **Run Local Development Servers:**
   - **Frontend Client (Next.js):**
     ```bash
     cd client
     npm run dev
     ```
     Access the dashboard at `http://localhost:3000`.

   - **Backend Catalyst Serverless Functions:**
     ```bash
     catalyst serve
     ```

---

## ⚙️ Deployment & CI/CD

This repository includes a pre-configured **Catalyst Pipeline** (`.catalyst/pipelines/pi-app-ci.yml`) for automated linting, syntax validation, Next.js build verification, and deployment.

### Manual Deployment via Catalyst CLI

1. **Login to Catalyst:**
   ```bash
   catalyst login
   ```

2. **Deploy Functions & Client:**
   ```bash
   catalyst deploy
   ```

---

## 🛡️ Security & Privacy Compliance

- **No Hardcoded Secrets:** All credentials, database URIs, and authentication tokens are loaded dynamically from environment variables.
- **PII Protection:** Caste, religion, and personal identifying details are masked and rounded to aggregate percentages in accordance with law enforcement privacy guidelines.
- **Git History Cleanliness:** Verified free of committed secrets or live API keys.

---

## 📜 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

<p center>
  <b>Police Intelligence App (PI App)</b> — Empowering Law Enforcement with Ethical, Explainable & Scalable AI.
</p>
