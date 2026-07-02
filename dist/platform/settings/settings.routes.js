import { prisma } from '../../store/prisma';
import { requireAuth, requireBotAccess, requireBotRole } from '../auth/auth.middleware';
import { reloadTenant, refreshTenantCache } from '../../engine/tenant-router';
export default async function settingsRoutes(app) {
    // Get bot settings
    app.get('/platform/bots/:slug/settings', { preHandler: [requireAuth, requireBotAccess] }, async (req, reply) => {
        const { slug } = req.params;
        const tenant = await prisma.tenant.findUnique({
            where: { slug }
        });
        if (!tenant)
            return reply.status(404).send({ error: 'Bot not found' });
        // Strip sensitive keys from configJson
        const safeConfig = { ...tenant.configJson };
        delete safeConfig.openwaApiKey;
        delete safeConfig.openwaBaseUrl;
        reply.send({
            settings: {
                name: tenant.name,
                ownerPhone: tenant.ownerPhone,
                active: tenant.active,
                configJson: safeConfig,
            }
        });
    });
    // Update bot settings
    app.put('/platform/bots/:slug/settings', { preHandler: [requireAuth, requireBotRole(['owner', 'admin'])] }, async (req, reply) => {
        const { slug } = req.params;
        const body = req.body;
        const tenant = await prisma.tenant.findUnique({ where: { slug } });
        if (!tenant)
            return reply.status(404).send({ error: 'Bot not found' });
        // Merge the updated scalar fields into configJson too. The engine reads
        // ownerPhone/name from configJson (see tenant-router.refreshTenantCache),
        // so writing only the scalar columns would silently revert on any cache
        // rebuild. We persist BOTH the columns and the embedded config in one update.
        const existingConfig = tenant.configJson;
        const newConfig = {
            ...existingConfig,
            name: body.name ?? tenant.name,
            ownerPhone: body.ownerPhone ?? tenant.ownerPhone,
            active: body.active !== undefined ? body.active : tenant.active,
        };
        const updated = await prisma.tenant.update({
            where: { slug },
            data: {
                name: newConfig.name,
                ownerPhone: newConfig.ownerPhone,
                active: newConfig.active,
                configJson: newConfig, // keep engine source-of-truth in sync
                // Note: only scalar-derived fields are merged; nested flows/messages are untouched.
            }
        });
        if (updated.active) {
            reloadTenant(newConfig);
        }
        else {
            refreshTenantCache();
        }
        // Return only safe, non-sensitive fields
        reply.send({
            success: true,
            settings: {
                name: updated.name,
                ownerPhone: updated.ownerPhone,
                active: updated.active,
            },
        });
    });
}
