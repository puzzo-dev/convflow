import { saveLead, saveOrder, logConversation, markLeadSyncFailed } from '../store/conversations';
import { scoreAnswers } from './scoring-engine';
import { pushLeadToERPNext, createSalesOrderInERPNext } from '../integrations/erpnext/erpnext.service';
import { notifyOwner } from '../notifications/notifier';
import { sendMessage } from '../channels/openwa.channel';
import { guardedFetch } from './webhook-util';
export async function runTerminal(stage, state, phone, company) {
    const t = stage.terminal;
    switch (t.type) {
        // ── save_lead ─────────────────────────────────────────────────────────────
        case 'save_lead': {
            const score = scoreAnswers(state.answers, company.scoring ?? []);
            const classification = classifyScore(score);
            const leadId = await saveLead(company.slug, phone, state.name, state.answers, score, classification);
            await notifyOwner(company, phone, state, score, 'new_lead');
            // fire-and-forget ERPNext push
            pushLeadToERPNext(company.slug, phone, state.name, state.answers, score, classification, t.fieldMapping)
                .catch(async (err) => {
                console.error(`[${company.slug}] ERPNext lead push failed:`, err.message);
                await markLeadSyncFailed(leadId, err.message).catch(() => { });
            });
            const msg = interpolate(t.successMessage, state);
            await sendMessage(company, phone, msg);
            await logConversation(company.slug, phone, 'outbound', msg);
            break;
        }
        // ── create_order ──────────────────────────────────────────────────────────
        case 'create_order': {
            await notifyOwner(company, phone, state, 0, 'new_order');
            const leadId = await saveOrder(company.slug, phone, state.name, state.answers);
            createSalesOrderInERPNext(company.slug, phone, state.name, state.answers, t)
                .catch(async (err) => {
                console.error(`[${company.slug}] ERPNext order create failed:`, err.message);
                await markLeadSyncFailed(leadId, err.message).catch(() => { });
            });
            const msg = interpolate(t.successMessage, state);
            await sendMessage(company, phone, msg);
            await logConversation(company.slug, phone, 'outbound', msg);
            break;
        }
        // ── notify_only ───────────────────────────────────────────────────────────
        case 'notify_only': {
            await notifyOwner(company, phone, state, 0, 'notification');
            const msg = interpolate(t.successMessage, state);
            await sendMessage(company, phone, msg);
            await logConversation(company.slug, phone, 'outbound', msg);
            break;
        }
        // ── send_info ─────────────────────────────────────────────────────────────
        case 'send_info': {
            const msg = interpolate(t.infoMessage, state);
            await sendMessage(company, phone, msg);
            await logConversation(company.slug, phone, 'outbound', msg);
            // loopToStage is handled in flow-engine.ts after this returns
            break;
        }
        // ── book_appointment ──────────────────────────────────────────────────────
        case 'book_appointment': {
            const base = interpolate(t.successMessage, state);
            const msg = t.bookingLink ? `${base}\n\n📅 ${t.bookingLink}` : base;
            await sendMessage(company, phone, msg);
            await logConversation(company.slug, phone, 'outbound', msg);
            await notifyOwner(company, phone, state, 0, 'booking_request');
            break;
        }
        // ── webhook ───────────────────────────────────────────────────────────────
        case 'webhook': {
            const webhookUrl = t.webhookUrl || t.url;
            try {
                if (!webhookUrl)
                    throw new Error('Webhook terminal missing URL');
                const response = await guardedFetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(t.headers ?? {}) },
                    body: JSON.stringify({
                        companySlug: company.slug,
                        phone,
                        name: state.name,
                        answers: state.answers,
                        completedAt: new Date().toISOString(),
                    }),
                });
                if (!response.ok)
                    throw new Error(`Webhook responded with status ${response.status}`);
            }
            catch (err) {
                console.error(`[${company.slug}] Webhook terminal failed:`, err.message);
            }
            const msg = interpolate(t.successMessage, state);
            await sendMessage(company, phone, msg);
            await logConversation(company.slug, phone, 'outbound', msg);
            break;
        }
        default: {
            const unknownType = t.type;
            console.error(`[${company.slug}] runTerminal: unknown terminal type "${unknownType}" — no message sent`);
            break;
        }
    }
}
function classifyScore(score) {
    if (score >= 8)
        return 'hot';
    if (score >= 5)
        return 'warm';
    if (score >= 2)
        return 'nurture';
    return 'cold';
}
export function interpolate(template, state) {
    if (!template)
        return '';
    let result = template.replace(/\{name\}/g, state.name ?? 'there');
    result = result.replace(/\{answers\.([^}]+)\}/g, (_, key) => {
        return state.answers[`${key}_label`] ?? state.answers[key] ?? '';
    });
    return result;
}
