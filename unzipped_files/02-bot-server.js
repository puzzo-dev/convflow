/**
 * IVarse Technologies — WhatsApp Sales Bot
 * Backend: Node.js + Express
 * 
 * Dependencies:
 *   npm install express axios redis ioredis pg dotenv
 * 
 * Environment variables (.env):
 *   WHATSAPP_TOKEN=         # Meta Cloud API access token
 *   WHATSAPP_PHONE_ID=      # WhatsApp Business phone number ID
 *   WEBHOOK_VERIFY_TOKEN=   # Your chosen verification string
 *   OG_PHONE=               # OG's WhatsApp number (e.g. 2348XXXXXXXXX)
 *   REDIS_URL=redis://localhost:6379
 *   DATABASE_URL=postgresql://user:pass@localhost:5432/ivarse_leads
 *   CALENDLY_LINK=          # Your Calendly booking link
 *   CAPABILITY_DECK_URL=    # Public link to capability deck PDF
 *   PORT=3000
 */

import express from 'express';
import axios from 'axios';
import { createClient } from 'redis';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// ─── Redis Client ─────────────────────────────────────────────────────────────
const redis = createClient({ url: process.env.REDIS_URL });
redis.connect().catch(console.error);

// ─── PostgreSQL Client ────────────────────────────────────────────────────────
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// ─── DB Initialisation ────────────────────────────────────────────────────────
async function initDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone VARCHAR(20) NOT NULL,
      name VARCHAR(100),
      service_interest VARCHAR(100),
      service_detail TEXT,
      org_type VARCHAR(50),
      timeline VARCHAR(50),
      budget_range VARCHAR(50),
      free_text TEXT,
      lead_score INTEGER DEFAULT 0,
      classification VARCHAR(20),
      source VARCHAR(50),
      routed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('✅ DB initialised');
}

// ─── Conversation State ───────────────────────────────────────────────────────
const TTL = 60 * 60 * 24; // 24 hours

async function getState(phone) {
  const raw = await redis.get(`conv:${phone}`);
  return raw ? JSON.parse(raw) : null;
}

async function setState(phone, state) {
  await redis.setEx(`conv:${phone}`, TTL, JSON.stringify(state));
}

async function clearState(phone) {
  await redis.del(`conv:${phone}`);
}

function freshState() {
  return {
    stage: 0,
    branch: null,
    name: null,
    answers: {},
    score: 0,
    source: 'direct',
  };
}

// ─── WhatsApp Messaging ───────────────────────────────────────────────────────
async function sendMessage(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err) {
    console.error('Send error:', err.response?.data || err.message);
  }
}

// ─── Lead Scoring ─────────────────────────────────────────────────────────────
function calculateScore(answers) {
  let score = 0;

  // Service complexity signal
  if (['2', '4'].includes(answers.service)) score += 1; // AI or SaaS = complex

  // Org type
  if (answers.org_type === '2') score += 2; // Established SME
  if (answers.org_type === '3') score += 2; // Enterprise
  if (answers.org_type === '1') score += 1; // Startup
  if (answers.org_type === '4') score -= 1; // Individual

  // Timeline
  if (answers.timeline === '1') score += 3; // Immediate
  if (answers.timeline === '2') score += 2; // 1-3 months
  if (answers.timeline === '3') score += 1; // 3-6 months

  // Budget
  if (answers.budget === '4') score += 2; // ₦10M+
  if (answers.budget === '3') score += 2; // ₦2M–₦10M
  if (answers.budget === '2') score += 1; // ₦500k–₦2M

  // Has articulated their need via free text
  if (answers.free_text && answers.free_text.length > 30) score += 2;

  return score;
}

function classify(score) {
  if (score >= 8) return 'hot';
  if (score >= 5) return 'warm';
  if (score >= 2) return 'nurture';
  return 'cold';
}

