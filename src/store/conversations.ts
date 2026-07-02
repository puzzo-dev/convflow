/**
 * src/store/conversations.ts
 *
 * Prisma-backed persistence helpers for:
 *   - saveLead()         → leads table
 *   - logConversation()  → conversations table (full history)
 *
 * All queries are fully parameterised via Prisma — no raw SQL.
 */
import { prisma } from './prisma';
import { AnswerMap } from '../types';

// ── Lead persistence ──────────────────────────────────────────────────────────

export async function saveLead(
  companySlug: string,
  phone: string,
  name: string | null,
  answers: AnswerMap,
  leadScore: number,
  classification: string
): Promise<string> {
  const lead = await prisma.lead.create({
    data: {
      companySlug,
      phone,
      name,
      answers: answers as object,
      leadScore,
      classification,
      source: 'whatsapp_bot',
      routedAt: new Date(),
    },
  });
  return lead.id;
}

// Order data is just answers at this level, ERPNext handles actual order logic
export async function saveOrder(
  companySlug: string,
  phone: string,
  name: string | null,
  answers: AnswerMap
): Promise<string> {
  const lead = await prisma.lead.create({
    data: {
      companySlug,
      phone,
      name,
      answers: answers as object,
      classification: 'order',
      source: 'whatsapp_bot',
      routedAt: new Date(),
    }
  });
  return lead.id;
}

export async function markLeadSyncFailed(leadId: string, errorMsg: string): Promise<void> {
  // Atomic JSON merge at the database level — no read-modify-write TOCTOU race.
  // Uses PostgreSQL's || operator on jsonb to add/update only these keys without
  // reading the current value first.
  await prisma.$executeRaw`
    UPDATE leads
    SET answers = answers || jsonb_build_object(
      '_sync_failed', true::boolean,
      '_sync_error',  ${errorMsg}::text
    )
    WHERE id = ${leadId}::uuid
  `;
}

// ── Conversation log ──────────────────────────────────────────────────────────

export async function logConversation(
  companySlug: string,
  phone: string,
  direction: 'inbound' | 'outbound',
  text: string,
  stageId?: string
): Promise<void> {
  try {
    await prisma.conversation.create({
      data: {
        companySlug,
        phone,
        direction,
        messageText: text,
        stageId: stageId ?? null,
      },
    });
  } catch (err: any) {
    // Never let a log failure crash the bot flow
    console.error(`[${companySlug}] logConversation failed:`, err.message);
  }
}
