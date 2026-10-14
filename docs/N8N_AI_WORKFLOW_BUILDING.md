# n8n AI Workflow Building — Research Notes (Oct 2026)

## Summary

n8n now has strong AI-assisted workflow building. For ConvFlow this is useful, but **there is no simple public REST endpoint that is “send prompt → get workflowId”**. The practical options are:

| Mechanism | What it is | Programmatic from ConvFlow? | Notes |
|-----------|------------|-----------------------------|-------|
| **n8n Assistant** | In-app chat agent that builds/edits/tests workflows from natural language | No (UI-first) | Needs LLM API key + sandbox on self-hosted. Great for humans refining workflows. |
| **n8n MCP server** | Instance-level MCP tools: create/edit/run workflows from external AI clients | **Yes** | Best path for an external agent (ConvFlow Builder) to build workflows by describing them. |
| **n8n REST API** | Classic create/update workflow with full JSON | **Yes** | Fully automated; we (or our LLM) must produce valid node JSON. |
| **Older AI Workflow Builder / Ask n8n AI** | Previous features | Partially superseded | Assistant is the current product direction. |

---

## 1. n8n Assistant

- Chat-based agent **inside the n8n editor**.
- Can: create workflows, edit them, test, troubleshoot, help with credentials, build agents.
- Result is a normal n8n workflow on the canvas.
- **Self-hosted requirements:**
  - LLM API key: Anthropic, OpenAI, or OpenRouter
  - Sandbox (n8n-sandbox for dev, Daytona recommended for production)
  - Env vars e.g. `N8N_ENABLED_MODULES` (include `instance-ai`), `N8N_INSTANCE_AI_MODEL`, `N8N_INSTANCE_AI_MODEL_API_KEY`, sandbox settings
- **Not designed as a remote API** for another product to call with a prompt and receive a workflow ID.
- Best use in ConvFlow: optional human/admin refinement path (“open this workflow in n8n and ask the Assistant to improve X”).

Docs: https://docs.n8n.io/build/ways-of-building-workflows/n8n-assistant  
Setup: https://docs.n8n.io/deploy/host-n8n/configure-n8n/set-up-n8n-assistant

---

## 2. n8n MCP Server (preferred AI path for ConvFlow)

- Built-in MCP server on the n8n instance.
- External MCP clients (Claude Desktop, Claude Code, Cursor, **or a custom agent inside ConvFlow**) can:
  - Create new workflows from a description
  - Edit existing workflows
  - Validate, run test executions, manage data tables
- Available on Cloud, Enterprise, and self-hosted Community.
- This is the right integration surface if we want “natural language → real n8n workflow” **without** hand-writing node JSON.

Docs: https://docs.n8n.io/build/ways-of-building-workflows/connect-to-n8n-mcp-server  
Blog: https://blog.n8n.io/n8n-mcp-server/

---

## 3. Classic n8n REST API (still required)

- `POST /api/v1/workflows` with full workflow JSON remains the most reliable fully-automated path.
- ConvFlow already planned this in `src/onboarding/generators/n8n.ts`.
- Use for:
  - Standard webhook → logic → callback templates we control 100%
  - Guaranteed structure for the ConvFlow runtime contract

---

## 4. Recommended strategy for ConvFlow (locked)

**Principle stays the same:** deterministic flow = conversation spine; n8n = side-effects & integrations.

**How workflows get created:**

1. **Default automated path (production onboarding)**  
   - Onboarding/Builder agent produces a precise **natural-language brief** + required I/O contract (webhook payload in, callback actions out).  
   - Generator creates a **standard skeleton** via REST API (Webhook trigger → placeholder/logic → HTTP callback to ConvFlow).  
   - Optionally enrich the skeleton by calling **n8n MCP** (if enabled) with the same brief so n8n’s tooling fills real integration nodes.  
   - Store `workflowId` on the tool; activate when sandbox tests pass.

2. **Human refinement path**  
   - Admin or power user opens the workflow in n8n and uses **n8n Assistant** (with our platform LLM key configured on the instance) to improve unique logic.

3. **Never** require the business owner to open n8n or paste JSON.

**Why not “only call n8n Assistant via API”?**  
There is no documented stable public API that replaces the in-app Assistant chat. MCP + REST are the programmable surfaces.

---

## 5. Implications for our generator code

- Keep `src/onboarding/generators/n8n.ts` as the **contract owner** (webhook path, callback URL, tenant/intent naming).
- Add a second step (optional feature flag): `enrichViaMcp(brief)` when instance MCP is available.
- Document required env for self-hosted n8n if we want Assistant available for admins:
  - Model key + sandbox
- Runtime path unchanged: ConvFlow tool → n8n webhook → n8n workflow → callback to `/api/internal/n8n-callback`.

---

*Research date: 2026-10-15. Update this file if n8n ships a first-class “prompt-to-workflow” HTTP API.*
