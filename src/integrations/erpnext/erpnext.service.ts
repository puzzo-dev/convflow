// src/integrations/erpnext/erpnext.service.ts
import axios from 'axios';
import { prisma } from '../../store/prisma';
import crypto from 'crypto';
import { validateExternalUrlAsync } from '../../lib/validate-url';
import { AnswerMap, CreateOrderTerminal, ERPNextFieldMap } from '../../types';

interface ConnectERPNextPayload {
  companySlug: string;
  sessionId: string;        // tenant's OpenWA session
  openwaApiKey: string;
  erpnextUrl: string;
  apiKey: string;
  apiSecret: string;
}

async function assertErpnextUrl(url: string): Promise<string> {
  const result = await validateExternalUrlAsync(url);
  if (!result.valid) throw new Error(result.reason);
  return result.origin;
}

export async function connectERPNext(payload: ConnectERPNextPayload): Promise<void> {
  const { companySlug, sessionId, erpnextUrl, apiKey, apiSecret, openwaApiKey } = payload;
  const baseURL = await assertErpnextUrl(erpnextUrl);
  const authHeader = `token ${apiKey}:${apiSecret}`;
  const client = axios.create({
    baseURL,
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    timeout: 15_000,
  });

  // Step 1: Verify credentials
  try {
    await client.get('/api/method/frappe.auth.get_logged_user');
  } catch {
    throw new Error('ERPNext credentials invalid or site unreachable');
  }

  // Step 2: Check frappe_whatsapp is installed
  try {
    await client.get('/api/resource/WhatsApp Settings/WhatsApp Settings');
  } catch {
    throw new Error('frappe_whatsapp app not installed on this ERPNext site. Install it first: https://github.com/shridarpatil/frappe_whatsapp');
  }

  // Step 3: Configure frappe_whatsapp WhatsApp Settings
  const proxySecret = crypto.randomBytes(24).toString('hex');
  const proxyUrl    = `${process.env.CONVFLOW_PUBLIC_URL}/api/openwa-proxy/${sessionId}`;

  await client.put('/api/resource/WhatsApp Settings/WhatsApp Settings', {
    token: openwaApiKey,
    url: proxyUrl,
    webhook_secret: proxySecret,
    enabled: 1,
  });

  // Step 4: Save connection to DB via Prisma (safe upsert — no raw SQL)
  await prisma.erpnextConnection.upsert({
    where:  { companySlug },
    update: { erpnextUrl, apiKey, apiSecret, status: 'connected', errorMessage: null, connectedAt: new Date() },
    create: { companySlug, erpnextUrl, apiKey, apiSecret, status: 'connected' },
  });

  // Store proxy secret in tenant config
  const tenant = await prisma.tenant.findUnique({ where: { slug: companySlug } });
  if (tenant) {
    const updatedConfig = { ...(tenant.configJson as object), erpnextProxySecret: proxySecret };
    await prisma.tenant.update({
      where:  { slug: companySlug },
      data:   { configJson: updatedConfig },
    });
  }
}

export async function pushLeadToERPNext(
  companySlug: string,
  phone: string,
  name: string | null,
  answers: AnswerMap,
  score: number,
  classification: string,
  fieldMapping?: ERPNextFieldMap
): Promise<void> {
  // Prisma query — fully parameterised, no injection surface
  const conn = await prisma.erpnextConnection.findFirst({
    where: { companySlug, status: 'connected' },
  });
  if (!conn) return; // Not connected — skip silently

  const baseURL = await assertErpnextUrl(conn.erpnextUrl);
  const authHeader = `token ${conn.apiKey}:${conn.apiSecret}`;

  // Build human-readable notes from answers
  const notes = Object.entries(answers)
    .filter(([k]) => k.endsWith('_label'))
    .map(([k, v]) => `${k.replace('_label','').replace(/_/g,' ')}: ${v}`)
    .join('\n');

  const leadPayload = {
    doctype: 'Lead',
    lead_name: name ?? `WhatsApp Lead - ${phone}`,
    mobile_no: `+${phone}`,
    source: 'WhatsApp Bot',
    status: classification === 'hot' ? 'Open' : 'Lead',
    notes: `ConvFlow Score: ${score}/12 (${classification})\n\n${notes}`,
    custom_convflow_score: score,
    custom_convflow_classification: classification,
    custom_convflow_slug: companySlug,
  };

  try {
    await axios.post(
      `${baseURL}/api/resource/Lead`,
      leadPayload,
      {
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        timeout: 10_000,
      }
    );

    await prisma.erpnextConnection.update({
      where: { companySlug },
      data:  { lastSyncAt: new Date() },
    });
  } catch (err: any) {
    // Log the error but never let it crash the bot flow
    console.error(`[${companySlug}] ERPNext lead push failed:`, err.response?.data ?? err.message);
    await prisma.erpnextConnection.update({
      where: { companySlug },
      data:  { status: 'error', errorMessage: err.message },
    });
  }
}

