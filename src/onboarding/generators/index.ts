/**
 * Generator pipeline orchestrator.
 * Called by the Onboarding Agent when the profile is ready.
 */

import type { BusinessProfile, GenerateRequest } from '../types';
import { generateN8nWorkflows } from './n8n';

export interface GenerateResult {
  profile: BusinessProfile;
  steps: Record<string, { status: 'ok' | 'skipped' | 'error'; detail?: string }>;
}

export async function runGenerators(
  profile: BusinessProfile,
  req: GenerateRequest
): Promise<GenerateResult> {
  const steps = req.steps ?? ['rag', 'flows', 'tools', 'n8n', 'agent'];
  const result: GenerateResult = {
    profile: { ...profile },
    steps: {},
  };

  // Ensure generated object exists
  result.profile.generated = result.profile.generated ?? {};

  for (const step of steps) {
    try {
      switch (step) {
        case 'rag': {
          // TODO: implement website crawl + embed
          result.steps.rag = { status: 'skipped', detail: 'RAG builder not yet implemented' };
          break;
        }
        case 'flows': {
          // TODO: emit deterministic FlowStage[] from intents
          result.steps.flows = { status: 'skipped', detail: 'Flow generator not yet implemented' };
          break;
        }
        case 'tools': {
          // TODO: build tool definitions (ERPNext + n8n-backed)
          result.steps.tools = { status: 'skipped', detail: 'Tool generator not yet implemented' };
          break;
        }
        case 'n8n': {
          const workflows = await generateN8nWorkflows(result.profile, req.tenantId);
          result.profile.generated.n8nWorkflows = [
            ...(result.profile.generated.n8nWorkflows ?? []),
            ...workflows,
          ];
          result.steps.n8n = {
            status: 'ok',
            detail: `Created ${workflows.length} workflow(s)`,
          };
          break;
        }
        case 'agent': {
          // TODO: produce system prompt from profile
          result.steps.agent = { status: 'skipped', detail: 'Agent instructions generator not yet implemented' };
          break;
        }
      }
    } catch (err: any) {
      result.steps[step] = { status: 'error', detail: err.message };
    }
  }

  result.profile.onboarding = {
    ...result.profile.onboarding,
    stage: 'testing',
    lastUpdatedAt: new Date().toISOString(),
  };

  return result;
}
