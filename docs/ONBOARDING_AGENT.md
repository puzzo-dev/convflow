# ConvFlow Onboarding Agent
## Self-Building Business Setup System

**Version:** 1.0  
**Purpose:** Enable zero-technical-knowledge onboarding. A business owner chats with the Onboarding Agent, describes their business, connects systems via guided logins, and the system automatically generates flows, tools, RAG, agent behavior, and n8n workflows.

This document is the authoritative source for the Onboarding Agent and any Builder Agent that consumes its output.

---

## 1. BusinessProfile Schema (Canonical)

This is the single source of truth produced by the Onboarding Agent. Everything downstream (flow generator, tool registry, RAG builder, n8n generator, runtime agent) reads from it.

```typescript
interface BusinessProfile {
  // ── Identity ───────────────────────────────────────────────────────────────
  tenantId?: string;                    // filled after tenant is created
  slug: string;                         // url-safe, unique
  name: string;
  vertical: string;                     // e.g. "restaurant", "professional_services", "ecommerce", "saas", "retail"
  description: string;                  // 1-3 sentence summary from owner
  toneOfVoice: "friendly" | "professional" | "playful" | "formal" | "custom";
  customToneInstructions?: string;
  primaryLanguage: string;              // "en", "en-NG", etc.
  timezone: string;

  // ── Offerings ──────────────────────────────────────────────────────────────
  productsAndServices: Array<{
    name: string;
    description?: string;
    priceRange?: string;
    category?: string;
  }>;

  // ── Customer Intents (what people actually ask for) ────────────────────────
  intents: Array<{
    id: string;                         // e.g. "request_quote", "place_order", "ask_pricing", "book_appointment"
    description: string;                // natural language
    examples: string[];                 // example user messages
    desiredAction: 
      | "answer_from_knowledge"
      | "create_quotation"
      | "create_order"
      | "save_lead"
      | "book_appointment"
      | "escalate_to_human"
      | "custom_n8n";
    requiresHumanApproval?: boolean;    // e.g. discounts, high-value quotes
    approvalThreshold?: string;         // e.g. "discount > 10%" or "quote > 500000"
  }>;

  // ── Channels ───────────────────────────────────────────────────────────────
  channels: Array<{
    type: "whatsapp" | "instagram" | "messenger" | "x" | "tiktok" | "webchat";
    status: "pending" | "connected" | "failed";
    externalId?: string;                // session id, page id, etc.
  }>;

  // ── Connected Systems ──────────────────────────────────────────────────────
  systems: {
    website?: {
      url: string;
      crawlStatus: "pending" | "crawling" | "ready" | "failed";
      lastCrawledAt?: string;
    };
    erpnext?: {
      siteUrl: string;
      status: "pending" | "connected" | "failed";
      apiKeyConfigured: boolean;
    };
    odoo?: {
      url: string;
      status: "pending" | "connected" | "failed";
    };
    email?: {
      fromAddress: string;
      status: "pending" | "connected" | "failed";
    };
    n8n?: {
      baseUrl?: string;                 // if self-hosted by tenant
      workspaceId?: string;
      status: "pending" | "ready";
    };
    // extensible
    [key: string]: any;
  };

  // ── Policies & Guardrails ──────────────────────────────────────────────────
  policies: {
    workingHours?: string;
    autoEscalateKeywords?: string[];
    maxAutonomousDiscountPercent?: number;
    requireApprovalAboveAmount?: number;
    humanHandoffMessage?: string;
    stopKeywords?: string[];
  };

  // ── Generated Runtime Artifacts (filled by generators) ─────────────────────
  generated: {
    flows?: any[];                      // deterministic FlowStage[] compatible with current engine
    agentInstructions?: string;         // system prompt for the runtime LLM agent
    tools?: Array<{                     // tool definitions the agent can call
      id: string;
      name: string;
      description: string;
      parameters: Record<string, any>;
      implementation: "erpnext" | "n8n" | "internal" | "webhook";
      n8nWorkflowId?: string;
    }>;
    n8nWorkflows?: Array<{
      id: string;
      name: string;
      description: string;
      trigger: "convflow_tool" | "webhook" | "schedule";
      status: "draft" | "active";
    }>;
    ragSources?: Array<{
      type: "website" | "pdf" | "manual";
      source: string;
      status: "pending" | "indexed";
    }>;
  };

  // ── Onboarding Meta ────────────────────────────────────────────────────────
  onboarding: {
    stage: "interview" | "connecting_systems" | "generating" | "testing" | "live";
    interviewCompletedAt?: string;
    lastUpdatedAt: string;
    notesForHuman?: string;             // anything the agent wants to flag
  };
}
```

---

## 2. Interview Script (Onboarding Agent Behavior)

The Onboarding Agent is a specialized LLM agent. It must follow this conversational arc while continuously updating the `BusinessProfile`.

### Personality
- Friendly, concise, professional consultant.
- Never ask more than one major question at a time.
- Confirm understanding frequently.
- Use the owner’s own words when summarizing.

### Conversation Arc (must cover these in order, but can adapt)

**Phase 1 – Business Understanding**
1. Greeting + purpose: “I’ll help you set up an AI assistant that can talk to your customers on WhatsApp, Instagram, etc. and actually do things (quotes, orders, answers). Just answer a few questions.”
2. “What does your business do? Give me a short description.”
3. “What are the main products or services you sell?”
4. “In what language and tone should the assistant speak to customers?” (offer examples)

