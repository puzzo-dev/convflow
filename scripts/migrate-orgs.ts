import 'dotenv/config';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

// Backfill: create one Organization per current bot owner, move their bots into
// it, and add an org-owner membership. Orphan bots (no owner membership — e.g.
// config-seeded tenants) go to a single "Default" organization.

function slugify(base: string): string {
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
    + '-' + crypto.randomBytes(2).toString('hex');
}

async function main() {
  const pool   = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const bots = await prisma.tenant.findMany({ select: { id: true, name: true, organizationId: true } });
  const owners = await prisma.tenantMembership.findMany({
    where: { role: 'owner' },
    include: { user: { select: { id: true, name: true } } },
  });

  // Map each owner user → the org we create for them.
  const orgByUser = new Map<string, string>();

  for (const m of owners) {
    if (!orgByUser.has(m.userId)) {
      const org = await prisma.organization.create({
        data: { name: `${m.user.name}'s Organization`, slug: slugify(m.user.name) },
      });
      orgByUser.set(m.userId, org.id);
      await prisma.organizationMembership.create({
        data: { userId: m.userId, orgId: org.id, role: 'owner' },
      });
      console.log(`✓ Org for ${m.user.name} (${org.slug})`);
    }
    // Move this owner's bot into their org (if not already assigned).
    const orgId = orgByUser.get(m.userId)!;
    await prisma.tenant.update({ where: { id: m.tenantId }, data: { organizationId: orgId } });
  }

  // Orphan bots (no org yet) → a shared Default org.
  const orphans = await prisma.tenant.findMany({ where: { organizationId: null }, select: { id: true, name: true } });
  if (orphans.length) {
    let def = await prisma.organization.findFirst({ where: { slug: { startsWith: 'default-' } } });
    if (!def) def = await prisma.organization.create({ data: { name: 'Default Organization', slug: slugify('default') } });
    for (const b of orphans) {
      await prisma.tenant.update({ where: { id: b.id }, data: { organizationId: def.id } });
    }
    // Give any super admin owner access to the default org.
    const admin = await prisma.user.findFirst({ where: { role: 'super_admin' } });
    if (admin) {
      await prisma.organizationMembership.upsert({
        where:  { userId_orgId: { userId: admin.id, orgId: def.id } },
        update: {},
        create: { userId: admin.id, orgId: def.id, role: 'owner' },
      });
    }
    console.log(`✓ Moved ${orphans.length} orphan bot(s) into Default org`);
  }

  const orgCount = await prisma.organization.count();
  console.log(`\n✅ Done. ${bots.length} bots processed, ${orgCount} organizations exist.`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
