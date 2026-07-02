# ConvFlow — WhatsApp Workflow Engine
## Reusable Build Skill

**Version:** 2.1  
**Author:** IVarse Technologies  
**Stack:** Node.js · TypeScript · Fastify · Next.js (Frontend UI) · **Prisma ORM** · PostgreSQL · Redis · OpenWA (self-hosted)  
**Model:** Multi-tenant monorepo. One server, many company bots. Config-file-first.  
**WhatsApp Layer:** OpenWA self-hosted gateway (replaces Meta Cloud API — no account bans, full infra control)

> **Security mandate — ORM-only rule:**  
> All database access **must** go through **Prisma**. Raw SQL (`db.query`, template literals, `pg` pool calls) is **strictly forbidden**. Prisma's parameterised queries eliminate SQL injection as an attack surface and its generated TypeScript types catch schema mismatches at compile time. If you ever feel the urge to write a raw SQL string, use `prisma.$queryRaw` with Prisma's tagged template literal (`Prisma.sql\`...\``) which still parameterises all values safely — never string-interpolate user input into any query.

---

## 1. What This Skill Covers

This skill is the complete, authoritative guide for building and extending **ConvFlow** — a multi-tenant WhatsApp workflow engine. Any business onboards by creating a config (via dashboard or file). The engine is entirely data-driven: tenant-designed flows, not hardcoded bot logic.

Use this skill whenever:
- Spinning up a new ConvFlow instance from scratch
- Onboarding a new company
- Adding a new stage type or terminal action
- Building or extending the tenant dashboard
- Implementing the ERPNext integration
- Debugging webhook, state, or engine issues
- Writing or modifying company config files

---

## 2. Product Mental Model

ConvFlow is a **general-purpose WhatsApp conversation engine**. Tenants design any workflow they want using a visual flow builder. The engine runs it. What happens at the END of a flow (the terminal action) is also tenant-configured.

```
OpenWA Gateway (self-hosted Docker)
         │  webhook: POST /webhook/whatsapp (every inbound message)
         │  send:    POST /api/sessions/{sessionId}/messages/send-text
         ▼
ConvFlow Engine
│
├── Webhook Handler     ← receives OpenWA events, verifies HMAC
├── Tenant Router       ← maps sessionId → CompanyConfig (in-memory cache)
├── Flow Engine         ← state machine; runs any tenant-designed flow
│   ├── Stage Runner    ← executes current stage (question, message, confirm, branch)
│   └── Terminal Runner ← fires terminal action when flow is complete
├── Terminal Actions    ← save_lead | create_order | notify_only | send_info |
│                          book_appointment | webhook  (each is a pluggable handler)
├── Scoring Engine      ← optional; only used when terminal action is save_lead
├── Notifier            ← WhatsApp alert to tenant owner on any terminal action
├── ERPNext Client      ← pushes leads or orders to ERPNext (if connected)
└── Store               ← PostgreSQL (leads, orders, conversations) + Redis (state TTL)
```

**Core invariant:** The Flow Engine contains zero business logic. It reads config and executes it. Adding a new company or a new flow shape never touches engine code.

---

## 3. Key Concepts

### 3.1 Flow Stages
A flow is an ordered list of stages. Each stage either collects data from the customer or delivers information to them. Stages chain together. Branching stages can fork to different next stages based on the customer's answer.

**Stage types that collect data:**
- `select` — numbered options (1️⃣ 2️⃣ 3️⃣). Customer replies with a number.
- `free_text` — open answer. Any text accepted. Stored as-is.
- `number` — numeric only. Rejected if not a number.
- `confirm` — YES / NO only. Used before a terminal action to let customer review.
- `branch` — like `select` but each option routes to a different next stage index.
- `erpnext_item_select` — **dynamic select stage**: at runtime, fetches the tenant's ERPNext Item list (from cache), builds numbered options automatically, and stores the selected item name + price in `state.answers`. No static options needed in config. Tenant configures: item group filter (optional), display format, and which answer keys to write (item_name, item_code, item_price).

**Stage types that deliver information (no answer expected — auto-advances):**
- `message` — bot sends text, then automatically moves to the next stage.
- `media` — bot sends an image or PDF (menu, price list, brochure), then advances.

**Terminal stage types (end the flow, trigger an action):**
- `save_lead` — score answers → classify → store in ConvFlow leads → push to ERPNext Lead (if connected) → notify tenant
- `create_order` — map answers to ERPNext Sales Order fields → create draft order → notify tenant
- `notify_only` — just fire a WhatsApp alert to the tenant with collected answers. No ERPNext.
- `send_info` — bot sends a configured text response to the customer. Flow ends.
- `book_appointment` — send a booking link or collect date/time → notify tenant
- `webhook` — POST all collected answers to a tenant-configured URL (escape hatch for any external system)

### 3.2 Terminal Actions
Every flow has exactly one terminal stage. The terminal stage is the last stage in the `flows` array. Its `type` determines what ConvFlow does with the collected answers.

Scoring and lead classification **only apply to `save_lead` terminals**. All other terminal types skip scoring entirely.

### 3.3 State
`state.answers` is a flat `Record<string, string>` map. Every stage writes to it using its `answerKey`. The terminal action reads from it. The tenant controls the keys. This is the universal data model — no special fields, no hardcoded structure.

### 3.4 ERPNext Field Mapping
For `create_order` and `save_lead` terminals, tenants configure a `fieldMapping` object that maps `answers` keys to ERPNext field names. ConvFlow uses this at runtime to build the ERPNext payload. No ERPNext field names are hardcoded in the engine.

### 3.5 ERPNext Item Cache
When a tenant connects ERPNext, ConvFlow syncs their Item list into a Redis cache keyed by `items:{companySlug}` (TTL: 30 minutes, refreshed on demand). The `erpnext_item_select` stage type reads from this cache at runtime to build dynamic numbered options. No API call happens mid-conversation — it reads the cache only. Cache is also surfaced in the dashboard so tenants can preview exactly what their customers will see.

### 3.6 Human Takeover Mode
When a customer sends a message that does not match the expected answer at the current stage (e.g. they ask "when will it be delivered?" mid-order), ConvFlow does NOT break the flow or repeat the prompt endlessly. Instead:

1. Bot sends: *"Hold on, let me get someone to help you with that 🙏"*
2. ConvFlow marks the conversation state as `mode: 'human'` in Redis
3. Fires a WhatsApp notification to the tenant's agent phone with the customer's question + full conversation context
4. While in `human` mode: all further customer messages are forwarded to the agent as WhatsApp notifications (no bot processing)
5. The agent handles the customer directly on WhatsApp
6. When done, the agent types `#resume` in the **ConvFlow dashboard** (or via a dedicated management API endpoint) → conversation state reverts to `mode: 'bot'` → bot re-sends the last stage message to the customer and resumes exactly where it left off
7. No AI involved. Pure message routing and state flag.

**Human mode is scoped per phone number per company.** Other customers on the same bot are not affected.

---

## 4. TypeScript Types

```typescript
// src/types/index.ts

export type AnswerMap = Record<string, string>;

// ── Conversation state (held in Redis, TTL 24h) ───────────────────────────────
export interface ConvState {
  companySlug: string;
  stage: number;
  answers: AnswerMap;
  name: string | null;
  source: string;
  startedAt: number; // unix ms
}

// ── Stage types ───────────────────────────────────────────────────────────────

export type CollectingStageType = 'select' | 'free_text' | 'number' | 'confirm' | 'branch';
export type InfoStageType       = 'message' | 'media';
export type TerminalStageType   = 'save_lead' | 'create_order' | 'notify_only' | 'send_info' | 'book_appointment' | 'webhook';
export type StageType           = CollectingStageType | InfoStageType | TerminalStageType;

export interface FlowStage {
  stage: number;                    // 0-indexed sequential
  id: string;                       // human slug e.g. "ask_service", "confirm_order"
  type: StageType;
  message: string;                  // bot message. Supports {name}, {answers.key} tokens
  answerKey?: string;               // key to write answer into state.answers (collecting stages)
  options?: StageOption[];          // for select, branch, confirm
  branches?: Record<string, number>; // branch type: answer value → next stage index
  mediaUrl?: string;                // media type: URL of image or PDF to send
  erpnextItemSelect?: ERPNextItemSelectConfig; // only for type === 'erpnext_item_select'
  // Terminal stage config:
  terminal?: TerminalConfig;
}

export interface StageOption {
  value: string;                    // what customer types e.g. "1"
  label: string;                    // human readable label stored in answers
}

// ── Terminal action config ────────────────────────────────────────────────────

export type TerminalConfig =
  | SaveLeadTerminal
  | CreateOrderTerminal
  | NotifyOnlyTerminal
  | SendInfoTerminal
  | BookAppointmentTerminal
  | WebhookTerminal;

export interface SaveLeadTerminal {
  type: 'save_lead';
  successMessage: string;           // sent to customer after lead is saved
  fieldMapping?: ERPNextFieldMap;   // optional: map answers → ERPNext Lead fields
}

export interface CreateOrderTerminal {
  type: 'create_order';
  successMessage: string;           // sent to customer e.g. "Order placed! We'll confirm shortly."
  fieldMapping: ERPNextFieldMap;    // required: map answers → Sales Order fields
  // Which answer key holds the item name/code
  itemAnswerKey: string;            // e.g. "item_name"
  qtyAnswerKey: string;             // e.g. "quantity"
  customerPhoneKey?: string;        // defaults to the sender's phone
  customerNameKey?: string;         // defaults to state.name
}

export interface NotifyOnlyTerminal {
  type: 'notify_only';
  successMessage: string;           // sent to customer
}

export interface SendInfoTerminal {
  type: 'send_info';
  infoMessage: string;              // the info text to send to customer (can be long)
  // After sending info, optionally loop back to a stage (e.g. main menu)
  loopToStage?: number;
}

export interface BookAppointmentTerminal {
  type: 'book_appointment';
  successMessage: string;
  bookingLink?: string;             // if set: send link to customer
  // if no link: collect date/time via flow answers, notify tenant
  dateAnswerKey?: string;
  timeAnswerKey?: string;
}

export interface WebhookTerminal {
  type: 'webhook';
  url: string;                      // POST all state.answers to this URL
  headers?: Record<string, string>; // optional custom headers (e.g. auth)
  successMessage: string;
}

// ERPNext field mapping: { answers key → ERPNext field name }
export type ERPNextFieldMap = Record<string, string>;
// Example: { "service_interest": "custom_service", "org_type": "custom_org_type" }

// ── Company Config ────────────────────────────────────────────────────────────

export interface CompanyConfig {
  slug: string;
  name: string;
  openwaSessionId: string;
  openwaApiKey: string;
  openwaBaseUrl: string;
  ownerPhone: string;               // WhatsApp number for tenant alerts (no +)
  websiteUrl: string;
  flows: FlowStage[];               // ALL stages including the terminal stage
  scoring?: ScoringRule[];          // optional; only used by save_lead terminal
  messages: MessageOverrides;
}

export interface ScoringRule {
  answerKey: string;
  values: Record<string, number>;
}

export interface MessageOverrides {
  unknown_input?: string;     // legacy — no longer used for off-flow; kept for explicit overrides
  escalate_confirm?: string;
  stop?: string;
  human_takeover?: string;    // message sent to customer when human takeover is triggered
}

// ── ERPNext Item cache entry ──────────────────────────────────────────────────
export interface ERPNextItem {
  item_code: string;
  item_name: string;
  item_group: string;
  standard_rate: number;
  currency: string;
  description?: string;
}

// ── erpnext_item_select stage config ─────────────────────────────────────────
export interface ERPNextItemSelectConfig {
  itemGroup?: string;           // filter by item group e.g. "Food" — omit for all active items
  displayFormat: string;        // e.g. "{item_name} — ₦{standard_rate}" (tokens replaced at runtime)
  itemNameAnswerKey: string;    // e.g. "item_name"
  itemCodeAnswerKey: string;    // e.g. "item_code"
  itemPriceAnswerKey: string;   // e.g. "item_price"
  noItemsMessage?: string;      // shown if cache is empty or ERPNext not connected
}

// ── Extended FlowStage to support erpnext_item_select ────────────────────────
// Add to CollectingStageType union:
export type CollectingStageType =
  | 'select' | 'free_text' | 'number' | 'confirm' | 'branch'
  | 'erpnext_item_select';   // ← NEW

// Add to FlowStage interface:
// erpnextItemSelect?: ERPNextItemSelectConfig;  (only used when type === 'erpnext_item_select')

// ── Conversation state (extended) ────────────────────────────────────────────
// ConvState.mode controls human takeover
export interface ConvState {
  companySlug: string;
  stage: number;
  answers: AnswerMap;
  name: string | null;
  source: string;
  startedAt: number;
  mode: 'bot' | 'human';        // ← NEW: 'human' = human takeover active
  humanTakeoverAt?: number;     // unix ms when takeover was triggered
  lastOffFlowMessage?: string;  // the off-flow question that triggered takeover
}

// ── Channel abstraction ───────────────────────────────────────────────────────
export interface InboundMessage {
  channelType: 'whatsapp';
  openwaSessionId: string;
  fromPhone: string;
  profileName: string | null;
  text: string;
  rawPayload: unknown;
}
```

## 5. Database Schema

ConvFlow uses **Prisma ORM** as the data access layer. Never write raw SQL — Prisma parameterises all queries automatically, which eliminates SQL injection as an attack surface and provides full TypeScript type-safety on every query.

Run `npx prisma migrate deploy` on first deploy.

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  // URL is passed via prisma.config.ts (Prisma v7+)
}

model Tenant {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slug            String    @unique @db.VarChar(80)
  name            String    @db.VarChar(120)
  openwaSessionId String    @unique @map("openwa_session_id") @db.VarChar(80)
  ownerPhone      String    @map("owner_phone") @db.VarChar(20)
  configJson      Json      @map("config_json")
  active          Boolean   @default(true)
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @default(now()) @map("updated_at")

  @@map("tenants")
}

model Lead {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  companySlug    String    @map("company_slug") @db.VarChar(80)
  phone          String    @db.VarChar(20)
  name           String?   @db.VarChar(120)
  answers        Json      @default("{}")
  leadScore      Int?      @default(0) @map("lead_score")
  classification String?   @db.VarChar(20)
  source         String?   @db.VarChar(50)
  routedAt       DateTime? @map("routed_at")
  createdAt      DateTime  @default(now()) @map("created_at")

  @@index([companySlug])
  @@index([companySlug, phone])
  @@index([companySlug, classification])
  @@map("leads")
}
```

**Prisma client singleton (`src/store/prisma.ts`):**

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

---

## 6. Environment Variables

```bash
# .env.example

# Server
PORT=3000
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/convflow

# Redis
REDIS_URL=redis://localhost:6379

