import { type NextRequest, NextResponse } from 'next/server';
import { R2Service } from '@/src/services/r2';
import {
  badRequest,
  enforceRateLimit,
  parseRealmId,
} from '@/src/utils/apiGuard';

export interface RealmItemsEntry {
  id: number;
  shard: number;
}

/** 60 requests per minute per IP. */
const LIMIT = 60;
const WINDOW_MS = 60_000;

/**
 * Lists per-item blobs cached for a connected realm. Used by the
 * dashboard's multi-realm view to enumerate items per realm without
 * downloading each `state.bin` first.
 *
 * The sharded layout `data/cached/{region}/{realmId}/{itemId & 0xFF}/{itemId}.bin`
 * means a single realm can hold thousands of blobs across 256 shards; we
 * list each shard directory and extract the item id from the basename.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ region: string; connectedRealmId: string }> }
) {
  const limited = enforceRateLimit(req, 'realm-items', LIMIT, WINDOW_MS);
  if (limited) return limited;

  const { region, connectedRealmId: realmIdStr } = await params;

  if (region !== 'eu' && region !== 'us') {
    return badRequest('region must be "eu" or "us"');
  }

  const connectedRealmId = parseRealmId(realmIdStr);
  if (connectedRealmId === null) {
    return badRequest('connectedRealmId must be a positive integer');
  }

  try {
    const r2 = new R2Service();
    const realmPrefix = `data/cached/${region}/${connectedRealmId}/`;
    const { prefixes } = await r2.listKeys(realmPrefix, '/');

    const items: RealmItemsEntry[] = [];
    for (const prefix of prefixes) {
      const shardMatch = prefix.match(/^data\/cached\/[^/]+\/\d+\/(\d+)\/$/);
      if (!shardMatch) continue;
      const shard = Number(shardMatch[1]);
      const { keys } = await r2.listKeys(prefix);
      for (const key of keys) {
        const fileMatch = key.match(/\/(\d+)\.bin$/);
        if (!fileMatch) continue;
        items.push({ id: Number(fileMatch[1]), shard });
      }
    }

    items.sort((a, b) => a.id - b.id);

    return NextResponse.json({
      region,
      connectedRealmId,
      generatedAt: null,
      items,
    });
  } catch (err: unknown) {
    return new NextResponse(
      `Failed to list items: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500 }
    );
  }
}