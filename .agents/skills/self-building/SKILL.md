# Self-Building System Skill

**Use this skill whenever working on the zero-tech onboarding experience, generators, Meta multi-tenant connections, or the Onboarding Agent.**

## Canonical Documents
- `docs/ONBOARDING_AGENT.md` — BusinessProfile schema + interview script + n8n rules
- `docs/SELF_BUILDING_SYSTEM.md` — master architecture (APIs, generators, Meta app, implementation order)
- `docs/META_APP.md` — multi-tenant Meta App design

## Key Code
- `src/onboarding/types.ts` — runtime BusinessProfile types
- `src/onboarding/generators/` — n8n generator (implemented), others scaffolded

## Core Invariant
The business owner must never write code, edit JSON, or open n8n.  
Everything is produced by the Onboarding Agent + Generators from a natural-language conversation + guided OAuth connections.

## Meta App
ConvFlow owns one Meta App. Tenants connect their own Pages / Instagram accounts through it. Tokens are stored in `ChannelConnection` and webhooks are routed by `page_id`.
