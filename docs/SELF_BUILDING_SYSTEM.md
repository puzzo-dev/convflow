# ConvFlow Self-Building System
## Complete Design: Onboarding Agent + Generators + Internal APIs + Meta App

**Version:** 1.2  
**Status:** Design + Scaffold  
**Depends on:** `docs/ONBOARDING_AGENT.md`, `docs/ARCHITECTURE_PRINCIPLES.md`, `docs/N8N_AI_WORKFLOW_BUILDING.md`, existing hybrid engine, Prisma schema

---

## 0. Architecture Principle (Read First)

**Deterministic Flow Engine = Conversation Spine only.**  
**n8n = Primary Integration & Side-Effects Layer.**

n8n AI building (Assistant + MCP) is leveraged as follows:
- Automated path: our generator guarantees webhook/callback contract; optional MCP enrichment from a natural-language brief.
- Human path: n8n Assistant in the UI for admin refinement (self-hosted needs LLM API key + sandbox).
- Business owner never touches n8n.

Details: `docs/N8N_AI_WORKFLOW_BUILDING.md`.

---

## 1. Overview

ConvFlow becomes a self-building multi-channel agent platform:

1. Business owner chats with the **Onboarding Agent**.
2. Agent builds a live `BusinessProfile`.
3. Owner connects channels & systems via guided OAuth / simple flows (including a **ConvFlow Meta App**).
4. **Generators** automatically create:
   - Deterministic flows (conversation only)
   - LLM agent instructions + tools
   - RAG from website
   - **n8n workflows** for virtually all side-effects and unique logic
5. Owner tests in sandbox → goes live.
6. Same agent can later evolve the system.

---

## 2. Meta App (Multi-Tenant Channel Connections)

ConvFlow owns **one Meta App**. Tenants connect their own Facebook Page / Instagram via OAuth. Tokens in `ChannelConnection`. Webhooks routed by `page_id`.

See `docs/META_APP.md`.

### ChannelConnection model
```prisma
model ChannelConnection {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  companySlug   String   @map("company_slug") @db.VarChar(80)
  channel       String   @db.VarChar(30)
  externalId    String   @map("external_id") @db.VarChar(120)
  displayName   String?  @map("display_name") @db.VarChar(200)
  accessToken   String   @map("access_token")
  tokenExpiresAt DateTime? @map("token_expires_at")
  metadata      Json?
  status        String   @default("connected") @db.VarChar(20)
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @default(now()) @updatedAt @map("updated_at")

  @@unique([channel, externalId])
  @@index([companySlug])
  @@map("channel_connections")
}
```

---

## 3. Internal APIs

### Profile / tenants / connections / generate / n8n / tools
Unchanged from v1.1 — see previous sections in git history or implement as:

- `/api/onboarding/profile`
- `/api/onboarding/tenants`
- `/api/onboarding/connect/*` (website, erpnext, meta, openwa)
- `/api/onboarding/generate`
- `/api/internal/n8n/*` and `/api/internal/n8n-callback`
- `/api/tools/execute`

---

## 4. Generator Design (n8n section updated)

### 4.1–4.3 RAG, Flows, Tools
- Flows = conversation only + terminal that calls a tool.
- Tools default to `implementation: "n8n"`.

### 4.4 n8n Workflow Generator

**Goals:** Owner never opens n8n. Contract with ConvFlow runtime is stable.

**Process:**

1. From `BusinessProfile` intents that need action, build a **natural-language brief** (trigger, systems, data in/out, success/failure, approval rules, callback expectations).
2. **Create skeleton via n8n REST API** (always):
   - Webhook trigger (path scoped by tenant + intent)
   - Optional logic placeholder
   - HTTP Request callback to `CONVFLOW_PUBLIC_URL/api/internal/n8n-callback`
3. **Optional enrichment (feature flag):** call **n8n MCP** with the brief so n8n’s AI tooling adds real integration nodes (ERPNext, Shopify, email, etc.) while preserving the webhook entry and callback exit.
4. Activate after sandbox test; store `n8nWorkflowId` on the tool.
5. **Admin refinement:** open workflow in n8n and use **n8n Assistant** (instance configured with LLM key + sandbox).

Runtime remains: tool call → n8n webhook → workflow → callback.

### 4.5 Agent Instructions Generator
Unchanged — system prompt + tool list from profile.

---

## 5. Onboarding Agent Sketch

```
src/onboarding/
  agent.ts
  profile.ts
  interview.ts
  generators/
    index.ts
    rag.ts
    flows.ts
    tools.ts
    n8n.ts              ← REST skeleton + optional MCP enrich
    agent-instructions.ts
  connections/...
  routes.ts
```

---

## 6–8. Prisma, Security, Implementation Order

Same as v1.1. Prefer implementing `ChannelConnection` + Meta, then profile APIs, then generators with the n8n strategy above.

---

*Master plan. Keep in sync with ARCHITECTURE_PRINCIPLES.md and N8N_AI_WORKFLOW_BUILDING.md.*
