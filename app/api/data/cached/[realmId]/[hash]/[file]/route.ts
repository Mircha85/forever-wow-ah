import { NextRequest, NextResponse } from 'next/server';
import { R2Service } from '@/src/services/r2';
import { BlizzardService } from '@/src/services/blizzard';
import { AuctionAggregator } from '@/src/services/aggregator';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ realmId: string; hash: string; file: string }> }
) {
  try {
    const { realmId, file } = await params;
    const connectedRealmId = parseInt(realmId, 10) || 4401;
    // Strip .bin if present
    const cleanId = file.replace(/\.bin$/i, '');
    const itemId = parseInt(cleanId, 10);

    if (isNaN(itemId)) {
      return new NextResponse('Invalid itemId parameter', { status: 400 });
    }

    const r2 = new R2Service();
    const itemKey = R2Service.generateItemKey(connectedRealmId, itemId);

    let buffer = await r2.getBin(itemKey);

    // If item not cached yet, bootstrap realm snapshot
    if (!buffer) {
      try {
        const blizzard = new BlizzardService();
        const { snapshot } = await blizzard.fetchAuctionSnapshot(connectedRealmId);
        await AuctionAggregator.processSnapshot(connectedRealmId, snapshot, r2);
        buffer = await r2.getBin(itemKey);
      } catch (e) {
        console.warn(`[API] Snapshot processing fallback for item #${itemId}:`, e);
      }
    }

    // If still not present in buffer, generate single item record directly on-demand
    if (!buffer) {
      buffer = await AuctionAggregator.generateSingleItemBin(connectedRealmId, itemId, r2);
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `inline; filename="${itemId}.bin"`,
        'Cache-Control': 'public, max-age=900, stale-while-revalidate=1800',
        'X-WoW-AH-Codec': 'UNDR-v1',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(`Failed to retrieve item.bin: ${message}`, { status: 500 });
  }
}
