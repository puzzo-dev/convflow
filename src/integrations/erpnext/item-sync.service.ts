// src/integrations/erpnext/item-sync.service.ts
import axios from 'axios';
import { prisma } from '../../store/prisma';
import { redis } from '../../store/redis';
import { ERPNextItem } from '../../types';

const ITEM_CACHE_TTL = 60 * 30; // 30 minutes

export async function syncItemsFromERPNext(companySlug: string): Promise<number> {
  // Prisma — type-safe, no raw SQL
  const conn = await prisma.erpnextConnection.findFirst({
    where: { companySlug, status: 'connected' },
  });
  if (!conn) throw new Error(`No active ERPNext connection for ${companySlug}`);

  const authHeader = `token ${conn.apiKey}:${conn.apiSecret}`;

  // Fetch all active, non-template sales items from ERPNext
  const res = await axios.get(`${conn.erpnextUrl}/api/resource/Item`, {
    params: {
      filters: JSON.stringify([
        ['disabled', '=', 0],
        ['is_sales_item', '=', 1],
      ]),
      fields: JSON.stringify([
        'item_code', 'item_name', 'item_group',
        'standard_rate', 'currency', 'description',
      ]),
      limit: 200,
      order_by: 'item_name asc',
    },
    headers: { Authorization: authHeader },
    timeout: 15_000,
  });

  const items: ERPNextItem[] = res.data.data ?? [];
  if (!items.length) return 0;

  // Upsert into DB backing store via Prisma
  for (const item of items) {
    await prisma.erpnextItemCache.upsert({
      where:  { companySlug_itemCode: { companySlug, itemCode: item.item_code } },
      update: {
        itemName:     item.item_name,
        itemGroup:    item.item_group ?? null,
        standardRate: item.standard_rate ?? 0,
        currency:     item.currency ?? 'NGN',
        description:  item.description ?? null,
        isActive:     true,
        syncedAt:     new Date(),
      },
      create: {
        companySlug,
        itemCode:     item.item_code,
        itemName:     item.item_name,
        itemGroup:    item.item_group ?? null,
        standardRate: item.standard_rate ?? 0,
        currency:     item.currency ?? 'NGN',
        description:  item.description ?? null,
      },
    });
  }

  // Mark items no longer in ERPNext as inactive
  const activeCodes = items.map(i => i.item_code);
  if (activeCodes.length) {
    await prisma.erpnextItemCache.updateMany({
      where: { companySlug, itemCode: { notIn: activeCodes } },
      data:  { isActive: false },
    });
  }

  // Rebuild Redis cache (all items + per-group caches)
  await rebuildRedisItemCache(companySlug, items);

  // Update last_sync_at
  await prisma.erpnextConnection.update({
    where: { companySlug },
    data:  { lastSyncAt: new Date() },
  });

  return items.length;
}

async function rebuildRedisItemCache(
  companySlug: string,
  items: ERPNextItem[]
): Promise<void> {
  // All items cache
  await redis.setex(`items:${companySlug}`, ITEM_CACHE_TTL, JSON.stringify(items));

  // Per-group caches
  const byGroup = items.reduce((acc, item) => {
    const g = item.item_group ?? 'Uncategorised';
    if (!acc[g]) acc[g] = [];
    acc[g].push(item);
    return acc;
  }, {} as Record<string, ERPNextItem[]>);

  for (const [group, groupItems] of Object.entries(byGroup)) {
    await redis.setex(
      `items:${companySlug}:${group}`,
      ITEM_CACHE_TTL,
      JSON.stringify(groupItems)
    );
  }
}

// Background cron: sync all connected tenants every 30 minutes
export async function syncAllTenants(): Promise<void> {
  const connections = await prisma.erpnextConnection.findMany({
    where: { status: 'connected' },
    select: { companySlug: true },
  });
  for (const { companySlug } of connections) {
    try {
      const count = await syncItemsFromERPNext(companySlug);
      console.info(`[ItemSync] ${companySlug}: ${count} items synced`);
    } catch (err: any) {
      console.error(`[ItemSync] ${companySlug} failed:`, err.message);
    }
  }
}
