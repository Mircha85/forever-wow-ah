import { NextResponse } from 'next/server';
import { BlizzardService } from '@/src/services/blizzard';
import { R2Service } from '@/src/services/r2';
import { CONNECTED_REALMS } from '@/src/data/itemsCatalog';

export function GET() {
  const blizzard = new BlizzardService();
  const r2 = new R2Service();

  return NextResponse.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    services: {
      blizzardOAuth: {
        configured: blizzard.hasCredentials(),
        description: blizzard.hasCredentials()
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
