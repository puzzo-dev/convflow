# ConvFlow Design Chat Export
## Full Context for Builder Agent

**Exported:** 2026-10-13  
**Source:** Design conversation between founder (puzzo-dev) and Grok  
**Purpose:** Any coding / builder agent working on ConvFlow should read this document + the linked docs to understand the complete intended product and architecture.

---

## 1. Product Vision (Founder’s Words)

ConvFlow is a **headless conversational layer** that sits between users and a business’s apps.

- Businesses sign up and connect website + ERP + WhatsApp (and later IG, Messenger, X, TikTok).
- End users text or send voice notes.
- An internal AI agent / LLM checks intent and executes actions.
- Examples:
  - “What services do you offer?” → answered from website knowledge (RAG).
  - “I need a quote for X” → reaches ERP, creates quotation, returns PDF or emails it.
  - Price negotiation → escalates to human-in-the-loop (business owner).

**Dual use:** First used internally by the founder’s businesses, then sold cheaply as a multi-tenant SaaS.

**Self-building requirement:**  
Users sign up → talk to a chat box about their business → answer questions → log in / connect the services they want → system sets everything up with zero technical difficulty. The owner never writes code, edits JSON, or opens n8n.

---

## 2. Key Decisions Made in This Chat

### 2.1 Hybrid Runtime (Final)
- Keep the existing **deterministic flow engine** as the **conversation spine** (state, stages, human takeover, collecting answers).
- **n8n is the primary integration and side-effects layer**.
- Reason: n8n is already integration-ready for most platforms. Building every integration from scratch inside the deterministic engine would be wasteful.
- Deterministic flow should **not** contain heavy integration code. It collects data and calls tools. Tools usually trigger n8n workflows.

See `docs/ARCHITECTURE_PRINCIPLES.md`.

### 2.2 Multi-Channel
Any channel can trigger the same workflows:
- WhatsApp (OpenWA — already working)
- Instagram DM + Facebook Messenger (via one ConvFlow-owned Meta App)
- X DMs, TikTok DMs (later)
- Channels are thin adapters that normalize to a common `InboundEvent`.

### 2.3 LLM Providers
Support multiple models: Grok, Chinese models, OpenAI, Claude Haiku, Gemma SLM, etc. Pluggable.

### 2.4 ERP Preference
ERPNext first (deep Frappe integration already started). Odoo later.

### 2.5 Self-Building Onboarding
- Onboarding Agent interviews the owner in natural language.
- Builds a structured `BusinessProfile`.
- Guided connections (OAuth for Meta, QR for OpenWA, API keys for ERPNext, URL for website).
- Generators automatically produce:
  - RAG from website
  - Deterministic conversation flows
  - Tools (mostly n8n-backed)
  - n8n workflows for unique logic
  - Agent system prompt
- Owner tests in sandbox → goes live.
- Same agent can later evolve the bot (“add order status”, “change discount rules”).

### 2.6 Meta App
ConvFlow owns **one** Meta App. Any tenant can connect their own Facebook Page + Instagram account through it. Tokens stored per tenant; webhooks routed by page_id.

---

## 3. Canonical Documents the Builder Must Follow

| Document | Content |
|----------|---------|
| `docs/ARCHITECTURE_PRINCIPLES.md` | Deterministic flow = spine, n8n = integrations |
| `docs/ONBOARDING_AGENT.md` | BusinessProfile schema, interview script, n8n auto-setup rules |
| `docs/SELF_BUILDING_SYSTEM.md` | Master plan: APIs, generators, Meta, implementation order |
| `docs/META_APP.md` | Multi-tenant Meta App details |
| `.agents/skills/convflow/SKILL.md` | Existing engine (keep as conversation spine) |
| `.agents/skills/onboarding-agent/SKILL.md` | Onboarding skill |
| `.agents/skills/self-building/SKILL.md` | Self-building skill |
| `src/onboarding/types.ts` | Runtime BusinessProfile types |
| `src/onboarding/generators/n8n.ts` | n8n workflow generator (already scaffolded) |
| `src/onboarding/generators/index.ts` | Generator pipeline |

---

## 4. Current Codebase Reality

- Multi-tenant WhatsApp workflow engine already exists and works.
- OpenWA gateway, Prisma + Postgres + Redis, human takeover, ERPNext item cache + create order/lead, plugin system, dashboard.
- Flow engine is config-driven (stages + terminals). **Keep it for conversation control.**
- Do not rip it out. Evolve it so terminals call tools → n8n.

---

## 5. What the Builder Agent Should Do Next

Follow the implementation order in `docs/SELF_BUILDING_SYSTEM.md`:

1. Add `ChannelConnection` model + Meta OAuth + webhook router.
2. Persist `BusinessProfile`.
3. Implement the Internal APIs.
4. Build the Onboarding Agent conversational loop (LLM + tools that call the Internal APIs).
5. Finish generators (RAG, conversation flows, tools, n8n, agent instructions).
6. Sandbox test chat + go-live.
7. Make the Onboarding Agent re-openable so owners can evolve their bot later.

**Hard rules for the Builder:**
- Business owner never configures n8n or writes code.
- New integrations = n8n workflows (generated or templated), not new TypeScript integration code inside the flow engine.
- Deterministic flow stays focused on conversation state only.

---

## 6. Original Example Flows (for reference)

- User asks about a service → RAG from website.
- User asks for quote → tool → n8n/ERPNext creates quotation → PDF or email + WhatsApp reply.
- User negotiates price → escalate to human-in-the-loop (existing human mode + notifications).

---

*End of export. This document + the linked docs are the complete design context.*
