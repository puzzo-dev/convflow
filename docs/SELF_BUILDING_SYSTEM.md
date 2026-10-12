# ConvFlow Self-Building System
## Complete Design: Onboarding Agent + Generators + Internal APIs + Meta App

**Version:** 1.0  
**Status:** Design + Scaffold  
**Depends on:** `docs/ONBOARDING_AGENT.md`, existing hybrid engine, Prisma schema

---

## 1. Overview

ConvFlow becomes a self-building multi-channel agent platform:

1. Business owner chats with the **Onboarding Agent**.
2. Agent builds a live `BusinessProfile`.
3. Owner connects channels & systems via guided OAuth / simple flows (including a **ConvFlow Meta App** so any user can connect their own Facebook Page, Instagram, WhatsApp Business, etc.).
4. **Generators** automatically create:
   - Deterministic flows
   - LLM agent instructions + tools
   - RAG from website
   - n8n workflows for unique logic
5. Owner tests in sandbox → goes live.
6. Same agent can later evolve the system.

---

## 2. Meta App (Multi-Tenant Channel Connections)

ConvFlow will own **one Meta App** that other businesses use to connect their own assets.

### Capabilities the Meta App must request
- `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement`
- `instagram_basic`, `instagram_manage_messages`
- `whatsapp_business_management`, `whatsapp_business_messaging` (if using Cloud API later)
- `business_management`

### Connection Flow (for any tenant)
1. Owner clicks “Connect Instagram / Messenger / WhatsApp” inside Onboarding or Dashboard.
2. Redirected to Meta OAuth using **ConvFlow’s Meta App**.
3. User selects the Page / IG account / WABA they want to grant to ConvFlow.
4. ConvFlow receives the long-lived Page Access Token + IDs.
5. Tokens are stored encrypted per tenant (`PluginCredential` or a new `ChannelConnection` table).
6. Webhooks for that Page/IG are subscribed to ConvFlow’s webhook endpoint.
7. Incoming messages are normalized into `InboundEvent` and routed by `page_id` / `ig_id` → tenant.

### New Data Model (to add)
```prisma
model ChannelConnection {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  companySlug   String   @map("company_slug") @db.VarChar(80)
  channel       String   @db.VarChar(30)   // instagram | messenger | whatsapp_cloud | x | tiktok
  externalId    String   @map("external_id") @db.VarChar(120)  // page_id, ig_user_id, etc.
  displayName   String?  @map("display_name") @db.VarChar(200)
  accessToken   String   @map("access_token")  // encrypted
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

### Webhook Routing
Meta will send all events to one ConvFlow endpoint. The handler looks up `ChannelConnection` by `entry.id` (page_id) or Instagram-scoped ID and routes to the correct tenant.

---

## 3. Internal APIs (for Onboarding Agent + Generators)

All under `/api/internal/` or `/api/onboarding/` (protected by service key or admin JWT).

### 3.1 Business Profile
```
POST   /api/onboarding/profile
GET    /api/onboarding/profile/:tenantId
PATCH  /api/onboarding/profile/:tenantId
```
Body = partial or full `BusinessProfile`.

### 3.2 Tenant Lifecycle
```
POST   /api/onboarding/tenants                 → create Organization + Tenant from profile
POST   /api/onboarding/tenants/:id/go-live
POST   /api/onboarding/tenants/:id/sandbox-session
```

### 3.3 Connections
```
POST   /api/onboarding/connect/website        { tenantId, url }
POST   /api/onboarding/connect/erpnext        { tenantId, siteUrl, apiKey, apiSecret }
GET    /api/onboarding/connect/meta/start     → returns OAuth URL (ConvFlow Meta App)
GET    /api/onboarding/connect/meta/callback  → exchanges code, stores ChannelConnection
POST   /api/onboarding/connect/whatsapp-openwa { tenantId } → returns QR / session link
```

### 3.4 Generators (triggered by Onboarding Agent)
```
POST   /api/onboarding/generate
Body: { tenantId, steps?: ["rag", "flows", "tools", "n8n", "agent"] }

