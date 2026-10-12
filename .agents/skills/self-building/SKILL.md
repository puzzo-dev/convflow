# Self-Building System Skill

**Use this skill whenever working on the zero-tech onboarding experience, generators, Meta multi-tenant connections, or the Onboarding Agent.**

## Canonical Documents (read in this order)
1. `docs/ARCHITECTURE_PRINCIPLES.md` — **Deterministic flow = conversation spine, n8n = primary integrations/side-effects**
2. `docs/DESIGN_CHAT_EXPORT.md` — Full design conversation context
3. `docs/ONBOARDING_AGENT.md` — BusinessProfile + interview script + n8n rules
4. `docs/SELF_BUILDING_SYSTEM.md` — Master plan (APIs, generators, Meta, order)
5. `docs/META_APP.md` — Multi-tenant Meta App

## Key Code
- `src/onboarding/types.ts`
- `src/onboarding/generators/` (n8n generator is the integration path)

## Core Invariants
- Business owner never writes code, edits JSON, or opens n8n.
- Deterministic flow engine only manages conversation state and calls tools.
- Almost all side-effects and external integrations are executed by n8n workflows.
- ConvFlow owns one Meta App; tenants connect their own Pages/IG accounts through it.

## When to Update
Update the docs and this skill together whenever the hybrid architecture or self-building flow changes.
