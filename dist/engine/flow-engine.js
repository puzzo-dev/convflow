import { getState, setState, clearState, getItemsFromCache } from '../store/redis';
import { sendMessage, sendImage } from '../channels/openwa.channel';
import { runTerminal, interpolate } from './terminal-runner';
import { logConversation } from '../store/conversations';
import { notifyOwner } from '../notifications/notifier';
import { prisma } from '../store/prisma';
const ESCALATION_KEYWORDS = ['human', 'person', 'agent', 'speak to someone', 'real person'];
const STOP_KEYWORDS = ['stop', 'unsubscribe', 'opt out', 'cancel'];
const TERMINAL_TYPES = new Set([
    'save_lead', 'create_order', 'notify_only', 'send_info', 'book_appointment', 'webhook'
]);
export async function handleInbound(phone, rawText, profileName, company) {
    const text = rawText.trim();
    const lower = text.toLowerCase();
    await logConversation(company.slug, phone, 'inbound', text);
    // Load state first so we can respect human mode before applying keywords.
    let state = await getState(phone, company.slug);
    // Human-mode messages bypass all keyword checks — the agent is in control.
    if (state?.mode === 'human') {
        await forwardToHumanAgent(phone, text, state, company);
        return;
    }
    if (STOP_KEYWORDS.some(k => lower.includes(k))) {
        await clearState(phone, company.slug);
        await sendMessage(company, phone, company.messages.stop ?? DEFAULT_STOP);
        return;
    }
    if (ESCALATION_KEYWORDS.some(k => lower.includes(k))) {
        const activeState = state ?? freshState(company.slug, profileName);
        await notifyEscalation(company, phone, activeState);
        await sendMessage(company, phone, company.messages.escalate_confirm ?? DEFAULT_ESCALATE);
        return;
    }
    if (!state) {
        state = freshState(company.slug, profileName);
        await setState(phone, company.slug, state);
        await deliverStage(company.flows[0], state, phone, company);
        return;
    }
    if (!state.name && profileName)
        state.name = profileName;
    const currentStage = company.flows[state.stage];
    if (!currentStage) {
        state = freshState(company.slug, profileName);
        await setState(phone, company.slug, state);
        await deliverStage(company.flows[0], state, phone, company);
        return;
    }
    if (TERMINAL_TYPES.has(currentStage.type)) {
        // Clear state BEFORE running the terminal to prevent a second concurrent
        // message from racing in and executing the terminal a second time.
        await clearState(phone, company.slug);
        await runTerminal(currentStage, state, phone, company);
        return;
    }
    const accepted = processAnswer(text, currentStage, state);
    if (!accepted) {
        await triggerHumanTakeover(phone, text, state, company);
        return;
    }
    const nextStageIndex = resolveNextStage(currentStage, state);
    if (nextStageIndex >= company.flows.length) {
        console.error(`[${company.slug}] nextStageIndex out of bounds`);
        return;
    }
    const nextStage = company.flows[nextStageIndex];
    state.stage = nextStageIndex;
    await setState(phone, company.slug, state);
    await deliverStage(nextStage, state, phone, company);
}
const MAX_DELIVER_DEPTH = 20;
async function deliverStage(stage, state, phone, company, depth = 0) {
    if (depth >= MAX_DELIVER_DEPTH) {
        console.error(`[${company.slug}] deliverStage hit max recursion depth at stage ${stage.id} — possible loop in flow config`);
        return;
    }
    const text = interpolate(stage.message, state);
    if (text) {
        await sendMessage(company, phone, text);
        await logConversation(company.slug, phone, 'outbound', text);
    }
    if (stage.type === 'erpnext_item_select') {
        const cfg = stage.erpnextItemSelect;
        const items = await getItemsFromCache(company.slug, cfg.itemGroup);
        if (!items.length) {
            const fallback = cfg.noItemsMessage ?? `Sorry, no items available right now. Please try again later.`;
            await sendMessage(company, phone, fallback);
            await logConversation(company.slug, phone, 'outbound', fallback);
            await triggerHumanTakeover(phone, 'no_items_available', state, company);
            return;
        }
        const listLines = items.map((item, i) => {
            const line = cfg.displayFormat
                .replace('{item_name}', item.item_name)
                .replace('{standard_rate}', item.standard_rate.toLocaleString('en-NG'))
                .replace('{item_group}', item.item_group ?? '')
                .replace('{description}', item.description ?? '');
            return `${i + 1}️⃣ ${line}`;
        });
        const stageMsg = stage.message ? text + '\n\n' : '';
        const fullMsg = stageMsg + listLines.join('\n');
        await sendMessage(company, phone, fullMsg);
        await logConversation(company.slug, phone, 'outbound', fullMsg);
        const dynamicOptions = items.map((_, i) => ({
            value: String(i + 1),
            label: items[i].item_name,
        }));
        state.answers[`_dynamic_options_${stage.id}`] = JSON.stringify(dynamicOptions);
        state.answers[`_dynamic_items_${stage.id}`] = JSON.stringify(items);
        await setState(phone, company.slug, state);
        return;
    }
    // Branch stages are silent routing nodes — auto-resolve without waiting for new user input.
    if (stage.type === 'branch') {
        const nextIdx = resolveNextStage(stage, state);
        const nextStage = company.flows[nextIdx];
        if (nextStage) {
            state.stage = nextIdx;
            await setState(phone, company.slug, state);
            await deliverStage(nextStage, state, phone, company, depth + 1);
        }
        return;
    }
    if (stage.type === 'message') {
        const next = company.flows[stage.stage + 1];
        if (next) {
            state.stage = next.stage;
            await setState(phone, company.slug, state);
            await deliverStage(next, state, phone, company, depth + 1);
        }
        return;
    }
    if (stage.type === 'media') {
        if (stage.mediaUrl) {
            await sendImage(company, phone, stage.mediaUrl);
        }
        const next = company.flows[stage.stage + 1];
        if (next) {
            state.stage = next.stage;
            await setState(phone, company.slug, state);
            await deliverStage(next, state, phone, company, depth + 1);
        }
        return;
    }
    if (TERMINAL_TYPES.has(stage.type)) {
        await runTerminal(stage, state, phone, company);
        const t = stage.terminal ?? {};
        if (stage.type === 'send_info' && typeof t.loopToStage === 'number') {
            const loopStage = company.flows[t.loopToStage];
            if (loopStage) {
                state.stage = t.loopToStage;
                await setState(phone, company.slug, state);
                await deliverStage(loopStage, state, phone, company, depth + 1);
                return;
            }
        }
        await clearState(phone, company.slug);
        return;
    }
}
function processAnswer(text, stage, state) {
    const lower = text.toLowerCase().trim();
    if (stage.type === 'free_text') {
        if (stage.answerKey)
            state.answers[stage.answerKey] = text;
        return true;
    }
    if (stage.type === 'number') {
        if (!/^\d+(\.\d+)?$/.test(text.trim()))
            return false;
        if (stage.answerKey)
            state.answers[stage.answerKey] = text.trim();
        return true;
    }
    if (stage.type === 'confirm') {
        const yes = ['yes', 'y', '1', 'ok', 'confirm', 'proceed'].includes(lower);
        const no = ['no', 'n', '2', 'cancel', 'back'].includes(lower);
        if (!yes && !no)
            return false;
        if (stage.answerKey)
            state.answers[stage.answerKey] = yes ? 'yes' : 'no';
        if (no) {
            Object.assign(state, { stage: 0, answers: {} });
        }
        return true;
    }
    if (stage.type === 'select' || stage.type === 'branch') {
        const option = stage.options?.find((o) => o.value === lower || o.value === text.trim());
        if (!option)
            return false;
        if (stage.answerKey) {
            state.answers[stage.answerKey] = option.value;
            state.answers[`${stage.answerKey}_label`] = option.label;
        }
        return true;
    }
    if (stage.type === 'erpnext_item_select') {
        const dynamicOptions = JSON.parse(state.answers[`_dynamic_options_${stage.id}`] ?? '[]');
        const option = dynamicOptions.find(o => o.value === lower || o.value === text.trim());
        if (!option)
            return false;
        const cfg = stage.erpnextItemSelect;
        const items = JSON.parse(state.answers[`_dynamic_items_${stage.id}`] ?? '[]');
        const selectedItem = items[parseInt(option.value) - 1];
        if (!selectedItem)
            return false;
        state.answers[cfg.itemNameAnswerKey] = selectedItem.item_name;
        state.answers[cfg.itemCodeAnswerKey] = selectedItem.item_code;
        state.answers[cfg.itemPriceAnswerKey] = String(selectedItem.standard_rate);
        delete state.answers[`_dynamic_options_${stage.id}`];
        delete state.answers[`_dynamic_items_${stage.id}`];
        return true;
    }
    return false;
}
function resolveNextStage(stage, state) {
    if (stage.type === 'branch' && stage.branches) {
        const answer = state.answers[stage.answerKey];
        return stage.branches[answer] ?? stage.stage + 1;
    }
    if (stage.type === 'confirm') {
        const answer = state.answers[stage.answerKey];
        if (answer === 'no')
            return 0;
    }
    return stage.stage + 1;
}
function freshState(companySlug, name) {
    return { companySlug, stage: 0, answers: {}, name, source: 'direct', startedAt: Date.now(), mode: 'bot' };
}
async function notifyEscalation(company, phone, state) {
    await notifyOwner(company, phone, state, 0, 'escalation');
}
async function triggerHumanTakeover(phone, text, state, company) {
    state.mode = 'human';
    state.humanTakeoverAt = Date.now();
    state.lastOffFlowMessage = text;
    await setState(phone, company.slug, state);
    await prisma.humanTakeover.create({
        data: {
            companySlug: company.slug,
            phone,
            offFlowMessage: text,
            stageAtTakeover: state.stage,
        }
    });
    const msg = company.messages.human_takeover ?? `Hold on, let me get someone to help you with that 🙏`;
    await sendMessage(company, phone, msg);
    await logConversation(company.slug, phone, 'outbound', msg);
    await notifyEscalation(company, phone, state);
}
async function forwardToHumanAgent(phone, text, state, company) {
    // Simply forward the text to the owner as a WhatsApp notification
    const forwardMsg = `📩 *Message from +${phone}*\n\n${text}\n\n_Reply directly:_ https://wa.me/${phone}`;
    await sendMessage(company, company.ownerPhone, forwardMsg);
}
const DEFAULT_STOP = `No problem! We won't message you again. Come back anytime 👋`;
const DEFAULT_ESCALATE = `Understood. A team member will reach out to you directly 🙏`;