// ─── Lead Persistence ─────────────────────────────────────────────────────────
const SERVICE_LABELS = {
  '1': 'Custom Software Development',
  '2': 'AI Integration & Automation',
  '3': 'ERP Implementation',
  '4': 'SaaS Product Development',
  '5': 'Infrastructure & DevOps',
  '6': 'General Inquiry / Consulting',
};

const ORG_LABELS = {
  '1': 'Startup',
  '2': 'Established SME',
  '3': 'Enterprise',
  '4': 'Individual / Freelancer',
  '5': 'Government / NGO',
};

const TIMELINE_LABELS = {
  '1': 'Immediately (has deadline)',
  '2': '1–3 months',
  '3': '3–6 months',
  '4': 'Just exploring',
};

const BUDGET_LABELS = {
  '1': 'Under ₦500k',
  '2': '₦500k – ₦2M',
  '3': '₦2M – ₦10M',
  '4': 'Above ₦10M / open budget',
  '5': 'Not sure yet',
};

async function saveLead(phone, state, score, classification) {
  const { answers, name, source } = state;
  await db.query(
    `INSERT INTO leads 
      (phone, name, service_interest, service_detail, org_type, timeline, budget_range, free_text, lead_score, classification, source, routed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
    [
      phone,
      name,
      SERVICE_LABELS[answers.service] || answers.service,
      answers.service_detail || null,
      ORG_LABELS[answers.org_type] || answers.org_type,
      TIMELINE_LABELS[answers.timeline] || answers.timeline,
      BUDGET_LABELS[answers.budget] || answers.budget,
      answers.free_text || null,
      score,
      classification,
      source,
    ]
  );
}

// ─── OG Hot Lead Alert ────────────────────────────────────────────────────────
async function alertOG(phone, state, score) {
  const { answers, name } = state;
  const msg = [
    `🔥 *HOT LEAD ALERT — IVarse Technologies*`,
    ``,
    `👤 *Name:* ${name || 'Unknown'}`,
    `📱 *Number:* +${phone}`,
    `🛠 *Service:* ${SERVICE_LABELS[answers.service] || 'Unknown'}`,
    `🏢 *Org Type:* ${ORG_LABELS[answers.org_type] || 'Unknown'}`,
    `⏰ *Timeline:* ${TIMELINE_LABELS[answers.timeline] || 'Unknown'}`,
    `💰 *Budget:* ${BUDGET_LABELS[answers.budget] || 'Unknown'}`,
    answers.free_text ? `📝 *Their words:* "${answers.free_text}"` : '',
    ``,
    `⭐ *Lead Score:* ${score}/12`,
    ``,
    `📲 *Reply now:* https://wa.me/${phone}`,
  ]
    .filter(Boolean)
    .join('\n');

  await sendMessage(process.env.OG_PHONE, msg);
}

