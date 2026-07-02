import { prisma } from '../../store/prisma';
// Higher number = more privilege. Used to compare org vs per-bot roles.
export const ROLE_RANK = { viewer: 1, member: 2, admin: 3, owner: 4 };
export function rankOf(role) {
    return role ? (ROLE_RANK[role] ?? 0) : 0;
}
// Hybrid resolution: a user's effective role on a bot is the HIGHER of their
// org-wide role (membership in the bot's organization) and any per-bot role.
// Returns null if the user has neither → no access.
export async function getEffectiveBotRole(userId, bot) {
    const candidates = [];
    if (bot.organizationId) {
        const org = await prisma.organizationMembership.findUnique({
            where: { userId_orgId: { userId, orgId: bot.organizationId } },
            select: { role: true },
        });
        if (org)
            candidates.push(org.role);
    }
    const perBot = await prisma.tenantMembership.findUnique({
        where: { userId_tenantId: { userId, tenantId: bot.id } },
        select: { role: true },
    });
    if (perBot)
        candidates.push(perBot.role);
    if (candidates.length === 0)
        return null;
    return candidates.sort((a, b) => rankOf(b) - rankOf(a))[0];
}
// Does an effective role satisfy a required minimum (any of the allowed roles)?
export function roleSatisfies(effective, allowed) {
    if (!effective)
        return false;
    const min = Math.min(...allowed.map(rankOf));
    return rankOf(effective) >= min;
}
// The org a user acts in by default (where they can create bots): their
// highest-privilege org membership, preferring owner then admin.
export async function getPrimaryOrgId(userId) {
    const memberships = await prisma.organizationMembership.findMany({
        where: { userId },
        select: { orgId: true, role: true },
    });
    if (memberships.length === 0)
        return null;
    memberships.sort((a, b) => rankOf(b.role) - rankOf(a.role));
    return memberships[0].orgId;
}
