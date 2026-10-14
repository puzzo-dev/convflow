# ConvFlow Architecture Principles
## Hybrid Runtime — Final Clarification

**Last updated:** 2026-10-15 (n8n AI research)

---

## Core Principle (Locked)

> **Deterministic Flow Engine = Conversation Spine**  
> **n8n = Primary Integration & Side-Effects Layer**

The deterministic flow engine is **not** responsible for building integrations from scratch.  
It only manages conversation state, collects structured answers, handles human takeover, and decides *when* an action is ready.

Almost all real-world side effects (create quotation, update Shopify, send email, complex approval chains, multi-system orchestration, etc.) are executed by **n8n workflows** (or a thin tool that immediately triggers n8n).

This is why n8n was chosen: it is already integration-ready for hundreds of platforms. We do **not** re-implement those integrations inside the flow engine.

---

## How n8n workflows are created (AI-assisted)

n8n has strong AI building features (n8n Assistant in the UI, and an **MCP server** for external agents). See `docs/N8N_AI_WORKFLOW_BUILDING.md`.

**ConvFlow policy:**

1. **Automated onboarding** uses our generator to guarantee the webhook ↔ callback contract (REST API skeleton), and may optionally enrich the workflow via **n8n MCP** using a natural-language brief from the Onboarding Agent.
2. **n8n Assistant** (in-app, needs LLM API key + sandbox on self-hosted) is the path for human/admin refinement — never required for the business owner.
3. Business owner still never opens n8n or writes JSON.

There is **no** documented public “send prompt, get workflowId” REST API for the Assistant itself. MCP + REST are the programmable surfaces.

---

## Layer Responsibilities

| Layer | Responsibility | Integrations? |
|-------|----------------|---------------|
| **Channel Adapters** | Normalize inbound/outbound (WhatsApp/OpenWA, Meta IG+Messenger, X, TikTok…) | Thin only |
| **Deterministic Flow Engine** | Multi-turn conversation state, stages, branching, human takeover, collecting answers | **No** heavy integrations |
| **LLM Agent** | Free-form understanding, intent, tool selection, RAG answers | Calls tools |
| **Tool Layer** | Thin interface (`create_quotation`, `escalate`, `custom_xyz`) | Points to n8n or internal |
| **n8n** | Actual side-effects, unique business logic, 400+ platform nodes | **Primary integration workhorse** |
| **ERPNext Plugin** | Fast-path convenience for the main ERP (can also be called from n8n) | Optional direct path |

---

## Runtime Flow (any channel)

```
Inbound message (any channel)
        ↓
Conversation Router + State (Redis)
        ↓
┌───────────────────────┐     ┌──────────────────────────┐
│ Deterministic Flow    │  or │ LLM Agent Orchestrator   │
│ (structured paths)    │     │ (free-form + RAG)        │
└───────────┬───────────┘     └────────────┬─────────────┘
            │                              │
            └──────────┬───────────────────┘
                       ↓
              Tool is called
                       ↓
        ┌──────────────┴──────────────┐
        │                             │
   Thin internal                 n8n workflow
   (rare / fast-path)            (default for
                                 side-effects &
                                 unique logic)
```

---

## Implications for Generators & Onboarding

- Flow Generator only emits conversation stages + a final “call tool X” terminal.
- Tool Generator creates tool definitions whose `implementation` is usually `"n8n"`.
- n8n Workflow Generator owns the webhook/callback contract; may use MCP to fill integration nodes from a natural-language brief.
- Business owner never opens n8n and never writes integration code.
- Adding a new platform (Shopify, HubSpot, Google Calendar, etc.) = n8n workflow (generated or refined), **not** new code in the flow engine.

---

## Existing ERPNext Code

The current ERPNext plugin and `erpnext_item_select` stage remain as a convenient fast-path.  
They can stay, but new or complex actions should prefer the n8n path for consistency and to avoid building every integration from scratch.

---

*This principle overrides any earlier ambiguity. Keep in sync with N8N_AI_WORKFLOW_BUILDING.md and SELF_BUILDING_SYSTEM.md.*