# OpenWA Gateway (self-hosted — runs separately via Docker)
OPENWA_BASE_URL=http://localhost:2785/api   # Internal URL; never expose to public
OPENWA_API_KEY=your_openwa_api_key_here     # Set in OpenWA dashboard on first run

# Webhook secret for HMAC signature verification (you choose this string)
# Register this in OpenWA when creating the webhook for each session
OPENWA_WEBHOOK_SECRET=your_webhook_hmac_secret

# Company-specific session IDs match the session names you created in OpenWA.
# All companies share the same OpenWA instance but have separate sessions (phone numbers).
# Session IDs are declared in config files and reference process.env.

# IVarse Technologies
IVARSE_OPENWA_SESSION_ID=ivarse-bot
IVARSE_OWNER_PHONE=2348XXXXXXXXXX     # OG's WhatsApp number (country code, no +)

# Avril Beetails
AVRIL_OPENWA_SESSION_ID=avril-bot
AVRIL_OWNER_PHONE=2348XXXXXXXXXX

# That Ofada Girl
OFADA_OPENWA_SESSION_ID=ofada-bot
OFADA_OWNER_PHONE=2348XXXXXXXXXX
```

---

---

## 7. Core Engine Implementation

### 7.1 Config Loader (`src/config/loader.ts`)

```typescript
// src/config/loader.ts
import { CompanyConfig, TerminalStageType } from '../types';
import { prisma } from '../store/prisma';
import fs from 'fs';
import path from 'path';

const TERMINAL_TYPES: TerminalStageType[] = [
  'save_lead', 'create_order', 'notify_only', 'send_info', 'book_appointment', 'webhook'
];

export async function loadAllConfigs(): Promise<CompanyConfig[]> {
  const dir   = path.resolve(process.cwd(), 'companies');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.config.ts') || f.endsWith('.config.js'));
  const configs: CompanyConfig[] = [];
  for (const file of files) {
    const mod = await import(path.join(dir, file));
    validateConfig(mod.default);
    configs.push(mod.default);
  }
  return configs;
}

export async function seedTenants(configs: CompanyConfig[]): Promise<void> {
  for (const config of configs) {
    await prisma.tenant.upsert({
      where:  { slug: config.slug },
      update: {
        name:            config.name,
        openwaSessionId: config.openwaSessionId,
        ownerPhone:      config.ownerPhone,
        configJson:      config as object,
        updatedAt:       new Date(),
      },
      create: {
        slug:            config.slug,
        name:            config.name,
        openwaSessionId: config.openwaSessionId,
        ownerPhone:      config.ownerPhone,
        configJson:      config as object,
      },
    });
  }
  console.log(`✅ Seeded ${configs.length} tenant(s)`);
}

export function validateConfig(config: CompanyConfig): void {
  if (!config.slug)            throw new Error('Config missing slug');
  if (!config.openwaSessionId) throw new Error(`${config.slug}: missing openwaSessionId`);
  if (!config.flows?.length)   throw new Error(`${config.slug}: flows array is empty`);

  // Stages must be sequential
  config.flows.forEach((f, i) => {
    if (f.stage !== i) throw new Error(`${config.slug}: stage mismatch at index ${i} (got ${f.stage})`);
  });

  // Last stage must be a terminal type
  const last = config.flows[config.flows.length - 1];
  if (!TERMINAL_TYPES.includes(last.type as TerminalStageType)) {
    throw new Error(`${config.slug}: last flow stage must be a terminal type. Got: ${last.type}`);
  }

  // Terminal stage must have terminal config
  if (!last.terminal) {
    throw new Error(`${config.slug}: terminal stage "${last.id}" is missing terminal config`);
  }
}
```

### 7.2 Tenant Router (`src/engine/tenant-router.ts`)

```typescript
// src/engine/tenant-router.ts
import { prisma } from '../store/prisma';
import { CompanyConfig } from '../types';

const cache = new Map<string, CompanyConfig>(); // key: openwaSessionId

export async function refreshTenantCache(): Promise<void> {
  const tenants = await prisma.tenant.findMany({ where: { active: true } });
  cache.clear();
  for (const tenant of tenants) {
    const config = tenant.configJson as unknown as CompanyConfig;
    cache.set(config.openwaSessionId, config);
  }
}

export function getCompanyBySessionId(sessionId: string): CompanyConfig | null {
  return cache.get(sessionId) ?? null;
}

// Hot-reload single tenant after dashboard config update
export function reloadTenant(config: CompanyConfig): void {
  cache.set(config.openwaSessionId, config);
}
```

### 7.3 Flow Engine (`src/engine/flow-engine.ts`)

The Flow Engine is the core state machine. It handles every inbound message, advances the conversation through stages, and delegates to the Terminal Runner when the flow is complete.

```typescript
import { ConvState, CompanyConfig, FlowStage, TerminalStageType } from '../types';
import { getState, setState, clearState } from '../store/redis';
import { sendMessage } from '../channels/openwa.channel';
import { runTerminal } from './terminal-runner';
import { logConversation } from '../store/conversations';

const ESCALATION_KEYWORDS = ['human', 'person', 'agent', 'speak to someone', 'real person'];
const STOP_KEYWORDS       = ['stop', 'unsubscribe', 'opt out', 'cancel'];

const TERMINAL_TYPES = new Set<TerminalStageType>([
  'save_lead', 'create_order', 'notify_only', 'send_info', 'book_appointment', 'webhook'
]);

export async function handleInbound(
  phone: string,
  rawText: string,
  profileName: string | null,
  company: CompanyConfig
): Promise<void> {
  const text  = rawText.trim();
  const lower = text.toLowerCase();

  // Log every inbound message for conversation history
  await logConversation(company.slug, phone, 'inbound', text);

  // ── Global keyword handlers ───────────────────────────────────────────────
  if (STOP_KEYWORDS.some(k => lower.includes(k))) {
    await clearState(phone, company.slug);
    await sendMessage(company, phone, company.messages.stop ?? DEFAULT_STOP);
    return;
  }

  if (ESCALATION_KEYWORDS.some(k => lower.includes(k))) {
    const state = await getState(phone, company.slug) ?? freshState(company.slug, profileName);
    await notifyEscalation(company, phone, state);
    await sendMessage(company, phone, company.messages.escalate_confirm ?? DEFAULT_ESCALATE);
    return;
  }

  // ── Load or create state ──────────────────────────────────────────────────
  let state = await getState(phone, company.slug);

  if (!state) {
    state = freshState(company.slug, profileName);
    await setState(phone, company.slug, state);
    await deliverStage(company.flows[0], state, phone, company);
    return;
  }

  // ── Human takeover mode: forward all messages to agent, don't run bot ──────
  if (state.mode === 'human') {
    await forwardToHumanAgent(phone, text, state, company);
    return;
  }

  // ── Update name from profile if not yet set ───────────────────────────────
  if (!state.name && profileName) state.name = profileName;

  // ── Get current stage ─────────────────────────────────────────────────────
  const currentStage = company.flows[state.stage];

  // Defensive: if state is past last stage, restart
  if (!currentStage) {
    state = freshState(company.slug, profileName);
    await setState(phone, company.slug, state);
    await deliverStage(company.flows[0], state, phone, company);
    return;
  }

  // ── Terminal stage: the last stage was already delivered, now handle confirm
  //    (some terminals require a confirm stage before them — see confirm type)
  if (TERMINAL_TYPES.has(currentStage.type as TerminalStageType)) {
    // Terminal was delivered (e.g. send_info, message), now run it
    await runTerminal(currentStage, state, phone, company);
    await clearState(phone, company.slug);
    return;
  }

  // ── Process answer for collecting/info stages ─────────────────────────────
  const accepted = processAnswer(text, currentStage, state);
  if (!accepted) {
    // Off-flow message — customer asked something the bot can't answer at this stage.
    // Do NOT repeat the prompt endlessly. Trigger human takeover instead.
    await triggerHumanTakeover(phone, text, state, company);
    return;
  }

  // ── Resolve next stage ────────────────────────────────────────────────────
  const nextStageIndex = resolveNextStage(currentStage, state);

  if (nextStageIndex >= company.flows.length) {
    // Should never happen if config is validated — last stage is always terminal
    console.error(`[${company.slug}] nextStageIndex out of bounds`);
    return;
  }

  const nextStage = company.flows[nextStageIndex];
  state.stage     = nextStageIndex;
  await setState(phone, company.slug, state);

  await deliverStage(nextStage, state, phone, company);
}

// ── Stage delivery ────────────────────────────────────────────────────────────
// Delivers the stage message to the customer.
// For info stages (message, media): also immediately advances to next stage.
// For terminal stages: delivers message then waits for one final reply to trigger action,
//   EXCEPT send_info which fires immediately without waiting.
async function deliverStage(
  stage: FlowStage,
  state: ConvState,
  phone: string,
  company: CompanyConfig
): Promise<void> {
  const text = interpolate(stage.message, state);
  await sendMessage(company, phone, text);
  await logConversation(company.slug, phone, 'outbound', text);

  // erpnext_item_select: fetch items from cache, build numbered options, deliver
  if (stage.type === 'erpnext_item_select') {
    const cfg   = stage.erpnextItemSelect!;
    const items = await getItemsFromCache(company.slug, cfg.itemGroup);

    if (!items.length) {
      const fallback = cfg.noItemsMessage ?? `Sorry, no items available right now. Please try again later or contact us directly.`;
      await sendMessage(company, phone, fallback);
      await logConversation(company.slug, phone, 'outbound', fallback);
      // Trigger human takeover — agent needs to handle this
      await triggerHumanTakeover(phone, 'no_items_available', state, company);
      return;
    }

    // Build numbered list message
    const listLines = items.map((item, i) => {
      const line = cfg.displayFormat
        .replace('{item_name}', item.item_name)
        .replace('{standard_rate}', item.standard_rate.toLocaleString('en-NG'))
        .replace('{item_group}', item.item_group ?? '')
        .replace('{description}', item.description ?? '');
      return `${i + 1}️⃣ ${line}`;
    });

    const stageMsg  = stage.message ? interpolate(stage.message, state) + '

' : '';
    const fullMsg   = stageMsg + listLines.join('
');
    await sendMessage(company, phone, fullMsg);
    await logConversation(company.slug, phone, 'outbound', fullMsg);

    // Store dynamic options + items in state for processAnswer to read
    const dynamicOptions: StageOption[] = items.map((_, i) => ({
      value: String(i + 1),
      label: items[i].item_name,
    }));
    state.answers[`_dynamic_options_${stage.id}`] = JSON.stringify(dynamicOptions);
    state.answers[`_dynamic_items_${stage.id}`]   = JSON.stringify(items);
    await setState(phone, company.slug, state);
    return; // Wait for customer reply
  }

  // Info stages auto-advance: no answer needed
  if (stage.type === 'message') {
    const next = company.flows[stage.stage + 1];
    if (next) {
      state.stage = next.stage;
      await setState(phone, company.slug, state);
      await deliverStage(next, state, phone, company);
    }
    return;
  }

  // Media stage: send media then auto-advance
  if (stage.type === 'media') {
    if (stage.mediaUrl) {
      await sendMedia(company, phone, stage.mediaUrl);
    }
    const next = company.flows[stage.stage + 1];
    if (next) {
      state.stage = next.stage;
      await setState(phone, company.slug, state);
      await deliverStage(next, state, phone, company);
    }
    return;
  }

  // send_info terminal: fire immediately, no waiting for reply
  if (stage.type === 'send_info' && stage.terminal?.type === 'send_info') {
    await runTerminal(stage, state, phone, company);
    const t = stage.terminal as any;
    if (typeof t.loopToStage === 'number') {
      // Loop back to another stage (e.g. main menu)
      const loopStage = company.flows[t.loopToStage];
      if (loopStage) {
        state.stage = t.loopToStage;
        await setState(phone, company.slug, state);
        await deliverStage(loopStage, state, phone, company);
        return;
      }
    }
    await clearState(phone, company.slug);
    return;
  }

  // All other stages: wait for customer reply (state already saved above)
}

// ── Answer processing ─────────────────────────────────────────────────────────
function processAnswer(text: string, stage: FlowStage, state: ConvState): boolean {
  const lower = text.toLowerCase().trim();

  if (stage.type === 'free_text') {
    if (stage.answerKey) state.answers[stage.answerKey] = text;
    return true;
  }

  if (stage.type === 'number') {
    if (!/^\d+(\.\d+)?$/.test(text.trim())) return false;
    if (stage.answerKey) state.answers[stage.answerKey] = text.trim();
    return true;
  }

  if (stage.type === 'confirm') {
    const yes = ['yes', 'y', '1', 'ok', 'confirm', 'proceed'].includes(lower);
    const no  = ['no', 'n', '2', 'cancel', 'back'].includes(lower);
    if (!yes && !no) return false;
    if (stage.answerKey) state.answers[stage.answerKey] = yes ? 'yes' : 'no';
    // If customer said NO on a confirm stage: restart flow
    if (no) {
      Object.assign(state, { stage: 0, answers: {} });
    }
    return true;
  }

  if (stage.type === 'select' || stage.type === 'branch') {
    const option = stage.options?.find(o => o.value === lower || o.value === text.trim());
    if (!option) return false;
    if (stage.answerKey) {
      state.answers[stage.answerKey]               = option.value;
      state.answers[`${stage.answerKey}_label`]    = option.label;
    }
    return true;
  }

  if (stage.type === 'erpnext_item_select') {
    // Options were built dynamically at delivery time and stored in state
    // under the key `_dynamic_options_{stage.id}`
    const dynamicOptions: StageOption[] = JSON.parse(
      state.answers[`_dynamic_options_${stage.id}`] ?? '[]'
    );
    const option = dynamicOptions.find(o => o.value === lower || o.value === text.trim());
    if (!option) return false;
    const cfg = stage.erpnextItemSelect!;
    // The option label is "{item_name} — ₦{price}", value is the index "1","2"...
    // The actual item data is stored in _dynamic_items_{stage.id}
    const items: ERPNextItem[] = JSON.parse(
      state.answers[`_dynamic_items_${stage.id}`] ?? '[]'
    );
    const selectedItem = items[parseInt(option.value) - 1];
    if (!selectedItem) return false;
    state.answers[cfg.itemNameAnswerKey]  = selectedItem.item_name;
    state.answers[cfg.itemCodeAnswerKey]  = selectedItem.item_code;
    state.answers[cfg.itemPriceAnswerKey] = String(selectedItem.standard_rate);
    // Clean up temp keys
    delete state.answers[`_dynamic_options_${stage.id}`];
    delete state.answers[`_dynamic_items_${stage.id}`];
    return true;
  }

  return false;
}

// ── Stage routing ─────────────────────────────────────────────────────────────
function resolveNextStage(stage: FlowStage, state: ConvState): number {
  if (stage.type === 'branch' && stage.branches) {
    const answer = state.answers[stage.answerKey!];
    return stage.branches[answer] ?? stage.stage + 1;
  }
  // confirm stage: if customer said NO, processAnswer already reset to stage 0
  if (stage.type === 'confirm') {
    const answer = state.answers[stage.answerKey!];
    if (answer === 'no') return 0;
  }
  return stage.stage + 1;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function freshState(companySlug: string, name: string | null): ConvState {
  return { companySlug, stage: 0, answers: {}, name, source: 'direct', startedAt: Date.now(), mode: 'bot' };
}

function interpolate(template: string, state: ConvState): string {
  let result = template.replace(/\{name\}/g, state.name ?? 'there');
  // Support {answers.key} tokens e.g. "You selected: {answers.item_name}"
  result = result.replace(/\{answers\.([^}]+)\}/g, (_, key) => {
    return state.answers[`${key}_label`] ?? state.answers[key] ?? '';
  });
  return result;
}

async function sendMedia(company: CompanyConfig, phone: string, mediaUrl: string): Promise<void> {
  // OpenWA send-image endpoint — implement in openwa.channel.ts
  const { sendImage } = await import('../channels/openwa.channel');
  await sendImage(company, phone, mediaUrl);
}

async function notifyEscalation(company: CompanyConfig, phone: string, state: ConvState): Promise<void> {
  const { notifyOwner } = await import('../notifications/notifier');
  await notifyOwner(company, phone, state, 0, 'escalation');
}

// Default system messages
const DEFAULT_STOP     = `No problem! We won't message you again. Come back anytime 👋`;
const DEFAULT_ESCALATE = `Understood. A team member will reach out to you directly 🙏`;
const DEFAULT_UNKNOWN  = `Please pick one of the options above, or type your answer freely 😊`;
```

### 7.4 Terminal Runner (`src/engine/terminal-runner.ts`)

The Terminal Runner is called once when the flow reaches its final stage. It reads the `terminal` config and executes the appropriate action. All terminal types live here.

```typescript
import { FlowStage, ConvState, CompanyConfig, TerminalConfig } from '../types';
import { sendMessage } from '../channels/openwa.channel';
import { notifyOwner } from '../notifications/notifier';
import { saveLead, logConversation } from '../store/conversations';
import { scoreAnswers } from './scoring-engine';
import { pushLeadToERPNext, createSalesOrderInERPNext } from '../integrations/erpnext/erpnext.service';
import axios from 'axios';

export async function runTerminal(
  stage: FlowStage,
  state: ConvState,
  phone: string,
  company: CompanyConfig
): Promise<void> {
  const t = stage.terminal!;

  switch (t.type) {

    // ── save_lead ─────────────────────────────────────────────────────────────
    case 'save_lead': {
      const score          = scoreAnswers(state.answers, company.scoring ?? []);
      const classification = classifyScore(score);

      await saveLead(company.slug, phone, state.name, state.answers, score, classification);

      // Notify tenant
      await notifyOwner(company, phone, state, score, 'new_lead');

      // Push to ERPNext if connected (fire-and-forget)
      pushLeadToERPNext(company.slug, phone, state.name, state.answers, score, classification, t.fieldMapping)
        .catch(err => console.error(`[${company.slug}] ERPNext lead push failed:`, err.message));

      await sendMessage(company, phone, interpolate(t.successMessage, state));
      await logConversation(company.slug, phone, 'outbound', t.successMessage);
      break;
    }

    // ── create_order ──────────────────────────────────────────────────────────
    case 'create_order': {
      // Notify tenant immediately
      await notifyOwner(company, phone, state, 0, 'new_order');

      // Create Sales Order in ERPNext (fire-and-forget)
      createSalesOrderInERPNext(company.slug, phone, state.name, state.answers, t)
        .catch(err => console.error(`[${company.slug}] ERPNext order create failed:`, err.message));

      await sendMessage(company, phone, interpolate(t.successMessage, state));
      await logConversation(company.slug, phone, 'outbound', t.successMessage);
      break;
    }

    // ── notify_only ───────────────────────────────────────────────────────────
    case 'notify_only': {
      await notifyOwner(company, phone, state, 0, 'notification');
      await sendMessage(company, phone, interpolate(t.successMessage, state));
      await logConversation(company.slug, phone, 'outbound', t.successMessage);
      break;
    }

    // ── send_info ─────────────────────────────────────────────────────────────
    case 'send_info': {
      const msg = interpolate(t.infoMessage, state);
      await sendMessage(company, phone, msg);
      await logConversation(company.slug, phone, 'outbound', msg);
      // loopToStage is handled in flow-engine.ts after this returns
      break;
    }

    // ── book_appointment ──────────────────────────────────────────────────────
    case 'book_appointment': {
      if (t.bookingLink) {
        const msg = interpolate(t.successMessage, state) + `\n\n📅 ${t.bookingLink}`;
        await sendMessage(company, phone, msg);
        await logConversation(company.slug, phone, 'outbound', msg);
      } else {
        await sendMessage(company, phone, interpolate(t.successMessage, state));
      }
      // Notify tenant with collected date/time answers
      await notifyOwner(company, phone, state, 0, 'booking_request');
      break;
    }

    // ── webhook ───────────────────────────────────────────────────────────────
    case 'webhook': {
      try {
        await axios.post(t.url, {
          companySlug: company.slug,
          phone,
          name: state.name,
          answers: state.answers,
          completedAt: new Date().toISOString(),
        }, {
          headers: { 'Content-Type': 'application/json', ...(t.headers ?? {}) },
          timeout: 10_000,
        });
      } catch (err: any) {
        console.error(`[${company.slug}] Webhook terminal failed:`, err.message);
      }
      await sendMessage(company, phone, interpolate(t.successMessage, state));
      await logConversation(company.slug, phone, 'outbound', t.successMessage);
      break;
    }
  }
}

function classifyScore(score: number): string {
  if (score >= 8) return 'hot';
  if (score >= 5) return 'warm';
  if (score >= 2) return 'nurture';
  return 'cold';
}

function interpolate(template: string, state: ConvState): string {
  let result = template.replace(/\{name\}/g, state.name ?? 'there');
  result = result.replace(/\{answers\.([^}]+)\}/g, (_, key) => {
    return state.answers[`${key}_label`] ?? state.answers[key] ?? '';
  });
  return result;
}
```

### 7.5 Scoring Engine (`src/engine/scoring-engine.ts`)

Unchanged. Only called by `save_lead` terminal.

```typescript
import { AnswerMap, ScoringRule } from '../types';

