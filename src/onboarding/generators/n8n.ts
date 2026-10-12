/**
 * n8n Workflow Generator
 *
 * Creates and activates n8n workflows for any intent that needs unique business logic.
 * The business owner never sees or configures n8n.
 *
 * Requires:
 *   N8N_BASE_URL
 *   N8N_API_KEY
 */

import axios from 'axios';
import type { BusinessProfile, BusinessIntent } from '../types';

const N8N_BASE = process.env.N8N_BASE_URL;
const N8N_KEY  = process.env.N8N_API_KEY;

interface CreatedWorkflow {
  id: string;
  name: string;
  description: string;
  trigger: 'convflow_tool';
  status: 'active';
}

/**
 * Standard webhook → logic → callback template.
 * The generator fills the placeholders.
 */
function buildWorkflowNodes(intent: BusinessIntent, tenantId: string, callbackUrl: string) {
  return [
    {
      parameters: {
        httpMethod: 'POST',
        path: `convflow-${tenantId}-${intent.id}`,
        responseMode: 'onReceived',
        options: {},
      },
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 1,
      position: [250, 300],
      webhookId: `cf-${tenantId}-${intent.id}`,
    },
    // Placeholder for future approval / IF / HTTP / Code nodes.
    // For v1 we keep it minimal: receive → optional code → callback.
    {
      parameters: {
        functionCode: `// Unique logic for intent: ${intent.description}\n// Full payload is in items[0].json\nreturn items;`,
      },
      name: 'Business Logic',
      type: 'n8n-nodes-base.function',
      typeVersion: 1,
      position: [500, 300],
    },
    {
      parameters: {
        url: callbackUrl,
        method: 'POST',
        jsonParameters: true,
        options: {},
        bodyParametersJson: `={{ JSON.stringify({ tenantId: '${tenantId}', intentId: '${intent.id}', payload: $json }) }}`,
      },
      name: 'Callback to ConvFlow',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 1,
      position: [750, 300],
    },
  ];
}

export async function generateN8nWorkflows(
  profile: BusinessProfile,
  tenantId: string
): Promise<CreatedWorkflow[]> {
  if (!N8N_BASE || !N8N_KEY) {
    console.warn('[n8n generator] N8N_BASE_URL or N8N_API_KEY not set — skipping');
    return [];
  }

  const customIntents = profile.intents.filter(
    (i) => i.desiredAction === 'custom_n8n' || i.requiresHumanApproval
  );

  if (customIntents.length === 0) return [];

  const callbackUrl = `${process.env.CONVFLOW_PUBLIC_URL}/api/internal/n8n-callback`;
  const created: CreatedWorkflow[] = [];

  for (const intent of customIntents) {
    const name = `${profile.slug} – ${intent.id}`;
    const nodes = buildWorkflowNodes(intent, tenantId, callbackUrl);

    try {
      const { data } = await axios.post(
        `${N8N_BASE}/api/v1/workflows`,
        {
          name,
          nodes,
          connections: {
            Webhook: { main: [[{ node: 'Business Logic', type: 'main', index: 0 }]] },
            'Business Logic': { main: [[{ node: 'Callback to ConvFlow', type: 'main', index: 0 }]] },
          },
          settings: { executionOrder: 'v1' },
          active: true,
        },
        {
          headers: {
            'X-N8N-API-KEY': N8N_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      created.push({
        id: data.id,
        name,
        description: intent.description,
        trigger: 'convflow_tool',
        status: 'active',
      });

      console.log(`[n8n generator] Created workflow ${data.id} for intent ${intent.id}`);
    } catch (err: any) {
      console.error(`[n8n generator] Failed for intent ${intent.id}:`, err.response?.data || err.message);
    }
  }

  return created;
}
