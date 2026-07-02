import 'dotenv/config';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const EMAIL    = process.env.ADMIN_EMAIL    ?? 'admin@convflow.io';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'convflow-admin-2024';
const NAME     = process.env.ADMIN_NAME     ?? 'ConvFlow Admin';

async function main() {
  const pool   = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });

  if (existing) {
    if (existing.role === 'super_admin') {
      console.log(`✓ Super admin already exists: ${EMAIL}`);
    } else {
      await prisma.user.update({ where: { email: EMAIL }, data: { role: 'super_admin' } });
      console.log(`✓ Promoted ${EMAIL} to super_admin`);
    }
  } else {
    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    const apiKey       = `cf_${crypto.randomBytes(30).toString('hex')}`;

    await prisma.user.create({
      data: { name: NAME, email: EMAIL, passwordHash, apiKey, role: 'super_admin' },
    });

    console.log(`✅ Created super admin`);
    console.log(`   Email:    ${EMAIL}`);
    console.log(`   Password: ${PASSWORD}`);
    console.log(`   ⚠  Change this password after first login.`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
