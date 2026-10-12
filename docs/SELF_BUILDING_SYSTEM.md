# ConvFlow Self-Building System
## Complete Design: Onboarding Agent + Generators + Internal APIs + Meta App

**Version:** 1.1  
**Status:** Design + Scaffold  
**Depends on:** `docs/ONBOARDING_AGENT.md`, `docs/ARCHITECTURE_PRINCIPLES.md`, existing hybrid engine, Prisma schema

---

## 0. Architecture Principle (Read First)

**Deterministic Flow Engine = Conversation Spine only.**  
**n8n = Primary Integration & Side-Effects Layer.**

The flow engine collects answers and manages conversation state.  
It does **not** contain heavy integration code.  
Almost every real action (quotes, orders, external systems, unique business logic) is executed by calling a tool that triggers an **n8n workflow**.  
This is why n8n was chosen — it is already integration-ready. We do not rebuild those integrations from scratch inside ConvFlow.

See `docs/ARCHITECTURE_PRINCIPLES.md` for the full clarification.

---

## 1. Overview

ConvFlow becomes a self-building multi-channel agent platform:

1. Business owner chats with the **Onboarding Agent**.
2. Agent builds a live `BusinessProfile`.
3. Owner connects channels & systems via guided OAuth / simple flows (including a **ConvFlow Meta App** so any user can connect their own Facebook Page, Instagram, WhatsApp Business, etc.).
4. **Generators** automatically create:
   - Deterministic flows (conversation only)
   - LLM agent instructions + tools
   - RAG from website
   - **n8n workflows** for virtually all side-effects and unique logic
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
5. Tokens are stored encrypted per tenant (`ChannelConnection` table).
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

### 3.6 Runtime Tools (used by LLM Agent / Flow terminals)
```
POST   /api/tools/execute
Body: { tenantId, toolId, arguments, conversationContext }
```
Most tools will simply trigger the corresponding n8n workflow.

---

## 4. Generator Design

### 4.1 RAG Builder
- Input: `systems.website.url`
- Crawl (respect robots.txt, limit depth/pages)
- Chunk → embed → store in tenant-scoped vector collection (pgvector first)
- Update `generated.ragSources`

### 4.2 Flow Generator
- Emits **conversation-only** deterministic `FlowStage[]`.
- Final stage is almost always a terminal that calls a tool (which points to n8n).
- Do **not** put integration logic inside the generated stages.

### 4.3 Tool Generator
- Create tool definitions.
- Default `implementation: "n8n"` for any action that touches external systems or unique logic.
- Fast-path internal/ERPNext tools are allowed but should be the exception.

### 4.4 n8n Workflow Generator (Critical — Primary Integration Path)

**Goal:** Business owner never opens n8n. Almost all side-effects live here.

Process:
1. For every intent that needs action (and any complex policy) → create an n8n workflow via API.
2. Standard template:
   - Webhook trigger from ConvFlow (full conversation context + answers)
   - Optional approval / IF nodes
   - HTTP / native n8n nodes for ERPNext, Shopify, email, etc.
   - Callback to `/api/internal/n8n-callback`
3. Activate the workflow.
4. Store `n8nWorkflowId` on the tool definition.
5. At runtime the flow terminal or LLM Agent just calls the tool → n8n runs.

### 4.5 Agent Instructions Generator
- Produce system prompt + guardrails from `BusinessProfile`.
- List available tools (most of which are n8n-backed).

---

## 5. Onboarding Agent Implementation Sketch

```
src/onboarding/
  agent.ts
  profile.ts
  interview.ts
  generators/
    index.ts
    rag.ts
    flows.ts          ← conversation stages only
    tools.ts          ← mostly n8n-backed tools
    n8n.ts            ← the real integration generator
    agent-instructions.ts
  connections/
    meta.ts
    erpnext.ts
    website.ts
    openwa.ts
  routes.ts
```

---

## 6. Prisma Additions Needed

- `BusinessProfile` (or JSON on Tenant)
- `ChannelConnection` (shown above)

---

## 7. Security Notes

- All Meta tokens and secrets encrypted at rest.
- Onboarding routes require auth or short-lived onboarding token.
- n8n callback verifies shared secret / JWT.
- Meta webhook verifies `X-Hub-Signature-256`.

---

## 8. Implementation Order

1. `ChannelConnection` + Meta OAuth routes
2. Persist `BusinessProfile`
3. Internal APIs
4. Onboarding Agent loop
5. Generators (RAG → flows → tools → n8n → agent instructions)
6. Sandbox + go-live
7. Re-openable Onboarding Agent for evolution

---

*Master plan. Keep in sync with ARCHITECTURE_PRINCIPLES.md.*
