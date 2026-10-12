/**
 * Core types for the self-building Onboarding system.
 * Full schema lives in docs/ONBOARDING_AGENT.md — this file is the runtime version.
 */

export type OnboardingStage =
  | 'interview'
  | 'connecting_systems'
  | 'generating'
  | 'testing'
  | 'live';

export type DesiredAction =
  | 'answer_from_knowledge'
  | 'create_quotation'
  | 'create_order'
  | 'save_lead'
  | 'book_appointment'
  | 'escalate_to_human'
  | 'custom_n8n';

export interface BusinessIntent {
  id: string;
  description: string;
  examples: string[];
  desiredAction: DesiredAction;
  requiresHumanApproval?: boolean;
  approvalThreshold?: string;
}

export interface ChannelDesire {
  type: 'whatsapp' | 'instagram' | 'messenger' | 'x' | 'tiktok' | 'webchat';
  status: 'pending' | 'connected' | 'failed';
  externalId?: string;
}

export interface BusinessProfile {
  tenantId?: string;
  slug: string;
  name: string;
  vertical: string;
  description: string;
  toneOfVoice: 'friendly' | 'professional' | 'playful' | 'formal' | 'custom';
  customToneInstructions?: string;
  primaryLanguage: string;
  timezone: string;

  productsAndServices: Array<{
    name: string;
    description?: string;
    priceRange?: string;
    category?: string;
  }>;

  intents: BusinessIntent[];

  channels: ChannelDesire[];

  systems: {
    website?: {
      url: string;
      crawlStatus: 'pending' | 'crawling' | 'ready' | 'failed';
      lastCrawledAt?: string;
    };
    erpnext?: {
      siteUrl: string;
      status: 'pending' | 'connected' | 'failed';
      apiKeyConfigured: boolean;
    };
    odoo?: {
      url: string;
      status: 'pending' | 'connected' | 'failed';
    };
    email?: {
      fromAddress: string;
      status: 'pending' | 'connected' | 'failed';
    };
    n8n?: {
      baseUrl?: string;
      workspaceId?: string;
      status: 'pending' | 'ready';
    };
    [key: string]: any;
  };

  policies: {
    workingHours?: string;
    autoEscalateKeywords?: string[];
    maxAutonomousDiscountPercent?: number;
    requireApprovalAboveAmount?: number;
    humanHandoffMessage?: string;
    stopKeywords?: string[];
  };

  generated: {
    flows?: any[];
    agentInstructions?: string;
    tools?: Array<{
      id: string;
      name: string;
      description: string;
      parameters: Record<string, any>;
      implementation: 'erpnext' | 'n8n' | 'internal' | 'webhook';
      n8nWorkflowId?: string;
    }>;
    n8nWorkflows?: Array<{
      id: string;
      name: string;
      description: string;
      trigger: 'convflow_tool' | 'webhook' | 'schedule';
      status: 'draft' | 'active';
    }>;
    ragSources?: Array<{
      type: 'website' | 'pdf' | 'manual';
      source: string;
      status: 'pending' | 'indexed';
    }>;
  };

  onboarding: {
    stage: OnboardingStage;
    interviewCompletedAt?: string;
    lastUpdatedAt: string;
    notesForHuman?: string;
  };
}

export interface GenerateRequest {
  tenantId: string;
  steps?: Array<'rag' | 'flows' | 'tools' | 'n8n' | 'agent'>;
}