export function scoreAnswers(answers: AnswerMap, rules: ScoringRule[]): number {
  let score = 0;
  for (const rule of rules) {
    const answer = answers[rule.answerKey];
    if (answer !== undefined && rule.values[answer] !== undefined) {
      score += rule.values[answer];
    }
  }
  return Math.max(0, score);
}
```

### 7.6 Notifier (`src/notifications/notifier.ts`)

Updated to handle all terminal action types in its alert messages.

```typescript
import { CompanyConfig, ConvState } from '../types';
import { sendMessage } from '../channels/openwa.channel';

type NotifyReason = 'new_lead' | 'new_order' | 'notification' | 'booking_request' | 'escalation';

const REASON_EMOJI: Record<NotifyReason, string> = {
  new_lead:        '🔥',
  new_order:       '🛒',
  notification:    '📬',
  booking_request: '📅',
  escalation:      '⚡',
};

const REASON_TITLE: Record<NotifyReason, string> = {
  new_lead:        'NEW LEAD',
  new_order:       'NEW ORDER',
  notification:    'NEW ENQUIRY',
  booking_request: 'BOOKING REQUEST',
  escalation:      'ESCALATION — customer wants to speak to someone',
};

export async function notifyOwner(
  company: CompanyConfig,
  phone: string,
  state: ConvState,
  score: number,
  reason: NotifyReason
): Promise<void> {
  const emoji = REASON_EMOJI[reason];
  const title = REASON_TITLE[reason];

  const answerLines = Object.entries(state.answers)
    .filter(([k]) => !k.endsWith('_label'))
    .map(([k, v]) => {
      const label = state.answers[`${k}_label`] ?? v;
      const key   = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `• *${key}:* ${label}`;
    })
    .join('\n');

  const lines = [
    `${emoji} *${title} — ${company.name}*`,
    ``,
    `👤 *Name:* ${state.name ?? 'Unknown'}`,
    `📱 *Number:* +${phone}`,
    answerLines ? answerLines : '_(no answers collected)_',
    score > 0 ? `\n⭐ *Score:* ${score}` : '',
    ``,
    `📲 *Reply:* https://wa.me/${phone}`,
  ].filter(l => l !== undefined).join('\n');

  await sendMessage(company, company.ownerPhone, lines);
}
```

### 7.7 OpenWA Channel (`src/channels/openwa.channel.ts`)

```typescript
import axios from 'axios';
import { CompanyConfig } from '../types';

const client = () => axios.create({
  baseURL: process.env.OPENWA_BASE_URL ?? 'http://localhost:2785/api',
  headers: {
    'X-API-Key': process.env.OPENWA_API_KEY ?? '',
    'Content-Type': 'application/json',
  },
  timeout: 10_000,
});

export async function sendMessage(company: CompanyConfig, to: string, text: string): Promise<void> {
  try {
    await client().post(`/sessions/${company.openwaSessionId}/messages/send-text`, {
      chatId: `${to}@c.us`,
      text,
    });
  } catch (err: any) {
    console.error(`[${company.slug}] Send failed to ${to}:`, err.response?.data ?? err.message);
  }
}

export async function sendImage(company: CompanyConfig, to: string, imageUrl: string): Promise<void> {
  try {
    await client().post(`/sessions/${company.openwaSessionId}/messages/send-image`, {
      chatId: `${to}@c.us`,
      url: imageUrl,
    });
  } catch (err: any) {
    console.error(`[${company.slug}] Image send failed to ${to}:`, err.message);
  }
}
```

### 7.8 Webhook Handler (`src/webhook/whatsapp.ts`)

```typescript
import crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { getCompanyBySessionId } from '../engine/tenant-router';
import { handleInbound } from '../engine/flow-engine';

export async function whatsappWebhookPost(req: FastifyRequest, reply: FastifyReply) {
  reply.send({ status: 'ok' }); // ACK OpenWA immediately

  try {
    const signature = (req.headers['x-openwa-signature'] as string) ?? '';
    const rawBody   = (req as any).rawBody as Buffer;
    const secret    = process.env.OPENWA_WEBHOOK_SECRET ?? '';

    if (secret) {
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      const valid    = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
      if (!valid) { console.warn('Invalid HMAC — ignored'); return; }
    }

    const body = req.body as any;
    if (body.event !== 'message.received') return;
    if (body.data?.isGroup)               return;
    if (body.data?.type !== 'chat')       return; // text only

    const company = getCompanyBySessionId(body.sessionId);
    if (!company) { console.warn(`Unknown sessionId: ${body.sessionId}`); return; }

    const phone       = (body.data.from as string).replace('@c.us', '');
    const text        = body.data.body ?? '';
    const profileName = body.data.contact?.pushName ?? null;

    await handleInbound(phone, text, profileName, company);
  } catch (err) {
    console.error('Webhook error:', err);
  }
}
```


---

## 8. Company Config Files

### 8.1 Config File Pattern

Every company lives in `companies/{slug}.config.ts`. A config defines the full `flows` array including the terminal stage. All stage types are available. The terminal stage must be last and must have a `terminal` config object.

**Important rules:**
- `flows` stages must be `0, 1, 2, ...` sequential
- Last stage must be a terminal type with a `terminal` config
- `scoring` array is optional — only needed when terminal type is `save_lead`
- `message` and `media` stages auto-advance (no answer key needed)
- `branch` stages require `branches` map (answer value → next stage index)
- All secrets come from `process.env`

---

### 8.2 IVarse Technologies — Lead Qualification Bot (`save_lead`)

```typescript
// companies/ivarse-technologies.config.ts
import { CompanyConfig } from '../src/types';

const config: CompanyConfig = {
  slug: 'ivarse-technologies',
  name: 'IVarse Technologies',
  openwaSessionId: process.env.IVARSE_OPENWA_SESSION_ID!,
  openwaApiKey: process.env.OPENWA_API_KEY!,
  openwaBaseUrl: process.env.OPENWA_BASE_URL!,
  ownerPhone: process.env.IVARSE_OWNER_PHONE!,
  websiteUrl: 'https://ivarstechnologies.ng',

  flows: [
    {
      stage: 0, id: 'welcome', type: 'select', answerKey: 'service',
      message: `Hey {name} 👋\n\nWelcome to *IVarse Technologies*. I'll connect you with the right person fast.\n\nWhat brought you to us?\n\n1️⃣ Custom software development\n2️⃣ AI & automation\n3️⃣ ERP setup (ERPNext)\n4️⃣ SaaS product development\n5️⃣ Infrastructure & DevOps\n6️⃣ Tech consulting`,
      options: [
        { value: '1', label: 'Custom Software Development' },
        { value: '2', label: 'AI & Automation' },
        { value: '3', label: 'ERP Setup' },
        { value: '4', label: 'SaaS Product Development' },
        { value: '5', label: 'Infrastructure & DevOps' },
        { value: '6', label: 'Tech Consulting' },
      ],
    },
    {
      stage: 1, id: 'org_type', type: 'select', answerKey: 'org_type',
      message: `Got it. What kind of organisation are you with?\n\n1️⃣ Startup\n2️⃣ Established SME\n3️⃣ Enterprise\n4️⃣ Individual\n5️⃣ Government / NGO`,
      options: [
        { value: '1', label: 'Startup' },
        { value: '2', label: 'Established SME' },
        { value: '3', label: 'Enterprise' },
        { value: '4', label: 'Individual' },
        { value: '5', label: 'Government / NGO' },
      ],
    },
    {
      stage: 2, id: 'timeline', type: 'select', answerKey: 'timeline',
      message: `When are you looking to start?\n\n1️⃣ Immediately\n2️⃣ Within 1–3 months\n3️⃣ 3–6 months out\n4️⃣ Just exploring`,
      options: [
        { value: '1', label: 'Immediately' },
        { value: '2', label: '1–3 months' },
        { value: '3', label: '3–6 months' },
        { value: '4', label: 'Just exploring' },
      ],
    },
    {
      stage: 3, id: 'budget', type: 'select', answerKey: 'budget',
      message: `Last one — roughly what investment are you planning?\n\n1️⃣ Under ₦500k\n2️⃣ ₦500k – ₦2M\n3️⃣ ₦2M – ₦10M\n4️⃣ Above ₦10M\n5️⃣ Not sure yet`,
      options: [
        { value: '1', label: 'Under ₦500k' },
        { value: '2', label: '₦500k – ₦2M' },
        { value: '3', label: '₦2M – ₦10M' },
        { value: '4', label: 'Above ₦10M' },
        { value: '5', label: 'Not sure yet' },
      ],
    },
    {
      // TERMINAL STAGE
      stage: 4, id: 'save_lead', type: 'save_lead',
      message: '', // not used; successMessage is used instead
      terminal: {
        type: 'save_lead',
        successMessage: `Thanks for sharing that 🙏\n\nOur team will review your details and be in touch shortly.\n\nIn the meantime, see what we've built: https://ivarstechnologies.ng/work`,
        fieldMapping: {
          'service_label':  'custom_service_interest',
          'org_type_label': 'custom_org_type',
          'timeline_label': 'custom_timeline',
          'budget_label':   'custom_budget_range',
        },
      },
    },
  ],

  scoring: [
    { answerKey: 'service',  values: { '1':1, '2':2, '3':1, '4':2, '5':1, '6':0 } },
    { answerKey: 'org_type', values: { '1':1, '2':2, '3':2, '4':-1, '5':1 } },
    { answerKey: 'timeline', values: { '1':3, '2':2, '3':1, '4':0 } },
    { answerKey: 'budget',   values: { '1':0, '2':1, '3':2, '4':3, '5':0 } },
  ],

  messages: {
    unknown_input:    `Just tap one of the numbers above 😊`,
    stop:             `No problem! Come back anytime 👋`,
    escalate_confirm: `Connecting you with a team member now 🙏`,
  },
};

