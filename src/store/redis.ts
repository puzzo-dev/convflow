import Redis from 'ioredis';
import { ConvState } from '../types';
import { prisma } from './prisma';

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const TTL = 60 * 60 * 24; // 24 hours

export async function getState(phone: string, companySlug: string): Promise<ConvState | null> {
  const raw = await redis.get(`state:${companySlug}:${phone}`);
  return raw ? JSON.parse(raw) : null;
}

export async function setState(phone: string, companySlug: string, state: ConvState): Promise<void> {
  await redis.setex(`state:${companySlug}:${phone}`, TTL, JSON.stringify(state));
}

export async function clearState(phone: string, companySlug: string): Promise<void> {
  await redis.del(`state:${companySlug}:${phone}`);
}

// Live activity: count active conversation states (customers currently mid-flow,
// within the 24h TTL), grouped by bot. Uses SCAN so it never blocks Redis.
export async function getActiveSessions(): Promise<{ total: number; byCompany: Record<string, number> }> {
  const byCompany: Record<string, number> = {};
  let total = 0;
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'state:*', 'COUNT', 500);
    cursor = next;
    for (const key of keys) {
      const slug = key.split(':')[1]; // state:{companySlug}:{phone}
      if (!slug) continue;
      byCompany[slug] = (byCompany[slug] ?? 0) + 1;
      total++;
    }
  } while (cursor !== '0');
  return { total, byCompany };
}

export async function getItemsFromCache(companySlug: string, itemGroup?: string): Promise<any[]> {
  try {
    const raw = await redis.get(`items:${companySlug}`);
    if (raw) {
      const items = JSON.parse(raw);
      if (itemGroup) {
        return items.filter((item: any) => item.item_group === itemGroup);
      }
      return items;
    }
  } catch (err) {
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