Returns: updated BusinessProfile.generated + status of each step
```

### 3.5 n8n Bridge
```
POST   /api/internal/n8n/create-workflow     { tenantId, name, description, nodesTemplate }
POST   /api/internal/n8n/activate/:workflowId
POST   /api/internal/n8n-callback            ← called by n8n workflows
```

### 3.6 Runtime Tools (used by LLM Agent later)
```
POST   /api/tools/execute
Body: { tenantId, toolId, arguments, conversationContext }
```

---

## 4. Generator Design

### 4.1 RAG Builder
- Input: `systems.website.url`
- Crawl (respect robots.txt, limit depth/pages)
- Chunk → embed (OpenAI / local / whatever provider is configured)
- Store in tenant-scoped vector collection (pgvector recommended first)
- Update `generated.ragSources`

### 4.2 Flow Generator
- For each intent with `desiredAction` in [`create_order`, `save_lead`, `book_appointment`, simple FAQ]:
  - Emit a deterministic `FlowStage[]` compatible with current `src/types`.
- Prefer structured stages for high-volume paths; leave ambiguous intents to the LLM agent.

### 4.3 Tool Generator
- Create tool definitions for:
  - ERPNext actions (reuse existing plugin)
  - `create_quotation`, `create_order`, `escalate_to_human`
  - Any `custom_n8n` intent → tool that points to the n8n workflow ID
- Store in `BusinessProfile.generated.tools` and also persist in DB if needed.

### 4.4 n8n Workflow Generator (Critical)

**Goal:** Business owner never opens n8n.

Process:
1. Detect intents or policies that need custom logic.
2. Call n8n API to create a workflow from a **standard template**:
   - Webhook trigger (ConvFlow → n8n)
   - Optional approval / IF nodes
   - HTTP nodes to ERPNext or other systems
   - Final callback to `/api/internal/n8n-callback`
3. Activate the workflow.
4. Store `n8nWorkflowId` on the corresponding tool.
5. At runtime the LLM Agent or a deterministic terminal simply calls the tool; n8n does the unique work.

Template variables the generator fills:
- Tenant ID, intent name, approval rules, field mappings, callback URL, secrets.

### 4.5 Agent Instructions Generator
- Produce a system prompt from `BusinessProfile` (tone, policies, available tools, escalation rules).
- Store in `generated.agentInstructions`.

---

## 5. Onboarding Agent Implementation Sketch

Location (suggested):
```
src/onboarding/
  agent.ts              ← main conversational loop
  profile.ts            ← BusinessProfile CRUD + validation
  interview.ts          ← state machine / phase tracking
  generators/
    index.ts
    rag.ts
    flows.ts
    tools.ts
    n8n.ts
    agent-instructions.ts
  connections/
    meta.ts
    erpnext.ts
    website.ts
    openwa.ts
  routes.ts             ← Fastify routes for /api/onboarding/*
```

The agent itself can be:
- An LLM with tool calling (the tools are the Internal APIs above), **or**
- A lightweight state machine that calls the LLM only for NLU + reply generation while keeping the profile in code.

Recommended: LLM + tools, because the interview is open-ended.

---

## 6. Prisma Additions Needed

- `BusinessProfile` table (or store as JSON on Tenant + versioned)
- `ChannelConnection` (shown above)
- Possibly `GeneratedArtifact` or just keep everything inside `BusinessProfile.generated` + Tenant.configJson for backward compatibility.

---

## 7. Security Notes

- All Meta tokens and ERPNext secrets encrypted at rest (existing pattern).
- Onboarding routes require authenticated user or a short-lived onboarding session token.
- n8n callback endpoint must verify a shared secret or JWT.
- Meta webhook must verify the `X-Hub-Signature-256`.

---

## 8. Implementation Order (Recommended)

1. Add `ChannelConnection` + Meta OAuth routes (so multi-tenant Meta works).
2. Persist `BusinessProfile` (new table or JSON on Tenant).
3. Implement Internal APIs listed in section 3.
4. Build the Onboarding Agent conversational loop + profile updater.
5. Implement generators one by one (start with website RAG + simple flow generator).
6. n8n workflow generator + callback.
7. Wire sandbox test chat + go-live.
8. Polish dashboard so owner can re-open the Onboarding Agent later to evolve the bot.

---

*This document is the master plan. Update it whenever the self-building architecture changes.*