export default config;
```

---

### 8.3 That Ofada Girl — Order-Taking Bot (`create_order`)

Demonstrates: free_text stages, number stage, confirm stage, create_order terminal with ERPNext field mapping.

```typescript
// companies/that-ofada-girl.config.ts
import { CompanyConfig } from '../src/types';

const config: CompanyConfig = {
  slug: 'that-ofada-girl',
  name: 'That Ofada Girl',
  openwaSessionId: process.env.OFADA_OPENWA_SESSION_ID!,
  openwaApiKey: process.env.OPENWA_API_KEY!,
  openwaBaseUrl: process.env.OPENWA_BASE_URL!,
  ownerPhone: process.env.OFADA_OWNER_PHONE!,
  websiteUrl: 'https://thatofadagirl.com',

  flows: [
    {
      stage: 0, id: 'welcome', type: 'select', answerKey: 'order_type',
      message: `Hey {name}! 🍛 Welcome to *That Ofada Girl* — Lagos' finest Ofada experience!\n\nWhat can we do for you today?\n\n1️⃣ Place a food order\n2️⃣ Catering for an event\n3️⃣ Ask about our menu\n4️⃣ Something else`,
      options: [
        { value: '1', label: 'Food Order' },
        { value: '2', label: 'Event Catering' },
        { value: '3', label: 'Menu Enquiry' },
        { value: '4', label: 'Other' },
      ],
    },
    // Branch: menu enquiry → send_info terminal (no order created)
    // Food order / catering → continue to order flow
    // Implemented as branch stage:
    {
      stage: 1, id: 'route', type: 'branch', answerKey: 'route',
      message: '', // not delivered — this stage is skipped by branch logic from stage 0
      // Actually: use stage 0 as a branch stage directly by adding branches:
      // (For clarity in this example, we use a separate routing stage)
      branches: { '1': 2, '2': 2, '3': 7, '4': 8 }, // 3 → menu info, 4 → notify only
      // NOTE: In practice, make stage 0 the branch stage to avoid an extra round-trip.
      // This is shown separately for clarity.
      options: [],
    },
    {
      stage: 2, id: 'item', type: 'free_text', answerKey: 'item_name',
      message: `What would you like to order? 🍛\n_(e.g. Ofada Rice + Ayamase, White Rice + Stew, Assorted Protein)_`,
    },
    {
      stage: 3, id: 'quantity', type: 'number', answerKey: 'quantity',
      message: `How many portions? _(enter a number e.g. 2)_`,
    },
    {
      stage: 4, id: 'delivery', type: 'select', answerKey: 'delivery_type',
      message: `Delivery or pickup?\n\n1️⃣ Delivery (Lagos)\n2️⃣ Pickup`,
      options: [
        { value: '1', label: 'Delivery' },
        { value: '2', label: 'Pickup' },
      ],
    },
    {
      stage: 5, id: 'address', type: 'free_text', answerKey: 'address',
      message: `What's your delivery address?\n_(e.g. 12 Admiralty Way, Lekki Phase 1)_`,
    },
    {
      // Confirm stage: show order summary before creating it
      stage: 6, id: 'confirm', type: 'confirm', answerKey: 'confirmed',
      message: `Here's your order summary 📋\n\n🍛 *{answers.item_name}* × {answers.quantity}\n🚚 *{answers.delivery_type_label}* → {answers.address}\n\nReply *YES* to confirm or *NO* to start over.`,
      options: [
        { value: 'yes', label: 'Confirmed' },
        { value: 'no',  label: 'Cancelled' },
      ],
    },
    {
      // TERMINAL STAGE — create_order
      stage: 7, id: 'create_order', type: 'create_order',
      message: '',
      terminal: {
        type: 'create_order',
        successMessage: `Order placed! 🎉\n\nWe've received your order and our team will confirm it shortly. Expect a message from us within 15 minutes 🍛`,
        itemAnswerKey: 'item_name',
        qtyAnswerKey: 'quantity',
        customerNameKey: 'name',  // uses state.name
        fieldMapping: {
          'address':            'shipping_address_name',
          'delivery_type_label': 'shipping_method',
        },
      },
    },
    {
      // TERMINAL STAGE — send_info (menu enquiry branch)
      stage: 8, id: 'menu_info', type: 'send_info',
      message: '',
      terminal: {
        type: 'send_info',
        infoMessage: `Here's our current menu 🍛\n\n*Rice Dishes*\n• Ofada Rice + Ayamase — ₦2,500\n• White Rice + Stew — ₦2,000\n• Jollof Rice — ₦2,200\n\n*Proteins*\n• Assorted — ₦1,500 add-on\n• Chicken — ₦1,200 add-on\n\nTo place an order, just say *Hi* to restart 😊`,
        loopToStage: 0, // After sending menu, loop back to welcome
      },
    },
    {
      // TERMINAL STAGE — notify_only (other enquiry branch)
      stage: 9, id: 'other_enquiry', type: 'notify_only',
      message: '',
      terminal: {
        type: 'notify_only',
        successMessage: `Thanks for reaching out! Our team will get back to you shortly 🙏`,
      },
    },
  ],

  messages: {
    unknown_input:    `Please pick one of the options above 😊`,
    stop:             `No wahala! Come back when hunger calls 🍛`,
    escalate_confirm: `Oya, someone will reach you now now 🙏`,
  },
};

export default config;
```

---

### 8.4 Avril Beetails — Booking + FAQ Bot (`book_appointment` + `send_info`)

Demonstrates: FAQ branch with send_info loop, booking terminal for appointments.

```typescript
// companies/avril-beetails.config.ts
import { CompanyConfig } from '../src/types';

const config: CompanyConfig = {
  slug: 'avril-beetails',
  name: 'Avril Beetails',
  openwaSessionId: process.env.AVRIL_OPENWA_SESSION_ID!,
  openwaApiKey: process.env.OPENWA_API_KEY!,
  openwaBaseUrl: process.env.OPENWA_BASE_URL!,
  ownerPhone: process.env.AVRIL_OWNER_PHONE!,
  websiteUrl: 'https://avrillbeetails.com',

  flows: [
    {
      stage: 0, id: 'welcome', type: 'branch', answerKey: 'intent',
      message: `Hi {name}! 🐾 Welcome to *Avril Beetails* pet care.\n\nHow can we help you today?\n\n1️⃣ Book a grooming appointment\n2️⃣ Ask about our services & pricing\n3️⃣ Talk to our team`,
      options: [
        { value: '1', label: 'Grooming Appointment' },
        { value: '2', label: 'Services & Pricing Info' },
        { value: '3', label: 'Talk to Team' },
      ],
      branches: { '1': 1, '2': 5, '3': 6 },
    },
    // ── Booking flow (stages 1–4) ──────────────────────────────────────────
    {
      stage: 1, id: 'pet_type', type: 'select', answerKey: 'pet_type',
      message: `What kind of pet?\n\n1️⃣ Dog\n2️⃣ Cat\n3️⃣ Rabbit / small animal\n4️⃣ Other`,
      options: [
        { value: '1', label: 'Dog' }, { value: '2', label: 'Cat' },
        { value: '3', label: 'Rabbit / Small Animal' }, { value: '4', label: 'Other' },
      ],
    },
    {
      stage: 2, id: 'pet_breed', type: 'free_text', answerKey: 'pet_breed',
      message: `What breed? _(e.g. Golden Retriever, Persian, Mixed breed)_`,
    },
    {
      stage: 3, id: 'preferred_date', type: 'free_text', answerKey: 'preferred_date',
      message: `What date works for you? _(e.g. Monday 9 June or this Friday afternoon)_`,
    },
    {
      // TERMINAL — book_appointment
      stage: 4, id: 'book', type: 'book_appointment',
      message: '',
      terminal: {
        type: 'book_appointment',
        successMessage: `Booked! 🐾 We'll confirm your slot and send details shortly.\n\nSee you and your furry friend soon! 💛`,
        dateAnswerKey: 'preferred_date',
      },
    },
    // ── FAQ / Info flow (stage 5) ──────────────────────────────────────────
    {
      stage: 5, id: 'services_info', type: 'send_info',
      message: '',
      terminal: {
        type: 'send_info',
        infoMessage: `🐾 *Avril Beetails Services & Pricing*\n\n*Grooming*\n• Full groom (bath + trim + dry): from ₦8,000\n• Bath only: from ₦4,000\n• Nail trim: ₦1,500\n\n*Price varies by size/breed.*\n\nTo book, just say *Hi* to start over 😊`,
        loopToStage: 0,
      },
    },
    // ── Escalation flow (stage 6) ─────────────────────────────────────────
    {
      stage: 6, id: 'talk_to_team', type: 'notify_only',
      message: '',
      terminal: {
        type: 'notify_only',
        successMessage: `Our team will reach out to you shortly! 🙏`,
      },
    },
  ],

  messages: {
    unknown_input:    `Please pick one of the options above 😊`,
    stop:             `No problem! Come back whenever you're ready 🐾`,
    escalate_confirm: `Connecting you with our team right away! 🙏`,
  },
};

export default config;
```

## 9. Onboarding a New Company — Step-by-Step

### Step 1: Gather company details
- Business name, slug (URL-safe)
- WhatsApp Business number (dedicated, not personal)
- Owner/sales person's WhatsApp number for alerts
- Bot purpose: what is this bot for? (lead qualification, orders, FAQ, booking, or mixed)
- Terminal action: what should happen when the flow ends? (save_lead, create_order, notify_only, send_info, book, webhook)

### Step 2: Create an OpenWA session for the company
1. Open the OpenWA dashboard: `http://your-server:2886`
2. Click **New Session** → enter a session name (e.g. `avril-bot`)
3. Scan the QR code with the company's dedicated WhatsApp number (not personal)
4. Once connected (status: CONNECTED), copy the session ID
5. Add `{SLUG}_OPENWA_SESSION_ID=avril-bot` to `.env`
6. Each company needs a **dedicated SIM/number** — one session per number

### Step 3: Write the config file
- Copy the closest example config above
- Adjust `flows` and the terminal stage `terminal` config for their use case
- All secrets come from `process.env` — never hardcode
- Run `npm run validate-config` to check before deploying

### Step 4: Register the ConvFlow webhook in OpenWA
For each session (company), register the webhook via OpenWA API or dashboard:

```bash
curl -X POST http://localhost:2785/api/sessions/{sessionId}/webhooks \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $OPENWA_API_KEY" \
  -d '{
    "url": "https://bots.ivarse.com/webhook/whatsapp",
    "events": ["message.received"],
    "secret": "your_webhook_hmac_secret"
  }'
```

- `url` must be the public HTTPS URL of your ConvFlow server
- `secret` must match `OPENWA_WEBHOOK_SECRET` in ConvFlow `.env`
- Repeat for every session (company)

### Step 5: Deploy
```bash
npm run build
npm run start
# Server auto-loads all company configs and seeds DB
```

### Step 6: Test
- Send "Hi" to the company's WhatsApp number
- Verify flow progresses correctly
- Trigger the terminal action → confirm the tenant receives the WhatsApp alert
- Check the `leads` table in PostgreSQL

---

## 10. package.json

```json
{
  "name": "convflow",
  "version": "1.0.0",
  "description": "ConvFlow — Multi-tenant WhatsApp workflow engine by IVarse Technologies",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "validate-config": "tsx scripts/validate-configs.ts",
    "migrate": "npx prisma migrate deploy",
    "db:generate": "npx prisma generate",
    "db:studio": "npx prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^7.0.0",
    "axios": "^1.6.0",
    "fastify": "^5.0.0",
    "ioredis": "^5.3.0",
    "dotenv": "^16.4.0",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.3"
  },
  "devDependencies": {
    "prisma": "^7.0.0",
    "typescript": "^5.4.0",
    "tsx": "^4.7.0",
    "@types/node": "^20.0.0",
    "@types/jsonwebtoken": "^9.0.0",
    "@types/bcryptjs": "^2.4.0"
  }
}
```

---

## 11. Deployment

### Infrastructure overview

```
VPS
├── OpenWA (Docker)      — ports 2785 (API), 2886 (Dashboard). Internal only, NOT public.
├── ConvFlow (Node.js)   — port 3000. Sits behind Nginx. Exposed via HTTPS.
├── PostgreSQL 16        — port 5432 (internal only)
└── Redis 7              — port 6379 (internal only)
```

### OpenWA Docker setup (run first)

```bash
git clone https://github.com/rmyndharis/OpenWA.git
cd OpenWA

# Production with PostgreSQL + Redis
docker compose --profile full up -d

# Dashboard: http://localhost:2886 (first run: create API key here)
# API:       http://localhost:2785/api
```

**CRITICAL:** Never expose OpenWA ports 2785/2886 to the public internet.
Nginx only proxies ConvFlow (port 3000). OpenWA is internal infrastructure.

### Session keepalive
OpenWA sessions can drop if the phone goes offline or WhatsApp detects unusual activity.
Handle this by:
1. Subscribing to `session.disconnected` webhook events → alert owner to re-scan QR
2. Monitoring `/api/sessions/{sessionId}` status in a cron job every 10 minutes
3. Keeping the WhatsApp number active (send occasional messages from the number)

