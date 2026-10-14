import { BlizzardService, type BlizzardConfig } from '../src/services/blizzard';

async function main() {
  const blizzard = new BlizzardService({
    region: 'eu',
    locale: 'en_US',
    namespace: 'dynamic-eu',
  } as BlizzardConfig);
  const meta = await blizzard.fetchItemMetadata(16204);
  console.log(JSON.stringify(meta, null, 2));
}

main().catch((err) => {
  console.error('err:', err.message);
  process.exit(1);
});