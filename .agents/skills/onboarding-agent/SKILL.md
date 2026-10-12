# Onboarding Agent Skill

**Use this skill whenever you are implementing, extending, or debugging the self-building onboarding experience in ConvFlow.**

## Goal
A business owner chats with an AI assistant, describes their business in natural language, connects the systems they use (WhatsApp, Instagram, ERPNext, website, etc.), and ConvFlow automatically builds:
- Deterministic flows (compatible with the existing engine)
- LLM agent behavior + tools
- RAG from their website
- n8n workflows for any unique business logic

The owner never touches technical configuration.

## Canonical Documents
- Full schema + interview script + n8n auto-setup rules: `docs/ONBOARDING_AGENT.md`
- Existing engine & types: `src/types/index.ts`, `src/engine/flow-engine.ts`, `.agents/skills/convflow/SKILL.md`

## Key Responsibilities of the Onboarding Agent
1. Conduct the interview following the arc in `docs/ONBOARDING_AGENT.md`.
2. Maintain and continuously update a `BusinessProfile` object.
3. Pause to run guided connection flows (WhatsApp via OpenWA, Meta for IG/Messenger, ERPNext, website URL).
4. When the profile is rich enough, trigger the generator pipeline:
   - RAG Builder
   - Flow Generator (deterministic stages)
   - Tool Generator
   - n8n Workflow Generator (for custom logic)
   - Agent Instructions Generator
5. Offer a sandbox test, then go-live.

## n8n Rule (Critical)
The business owner must never configure n8n themselves.  
If any intent requires unique logic, the Builder creates and activates an n8n workflow via API, stores the workflow ID on the tool definition, and the runtime agent simply calls the tool.

## Output
At the end of a successful onboarding the system must have a complete `BusinessProfile` with `generated` artifacts that the hybrid runtime (deterministic engine + LLM agent + n8n) can execute on any connected channel.

## When to Update This Skill
Update this skill and `docs/ONBOARDING_AGENT.md` together whenever the interview arc, BusinessProfile schema, or n8n generation strategy changes.
