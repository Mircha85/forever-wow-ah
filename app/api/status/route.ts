import { NextResponse } from 'next/server';
import { BlizzardService } from '@/src/services/blizzard';
import { R2Service } from '@/src/services/r2';
import { CONNECTED_REALMS } from '@/src/data/itemsCatalog';

export function GET() {
  const blizzard = new BlizzardService();
  const r2 = new R2Service();
  const configured = blizzard.hasCredentials();

  return NextResponse.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    // "synthetic_forever" means no credentials → demo mode; everything else
    // means live Battle.net. The dashboard uses this to decide whether to
    // surface a visible "demo data" banner instead of silently feeding the
    // user plausible-sounding invented numbers.
    dataSource: configured ? 'blizzard_api' : 'synthetic_forever',
    services: {
      blizzardOAuth: {
        configured,
        namespace: blizzard.getNamespace(),
        region: blizzard.getRegion(),
        description: configured
          ? 'Live Battle.net API Client Active'
          : 'WoW: Forever Classic Mode Active (Simulated Production Ingestion)',
      },
      storage: {
        r2Active: r2.hasCloudflareR2(),
        type: r2.hasCloudflareR2() ? 'Cloudflare R2 Bucket (S3 API)' : 'In-Memory Ephemeral Engine',
      },
      binaryCodec: {
        spec: 'UNDR v1.0',
        magic: '0x554E4452',
        endianness: 'LITTLE_ENDIAN',
      },
    },
    realms: CONNECTED_REALMS,
  });
}