**Phase 2 – Customer Intents**
5. “What are the top 3–5 things customers usually message you about or ask for?”
6. For each intent, clarify the desired outcome:
   - Just answer from knowledge?
   - Create a quotation / order / lead?
   - Book something?
   - Always hand over to a human?
7. “Are there any situations where the assistant must ask you before acting? (e.g. discounts, large orders)”

**Phase 3 – Channels**
8. “Which channels do you want this on right now?” (WhatsApp, Instagram, Messenger, others)
9. Guide connection for each selected channel (see Connection section).

**Phase 4 – Systems**
10. “Do you have a website? Paste the URL and I’ll learn from it.”
11. “Do you use ERPNext, Odoo, or another system for orders/quotes/inventory?”
12. If ERPNext → guided connection (site URL + API key or token instructions).
13. “Do you need any special custom logic that is unique to how your business operates?” (this triggers n8n workflow generation later).

**Phase 5 – Policies**
14. Working hours, escalation rules, stop keywords, approval thresholds.

**Phase 6 – Generation & Test**
15. “I have enough to build the first version. I’ll now:
    - Learn from your website
    - Create the assistant behavior
    - Set up the necessary workflows (including any custom n8n flows)
    - Connect the systems you chose
    Ready?”
16. After generation → offer sandbox test chat.
17. “Looks good? We can go live, or you can tell me what to change.”

### Rules for the Onboarding Agent
- Always keep the `BusinessProfile` object up to date after every meaningful answer.
- When a system needs connecting, pause the interview and run the guided connection flow.
- Never ask the owner to write JSON, code, or configure n8n manually.
- If the owner describes unique business logic, capture it under `intents[].desiredAction = "custom_n8n"` and store the natural language description. The generator will turn it into an n8n workflow.
- At the end of the interview, emit a complete `BusinessProfile` that the Builder can consume.

---

## 3. How the Onboarding / Builder Agent Sets Up n8n Flows

The business owner must **never** touch n8n. The system does it.

### Strategy

1. ConvFlow maintains a **platform-level n8n** (or a multi-tenant n8n with workspace isolation).
2. For each tenant that needs custom logic, the Builder:
   - Creates (or reuses) a dedicated n8n workflow via n8n’s API.
   - Names it clearly: `{tenantSlug} – {intentName}`.
   - Uses a standard template that:
     - Receives a webhook from ConvFlow with full conversation context + answers.
     - Performs the unique business steps (approvals, calculations, multi-system calls, etc.).
     - Calls back into ConvFlow (send message, update state, create ERP document, escalate, etc.).
3. The generated tool in `BusinessProfile.generated.tools` points to that n8n workflow ID.
4. At runtime the LLM Agent or deterministic flow simply calls the tool; n8n executes the unique logic.

### Standard n8n Workflow Template (what the Builder should generate)

```
Trigger: Webhook (POST) from ConvFlow
  Payload: {
    tenantId, conversationId, channel, userId,
    intent, answers, fullHistory, businessProfileSnapshot
  }

→ Optional: IF node for approval rules
→ HTTP Request nodes to ERPNext / other systems
→ Code node for any calculations
→ Callback to ConvFlow:
    - POST /api/internal/n8n-callback
      { conversationId, action: "send_message" | "update_state" | "escalate" | "create_document", ... }
→ Respond to webhook (success)
```

### Builder Responsibilities Regarding n8n

- If `intent.desiredAction === "custom_n8n"` or complex approval logic exists → create workflow.
- Store `n8nWorkflowId` inside the corresponding tool definition.
- Activate the workflow.
- Test the webhook path in sandbox mode before marking the tenant live.
- If the owner later says “change how discounts work”, the Onboarding Agent updates the profile and the Builder patches the existing n8n workflow (or recreates it).

---

## 4. Generator Pipeline (what runs after interview)

Once `onboarding.stage` moves to `"generating"`:

1. **RAG Builder**  
   Crawl `systems.website.url` → chunk → embed → store in tenant vector collection.

2. **Flow Generator**  
   For high-confidence structured intents (order, lead, simple FAQ) → emit deterministic `FlowStage[]` compatible with the existing engine.

3. **Tool Generator**  
   Create tool definitions for ERPNext actions, quotation, order, escalate, and any n8n-backed tools.

4. **n8n Workflow Generator**  
   For every `custom_n8n` intent or complex policy → create + activate workflow via n8n API.

5. **Agent Instructions Generator**  
   Produce the system prompt + guardrails for the runtime LLM agent.

6. **Sandbox**  
   Spin up a test conversation so the owner can try it immediately.

7. Mark `onboarding.stage = "testing"` then, on owner approval, `"live"`.

---

## 5. Connection Guides the Agent Must Know

The Onboarding Agent should be able to walk the owner through:

- **WhatsApp (OpenWA)**: Generate QR / session link, confirm connection.
- **Instagram + Messenger**: Meta Business Login / OAuth, select pages.
- **ERPNext**: Ask for site URL → instruct how to create API key / use token → test connection.
- **Website**: Just collect URL; system crawls automatically.
- **Email**: Simple SMTP or provider OAuth if needed.

All credentials are stored encrypted via the existing credentials plugin system.

---

## 6. Success Criteria for the Onboarding Agent

- Owner never writes code, JSON, or opens n8n.
- After 8–15 minutes of chat + a few connection clicks, a working multi-channel assistant exists.
- Unique business logic is captured as n8n workflows automatically.
- Owner can continue chatting with the same agent later to evolve the system (“add order status checking”, “change the discount rule”, etc.).

---

*This document is the source of truth. Any Builder Agent or Onboarding Agent implementation must follow it.*
