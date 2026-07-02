import { CompanyConfig, FlowStage, TerminalStageType } from '../types';
import { prisma } from '../store/prisma';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const TERMINAL_TYPES: TerminalStageType[] = [
  'save_lead', 'create_order', 'notify_only', 'send_info', 'book_appointment', 'webhook'
];

function findProjectRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export async function loadAllConfigs(): Promise<CompanyConfig[]> {
  const dir = path.resolve(findProjectRoot(), 'companies');
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.config.ts') || f.endsWith('.config.js'));
  const configs: CompanyConfig[] = [];

  for (const file of files) {
    const mod = await import(path.join(dir, file));
    const config = mod.default as CompanyConfig;
    validateConfig(config);
    configs.push(config);
  }
  return configs;
}

export async function seedTenants(configs: CompanyConfig[]): Promise<void> {
  for (const config of configs) {
    await prisma.tenant.upsert({
      where: { slug: config.slug },
      update: {
        name: config.name,
        openwaSessionId: config.openwaSessionId,
        ownerPhone: config.ownerPhone,
        configJson: config as unknown as object,
        updatedAt: new Date(),
      },
      create: {
        slug: config.slug,
        name: config.name,
        openwaSessionId: config.openwaSessionId,
        ownerPhone: config.ownerPhone,
        configJson: config as unknown as object,
      }
    });
  }
  console.log(`✅ Seeded ${configs.length} tenant(s)`);
}

export function validateConfig(config: CompanyConfig): void {
  if (!config.slug)            throw new Error('Config missing slug');
  if (!config.openwaSessionId) throw new Error(`${config.slug}: missing openwaSessionId`);
  if (!config.flows?.length)   throw new Error(`${config.slug}: flows array is empty`);

  config.flows.forEach((f, i) => {
    if (f.stage !== i) throw new Error(`${config.slug}: stage mismatch at index ${i} (got ${f.stage})`);
  });

  const last = config.flows[config.flows.length - 1];
  if (!TERMINAL_TYPES.includes(last.type as TerminalStageType)) {
    throw new Error(`${config.slug}: last flow stage must be a terminal type. Got: ${last.type}`);
  }

  if (!last.terminal) {
    throw new Error(`${config.slug}: terminal stage "${last.id}" is missing terminal config`);
  }
}
