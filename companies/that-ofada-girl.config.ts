import { CompanyConfig } from '../src/types';

const config: CompanyConfig = {
  slug: 'that-ofada-girl',
  name: 'That Ofada Girl',
  openwaSessionId: process.env.OFADA_OPENWA_SESSION_ID || 'ofada-bot',
  openwaApiKey: process.env.OPENWA_API_KEY || '',
  openwaBaseUrl: process.env.OPENWA_BASE_URL || 'http://localhost:2785/api',
  ownerPhone: process.env.OFADA_OWNER_PHONE || '2348000000001',
  websiteUrl: 'https://thatofadagirl.com',

  flows: [
    {
      stage: 0, id: 'welcome', type: 'select', answerKey: 'order_type',
      message: `Hey {name}! 🍛 Welcome to *That Ofada Girl* — Lagos' finest Ofada experience!\n\nWhat can we do for you today?\n\n1️⃣ Place a food order\n2️⃣ Catering for an event\n3️⃣ Ask about our menu\n4️⃣ Something else`,
      options: [
        { value: '1', label: 'Food Order' },
        { value: '2', label: 'Event Catering' },
        { value: '3', label: 'Menu Enquiry' },
        { value: '4', label: 'Other' },
      ],
    },
    // Silent routing node — auto-fires based on the answer stored by stage 0.
    // answerKey must match stage 0's answerKey so resolveNextStage reads the right slot.
    {
      stage: 1, id: 'route', type: 'branch', answerKey: 'order_type',
      message: '',
      branches: { '1': 2, '2': 2, '3': 8, '4': 9 }, // 3 → menu_info (8), 4 → other_enquiry (9)
      options: [],
    },
    {
      stage: 2, id: 'item', type: 'free_text', answerKey: 'item_name',
      message: `What would you like to order? 🍛\n_(e.g. Ofada Rice + Ayamase, White Rice + Stew, Assorted Protein)_`,
    },
    {
      stage: 3, id: 'quantity', type: 'number', answerKey: 'quantity',
      message: `How many portions? _(enter a number e.g. 2)_`,
    },
    {
      stage: 4, id: 'delivery', type: 'select', answerKey: 'delivery_type',
      message: `Delivery or pickup?\n\n1️⃣ Delivery (Lagos)\n2️⃣ Pickup`,
      options: [
        { value: '1', label: 'Delivery' },
        { value: '2', label: 'Pickup' },
      ],
    },
    {
      stage: 5, id: 'address', type: 'free_text', answerKey: 'address',
      message: `What's your delivery address?\n_(e.g. 12 Admiralty Way, Lekki Phase 1)_`,
    },
    {
      // Confirm stage: show order summary before creating it
      stage: 6, id: 'confirm', type: 'confirm', answerKey: 'confirmed',
      message: `Here's your order summary 📋\n\n🍛 *{answers.item_name}* × {answers.quantity}\n🚚 *{answers.delivery_type_label}* → {answers.address}\n\nReply *YES* to confirm or *NO* to start over.`,
      options: [
        { value: 'yes', label: 'Confirmed' },
        { value: 'no',  label: 'Cancelled' },
      ],
    },
    {
      // TERMINAL STAGE — create_order
      stage: 7, id: 'create_order', type: 'create_order',
      message: '',
      terminal: {
        type: 'create_order',
        successMessage: `Order placed! 🎉\n\nWe've received your order and our team will confirm it shortly. Expect a message from us within 15 minutes 🍛`,
        itemAnswerKey: 'item_name',
        qtyAnswerKey: 'quantity',
        customerNameKey: 'name',  // uses state.name
        fieldMapping: {
          'address':            'shipping_address_name',
          'delivery_type_label': 'shipping_method',
        },
      },
    },
    {
      // TERMINAL STAGE — send_info (menu enquiry branch)
      stage: 8, id: 'menu_info', type: 'send_info',
      message: '',
      terminal: {
        type: 'send_info',
        infoMessage: `Here's our current menu 🍛\n\n*Rice Dishes*\n• Ofada Rice + Ayamase — ₦2,500\n• White Rice + Stew — ₦2,000\n• Jollof Rice — ₦2,200\n\n*Proteins*\n• Assorted — ₦1,500 add-on\n• Chicken — ₦1,200 add-on\n\nTo place an order, just say *Hi* to restart 😊`,
        loopToStage: 0, // After sending menu, loop back to welcome
      },
    },
    {
      // TERMINAL STAGE — notify_only (other enquiry branch)
      stage: 9, id: 'other_enquiry', type: 'notify_only',
      message: '',
      terminal: {
        type: 'notify_only',
        successMessage: `Thanks for reaching out! Our team will get back to you shortly 🙏`,
      },
    },
  ],

  messages: {
    unknown_input:    `Please pick one of the options above 😊`,
    stop:             `No wahala! Come back when hunger calls 🍛`,
    escalate_confirm: `Oya, someone will reach you now now 🙏`,
  },
};

export default config;