### ConvFlow server requirements
- Node.js 20+
- PostgreSQL 16
- Redis 7+
- Public HTTPS URL (Nginx + Let's Encrypt or Cloudflare Tunnel)

### Nginx config (minimal)
```nginx
server {
  listen 443 ssl;
  server_name bots.ivarse.com;

  location /webhook/whatsapp {
    proxy_pass http://localhost:3000;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  location /health {
    proxy_pass http://localhost:3000;
  }
}
```

### PM2 process file
```json
{
  "apps": [{
    "name": "convflow",
    "script": "dist/server.js",
    "env": { "NODE_ENV": "production" },
    "restart_delay": 3000,
    "max_restarts": 10
  }]
}
```

---

## 12. Extending ConvFlow

### Adding a new channel (e.g. Instagram DM, SMS, Telegram)
1. Create `src/channels/{channel}.channel.ts` implementing `sendMessage(config, to, text)`
2. Create `src/webhook/{channel}.ts` for the webhook handler
3. Add a new route in `server.ts`
4. Extend `InboundMessage.channelType` union in `src/types/index.ts`
5. Extend `CompanyConfig` with any channel-specific fields (e.g. `telegramBotToken`)
6. The Flow Engine is channel-agnostic — no changes needed there

### Adding a new flow type
1. Add the new type to the `Flow.type` union in `src/types/index.ts`
2. Handle it in `flow-engine.ts → processAnswer()`
3. Document the new type in this skill file

### Adding an admin dashboard
- Build a Next.js app that reads from the same PostgreSQL `leads` table
- Filter by `company_slug` for per-tenant views
- Auth: simple JWT or NextAuth with company-specific credentials

---

## 13. Key Architectural Decisions & Rationale

| Decision | Rationale |
|---|---|
| Config files seed DB (not DB-only) | IDE-friendly, version-controllable, reviewable in PRs. DB is the runtime source of truth. |
| One server, many tenants | Lower infra cost. Tenant isolation via `company_slug` in all DB tables and `conv:{slug}:{phone}` in Redis. |
| Fastify over Express | Faster, better TypeScript support, schema validation built in |
| Channel abstraction from day one | Costs nothing now, saves a rewrite when Instagram DM or SMS is needed |
| Redis for conversation state | TTL-based auto-expiry, fast reads, no orphaned rows in Postgres |
| Flow Engine reads config, zero company code in engine | Adding a company never touches engine code — prevents bugs, enables non-dev onboarding eventually |
| OpenWA self-hosted (replaces Meta Cloud API) | No Meta account bans, no approval pipeline, full infra ownership. Runs on same VPS. Slight extra complexity (QR re-scan on session drop) is worth the stability. |
| One OpenWA instance, multiple sessions | Each company has its own session (phone number) on one Docker container. Simpler ops than running separate containers per company. |

---

## 14. Platform Architecture — Multi-Tenant SaaS Layer
## 14. Platform Architecture — Multi-Tenant SaaS Layer

ConvFlow v2 adds a full SaaS platform on top of the core engine. The engine (Sections 1–13) remains unchanged. What's added:

```
convflow/
├── src/
│   ├── [existing engine modules — unchanged]
│   │
│   ├── platform/                        ← NEW: SaaS management layer
│   │   ├── auth/
│   │   │   ├── auth.service.ts          # JWT issue/verify, bcrypt passwords
│   │   │   └── auth.middleware.ts       # Fastify preHandler: injects req.tenant
│   │   ├── tenants/
│   │   │   ├── tenant.service.ts        # CRUD for tenant accounts
│   │   │   └── tenant.routes.ts         # POST /platform/tenants (register)
│   │   ├── sessions/
│   │   │   ├── session.service.ts       # Proxy OpenWA session create/QR/status
│   │   │   └── session.routes.ts        # GET /platform/sessions/qr etc.
│   │   ├── flows/
│   │   │   ├── flow.service.ts          # Save/load flow configs per tenant
│   │   │   └── flow.routes.ts           # CRUD /platform/flows
│   │   ├── leads/
│   │   │   ├── lead.service.ts          # Tenant-scoped lead queries
│   │   │   └── lead.routes.ts           # GET /platform/leads
│   │   ├── messages/
│   │   │   ├── message.service.ts       # Manual/transactional outbound
│   │   │   └── message.routes.ts        # POST /platform/messages/send
│   │   └── analytics/
│   │       ├── analytics.service.ts     # Aggregation queries
│   │       └── analytics.routes.ts      # GET /platform/analytics
│   │
│   └── integrations/                    ← NEW: External integration API
│       ├── integration.routes.ts        # POST /api/integrations/send
│       ├── erpnext/
│       │   ├── erpnext.service.ts       # ERPNext webhook receiver + sender
│       │   └── erpnext.routes.ts        # POST /integrations/erpnext/webhook
│       └── templates/
│           └── template.service.ts      # Message template renderer (Handlebars)
│
├── dashboard/                           ← NEW: Next.js tenant dashboard
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx               # Sidebar + auth guard
│   │   │   ├── page.tsx                 # Overview / analytics home
│   │   │   ├── whatsapp/page.tsx        # Connect WhatsApp (QR scan)
│   │   │   ├── flows/page.tsx           # No-code flow builder
│   │   │   ├── leads/page.tsx           # Lead CRM table
│   │   │   ├── conversations/page.tsx   # Full conversation history
│   │   │   ├── messages/page.tsx        # Send manual/transactional messages
│   │   │   ├── settings/page.tsx        # Scoring, routing, API key
│   │   │   └── integrations/page.tsx    # ERPNext setup guide + API key
│   │   └── admin/                       # IVarse super-admin only
│   │       ├── tenants/page.tsx
│   │       └── platform/page.tsx
│   ├── components/
│   │   ├── flow-builder/                # React Flow visual editor
│   │   ├── qr-connect/                  # WhatsApp QR scanner widget
│   │   ├── lead-table/                  # TanStack Table lead CRM
│   │   └── charts/                      # Recharts analytics
│   └── lib/
│       ├── api.ts                        # Typed fetch client → ConvFlow API
│       └── auth.ts                       # NextAuth config
│
└── migrations/
    ├── 001_init.sql                      # [existing]
    └── 002_platform.sql                  # NEW: platform tables
```

---


---

## 15. Extended Prisma Schema (Platform Tables)

Add these models to `prisma/schema.prisma` alongside the core `Tenant` and `Lead` models. Run `npx prisma migrate dev` to generate and apply the migration.

```prisma
// ── Tenant accounts (platform users) ─────────────────────────────────────────
model TenantAccount {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slug         String    @unique @db.VarChar(80)
  businessName String    @map("business_name") @db.VarChar(120)
  email        String    @unique @db.VarChar(200)
  passwordHash String    @map("password_hash") @db.VarChar(255)
  role         String    @default("tenant") @db.VarChar(20)  // 'tenant' | 'super_admin'
  plan         String    @default("starter") @db.VarChar(20)
  apiKey       String    @unique @map("api_key") @db.VarChar(64)
  active       Boolean   @default(true)
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @default(now()) @map("updated_at")
  tenants      Tenant[]  @relation("AccountTenants")

  @@map("tenant_accounts")
}

// ── ERPNext connection config (optional, per bot) ─────────────────────────────
model ErpnextConnection {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  companySlug  String    @unique @map("company_slug") @db.VarChar(80)
  erpnextUrl   String    @map("erpnext_url") @db.VarChar(255)
  apiKey       String    @map("api_key") @db.VarChar(120)
  apiSecret    String    @map("api_secret") @db.VarChar(120)
  connectedAt  DateTime  @default(now()) @map("connected_at")
  lastSyncAt   DateTime? @map("last_sync_at")
  status       String    @default("connected") @db.VarChar(20)  // 'connected' | 'error' | 'disconnected'
  errorMessage String?   @map("error_message")

  @@map("erpnext_connections")
}

// ── Conversation log ──────────────────────────────────────────────────────────
model Conversation {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  companySlug String   @map("company_slug") @db.VarChar(80)
  phone       String   @db.VarChar(20)
  direction   String   @db.VarChar(10)   // 'inbound' | 'outbound'
  messageText String   @map("message_text")
  stageId     String?  @map("stage_id") @db.VarChar(80)
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([companySlug, phone])
  @@index([companySlug, createdAt(sort: Desc)])
  @@map("conversations")
}

// ── ERPNext item cache (synced on connect + refreshed every 30min) ────────────
model ErpnextItemCache {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  companySlug  String   @map("company_slug") @db.VarChar(80)
  itemCode     String   @map("item_code") @db.VarChar(140)
  itemName     String   @map("item_name") @db.VarChar(200)
  itemGroup    String?  @map("item_group") @db.VarChar(100)
  standardRate Decimal  @default(0) @map("standard_rate") @db.Decimal(12, 2)
  currency     String   @default("NGN") @db.VarChar(10)
  description  String?
  isActive     Boolean  @default(true) @map("is_active")
  syncedAt     DateTime @default(now()) @map("synced_at")

  @@unique([companySlug, itemCode])
  @@index([companySlug, isActive])
  @@index([companySlug, itemGroup])
  @@map("erpnext_item_cache")
}

// ── Human takeover log ────────────────────────────────────────────────────────
model HumanTakeover {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  companySlug      String    @map("company_slug") @db.VarChar(80)
  phone            String    @db.VarChar(20)
  triggeredAt      DateTime  @default(now()) @map("triggered_at")
  resumedAt        DateTime? @map("resumed_at")
  resumedBy        String?   @map("resumed_by") @db.VarChar(120)
  offFlowMessage   String?   @map("off_flow_message")
  stageAtTakeover  Int?      @map("stage_at_takeover")

  @@index([companySlug, triggeredAt(sort: Desc)])
  @@map("human_takeovers")
}
```

Also add `accountId` and `plan` to the `Tenant` model:

```prisma
// Updated Tenant model (in prisma/schema.prisma)
model Tenant {
  // ...existing fields...
  accountId String?        @map("account_id") @db.Uuid
  plan      String?        @default("starter") @db.VarChar(20)
  account   TenantAccount? @relation("AccountTenants", fields: [accountId], references: [id])
}
```

---

## 16. Extended TypeScript Types

```typescript
// Additions to src/types/index.ts

export interface TenantAccount {
  id: string;
  slug: string;
  businessName: string;
  email: string;
  role: 'tenant' | 'super_admin';
  plan: 'starter' | 'growth' | 'scale';
  apiKey: string;
  active: boolean;
}

export interface ERPNextConnection {
  companySlug: string;
  erpnextUrl: string;
  apiKey: string;
  apiSecret: string;
  status: 'connected' | 'error' | 'disconnected';
  lastSyncAt: string | null;
  errorMessage: string | null;
}

// Plan limits
export const PLAN_LIMITS = {
  starter: { bots: 1,  monthlyLeads: 500,    teamMembers: 1  },
  growth:  { bots: 3,  monthlyLeads: 5_000,  teamMembers: 5  },
  scale:   { bots: 10, monthlyLeads: 50_000, teamMembers: 20 },
} as const;
```

---

## 17. Platform API — Management Backend

All platform routes live under `/platform/` and require a valid JWT.
JWT payload: `{ accountId, role, tenantSlugs[] }`.

### 17.1 Auth Routes

```
POST /platform/auth/register
  Body: { businessName, email, password }
  → Creates tenant_account (slug auto-generated, apiKey generated with crypto.randomBytes)
  → Returns: { token, account }

POST /platform/auth/login
  Body: { email, password }
  → Returns: { token, account, bots[] }

POST /platform/auth/refresh
  → Returns: { token }
```

### 17.2 Bot Management Routes

```
GET  /platform/bots
  → Lists all bots owned by authenticated account

POST /platform/bots
  Body: { name, websiteUrl, ownerPhone }
  → Creates tenants row + OpenWA session
  → Returns: { bot, qrPollUrl }

GET  /platform/bots/:slug/qr
  → Proxies OpenWA GET /api/sessions/{sessionId}/qr
  → Returns: { status: 'CONNECTED' | 'SCAN_QR' | 'STARTING', qrImage?: string (base64 PNG) }
  → Dashboard polls this every 2s until status === 'CONNECTED'

GET  /platform/bots/:slug/status
  → Returns: { status, phoneNumber, connectedAt }

POST /platform/bots/:slug/reconnect
  → Restarts OpenWA session → new QR generated
```

### 17.3 Flow Builder Routes

```
GET /platform/bots/:slug/flows
  → Returns current { flows[], scoring[], routing[] } from tenants.config_json

PUT /platform/bots/:slug/flows
  Body: { flows: FlowStage[], scoring?: ScoringRule[] }
  → Validates (same validator as file-based configs)
  → Saves to tenants.config_json in DB
  → Hot-reloads tenant cache (NO server restart needed)

POST /platform/bots/:slug/flows/preview
  Body: { flows, scoring, routing, simulatedAnswers: AnswerMap }
  → Runs scoring + routing engine against simulated answers
  → Returns: { score, classification, routingMessage }
  → Powers the "Test your flow" button in dashboard
```

### 17.4 Leads Routes

```
GET /platform/bots/:slug/leads
  Query: { classification?, dateFrom?, dateTo?, page?, limit? }
  → ALL queries ALWAYS filter by company_slug (tenant isolation)
  → Returns: paginated leads with answer labels

GET /platform/bots/:slug/leads/:id
  → Full lead detail

GET /platform/bots/:slug/conversations/:phone
  → Full inbound+outbound conversation thread for this phone number
```

### 17.5 Analytics Routes

```
GET /platform/bots/:slug/analytics
  Query: { period: '7d' | '30d' | '90d' }
  → Returns:
    {
      totalLeads: number,
      byClassification: { hot, warm, nurture, cold },
      conversionRate: number,
      avgLeadScore: number,
      dailyVolume: { date, inbound, outbound }[],
      flowDropOff: { stageId, label, count, droppedPct }[],
      topSources: { source, count }[]
    }
```

### 17.6 Settings Routes

```
GET /platform/bots/:slug/settings
  → Returns: { ownerPhone, calendlyLink, deckUrl, websiteUrl }

PUT /platform/bots/:slug/settings
  Body: Partial<{ ownerPhone, calendlyLink, deckUrl, websiteUrl }>
  → Updates config, hot-reloads cache

POST /platform/account/api-key/rotate
  → Regenerates tenant_accounts.api_key
  → Returns: { apiKey }
```

### 17.7 Auth Middleware (Tenant Scope Guard)

```typescript
// src/platform/auth/auth.middleware.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
// No db import needed — JWT payload carries all required claims

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return reply.status(401).send({ error: 'Unauthorized' });

  try {
    const token   = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
    (req as any).account = payload;
  } catch {
    return reply.status(401).send({ error: 'Invalid token' });
  }
}

export async function requireBotAccess(req: FastifyRequest, reply: FastifyReply) {
  const account = (req as any).account;
  const slug    = (req.params as any).slug;

  // Super admins can access any bot
  if (account.role === 'super_admin') return;

  // Tenants can only access their own bots
  if (!account.tenantSlugs.includes(slug)) {
    return reply.status(403).send({ error: 'Access denied' });
  }
}
```

---

## 18. ERPNext Integration — Auto-Configuration via frappe_whatsapp

**What this is NOT:**
ConvFlow does NOT send transactional messages from ERPNext. ConvFlow does NOT receive ERPNext webhooks at runtime. There is no message bridge between ConvFlow and ERPNext at runtime.

**What this IS:**
When a tenant clicks "Connect ERPNext" in the ConvFlow dashboard, ConvFlow fires a one-time API call to the tenant's ERPNext site to auto-configure the `frappe_whatsapp` app with the tenant's WhatsApp credentials. After that, the tenant manages all their business transactional templates entirely inside ERPNext — ConvFlow's job is done.

The `frappe_whatsapp` app (https://github.com/shridarpatil/frappe_whatsapp) runs on the tenant's ERPNext site and handles all transactional WhatsApp on their end, using their WhatsApp Business number (the same number connected to their ConvFlow bot session).

### 18.1 What "Connect ERPNext" Does

```
Tenant clicks "Connect ERPNext" in ConvFlow dashboard
  → Enters: ERPNext URL, API Key, API Secret
  → ConvFlow fires ONE-TIME setup:

  Step 1: Test ERPNext credentials
    GET {erpnextUrl}/api/method/frappe.auth.get_logged_user
    Headers: Authorization: token {apiKey}:{apiSecret}

  Step 2: Check frappe_whatsapp is installed
    GET {erpnextUrl}/api/method/frappe.client.get_list
    Body: { doctype: "WhatsApp Settings" }

  Step 3: Push WhatsApp credentials into frappe_whatsapp WhatsApp Settings
    POST {erpnextUrl}/api/resource/WhatsApp Settings/WhatsApp Settings
    Body:
    {
      "token": "{tenant's OpenWA session API key}",
      "url": "https://bots.ivarse.com/api/openwa-proxy/{sessionId}",
      "webhook_secret": "{generated secret}",
      "enabled": 1
    }

  Step 4: (Optional) Create a "New Lead" notification template in ERPNext
    POST {erpnextUrl}/api/resource/WhatsApp Templates
    Body: { ... default new lead template ... }

  Step 5: Save connection creds to erpnext_connections table

  → Returns: { connected: true }
```

**After this, the tenant:**
- Goes into their ERPNext → WhatsApp Settings → sees it's already configured
- Creates their own notification templates for invoices, orders, deliveries etc.
- Manages everything from within ERPNext — ConvFlow never touches it again

### 18.2 OpenWA Proxy Endpoint

Because `frappe_whatsapp` needs to call a standard WhatsApp API endpoint,
ConvFlow exposes a thin proxy that translates `frappe_whatsapp`'s calls into
OpenWA REST calls. This is the `url` set in Step 3 above.

```typescript
// src/integrations/openwa-proxy.routes.ts
// Exposes: POST /api/openwa-proxy/:sessionId/messages
// frappe_whatsapp posts here → ConvFlow forwards to OpenWA

import { FastifyInstance } from 'fastify';
import { sendMessage } from '../channels/openwa.channel';
import { getCompanyBySessionId } from '../engine/tenant-router';

export async function openwaProxyRoutes(app: FastifyInstance) {
  // frappe_whatsapp calls this to send a message
  app.post('/api/openwa-proxy/:sessionId/messages', async (req, reply) => {
    const { sessionId } = req.params as any;
    const body = req.body as any;

    // Validate proxy secret header (set per tenant during ERPNext connect)
    const proxySecret = req.headers['x-proxy-secret'];
    const company = getCompanyBySessionId(sessionId);

    if (!company) return reply.status(404).send({ error: 'Session not found' });
    // TODO: validate proxySecret against stored value

    // frappe_whatsapp sends: { to: "phone", message: "text" }
    const phone = body.to?.replace(/\D/g, ''); // strip all non-digits
    const text  = body.message ?? body.text;

    if (!phone || !text) return reply.status(400).send({ error: 'Missing to or message' });

    await sendMessage(company, phone, text);
    reply.send({ success: true });
  });
}
```

### 18.3 ERPNext Connect Service (`src/integrations/erpnext/erpnext.service.ts`)

```typescript
// src/integrations/erpnext/erpnext.service.ts
import axios from 'axios';
import { prisma } from '../../store/prisma';
import crypto from 'crypto';

interface ConnectERPNextPayload {
  companySlug: string;
  sessionId: string;        // tenant's OpenWA session
  openwaApiKey: string;
  erpnextUrl: string;
  apiKey: string;
  apiSecret: string;
}

export async function connectERPNext(payload: ConnectERPNextPayload): Promise<void> {
  const { companySlug, sessionId, erpnextUrl, apiKey, apiSecret, openwaApiKey } = payload;
  const authHeader = `token ${apiKey}:${apiSecret}`;
  const client = axios.create({
    baseURL: erpnextUrl,
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    timeout: 15_000,
  });

  // Step 1: Verify credentials
  try {
    await client.get('/api/method/frappe.auth.get_logged_user');
  } catch {
    throw new Error('ERPNext credentials invalid or site unreachable');
  }

  // Step 2: Check frappe_whatsapp is installed
  try {
    await client.get('/api/resource/WhatsApp Settings/WhatsApp Settings');
  } catch {
    throw new Error('frappe_whatsapp app not installed on this ERPNext site. Install it first: https://github.com/shridarpatil/frappe_whatsapp');
  }

  // Step 3: Configure frappe_whatsapp WhatsApp Settings
  const proxySecret = crypto.randomBytes(24).toString('hex');
  const proxyUrl    = `${process.env.CONVFLOW_PUBLIC_URL}/api/openwa-proxy/${sessionId}`;

  await client.put('/api/resource/WhatsApp Settings/WhatsApp Settings', {
    token: openwaApiKey,
    url: proxyUrl,
    webhook_secret: proxySecret,
    enabled: 1,
  });

  // Step 4: Save connection to DB via Prisma (safe upsert — no raw SQL)
  await prisma.erpnextConnection.upsert({
    where:  { companySlug },
    update: { erpnextUrl, apiKey, apiSecret, status: 'connected', errorMessage: null, connectedAt: new Date() },
    create: { companySlug, erpnextUrl, apiKey, apiSecret, status: 'connected' },
  });

  // Store proxy secret in tenant config
  const tenant = await prisma.tenant.findUnique({ where: { slug: companySlug } });
  if (tenant) {
    const updatedConfig = { ...(tenant.configJson as object), erpnextProxySecret: proxySecret };
    await prisma.tenant.update({
      where:  { slug: companySlug },
      data:   { configJson: updatedConfig },
    });
  }
}
```

### 18.4 ERPNext Connect Route

```typescript
// src/platform/sessions/erpnext-connect.routes.ts

app.post('/platform/bots/:slug/erpnext/connect',
  { preHandler: [requireAuth, requireBotAccess] },
  async (req, reply) => {
    const { slug }                         = req.params as any;
    const { erpnextUrl, apiKey, apiSecret } = req.body as any;

    // Get tenant's OpenWA session details via Prisma (type-safe, injection-proof)
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) return reply.status(404).send({ error: 'Bot not found' });

    try {
      await connectERPNext({
        companySlug: slug,
        sessionId:   tenant.openwaSessionId,
        openwaApiKey: process.env.OPENWA_API_KEY!,
        erpnextUrl,
        apiKey,
        apiSecret,
      });
      reply.send({ connected: true });
    } catch (err: any) {
      reply.status(400).send({ connected: false, error: err.message });
    }
  }
);

app.get('/platform/bots/:slug/erpnext/status',
  { preHandler: [requireAuth, requireBotAccess] },
  async (req, reply) => {
    const { slug } = req.params as any;
    const conn = await prisma.erpnextConnection.findUnique({ where: { companySlug: slug } });
    if (!conn) return reply.send({ connected: false });
    reply.send({ connected: conn.status === 'connected', ...conn });
  }
);

app.delete('/platform/bots/:slug/erpnext/disconnect',
  { preHandler: [requireAuth, requireBotAccess] },
  async (req, reply) => {
    const { slug } = req.params as any;
    await prisma.erpnextConnection.update({
      where: { companySlug: slug },
      data:  { status: 'disconnected' },
    });
    reply.send({ disconnected: true });
  }
);
```

---

## 19. Lead Push to ERPNext

When ConvFlow qualifies a lead (bot flow complete), if the tenant has ERPNext connected,
ConvFlow pushes the lead data into the ERPNext **Lead** doctype automatically.
This is the ONLY runtime interaction between ConvFlow and ERPNext.

### 19.1 Lead Push Logic (inside `routing-engine.ts`)

```typescript
// Called after saveLead() in terminal-runner.ts
import { prisma } from '../../store/prisma';

export async function pushLeadToERPNext(
  companySlug: string,
  phone: string,
  name: string | null,
  answers: AnswerMap,
  score: number,
  classification: string
): Promise<void> {
  // Prisma query — fully parameterised, no injection surface
  const conn = await prisma.erpnextConnection.findFirst({
    where: { companySlug, status: 'connected' },
  });
  if (!conn) return; // Not connected — skip silently

  const authHeader = `token ${conn.apiKey}:${conn.apiSecret}`;

  // Build human-readable notes from answers
  const notes = Object.entries(answers)
    .filter(([k]) => k.endsWith('_label'))
    .map(([k, v]) => `${k.replace('_label','').replace(/_/g,' ')}: ${v}`)
    .join('\n');

  const leadPayload = {
    doctype: 'Lead',
    lead_name: name ?? `WhatsApp Lead - ${phone}`,
    mobile_no: `+${phone}`,
    source: 'WhatsApp Bot',
    status: classification === 'hot' ? 'Open' : 'Lead',
    notes: `ConvFlow Score: ${score}/12 (${classification})\n\n${notes}`,
    custom_convflow_score: score,
    custom_convflow_classification: classification,
    custom_convflow_slug: companySlug,
  };

  try {
    await axios.post(
      `${conn.erpnextUrl}/api/resource/Lead`,
      leadPayload,
      {
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        timeout: 10_000,
      }
    );

    await prisma.erpnextConnection.update({
      where: { companySlug },
      data:  { lastSyncAt: new Date() },
    });
  } catch (err: any) {
    // Log the error but never let it crash the bot flow
    console.error(`[${companySlug}] ERPNext lead push failed:`, err.response?.data ?? err.message);
    await prisma.erpnextConnection.update({
      where: { companySlug },
      data:  { status: 'error', errorMessage: err.message },
    });
  }
}
```

### 19.2 Wiring into Flow Engine

In `flow-engine.ts`, after `saveLead()` and `notifyOwner()`:

```typescript
// After routing is complete:
await saveLead(phone, state, score, route.classification);

if (route.classification === 'hot') {
  await notifyOwner(company, phone, state, score, 'hot_lead');
}

// Push to ERPNext if connected (non-blocking — fire and forget)
pushLeadToERPNext(
  company.slug,
  phone,
  state.name,
  state.answers,
  score,
  route.classification
).catch(err => console.error(`[${company.slug}] ERPNext push error:`, err));

await sendMessage(company, phone, interpolate(route.action.message, state));
await clearState(phone, company.slug);
```

### 19.3 ERPNext Custom Fields for Leads

Tenants need three custom fields on the Lead doctype to store ConvFlow metadata.
ConvFlow creates these automatically during the ERPNext connect flow (Step 3 extended):

```typescript
// Add to connectERPNext() after configuring WhatsApp Settings:

const customFields = [
  { fieldname: 'custom_convflow_score', label: 'ConvFlow Score', fieldtype: 'Int', insert_after: 'source' },
  { fieldname: 'custom_convflow_classification', label: 'ConvFlow Classification', fieldtype: 'Data', insert_after: 'custom_convflow_score' },
  { fieldname: 'custom_convflow_slug', label: 'ConvFlow Bot', fieldtype: 'Data', insert_after: 'custom_convflow_classification' },
];

for (const field of customFields) {
  try {
    await client.post('/api/resource/Custom Field', {
      ...field,
      dt: 'Lead',
      read_only: 1,
    });
  } catch {
    // Field may already exist — ignore
  }
}
```

---

## 20. Complete Lead Flow — End to End

```
Customer visits itechnologies.ng
         │
         ▼
Clicks WhatsApp button → wa.me/234XXXXXXXXX?text=Hi IVarse Technologies!
         │
         ▼
WhatsApp opens → Customer sends message
         │
         ▼
OpenWA receives it → fires POST /webhook/whatsapp to ConvFlow
         │
         ▼
ConvFlow Webhook Handler:
  1. Verifies HMAC signature
  2. Maps sessionId → IVarse Technologies config
  3. Calls Flow Engine
         │
         ▼
Flow Engine runs through configured stages:
  Stage 0: "What service are you interested in?" → Customer: "1"
  Stage 1: "What type of org?"                  → Customer: "2"
  Stage 2: "Timeline?"                          → Customer: "1"
  Stage 3: "Budget?"                            → Customer: "3"
         │
         ▼
Scoring Engine: score = 8 → classification = 'hot'
         │
    ┌────┴────────────────────────────────────────┐
    ▼                                             ▼
saveLead()                               notifyOwner() → WhatsApp alert to OG:
leads table:                             "🔥 HOT LEAD — IVarse Technologies
{ phone, answers,                         Name: John
  score: 8,                               Service: Custom Software
  classification: 'hot' }                 Score: 8/12 ..."
    │
    ▼
pushLeadToERPNext() [if connected]
→ POST /api/resource/Lead on erp.ivarstechnologies.ng
→ Lead created with score, classification, mobile, notes
→ Appears in ERPNext Lead list instantly
    │
    ▼
sendMessage() to customer:
"Based on what you've shared, this sounds urgent.
🔥 Flagging your details to our founder — expect a message within the hour..."
```

---

## 21. Dashboard Frontend Stack

### Stack

| Layer | Technology | Rationale |
|---|---|---|
| Framework | Next.js 16 App Router | Consistent with all IVarse products |
| Styling | Tailwind CSS v4 (CSS-first) | No tailwind.config.js, same as group |
| Components | shadcn/ui | Accessible, composable |
| Auth | NextAuth.js v5 | JWT + credential provider |
| Flow Builder | @xyflow/react (React Flow) | Visual node editor for conversation flows |
| Charts | Recharts | Lightweight, composable |
| Tables | TanStack Table v8 | Headless, full control |
| Real-time QR | SWR polling every 2s | Simple, no WebSocket overhead |
| API Client | Typed fetch wrapper | No extra HTTP library |

### Dashboard Pages

```
/login                        → Sign in
/register                     → New tenant signup

/(dashboard)
  /                           → Overview: lead stats, bot status summary
  /bots                       → All connected bot instances
  /bots/[slug]/connect        → WhatsApp QR connect / reconnect
  /bots/[slug]/flows          → No-code flow builder (React Flow)
  /bots/[slug]/leads          → Lead CRM table (TanStack Table)
  /bots/[slug]/conversations  → Full conversation history per phone
  /bots/[slug]/analytics      → Charts: volume, classification, drop-off
  /bots/[slug]/settings       → Owner phone, routing links, API key
  /bots/[slug]/integrations   → ERPNext connect form + status

/admin (super_admin only)
  /tenants                    → All tenant accounts
  /bots                       → All bots across all tenants
  /analytics                  → Platform-wide stats
```

### Key Components

**QR Connect Widget:**
```typescript
// Polls GET /platform/bots/:slug/qr every 2s via SWR
// Shows: base64 QR image while status !== 'CONNECTED'
// Shows: green checkmark + "Bot is Live" when CONNECTED
// Shows: "Reconnect" button when status === 'DISCONNECTED'
```

**Flow Builder (React Flow):**
```
Node types:
  SelectNode   → maps to Flow { type: 'select' }   — numbered options question
  FreeTextNode → maps to Flow { type: 'free_text' } — open answer question
  BranchNode   → maps to Flow { type: 'branch' }   — question with different next-stage per answer
  ScoringNode  → visual scoring rule editor (answerKey → value → score delta)
  RoutingNode  → routing threshold editor (min score → classification → message)

Save flow → PUT /platform/bots/:slug/flows
Test flow → POST /platform/bots/:slug/flows/preview (shows score + route for simulated answers)
```

**ERPNext Integration Page:**
```typescript
// Three states:
// 1. Not connected → form: ERPNext URL, API Key, API Secret + "Connect" button
// 2. Connecting    → spinner + "Configuring frappe_whatsapp..."
// 3. Connected     → green badge, ERPNext URL, "Disconnect" button
//                    + info box: "Your ERPNext is now ready.
//                      Go to ERPNext → WhatsApp Settings to set up your
//                      notification templates for invoices, orders, etc."
```

### Auth Flow

```typescript
// dashboard/lib/auth.ts
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      async authorize(credentials) {
        const res = await fetch(`${process.env.CONVFLOW_API_URL}/platform/auth/login`, {
          method: 'POST',
          body: JSON.stringify(credentials),
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) return null;
        const { token, account } = await res.json();
        return { ...account, token };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.convflowToken = (user as any).token;
      return token;
    },
    session({ session, token }) {
      (session as any).convflowToken = token.convflowToken;
      return session;
    },
  },
});
```

---

## 22. Infrastructure — Full Deployment Map

```
VPS (e.g. bots.ivarse.com)
│
├── Docker: OpenWA
│   ├── REST API:   http://localhost:2785  ← INTERNAL ONLY
│   └── Dashboard:  http://localhost:2886  ← INTERNAL ONLY (IVarse admin only)
│
├── PM2: convflow-engine    (port 3000)
│   └── Nginx → https://bots.ivarse.com
│
├── PM2: convflow-dashboard (port 4000)
│   └── Nginx → https://dashboard.convflow.ng
│
├── PostgreSQL 16  (port 5432, internal)
└── Redis 7        (port 6379, internal)
```

### Nginx (simplified)

```nginx
server {
  listen 443 ssl;
  server_name bots.ivarse.com;
  location / { proxy_pass http://localhost:3000; }
}

server {
  listen 443 ssl;
  server_name dashboard.convflow.ng;
  location / { proxy_pass http://localhost:4000; }
}
```

### PM2 ecosystem.config.js

```javascript
module.exports = {
  apps: [
    {
      name: 'convflow-engine',
      script: 'dist/server.js',
      cwd: '/srv/convflow',
      env: { NODE_ENV: 'production', PORT: 3000 },
    },
    {
      name: 'convflow-dashboard',
      script: 'node_modules/.bin/next',
      args: 'start -p 4000',
      cwd: '/srv/convflow/dashboard',
      env: { NODE_ENV: 'production' },
    },
  ],
};
```

### Session keepalive

OpenWA sessions can drop if the phone goes offline. Handle this:
1. Subscribe to `session.disconnected` webhook event → update tenants table → alert tenant via email
2. Dashboard shows "Disconnected" badge on bot card → tenant clicks "Reconnect" → new QR shown
3. ConvFlow cron (every 10 min): `GET /api/sessions/{sessionId}` on OpenWA → update status

---

## 23. Product Naming & Positioning

| Asset | Value |
|---|---|
| Product name | **ConvFlow** |
| Tagline | *Turn any WhatsApp number into a sales machine* |
| Domain | convflow.ng (or convflow.africa) |
| Built by | IVarse Technologies |
| Target market | Nigerian SMEs, service businesses, agencies |
| Pricing | SaaS subscription (Starter / Growth / Scale) in Naira |
| Competitive moat | Self-hosted WhatsApp (no Meta bans), ERPNext lead sync, no-code flow builder, scoring engine |

---

## 24. Build Sequence

### Phase 1 — Engine + OpenWA (Week 1)
- [ ] Deploy OpenWA via Docker
- [ ] Create first session, scan QR
- [ ] Run DB migrations (001 + 002)
- [ ] Drop IVarse Technologies config file, `npm run dev`
- [ ] Test end-to-end: "Hi" → full flow → lead saved + OG notified

### Phase 2 — Platform API (Week 2)
- [ ] Auth routes (register, login, JWT)
- [ ] Bot management routes (create, QR proxy, status)
- [ ] Flow CRUD routes + hot-reload
- [ ] Leads + analytics routes
- [ ] Auth middleware + tenant scope guard

### Phase 3 — ERPNext Integration (Week 3)
- [ ] `connectERPNext()` service: verify creds → configure frappe_whatsapp → create custom fields
- [ ] Connect/status/disconnect routes
- [ ] `pushLeadToERPNext()` in flow engine (fire-and-forget)
- [ ] OpenWA proxy endpoint for frappe_whatsapp outbound calls
- [ ] Test: qualify a lead → confirm Lead appears in ERPNext

### Phase 4 — Dashboard (Week 4–5)
- [ ] Auth pages (login, register)
- [ ] WhatsApp connect page (QR scanner, SWR polling)
- [ ] Flow builder (React Flow nodes → PUT /flows)
- [ ] Leads table (TanStack Table)
- [ ] Analytics page (Recharts)
- [ ] Settings page
- [ ] ERPNext integration page (connect form + status)

### Phase 5 — Polish & Launch (Week 6)
- [ ] Super-admin views
- [ ] Session health monitor + tenant alerts
- [ ] Plan limits enforcement
- [ ] Paystack subscription (if billing at launch)
- [ ] Onboarding flow (signup → QR → first flow → done)

---

## 25. ERPNext — Sales Order Creation (`create_order` terminal)

This function is called by the Terminal Runner when a `create_order` terminal fires.

```typescript
// src/integrations/erpnext/erpnext.service.ts (additions)

import { CreateOrderTerminal, AnswerMap } from '../../types';
import { prisma } from '../../store/prisma';

export async function createSalesOrderInERPNext(
  companySlug: string,
  phone: string,
  name: string | null,
  answers: AnswerMap,
  terminal: CreateOrderTerminal
): Promise<void> {
  // Prisma — type-safe, no raw SQL
  const conn = await prisma.erpnextConnection.findFirst({
    where: { companySlug, status: 'connected' },
  });
  if (!conn) {
    console.info(`[${companySlug}] ERPNext not connected — order not pushed`);
    return;
  }

  const authHeader = `token ${conn.apiKey}:${conn.apiSecret}`;

  // Resolve or create customer by phone
  const customerName = await resolveOrCreateCustomer(conn.erpnextUrl, authHeader, phone, name);

  // Build item line from answers
  const itemName = answers[terminal.itemAnswerKey] ?? 'Unknown Item';
  const qty      = parseFloat(answers[terminal.qtyAnswerKey] ?? '1') || 1;

  // Build extra fields from fieldMapping
  const extraFields: Record<string, string> = {};
  if (terminal.fieldMapping) {
    for (const [answerKey, erpnextField] of Object.entries(terminal.fieldMapping)) {
      const val = answers[`${answerKey}_label`] ?? answers[answerKey];
      if (val) extraFields[erpnextField] = val;
    }
  }

  const orderPayload = {
    doctype: 'Sales Order',
    customer: customerName,
    order_type: 'Sales',
    docstatus: 0,  // Draft — never submit automatically
    custom_whatsapp_phone: `+${phone}`,
    custom_convflow_slug: companySlug,
    items: [
      {
        item_name: itemName,
        item_code: itemName,
        qty,
        uom: 'Nos',
      },
    ],
    ...extraFields,
  };

  try {
    const res = await axios.post(
      `${conn.erpnextUrl}/api/resource/Sales Order`,
      orderPayload,
      { headers: { Authorization: authHeader, 'Content-Type': 'application/json' }, timeout: 15_000 }
    );

    await prisma.erpnextConnection.update({
      where: { companySlug },
      data:  { lastSyncAt: new Date() },
    });

    console.info(`[${companySlug}] Sales Order created: ${res.data.data.name}`);
  } catch (err: any) {
    console.error(`[${companySlug}] Sales Order creation failed:`, err.response?.data ?? err.message);
    await prisma.erpnextConnection.update({
      where: { companySlug },
      data:  { status: 'error', errorMessage: err.message },
    });
  }
}

async function resolveOrCreateCustomer(
  erpnextUrl: string,
  authHeader: string,
  phone: string,
  name: string | null
): Promise<string> {
  const normalizedPhone = `+${phone}`;

  // Try to find existing customer by phone
  try {
    const res = await axios.get(`${erpnextUrl}/api/resource/Customer`, {
      params: { filters: JSON.stringify([['mobile_no', '=', normalizedPhone]]), fields: '["name"]', limit: 1 },
      headers: { Authorization: authHeader },
      timeout: 10_000,
    });
    if (res.data.data?.length) return res.data.data[0].name;
  } catch { /* not found — create */ }

  // Create new customer
  const customerName = name ?? `WhatsApp ${normalizedPhone}`;
  await axios.post(`${erpnextUrl}/api/resource/Customer`, {
    customer_name: customerName,
    customer_type: 'Individual',
    customer_group: 'Individual',
    territory: 'Nigeria',
    mobile_no: normalizedPhone,
  }, {
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    timeout: 10_000,
  });

  return customerName;
}
```

**Important constraint for `create_order`:** The `item_name` / `item_code` sent in the order must already exist as an Item in ERPNext. If the tenant uses free text for item selection, they must ensure their ERPNext item names match what customers type, OR use a `select` stage with option values that match ERPNext item codes exactly.

**Draft only — never submit:** ConvFlow always creates Sales Orders with `docstatus: 0` (Draft). The tenant reviews and submits from ERPNext. This is intentional — the tenant must confirm the order, set pricing, and handle fulfilment in their own ERP workflow.


---

## 26. ERPNext Item Sync Service

### 26.1 When Items Are Synced

| Trigger | What happens |
|---|---|
| Tenant connects ERPNext (one-time setup) | Full item sync runs immediately |
| Every 30 minutes (cron) | Background re-sync for all connected tenants |
| Tenant clicks "Refresh Items" in dashboard | On-demand re-sync for their bot |
| Redis cache miss during `erpnext_item_select` stage | Falls back to DB backing store; re-queues Redis |

### 26.2 Item Sync Service (`src/integrations/erpnext/item-sync.service.ts`)

```typescript
// src/integrations/erpnext/item-sync.service.ts
import axios from 'axios';
import { prisma } from '../../store/prisma';
import { redis } from '../../store/redis';
import { ERPNextItem } from '../../types';

const ITEM_CACHE_TTL = 60 * 30; // 30 minutes

export async function syncItemsFromERPNext(companySlug: string): Promise<number> {
  // Prisma — type-safe, no raw SQL
  const conn = await prisma.erpnextConnection.findFirst({
    where: { companySlug, status: 'connected' },
  });
  if (!conn) throw new Error(`No active ERPNext connection for ${companySlug}`);

  const authHeader = `token ${conn.apiKey}:${conn.apiSecret}`;

  // Fetch all active, non-template sales items from ERPNext
  const res = await axios.get(`${conn.erpnextUrl}/api/resource/Item`, {
    params: {
      filters: JSON.stringify([
        ['disabled', '=', 0],
        ['is_sales_item', '=', 1],
      ]),
      fields: JSON.stringify([
        'item_code', 'item_name', 'item_group',
        'standard_rate', 'currency', 'description',
      ]),
      limit: 200,
      order_by: 'item_name asc',
    },
    headers: { Authorization: authHeader },
    timeout: 15_000,
  });

  const items: ERPNextItem[] = res.data.data ?? [];
  if (!items.length) return 0;

  // Upsert into DB backing store via Prisma
  for (const item of items) {
    await prisma.erpnextItemCache.upsert({
      where:  { companySlug_itemCode: { companySlug, itemCode: item.item_code } },
      update: {
        itemName:     item.item_name,
        itemGroup:    item.item_group ?? null,
        standardRate: item.standard_rate ?? 0,
        currency:     item.currency ?? 'NGN',
        description:  item.description ?? null,
        isActive:     true,
        syncedAt:     new Date(),
      },
      create: {
        companySlug,
        itemCode:     item.item_code,
        itemName:     item.item_name,
        itemGroup:    item.item_group ?? null,
        standardRate: item.standard_rate ?? 0,
        currency:     item.currency ?? 'NGN',
        description:  item.description ?? null,
      },
    });
  }

  // Mark items no longer in ERPNext as inactive
  const activeCodes = items.map(i => i.item_code);
  if (activeCodes.length) {
    await prisma.erpnextItemCache.updateMany({
      where: { companySlug, itemCode: { notIn: activeCodes } },
      data:  { isActive: false },
    });
  }

  // Rebuild Redis cache (all items + per-group caches)
  await rebuildRedisItemCache(companySlug, items);

  // Update last_sync_at
  await prisma.erpnextConnection.update({
    where: { companySlug },
    data:  { lastSyncAt: new Date() },
  });

  return items.length;
}

async function rebuildRedisItemCache(
  companySlug: string,
  items: ERPNextItem[]
): Promise<void> {
  // All items cache
  await redis.setex(`items:${companySlug}`, ITEM_CACHE_TTL, JSON.stringify(items));

  // Per-group caches
  const byGroup = items.reduce((acc, item) => {
    const g = item.item_group ?? 'Uncategorised';
    if (!acc[g]) acc[g] = [];
    acc[g].push(item);
    return acc;
  }, {} as Record<string, ERPNextItem[]>);

  for (const [group, groupItems] of Object.entries(byGroup)) {
    await redis.setex(
      `items:${companySlug}:${group}`,
      ITEM_CACHE_TTL,
      JSON.stringify(groupItems)
    );
  }
}

// Background cron: sync all connected tenants every 30 minutes
export async function syncAllTenants(): Promise<void> {
  const connections = await prisma.erpnextConnection.findMany({
    where: { status: 'connected' },
    select: { companySlug: true },
  });
  for (const { companySlug } of connections) {
    try {
      const count = await syncItemsFromERPNext(companySlug);
      console.info(`[ItemSync] ${companySlug}: ${count} items synced`);
    } catch (err: any) {
      console.error(`[ItemSync] ${companySlug} failed:`, err.message);
    }
  }
}
```

### 26.3 Wire sync into server startup and cron

```typescript
// In src/server.ts — add after seedTenants():

import { syncAllTenants } from './integrations/erpnext/item-sync.service';

// Sync items on startup
syncAllTenants().catch(console.error);

// Re-sync every 30 minutes
setInterval(() => syncAllTenants().catch(console.error), 30 * 60 * 1000);
```

### 26.4 On-demand sync route (Platform API)

```typescript
// POST /platform/bots/:slug/erpnext/sync-items
// Tenant clicks "Refresh product list" in dashboard

app.post('/platform/bots/:slug/erpnext/sync-items',
  { preHandler: [requireAuth, requireBotAccess] },
  async (req, reply) => {
    const { slug } = req.params as any;
    try {
      const count = await syncItemsFromERPNext(slug);
      reply.send({ synced: true, itemCount: count });
    } catch (err: any) {
      reply.status(400).send({ synced: false, error: err.message });
    }
  }
);

// GET /platform/bots/:slug/erpnext/items
// Dashboard preview: show tenant exactly what their customers will see

app.get('/platform/bots/:slug/erpnext/items',
  { preHandler: [requireAuth, requireBotAccess] },
  async (req, reply) => {
    const { slug }  = req.params as any;
    const { group } = req.query as any;

    // Prisma query — optional filter on itemGroup, no string interpolation
    const items = await prisma.erpnextItemCache.findMany({
      where: {
        companySlug: slug,
        isActive:    true,
        ...(group ? { itemGroup: group } : {}),
      },
      orderBy: { itemName: 'asc' },
      select: { itemCode: true, itemName: true, itemGroup: true, standardRate: true, currency: true },
    });
    reply.send({ items });
  }
);
```

---

## 27. Human Takeover — Resume API & Full Lifecycle

### 27.1 Resume Endpoint (Platform API)

The agent (tenant) triggers resume from the ConvFlow dashboard. This unfreezes the conversation and re-sends the last bot stage prompt to the customer.

```typescript
// POST /platform/bots/:slug/conversations/:phone/resume

app.post('/platform/bots/:slug/conversations/:phone/resume',
  { preHandler: [requireAuth, requireBotAccess] },
  async (req, reply) => {
    const { slug, phone } = req.params as any;
    const account         = (req as any).account;

    // Load state
    const state = await getState(phone, slug);
    if (!state) return reply.status(404).send({ error: 'No active conversation found' });
    if (state.mode !== 'human') return reply.status(400).send({ error: 'Conversation is not in human mode' });

    // Get company config via Prisma (injection-proof)
    const tenantLookup = await prisma.tenant.findUnique({ where: { slug } });
    const company      = tenantLookup ? getCompanyBySessionId(tenantLookup.openwaSessionId) : null;
    if (!company) return reply.status(503).send({ error: 'Bot session not active' });

    // Resume: flip mode back to bot
    state.mode = 'bot';
    delete state.humanTakeoverAt;
    delete state.lastOffFlowMessage;
    await setState(phone, slug, state);

    // Log resume via Prisma — type-safe updateMany (no raw SQL)
    await prisma.humanTakeover.updateMany({
      where: { companySlug: slug, phone, resumedAt: null },
      data:  { resumedAt: new Date(), resumedBy: account.email },
    });

    // Get company config via Prisma
    const tenantRow = await prisma.tenant.findUnique({ where: { slug } });
    const company   = tenantRow ? getCompanyBySessionId(tenantRow.openwaSessionId) : null;
    if (!company) return reply.status(503).send({ error: 'Bot session not active' });
  if (targetPhone) {
    const targetState = await getState(targetPhone, company.slug);
    if (targetState?.mode === 'human') {
      targetState.mode = 'bot';
      delete targetState.humanTakeoverAt;
      await setState(targetPhone, company.slug, targetState);
      const currentStage = company.flows[targetState.stage];
      if (currentStage) {
        const msg = `Our team is done — let's continue 😊\n\n` + interpolate(currentStage.message, targetState);
        await sendMessage(company, targetPhone, msg);
      }
      await sendMessage(company, company.ownerPhone, `✅ Resumed conversation with +${targetPhone}`);
    } else {
      await sendMessage(company, company.ownerPhone, `No active human takeover found for +${targetPhone}`);
    }
  }
  return; // Do not process further
}
```

### 27.3 Human Takeover — Full Lifecycle Diagram

```
Customer sends off-flow message: "when will it be delivered?"
         │
         ▼
