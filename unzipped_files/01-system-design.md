# IVarse Technologies — WhatsApp Sales Bot
## Full System Design Document

---

## 1. Overview & Philosophy

The IVarse WhatsApp Sales Bot is a **conversational sales engine** that turns cold website visitors into warm, qualified leads — without feeling like a chatbot. Every message is written to feel like a sharp, competent team member responded, not an automation.

**Core principle:** *Qualify fast, personalise deep, route smart.*

The bot has three jobs:
1. **Engage** — make the prospect feel seen immediately
2. **Qualify** — understand their problem, budget readiness, and urgency
3. **Route** — send hot leads to a call, warm leads to a proposal request, cold leads to nurture

---

## 2. Services Handled

Based on IVarse Technologies' capabilities:

| Service Tier | What It Is | Typical Buyer |
|---|---|---|
| **Custom Software Development** | Web apps, portals, internal tools, MVPs | Startups, SMEs needing bespoke systems |
| **AI Integration & Automation** | NeuroCore-powered workflows, chatbots, data pipelines | Businesses wanting to automate operations |
| **ERP Implementation** | ERPNext setup, configuration, custom modules | SMEs needing structured operations (inventory, HR, finance) |
| **SaaS Product Development** | Full product engineering (like OpsCloud, GroovPass) | Founders, product companies |
| **Infrastructure & DevOps** | Self-hosted setups, cloud infra, S3, CI/CD | Tech-forward businesses, agencies |
| **Tech Consulting & Architecture** | System design, tech stack decisions, audits | CTOs, non-technical founders |

---

## 3. Conversation Flow Architecture

### 3.1 Entry Points

```
Website Contact Form  ──► WhatsApp Deep Link (pre-filled message)
Website WhatsApp FAB  ──► WhatsApp Deep Link (pre-filled message)
Direct WhatsApp       ──► Bot receives any message, triggers flow
```

### 3.2 Pre-filled Message Templates (by entry point)

**From Contact Form:**
```
Hi IVarse Technologies! I just filled your contact form and wanted to connect directly. [Name: {name}] [Interest: {service_dropdown_value}]
```

**From WhatsApp FAB (floating button):**
```
Hi! I'm visiting ivarse technologies.ng and I'd like to learn more about your services.
```

**From direct WhatsApp:**
```
(any message) → bot intercepts and starts qualification
```

---

## 4. Full Conversation Script

### Stage 0 — Welcome (triggered on first message)

> **Bot:**
> Hey [Name if available] 👋
>
> Welcome to **IVarse Technologies** — I'm the team's virtual assistant. I'll get you to the right person fast, but first let me understand what you're building.
>
> What brought you to us today?
>
> 1️⃣ I need custom software built
> 2️⃣ I want to add AI / automation to my business
> 3️⃣ I need ERP or operations software set up
> 4️⃣ I have a SaaS product idea I want to build
> 5️⃣ I need tech infrastructure or DevOps help
> 6️⃣ I just want to talk to someone about my tech situation

---

### Stage 1 — Service Discovery (branching by selection)

#### Branch 1: Custom Software

> **Bot:**
> Great choice — custom software is what we do best.
>
> Quick question: is this a *new* project from scratch, or do you need to fix/extend something that already exists?
>
> 1️⃣ Brand new build
> 2️⃣ Existing system that needs work
> 3️⃣ Not sure yet — still figuring it out

#### Branch 2: AI / Automation

> **Bot:**
> Smart move. AI can unlock serious leverage in the right hands.
>
> What are you hoping to automate or improve?
>
> 1️⃣ Customer-facing (chatbot, support, sales)
> 2️⃣ Internal operations (reports, workflows, data)
> 3️⃣ Data intelligence (analytics, predictions)
> 4️⃣ I have a specific idea — let me describe it

#### Branch 3: ERP

> **Bot:**
> ERPNext is our stack of choice — powerful, flexible, and self-hostable.
>
> What does your business do?
> *(Just type it briefly — e.g. "I run a bakery" or "I manage a logistics company")*

#### Branch 4: SaaS Product

> **Bot:**
> Building a SaaS product is serious infrastructure work — we've done it ourselves with OpsCloud, GroovPass, and OpsCommerce.
>
> Where are you in the journey?
>
> 1️⃣ Idea stage — haven't built anything yet
> 2️⃣ Have a spec / design — need engineering
> 3️⃣ MVP exists — need to scale or improve it
> 4️⃣ Need a full product team on a retainer

#### Branch 5: Infrastructure / DevOps

> **Bot:**
> Infrastructure done right is invisible — and we like it that way.
>
> What's the situation?
>
> 1️⃣ Setting up cloud infrastructure from scratch
> 2️⃣ Moving off a platform (hosting, Nextcloud, etc.)
> 3️⃣ Need CI/CD, deployment pipelines
> 4️⃣ Security audit or architecture review

