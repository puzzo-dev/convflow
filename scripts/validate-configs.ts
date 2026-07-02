import { loadAllConfigs } from '../src/config/loader';

async function main() {
  try {
    const configs = await loadAllConfigs();
    if (configs.length === 0) {
      console.log('No company configs found to validate.');
      return;
    }
    for (const config of configs) {
      console.log(`✅ ${config.slug} — ${config.flows.length} stage(s)`);
    }
    console.log(`\nValidated ${configs.length} config(s) successfully.`);
  } catch (err: any) {
    console.error('❌ Config validation failed:', err.message);
    process.exit(1);
  }
}

main();
