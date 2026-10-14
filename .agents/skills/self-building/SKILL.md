# Self-Building System Skill

**Use this skill whenever working on zero-tech onboarding, generators, Meta connections, or the Onboarding Agent.**

## Read in this order
1. `docs/ARCHITECTURE_PRINCIPLES.md` — flow = spine, n8n = integrations; how n8n AI fits
2. `docs/N8N_AI_WORKFLOW_BUILDING.md` — research: Assistant (UI) vs MCP (programmatic) vs REST
3. `docs/DESIGN_CHAT_EXPORT.md` — full design chat context
4. `docs/ONBOARDING_AGENT.md` — BusinessProfile + interview + n8n rules
5. `docs/SELF_BUILDING_SYSTEM.md` — master plan
6. `docs/META_APP.md` — multi-tenant Meta App

## Core invariants
- Business owner never writes code, edits JSON, or opens n8n.
- Deterministic flow only manages conversation state and calls tools.
- Almost all side-effects run in n8n workflows.
- Workflow creation: REST skeleton for contract + optional MCP enrichment from a natural-language brief; n8n Assistant for human/admin refinement only.
- ConvFlow owns one Meta App; tenants connect their own Pages/IG through it.

## Code
- `src/onboarding/types.ts`
- `src/onboarding/generators/` (especially `n8n.ts`)
