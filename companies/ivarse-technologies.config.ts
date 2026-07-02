import { CompanyConfig } from '../src/types';

const config: CompanyConfig = {
  slug: 'ivarse-technologies',
  name: 'IVarse Technologies',
  openwaSessionId: process.env.IVARSE_OPENWA_SESSION_ID || 'ivarse-bot',
  openwaApiKey: process.env.OPENWA_API_KEY || '',
  openwaBaseUrl: process.env.OPENWA_BASE_URL || 'http://localhost:2785/api',
  ownerPhone: process.env.IVARSE_OWNER_PHONE || '2348000000000',
  websiteUrl: 'https://ivarstechnologies.ng',

  flows: [
    {
      stage: 0, id: 'welcome', type: 'select', answerKey: 'service',
      message: `Hey {name} 👋\n\nWelcome to *IVarse Technologies*. I'll connect you with the right person fast.\n\nWhat brought you to us?\n\n1️⃣ Custom software development\n2️⃣ AI & automation\n3️⃣ ERP setup (ERPNext)\n4️⃣ SaaS product development\n5️⃣ Infrastructure & DevOps\n6️⃣ Tech consulting`,
      options: [
        { value: '1', label: 'Custom Software Development' },
        { value: '2', label: 'AI & Automation' },
        { value: '3', label: 'ERP Setup' },
        { value: '4', label: 'SaaS Product Development' },
        { value: '5', label: 'Infrastructure & DevOps' },
        { value: '6', label: 'Tech Consulting' },
      ],
    },
    {
      stage: 1, id: 'org_type', type: 'select', answerKey: 'org_type',
      message: `Got it. What kind of organisation are you with?\n\n1️⃣ Startup\n2️⃣ Established SME\n3️⃣ Enterprise\n4️⃣ Individual\n5️⃣ Government / NGO`,
      options: [
        { value: '1', label: 'Startup' },
        { value: '2', label: 'Established SME' },
        { value: '3', label: 'Enterprise' },
        { value: '4', label: 'Individual' },
        { value: '5', label: 'Government / NGO' },
      ],
    },
    {
      stage: 2, id: 'timeline', type: 'select', answerKey: 'timeline',
      message: `When are you looking to start?\n\n1️⃣ Immediately\n2️⃣ Within 1–3 months\n3️⃣ 3–6 months out\n4️⃣ Just exploring`,
      options: [
        { value: '1', label: 'Immediately' },
        { value: '2', label: '1–3 months' },
        { value: '3', label: '3–6 months' },
        { value: '4', label: 'Just exploring' },
      ],
    },
    {
      stage: 3, id: 'budget', type: 'select', answerKey: 'budget',
      message: `Last one — roughly what investment are you planning?\n\n1️⃣ Under ₦500k\n2️⃣ ₦500k – ₦2M\n3️⃣ ₦2M – ₦10M\n4️⃣ Above ₦10M\n5️⃣ Not sure yet`,
      options: [
        { value: '1', label: 'Under ₦500k' },
        { value: '2', label: '₦500k – ₦2M' },
        { value: '3', label: '₦2M – ₦10M' },
        { value: '4', label: 'Above ₦10M' },
        { value: '5', label: 'Not sure yet' },
      ],
    },
    {
      // TERMINAL STAGE
      stage: 4, id: 'save_lead', type: 'save_lead',
      message: '', // not used; successMessage is used instead
      terminal: {
        type: 'save_lead',
        successMessage: `Thanks for sharing that 🙏\n\nOur team will review your details and be in touch shortly.\n\nIn the meantime, see what we've built: https://ivarstechnologies.ng/work`,
        fieldMapping: {
          'service_label':  'custom_service_interest',
          'org_type_label': 'custom_org_type',
          'timeline_label': 'custom_timeline',
          'budget_label':   'custom_budget_range',
        },
      },
    },
  ],

  scoring: [
    { answerKey: 'service',  values: { '1':1, '2':2, '3':1, '4':2, '5':1, '6':0 } },
    { answerKey: 'org_type', values: { '1':1, '2':2, '3':2, '4':-1, '5':1 } },
    { answerKey: 'timeline', values: { '1':3, '2':2, '3':1, '4':0 } },
    { answerKey: 'budget',   values: { '1':0, '2':1, '3':2, '4':3, '5':0 } },
  ],

  messages: {
    unknown_input:    `Just tap one of the numbers above 😊`,
    stop:             `No problem! Come back anytime 👋`,
    escalate_confirm: `Connecting you with a team member now 🙏`,
  },
};

export default config;
