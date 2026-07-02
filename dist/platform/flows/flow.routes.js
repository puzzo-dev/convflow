import { prisma } from '../../store/prisma';
import { requireAuth, requireBotAccess, requireBotRole } from '../auth/auth.middleware';
import { reloadTenant } from '../../engine/tenant-router';
import { validateConfig } from '../../config/loader';
import { scoreAnswers } from '../../engine/scoring-engine';
export default async function flowRoutes(app) {
    // GET /platform/bots/:slug/flows
    app.get('/platform/bots/:slug/flows', { preHandler: [requireAuth, requireBotAccess] }, async (req, reply) => {
        const { slug } = req.params;
        const tenant = await prisma.tenant.findUnique({ where: { slug } });
        if (!tenant)
            return reply.status(404).send({ error: 'Bot not found' });
        const config = tenant.configJson;
        reply.send({
            flows: config.flows ?? [],
            scoring: config.scoring ?? [],
            messages: config.messages ?? {},
        });
    });
    // PUT /platform/bots/:slug/flows
    app.put('/platform/bots/:slug/flows', { preHandler: [requireAuth, requireBotRole(['owner', 'admin'])] }, async (req, reply) => {
        const { slug } = req.params;
        const body = req.body;
        const tenant = await prisma.tenant.findUnique({ where: { slug } });
        if (!tenant)
            return reply.status(404).send({ error: 'Bot not found' });
        const currentConfig = tenant.configJson;
        // Merge new flows + scoring + messages into existing config
        const updatedConfig = {
            ...currentConfig,
            flows: body.flows,
            scoring: body.scoring ?? currentConfig.scoring ?? [],
            messages: body.messages ?? currentConfig.messages ?? {},
        };
        // Validate before saving
        try {
            validateConfig(updatedConfig);
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
        await prisma.tenant.update({
            where: { slug },
            data: { configJson: updatedConfig, updatedAt: new Date() },
        });
        // Hot-reload in-memory cache — no server restart needed
        reloadTenant(updatedConfig);
        reply.send({ saved: true });
    });
    // POST /platform/bots/:slug/flows/preview
    // Dry-run: score + classify simulated answers without saving anything
    app.post('/platform/bots/:slug/flows/preview', { preHandler: [requireAuth, requireBotAccess] }, async (req, reply) => {
        const { slug } = req.params;
        const body = req.body;
        const tenant = await prisma.tenant.findUnique({ where: { slug } });
        if (!tenant)
            return reply.status(404).send({ error: 'Bot not found' });
        const config = tenant.configJson;
        const scoringRules = body.scoring ?? config.scoring ?? [];
        const score = scoreAnswers(body.simulatedAnswers, scoringRules);
        // Classify
        let classification;
        if (score >= 8)
            classification = 'hot';
        else if (score >= 5)
            classification = 'warm';
        else if (score >= 2)
            classification = 'nurture';
        else
            classification = 'cold';
        // Find routing message from terminal stage
        const terminalStage = config.flows[config.flows.length - 1];
        const routingMessage = terminalStage?.terminal?.successMessage ?? '';
        reply.send({ score, classification, routingMessage });
    });
}