processAnswer() returns false (message doesn't match current stage type)
         │
         ▼
triggerHumanTakeover() fires:
  1. state.mode = 'human'  → saved to Redis
  2. Bot sends to customer: "Hold on, getting someone for you 🙏"
  3. Agent alert sent to ownerPhone:
     "⚡ HUMAN TAKEOVER — That Ofada Girl
      Customer: Taofeek (+2348012345678)
      Their question: 'when will it be delivered?'
      Flow stage: confirm_order (stage 5)
      Answers so far:
      • item name: Ofada Rice
      • quantity: 2
      • delivery type: Delivery
      📲 Reply to them: wa.me/2348012345678
      When done: #resume 2348012345678"
  4. Logged to human_takeovers table
         │
         ▼
All subsequent customer messages → forwarded to agent WhatsApp
(Bot is completely silent — no prompts, no errors)
         │
         ▼
Agent handles customer directly on WhatsApp
(They can answer delivery questions, adjust the order, anything)
         │
         ▼
Agent types "#resume 2348012345678" on their WhatsApp
OR
Agent clicks "Resume Bot" button on ConvFlow dashboard
         │
         ▼
ConvFlow:
  1. state.mode = 'bot'  → saved to Redis
  2. human_takeovers.resumed_at = NOW()
  3. Re-sends current stage message to customer:
     "Our team has answered your question. Let's continue 😊
      Confirm your order: 2x Ofada Rice, Delivery → 12 Lekki Phase 1
      Reply YES to confirm or NO to start over."
         │
         ▼
Flow resumes exactly where it left off. Customer confirms. Order created.
```

### 27.4 Dashboard — Human Takeover UI

```
Leads / Conversations page:
  → Conversations in human mode show a red "🔴 Awaiting Agent" badge
  → Clicking opens the conversation thread (full history)
  → "Resume Bot" button visible for human-mode conversations only
  → Clicking Resume → POST /platform/bots/:slug/conversations/:phone/resume
  → Badge changes to "🟢 Bot Active"
```

---

## 28. Updated That Ofada Girl Config — Using `erpnext_item_select`

This replaces the hardcoded menu in section 8.3. The item list now comes live from ERPNext.

```typescript
// companies/that-ofada-girl.config.ts
import { CompanyConfig } from '../src/types';

const config: CompanyConfig = {
  slug: 'that-ofada-girl',
  name: 'That Ofada Girl',
  openwaSessionId: process.env.OFADA_OPENWA_SESSION_ID!,
  openwaApiKey:    process.env.OPENWA_API_KEY!,
  openwaBaseUrl:   process.env.OPENWA_BASE_URL!,
  ownerPhone:      process.env.OFADA_OWNER_PHONE!,
  websiteUrl:      'https://thatofadagirl.com',

  flows: [
    // Stage 0: Welcome + intent branch
    {
      stage: 0, id: 'welcome', type: 'branch', answerKey: 'intent',
      message: `Hey {name}! 🍛 Welcome to *That Ofada Girl* — Lagos' finest Ofada experience!\n\nWhat can we do for you today?\n\n1️⃣ Place an order\n2️⃣ Catering for an event\n3️⃣ View our menu\n4️⃣ Something else`,
      options: [
        { value: '1', label: 'Food Order' },
        { value: '2', label: 'Event Catering' },
        { value: '3', label: 'View Menu' },
        { value: '4', label: 'Other Enquiry' },
      ],
      branches: { '1': 1, '2': 1, '3': 7, '4': 8 },
      // food order + catering both go to stage 1 (item selection)
    },

    // Stage 1: DYNAMIC item selection from ERPNext
    {
      stage: 1, id: 'item_select', type: 'erpnext_item_select',
      message: `Here's what we have for you today 🍛\n\nPick a dish by entering its number:`,
      // No static options — built dynamically from ERPNext item cache
      erpnextItemSelect: {
        // itemGroup: 'Food',  // uncomment to filter by item group
        displayFormat: '{item_name} — ₦{standard_rate}',
        itemNameAnswerKey:  'item_name',
        itemCodeAnswerKey:  'item_code',
        itemPriceAnswerKey: 'item_price',
        noItemsMessage: `Sorry, our menu isn't available right now. We'll be right with you 🙏`,
      },
    },

    // Stage 2: Quantity
    {
      stage: 2, id: 'quantity', type: 'number', answerKey: 'quantity',
      message: `How many portions of *{answers.item_name}* would you like? _(enter a number)_`,
    },

    // Stage 3: Delivery type
    {
      stage: 3, id: 'delivery', type: 'select', answerKey: 'delivery_type',
      message: `Delivery or pickup?\n\n1️⃣ Delivery (Lagos)\n2️⃣ Pickup`,
      options: [
        { value: '1', label: 'Delivery' },
        { value: '2', label: 'Pickup'   },
      ],
    },

    // Stage 4: Address (conditional — only needed for delivery)
    // Simple approach: always ask, customer types "N/A" for pickup
    {
      stage: 4, id: 'address', type: 'free_text', answerKey: 'address',
      message: `What's your delivery address?\n_(Type your full address, or *N/A* if you're picking up)_`,
    },

    // Stage 5: Phone number (to contact for delivery)
    {
      stage: 5, id: 'contact_phone', type: 'free_text', answerKey: 'contact_phone',
      message: `What phone number should we call for delivery?\n_(Leave blank to use this WhatsApp number)_`,
    },

    // Stage 6: Confirm — show full order summary with price
    {
      stage: 6, id: 'confirm_order', type: 'confirm', answerKey: 'confirmed',
      message: `Here's your order summary 📋\n\n🍛 *{answers.item_name}* × {answers.quantity}\n💰 *Total:* ₦{answers.item_price} × {answers.quantity}\n🚚 *{answers.delivery_type_label}* → {answers.address}\n\nReply *YES* to confirm or *NO* to start over.`,
      options: [
        { value: 'yes', label: 'Confirmed' },
        { value: 'no',  label: 'Cancelled' },
      ],
    },

    // Stage 7: TERMINAL — create_order (food order + catering)
    {
      stage: 7, id: 'create_order', type: 'create_order',
      message: '',
      terminal: {
        type: 'create_order',
        successMessage: `Order placed! 🎉\n\nWe've received your order for *{answers.item_name} × {answers.quantity}*.\n\nOur team will confirm it within 15 minutes. Get ready for the best Ofada in Lagos! 🍛`,
        itemAnswerKey:   'item_name',
        itemCodeAnswerKey: 'item_code', // ERPNext item_code from erpnext_item_select
        qtyAnswerKey:    'quantity',
        customerNameKey: 'name',
        fieldMapping: {
          'address':             'shipping_address_name',
          'delivery_type_label': 'shipping_method',
          'contact_phone':       'contact_phone',
        },
      },
    },

    // Stage 8: TERMINAL — send_info (view menu branch)
    // Shows ERPNext items as a read-only list, then loops back to welcome
    {
      stage: 8, id: 'menu_info', type: 'send_info',
      message: '',
      terminal: {
        type: 'send_info',
        // This message is static — for a dynamic menu, use erpnext_item_select
        // with a notify_only terminal instead (tenant's preference)
        infoMessage: `Our full menu is updated regularly in our ERPNext system.\nTo see today's menu and place an order, say *Hi* to start 😊`,
        loopToStage: 0,
      },
    },

    // Stage 9: TERMINAL — notify_only (other enquiry branch)
    {
      stage: 9, id: 'other_enquiry', type: 'notify_only',
      message: '',
      terminal: {
        type: 'notify_only',
        successMessage: `Thanks for reaching out! Our team will be with you shortly 🙏`,
      },
    },
  ],

  messages: {
    unknown_input:    `Please pick one of the options above 😊`,
    stop:             `No wahala! Come back when hunger calls 🍛`,
    escalate_confirm: `Oya, someone will reach you now now 🙏`,
    human_takeover:   `Hold on, let me get someone to help you with that 🙏\n\nA team member will be with you shortly!`,
  },
};

export default config;
```

---

## 29. Flow Builder Dashboard — New Node Types

Add these to the React Flow node palette in the dashboard (section 21):

```
ERPNextItemSelectNode
  → type: erpnext_item_select
  → Config panel:
      • Item Group filter (dropdown, fetches groups from GET /platform/bots/:slug/erpnext/items)
      • Display format string (text field with token hints: {item_name}, {standard_rate})
      • Answer key names: item_name, item_code, item_price
      • No-items fallback message
      • Preview button: shows live numbered list from current cache

HumanTakeoverBadge (not a node — a conversation-list UI element)
  → Shows in Leads/Conversations sidebar
  → Red badge: "🔴 Awaiting Agent" for conversations with mode === 'human'
  → "Resume Bot" button → POST /platform/bots/:slug/conversations/:phone/resume
  → On resume: badge flips to "🟢 Bot Active", stage prompt re-sent to customer
```

---

## 30. Key Decisions — New Additions

| Decision | Rationale |
|---|---|
| ERPNext items cached in Redis + DB backing store | Mid-conversation API calls to ERPNext would add 500ms+ latency. Cache reads are <5ms. 30-min TTL is fresh enough for menu/price data. |
| Dynamic options stored in `state.answers` (temp keys) | Avoids a separate cache layer just for in-flight conversation options. Temp keys (`_dynamic_*`) are cleaned up immediately after the answer is processed. |
| Human takeover on ANY off-flow message | Repeating "please pick an option" is a bad UX. One mis-match → human takeover is more respectful of the customer's time. Tenant can resume bot once they've answered. |
| `#resume {phone}` keyword on agent's own WhatsApp | Agents can resume without opening the dashboard. Practical for mobile-first Nigerian SME owners. Dashboard resume also available for preference. |
| No AI in human takeover decision | AI would make this expensive. The rule is simple and binary: answer matches current stage type → bot continues. It doesn't → human takes over. No LLM needed. |
| Item sync happens on ERPNext connect + cron + on-demand | Ensures items are never stale mid-conversation. On-demand sync in dashboard gives tenant control without needing a server restart. |
| `itemCodeAnswerKey` for `erpnext_item_select` | When creating a Sales Order in ERPNext, `item_code` must match an existing ERPNext Item record exactly. By storing the `item_code` (not just the display name) from the selection, Sales Order creation is reliable. |