#### Branch 6: General Inquiry

> **Bot:**
> No problem — that's exactly what our discovery calls are for.
>
> Tell me in one or two sentences: what problem are you trying to solve with technology?
> *(Free text — bot reads and qualifies)*

---

### Stage 2 — Qualification Questions (all branches converge here)

After the service branch resolves, ask these three qualification questions **one at a time:**

**Q1 — Organisation:**
> **Bot:**
> Got it. What kind of organisation are you with?
>
> 1️⃣ Startup / early-stage company
> 2️⃣ Established SME (already operating)
> 3️⃣ Enterprise / large organisation
> 4️⃣ I'm an individual / freelancer
> 5️⃣ Government / NGO

**Q2 — Timeline:**
> **Bot:**
> When are you looking to get started?
>
> 1️⃣ Immediately — I have a deadline
> 2️⃣ Within the next 1–3 months
> 3️⃣ Planning ahead (3–6 months out)
> 4️⃣ Just exploring for now

**Q3 — Budget Signal (soft):**
> **Bot:**
> Last one — roughly what kind of investment are you planning for this?
> *(Don't worry, this just helps us recommend the right engagement model)*
>
> 1️⃣ Under ₦500k
> 2️⃣ ₦500k – ₦2M
> 3️⃣ ₦2M – ₦10M
> 4️⃣ Above ₦10M / open budget
> 5️⃣ Not sure yet

---

### Stage 3 — Lead Scoring & Routing

#### Scoring Matrix

| Signal | Score |
|---|---|
| Has a specific, articulated need | +2 |
| Established SME or Enterprise | +2 |
| Timeline: Immediately | +3 |
| Timeline: 1–3 months | +2 |
| Budget: ₦2M+ | +2 |
| Budget: ₦500k–₦2M | +1 |
| SaaS product / AI branch | +1 (complexity signal) |
| Individual / just exploring | -1 |

#### Routing Thresholds

| Score | Classification | Action |
|---|---|---|
| **8+** | 🔥 Hot Lead | → Direct WhatsApp handoff to OG |
| **5–7** | 🌡️ Warm Lead | → Book a discovery call (Calendly link) |
| **2–4** | 🌱 Nurture Lead | → Send capability deck + proposal request form |
| **< 2** | ❄️ Cold / Unfit | → Friendly redirect + resource link |

---

### Stage 4 — Routing Messages

#### Hot Lead (Score 8+)
> **Bot:**
> Based on what you've shared, this sounds like something our team needs to get on a call about — this week.
>
> I'm connecting you directly with our founder. He'll reach out within the hour.
>
> *(Bot sends OG a WhatsApp notification with full lead summary)*
>
> While you wait — here's a bit more about what we've built:
> 🔗 ivarse technologies.ng/work

#### Warm Lead (Score 5–7)
> **Bot:**
> You're in the right place. Let's set up a proper discovery session — 30 minutes, no fluff, just understanding your situation and seeing if we're a fit.
>
> 📅 Book a time that works for you:
> [Calendly Link]
>
> Is there anything specific you'd like us to prepare before the call?

#### Nurture Lead (Score 2–4)
> **Bot:**
> Thanks for sharing that. We work with businesses at all stages, but I want to make sure we're the right fit before we take up each other's time.
>
> Let me send you our capability overview — it covers what we do, how we work, and some examples of what we've built.
>
> 📎 [Capability Deck Link]
>
> When you're ready to move forward, just reply here and we'll pick up from where we left off. 👌

#### Cold / Unfit
> **Bot:**
> Thanks for reaching out! Based on what you've described, our services might not be the best fit right now — but things change.
>
> Here's our website if you ever want to revisit:
> 🔗 ivarstechnologies.ng
>
> Feel free to come back anytime 🙌

---

## 5. Bot Notifications to OG (Hot Lead Alert)

When a hot lead is detected, the bot sends OG a structured summary via WhatsApp:

```
🔥 HOT LEAD ALERT — IVarse Technologies

Name: {name}
Number: {phone}
Service Interest: {service}
Organisation Type: {org_type}
Timeline: {timeline}
Budget: {budget}
Summary: {free_text_if_any}
Lead Score: {score}/10

Reply to prospect: wa.me/{phone}
```

---

## 6. Technical Architecture

### 6.1 Stack

| Layer | Technology |
|---|---|
| **Bot Runtime** | Node.js (Express) or Python FastAPI |
| **WhatsApp API** | WhatsApp Business Cloud API (Meta) OR Twilio WhatsApp |
| **State Management** | Redis (conversation state per phone number) |
| **Lead Storage** | PostgreSQL (leads table) |
| **Notification** | WhatsApp message to OG's number (via same API) |
| **Booking** | Calendly embed / link (or Cal.com self-hosted) |
| **Website Widget** | Next.js component (React) |
| **Hosting** | Same VPS/infra as IVarse stack |

### 6.2 Data Model

```sql
-- Leads table
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL,
  name VARCHAR(100),
  service_interest VARCHAR(50),
  service_detail VARCHAR(200),
  org_type VARCHAR(50),
  timeline VARCHAR(50),
  budget_range VARCHAR(50),
  free_text TEXT,
  lead_score INTEGER DEFAULT 0,
  classification VARCHAR(20), -- hot/warm/nurture/cold
  routed_at TIMESTAMP,
  source VARCHAR(50), -- website_form / whatsapp_fab / direct
  created_at TIMESTAMP DEFAULT NOW()
);

-- Conversation state (Redis key structure)
-- Key: conv:{phone_number}
-- Value: JSON { stage, branch, answers: {}, score }
-- TTL: 24 hours
```

### 6.3 Webhook Flow

```
Meta WhatsApp Cloud API
        │
        ▼
POST /webhook/whatsapp
        │
        ▼
Message Router
  ├── New conversation? → Start Stage 0
  ├── Existing state? → Resume from Redis
  └── Keyword triggers? → Handle (e.g. "hi", "hello", "start")
        │
        ▼
Stage Handler
  ├── Parse user selection (number or keyword)
  ├── Update state in Redis
  ├── Calculate score
  └── Send next message or route
        │
        ▼
Lead Router
  ├── Hot → Alert OG + confirmation to prospect
  ├── Warm → Send Calendly + log lead
  ├── Nurture → Send deck + log lead
  └── Cold → Friendly close
        │
        ▼
PostgreSQL (persist lead)
```

---

## 7. Website Integration Points

### 7.1 Pre-filled WhatsApp Deep Link Format

```
https://wa.me/234XXXXXXXXXX?text=Hi%20IVarse%20Technologies!%20I%27m%20interested%20in%20your%20services.
```

Replace `234XXXXXXXXXX` with IVarse Technologies' WhatsApp Business number.

### 7.2 Contact Form Enhancement

When the contact form is submitted:
1. Capture: name, email, service interest (dropdown)
2. Show WhatsApp CTA with pre-filled message that includes their name + interest
3. Also send email notification as fallback

### 7.3 Floating WhatsApp Button (FAB)

- Appears after 5 seconds on page or on scroll past 40%
- Subtle pulse animation to draw attention without being obnoxious
- On click: opens WhatsApp with pre-filled greeting

---

## 8. Conversation Guardrails

| Scenario | Bot Response |
|---|---|
| User sends unrecognised input | "Just tap one of the numbers above, or type your response freely 😊" |
| User says "speak to a human" | Immediately escalate → send OG alert regardless of score |
| User sends "stop" or "unsubscribe" | "No problem! We won't message you again. If you ever want to reconnect, just send us a message. Take care 👋" |
| User is rude / hostile | Neutral close: "We'd love to help when you're ready. Take care!" |
| Bot receives media (image, doc) | "Thanks for sharing! Our team will review this. Can you also tell me a bit about what you need?" |

---

## 9. Implementation Phases

### Phase 1 — Website Widget (Week 1)
- [ ] Enhanced WhatsApp FAB component (Next.js)
- [ ] Contact form pre-fill integration
- [ ] Deep link generation with UTM tracking

### Phase 2 — Bot Core (Week 2–3)
- [ ] WhatsApp Business API setup (Meta Cloud API)
- [ ] Webhook server (Node.js/FastAPI)
- [ ] Redis state management
- [ ] Full conversation flow implementation
- [ ] PostgreSQL leads table

### Phase 3 — Routing & Alerts (Week 3–4)
- [ ] Lead scoring engine
- [ ] OG notification system (hot lead alerts)
- [ ] Calendly integration (warm leads)
- [ ] Capability deck hosting + link

### Phase 4 — Polish & Analytics (Week 4+)
- [ ] Lead dashboard (simple Next.js admin)
- [ ] Conversion tracking
- [ ] A/B test conversation variations
- [ ] WhatsApp message templates approval (for outbound)

---

## 10. WhatsApp Business API Setup Checklist

- [ ] Create Meta Business Account (if not exists)
- [ ] Verify business on Meta Business Manager
- [ ] Create WhatsApp Business App in Meta Developers
- [ ] Get a dedicated phone number for the bot (not OG's personal number)
- [ ] Submit message templates for approval (for outbound/proactive messages)
- [ ] Set up webhook endpoint (must be HTTPS)
- [ ] Configure webhook verification token
- [ ] Test with WhatsApp sandbox first

> **Recommendation:** Use **Meta WhatsApp Cloud API** (free per conversation tier available) rather than Twilio to keep costs low and avoid a third-party dependency — aligned with your infrastructure ownership philosophy.
