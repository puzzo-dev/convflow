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
        const updated = await prisma.tenant.update({
            where: { slug },
            data: {
                name: body.name ?? tenant.name,
                ownerPhone: body.ownerPhone ?? tenant.ownerPhone,
                active: body.active !== undefined ? body.active : tenant.active,
                // Block raw configJson overwrites from settings API for security
            }
        });
        // Merge the updated scalar fields into the cached config so the engine
        // reflects the new name/ownerPhone without a full cache rebuild.
        const existingConfig = tenant.configJson;
        const newConfig = {
            ...existingConfig,
            name: updated.name,
            ownerPhone: updated.ownerPhone,
            active: updated.active,
        };
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
