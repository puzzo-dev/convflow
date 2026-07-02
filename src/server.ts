import Fastify from 'fastify';
import 'dotenv/config';

// ── Critical env validation ───────────────────────────────────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET', 'OPENWA_WEBHOOK_SECRET'] as const;
const INSECURE_JWT_SECRETS = new Set([
  'change_me_to_a_long_random_string_in_production',
  'fallback_secret_do_not_use_in_prod',
]);

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[FATAL] Required environment variable ${key} is not set. Refusing to start.`);
    process.exit(1);
  }
}
if (INSECURE_JWT_SECRETS.has(process.env.JWT_SECRET!)) {
  console.error('[SECURITY] JWT_SECRET is set to an insecure default value.');
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] Refusing to start in production with an insecure JWT_SECRET.');
    process.exit(1);
  } else {
    console.warn('[WARN]  Continuing in development mode with insecure JWT_SECRET — do NOT use this in production.');
  }
}

if (process.env.NODE_ENV === 'production' && !process.env.DASHBOARD_ORIGIN) {
  console.error('[FATAL] DASHBOARD_ORIGIN is required in production to restrict CORS to the dashboard.');
  process.exit(1);
}

import { loadAllConfigs, seedTenants } from './config/loader';
import { refreshTenantCache } from './engine/tenant-router';
import { refreshPlugins } from './plugins/registry';
import { whatsappWebhookPost } from './webhook/whatsapp';
import { syncAllTenants } from './integrations/erpnext/item-sync.service';

// Route imports
import authRoutes from './platform/auth/auth.routes';
import botRoutes from './platform/bots/bot.routes';
import leadRoutes from './platform/leads/lead.routes';
import analyticsRoutes from './platform/analytics/analytics.routes';
import conversationRoutes from './platform/conversations/conversation.routes';
import settingsRoutes from './platform/settings/settings.routes';
import flowRoutes from './platform/flows/flow.routes';
import accountRoutes from './platform/account/account.routes';
import erpnextRoutes from './integrations/erpnext/erpnext.routes';
import openwaProxyRoutes from './integrations/openwa-proxy.routes';
import adminRoutes from './platform/admin/admin.routes';
import notificationRoutes from './notifications/notification.routes';
import pluginRoutes from './plugins/plugin.routes';
import orgRoutes from './platform/org/org.routes';

// Augment fastify to save raw body for HMAC signature verification
const fastify = Fastify({ logger: true });

// CORS — restrict to the dashboard origin in production
import cors from '@fastify/cors';

function corsOrigin(origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) {
  // OpenWA/non-browser callers send no Origin header; those are not CORS requests.
  if (!origin) return cb(null, true);
  if (process.env.NODE_ENV !== 'production') return cb(null, true);
  const allowed = (process.env.DASHBOARD_ORIGIN ?? '').split(',').map(o => o.trim()).filter(Boolean);
  if (allowed.includes(origin)) return cb(null, true);
  return cb(new Error('CORS origin not allowed'), false);
}

await fastify.register(cors, {
  origin: corsOrigin,
  credentials: true,
});

fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
  try {
    const json = JSON.parse(body.toString());
    (req as any).rawBody = body; // Attach raw buffer
    done(null, json);
  } catch (err: any) {
    err.statusCode = 400;
    done(err, undefined);
  }
});

// Core webhook
fastify.post('/webhook/whatsapp', whatsappWebhookPost);

// Register Platform API routes
fastify.register(authRoutes);
fastify.register(botRoutes);
fastify.register(leadRoutes);
fastify.register(analyticsRoutes);
fastify.register(conversationRoutes);
fastify.register(settingsRoutes);
fastify.register(flowRoutes);
fastify.register(accountRoutes);
fastify.register(erpnextRoutes);
fastify.register(openwaProxyRoutes);
fastify.register(adminRoutes);
fastify.register(notificationRoutes);
fastify.register(pluginRoutes);
fastify.register(orgRoutes);

fastify.get('/health', async () => {
  return { status: 'ok', service: 'convflow-engine' };
});

const start = async () => {
  try {
    console.log('Loading configs...');
    const configs = await loadAllConfigs();
    if (configs.length > 0) {
      await seedTenants(configs);
    }
    await refreshTenantCache();
    await refreshPlugins();

    // Background cron: sync all connected tenants every 30 minutes
    setInterval(() => {
      syncAllTenants().catch(err => console.error('Cron item sync failed:', err));
    }, 30 * 60 * 1000);
    
    // Initial sync on startup
    syncAllTenants().catch(err => console.error('Initial item sync failed:', err));

    const port = Number(process.env.PORT) || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 ConvFlow Engine listening on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
