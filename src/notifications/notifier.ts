import { CompanyConfig, ConvState } from '../types';
import { sendMessage } from '../channels/openwa.channel';

type NotifyReason = 'new_lead' | 'new_order' | 'notification' | 'booking_request' | 'escalation';

const REASON_EMOJI: Record<NotifyReason, string> = {
  new_lead:        '🔥',
  new_order:       '🛒',
  notification:    '📬',
  booking_request: '📅',
  escalation:      '⚡',
};

const REASON_TITLE: Record<NotifyReason, string> = {
  new_lead:        'NEW LEAD',
  new_order:       'NEW ORDER',
  notification:    'NEW ENQUIRY',
  booking_request: 'BOOKING REQUEST',
  escalation:      'ESCALATION — customer wants to speak to someone',
};

export async function notifyOwner(
  company: CompanyConfig,
  phone: string,
  state: ConvState,
  score: number,
  reason: NotifyReason
): Promise<void> {
  const emoji = REASON_EMOJI[reason];
  const title = REASON_TITLE[reason];

  const answerLines = Object.entries(state.answers)
    .filter(([k]) => !k.endsWith('_label') && !k.startsWith('_dynamic'))
    .map(([k, v]) => {
      const label = state.answers[`${k}_label`] ?? v;
      const key   = k.replace(/_/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
      return `• *${key}:* ${label}`;
    })
    .join('\n');

  const lines = [
    `${emoji} *${title} — ${company.name}*`,
    ``,
    `👤 *Name:* ${state.name ?? 'Unknown'}`,
    `📱 *Number:* +${phone}`,
    answerLines ? answerLines : '_(no answers collected)_',
    score > 0 ? `\n⭐ *Score:* ${score}` : '',
    ``,
    `📲 *Reply:* https://wa.me/${phone}`,
  ].filter(l => l !== undefined).join('\n');

  await sendMessage(company, company.ownerPhone, lines);
}
