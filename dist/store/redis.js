import Redis from 'ioredis';
import { prisma } from './prisma';
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const TTL = 60 * 60 * 24; // 24 hours
export async function getState(phone, companySlug) {
    const raw = await redis.get(`state:${companySlug}:${phone}`);
    return raw ? JSON.parse(raw) : null;
}
export async function setState(phone, companySlug, state) {
    await redis.setex(`state:${companySlug}:${phone}`, TTL, JSON.stringify(state));
}
export async function clearState(phone, companySlug) {
    await redis.del(`state:${companySlug}:${phone}`);
}
export async function getItemsFromCache(companySlug, itemGroup) {
    try {
        const raw = await redis.get(`items:${companySlug}`);
        if (raw) {
            const items = JSON.parse(raw);
            if (itemGroup) {
                return items.filter((item) => item.item_group === itemGroup);
            }
            return items;
        }
    }
    catch (err) {
        console.warn(`[Redis] item cache read failed for ${companySlug}:`, err);
    }
    // Fallback to DB cache when Redis is empty or unavailable
    const rows = await prisma.erpnextItemCache.findMany({
        where: { companySlug, isActive: true, ...(itemGroup ? { itemGroup } : {}) },
        orderBy: { itemName: 'asc' },
    });
    return rows.map(r => ({
        item_code: r.itemCode,
        item_name: r.itemName,
        item_group: r.itemGroup,
        standard_rate: r.standardRate,
        currency: r.currency,
        description: r.description,
    }));
}