// ─── Message Scripts ──────────────────────────────────────────────────────────
const MESSAGES = {
  welcome: (name) =>
    `Hey${name ? ` ${name}` : ''} 👋\n\nWelcome to *IVarse Technologies* — I'm the team's virtual assistant. I'll connect you with the right person fast, but first let me understand what you're building.\n\nWhat brought you to us today?\n\n1️⃣ I need custom software built\n2️⃣ I want to add AI / automation to my business\n3️⃣ I need ERP or operations software set up\n4️⃣ I have a SaaS product idea I want to build\n5️⃣ I need tech infrastructure or DevOps help\n6️⃣ I just want to talk to someone about my tech situation`,

  branch: {
    '1': `Great choice — custom software is what we do best.\n\nIs this a *new* project from scratch, or do you need to fix/extend something that already exists?\n\n1️⃣ Brand new build\n2️⃣ Existing system that needs work\n3️⃣ Not sure yet — still figuring it out`,
    '2': `Smart move. AI can unlock serious leverage in the right hands.\n\nWhat are you hoping to automate or improve?\n\n1️⃣ Customer-facing (chatbot, support, sales)\n2️⃣ Internal operations (reports, workflows, data)\n3️⃣ Data intelligence (analytics, predictions)\n4️⃣ I have a specific idea — let me describe it`,
    '3': `ERPNext is our stack of choice — powerful, flexible, and self-hostable.\n\nWhat does your business do?\n_(Just type it briefly — e.g. "I run a bakery" or "I manage a logistics company")_`,
    '4': `Building a SaaS product is serious infrastructure work — we've done it ourselves with OpsCloud, GroovPass, and OpsCommerce.\n\nWhere are you in the journey?\n\n1️⃣ Idea stage — haven't built anything yet\n2️⃣ Have a spec / design — need engineering\n3️⃣ MVP exists — need to scale or improve it\n4️⃣ Need a full product team on retainer`,
    '5': `Infrastructure done right is invisible — and we like it that way.\n\nWhat's the situation?\n\n1️⃣ Setting up cloud infrastructure from scratch\n2️⃣ Moving off a platform (hosting, Nextcloud, etc.)\n3️⃣ Need CI/CD, deployment pipelines\n4️⃣ Security audit or architecture review`,
    '6': `No problem — that's exactly what our discovery calls are for.\n\nTell me in a sentence or two: *what problem are you trying to solve with technology?*`,
  },

  qual_org: `Got it. What kind of organisation are you with?\n\n1️⃣ Startup / early-stage company\n2️⃣ Established SME (already operating)\n3️⃣ Enterprise / large organisation\n4️⃣ I'm an individual / freelancer\n5️⃣ Government / NGO`,

  qual_timeline: `When are you looking to get started?\n\n1️⃣ Immediately — I have a deadline\n2️⃣ Within the next 1–3 months\n3️⃣ Planning ahead (3–6 months out)\n4️⃣ Just exploring for now`,

  qual_budget: `Last one — roughly what investment are you planning for this?\n_(This helps us recommend the right engagement model)_\n\n1️⃣ Under ₦500k\n2️⃣ ₦500k – ₦2M\n3️⃣ ₦2M – ₦10M\n4️⃣ Above ₦10M / open budget\n5️⃣ Not sure yet`,

  route: {
    hot: `Based on what you've shared, this sounds like something our team needs to get into immediately.\n\n🔥 I'm flagging your details to our founder right now — expect a direct message within the hour.\n\nWhile you wait, here's a look at what we've built:\n🔗 https://ivarstechnologies.ng/work`,
    warm: `You're in the right place. Let's set up a proper discovery session — 30 minutes, no fluff, just understanding your situation and seeing if we're the right fit.\n\n📅 *Book a time here:*\n${process.env.CALENDLY_LINK}\n\nIs there anything specific you'd like us to prepare before the call?`,
    nurture: `Thanks for sharing that. We work with businesses at all stages, but I want to make sure we're a fit before we take up each other's time.\n\nHere's our capability overview — what we do, how we work, and examples of what we've built:\n📎 ${process.env.CAPABILITY_DECK_URL}\n\nWhen you're ready to move forward, just reply here and we'll pick up right where we left off. 👌`,
    cold: `Thanks for reaching out! Based on what you've described, our services might not be the best fit right now — but things change.\n\nHere's our website if you ever want to revisit:\n🔗 https://ivarstechnologies.ng\n\nFeel free to come back anytime 🙌`,
  },

  unknown: `Just tap one of the numbers above, or type your response freely 😊`,
  escalate: `Absolutely — let me connect you directly with a team member right now. Please hold for a moment. 🙏`,
  stop: `No problem! We won't message you again. If you ever want to reconnect, just send us a message. Take care 👋`,
};

