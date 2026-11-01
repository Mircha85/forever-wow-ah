import { R2Service } from './r2';
import type { BlizzardService } from './blizzard';

/**
 * The resolved display names of the realms the pipeline has ingested.
 *
 * A realm's name comes from Battle.net's connected-realm endpoint, which
 * is an upstream call against a shared API key. It used to be made from
 * `GET /api/realms` — a public route — which meant one anonymous request
 * could fan out into 175 upstream calls.
 *
 * The call moved here, to the bearer-gated ingestion path, and the result
 * is written to `names.json` for the public route to read.
 *
 * The name is resolved once per realm: after that the pipeline only reads
 * the file. A realm whose name cannot be resolved keeps its numeric id in
 * the listing, which is honest about being unresolved.
 */
export async function recordRealmName(params: {
  r2: R2Service;
  blizzard: BlizzardService;
  product: 'retail' | 'forever';
  region: 'eu' | 'us';
  connectedRealmId: number;
}): Promise<void> {
  const { r2, blizzard, product, region, connectedRealmId } = params;
  const key = R2Service.generateRealmNamesKey(product, region);

  const existing = await r2.getBin(key);
  let names: Record<string, string> = {};
  if (existing) {
    try {
      const parsed = JSON.parse(existing.toString('utf8')) as Record<string, string>;
      if (parsed && typeof parsed === 'object') names = parsed;
    } catch {
      names = {};
    }
  }

  if (names[String(connectedRealmId)]) return;

  let name: string | null = null;
  try {
    name = await blizzard.fetchConnectedRealmName(connectedRealmId);
  } catch {
    name = null;
  }
  if (!name) return;

  names[String(connectedRealmId)] = name;
  await r2.uploadBin(key, Buffer.from(JSON.stringify(names), 'utf8'));
}