export async function createSalesOrderInERPNext(
  companySlug: string,
  phone: string,
  name: string | null,
  answers: AnswerMap,
  terminal: CreateOrderTerminal
): Promise<void> {
  // Prisma — type-safe, no raw SQL
  const conn = await prisma.erpnextConnection.findFirst({
    where: { companySlug, status: 'connected' },
  });
  if (!conn) {
    console.info(`[${companySlug}] ERPNext not connected — order not pushed`);
    return;
  }

  const baseURL = await assertErpnextUrl(conn.erpnextUrl);
  const authHeader = `token ${conn.apiKey}:${conn.apiSecret}`;

  // Resolve or create customer by phone
  const customerName = await resolveOrCreateCustomer(baseURL, authHeader, phone, name);

  // Build item line from answers
  const itemName = answers[terminal.itemAnswerKey] ?? 'Unknown Item';
  const itemCode = terminal.itemCodeAnswerKey
    ? (answers[terminal.itemCodeAnswerKey] ?? itemName)
    : itemName;
  const qty      = parseFloat(answers[terminal.qtyAnswerKey] ?? '1') || 1;

  // Build extra fields from fieldMapping
  const extraFields: Record<string, string> = {};
  if (terminal.fieldMapping) {
    for (const [answerKey, erpnextField] of Object.entries(terminal.fieldMapping)) {
      const val = answers[`${answerKey}_label`] ?? answers[answerKey];
      if (val) extraFields[erpnextField] = val;
    }
  }

  const orderPayload = {
    doctype: 'Sales Order',
    customer: customerName,
    order_type: 'Sales',
    docstatus: 0,  // Draft — never submit automatically
    custom_whatsapp_phone: `+${phone}`,
    custom_convflow_slug: companySlug,
    items: [
      {
        item_name: itemName,
        item_code: itemCode,
        qty,
        uom: 'Nos',
      },
    ],
    ...extraFields,
  };

  try {
    const res = await axios.post(
      `${baseURL}/api/resource/Sales Order`,
      orderPayload,
      { headers: { Authorization: authHeader, 'Content-Type': 'application/json' }, timeout: 15_000 }
    );

    await prisma.erpnextConnection.update({
      where: { companySlug },
      data:  { lastSyncAt: new Date() },
    });

    console.info(`[${companySlug}] Sales Order created: ${res.data.data.name}`);
  } catch (err: any) {
    console.error(`[${companySlug}] Sales Order creation failed:`, err.response?.data ?? err.message);
    await prisma.erpnextConnection.update({
      where: { companySlug },
      data:  { status: 'error', errorMessage: err.message },
    });
  }
}

async function resolveOrCreateCustomer(
  baseURL: string,
  authHeader: string,
  phone: string,
  name: string | null
): Promise<string> {
  const normalizedPhone = `+${phone}`;

  // Try to find existing customer by phone
  try {
    const res = await axios.get(`${baseURL}/api/resource/Customer`, {
      params: { filters: JSON.stringify([['mobile_no', '=', normalizedPhone]]), fields: '["name"]', limit: 1 },
      headers: { Authorization: authHeader },
      timeout: 10_000,
    });
    if (res.data.data?.length) return res.data.data[0].name;
  } catch { /* not found — create */ }

  // Create new customer
  const customerName = name ?? `WhatsApp ${normalizedPhone}`;
  await axios.post(`${baseURL}/api/resource/Customer`, {
    customer_name: customerName,
    customer_type: 'Individual',
    customer_group: 'Individual',
    territory: 'Nigeria',
    mobile_no: normalizedPhone,
  }, {
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    timeout: 10_000,
  });

  return customerName;
}