// ─── Main Message Handler ─────────────────────────────────────────────────────
async function handleMessage(phone, text, profileName) {
  const input = text.trim().toLowerCase();

  // Hard stops
  if (['stop', 'unsubscribe', 'opt out'].includes(input)) {
    await clearState(phone);
    await sendMessage(phone, MESSAGES.stop);
    return;
  }

  // Escalation keywords
  if (['human', 'person', 'agent', 'speak to someone', 'talk to someone'].some(k => input.includes(k))) {
    await alertOG(phone, { answers: {}, name: profileName, source: 'escalation' }, 0);
    await sendMessage(phone, MESSAGES.escalate);
    return;
  }

  let state = await getState(phone);

  // New conversation
  if (!state) {
    state = freshState();
    state.name = profileName || null;
    await setState(phone, state);
    await sendMessage(phone, MESSAGES.welcome(state.name));
    return;
  }

  // ── Stage 0: Waiting for service selection ──
  if (state.stage === 0) {
    if (!['1','2','3','4','5','6'].includes(input)) {
      await sendMessage(phone, MESSAGES.unknown);
      return;
    }
    state.answers.service = input;
    state.branch = input;
    state.stage = 1;
    await setState(phone, state);
    await sendMessage(phone, MESSAGES.branch[input]);
    return;
  }

  // ── Stage 1: Branch-specific question ──
  if (state.stage === 1) {
    // Branch 3 (ERP) and Branch 6 (general) expect free text
    if (['3', '6'].includes(state.branch)) {
      state.answers.service_detail = text.trim();
      if (state.branch === '6') state.answers.free_text = text.trim();
    } else {
      state.answers.service_detail = input;
    }
    state.stage = 2;
    await setState(phone, state);
    await sendMessage(phone, MESSAGES.qual_org);
    return;
  }

  // ── Stage 2: Org type ──
  if (state.stage === 2) {
    if (!['1','2','3','4','5'].includes(input)) {
      await sendMessage(phone, MESSAGES.unknown);
      return;
    }
    state.answers.org_type = input;
    state.stage = 3;
    await setState(phone, state);
    await sendMessage(phone, MESSAGES.qual_timeline);
    return;
  }

  // ── Stage 3: Timeline ──
  if (state.stage === 3) {
    if (!['1','2','3','4'].includes(input)) {
      await sendMessage(phone, MESSAGES.unknown);
      return;
    }
    state.answers.timeline = input;
    state.stage = 4;
    await setState(phone, state);
    await sendMessage(phone, MESSAGES.qual_budget);
    return;
  }

  // ── Stage 4: Budget → Score → Route ──
  if (state.stage === 4) {
    if (!['1','2','3','4','5'].includes(input)) {
      await sendMessage(phone, MESSAGES.unknown);
      return;
    }
    state.answers.budget = input;
    state.stage = 5; // done

    const score = calculateScore(state.answers);
    const classification = classify(score);

    // Persist lead
    await saveLead(phone, state, score, classification);

    // Alert OG if hot
    if (classification === 'hot') {
      await alertOG(phone, state, score);
    }

    // Route prospect
    await sendMessage(phone, MESSAGES.route[classification]);

    // Clear state (conversation complete)
    await clearState(phone);
    return;
  }

  // ── Stage 5+: Already routed — handle follow-ups ──
  if (state.stage === 5 || !state.stage) {
    // If they reply after routing, restart or escalate
    if (input.length > 5) {
      state = freshState();
      state.name = profileName;
      await setState(phone, state);
      await sendMessage(phone, MESSAGES.welcome(state.name));
    }
    return;
  }
}

// ─── Webhook Routes ───────────────────────────────────────────────────────────

// Webhook verification (Meta requirement)
app.get('/webhook/whatsapp', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Incoming messages
app.post('/webhook/whatsapp', async (req, res) => {
  res.sendStatus(200); // Always respond immediately to Meta

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages?.length) return;

    const message = value.messages[0];
    const phone = message.from;
    const text = message.text?.body || '';
    const profileName = value.contacts?.[0]?.profile?.name || null;

    if (!text) return; // Ignore non-text messages for now (media handled separately)

    console.log(`📨 [${phone}] ${profileName || 'Unknown'}: ${text}`);
    await handleMessage(phone, text, profileName);
  } catch (err) {
    console.error('Webhook handler error:', err);
  }
});

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'ivarse-whatsapp-bot' }));

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await initDB();
  console.log(`🚀 IVarse WhatsApp Bot running on port ${PORT}`);
});
