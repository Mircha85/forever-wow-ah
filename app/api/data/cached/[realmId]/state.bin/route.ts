import { NextRequest, NextResponse } from 'next/server';
import { R2Service } from '@/src/services/r2';
import { BlizzardService } from '@/src/services/blizzard';
import { AuctionAggregator } from '@/src/services/aggregator';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ realmId: string }> }
) {
  try {
    const { realmId } = await params;
    const connectedRealmId = parseInt(realmId, 10) || 4401;
    const r2 = new R2Service();
    const stateKey = R2Service.generateStateKey(connectedRealmId);

    let buffer = await r2.getBin(stateKey);

    // If not cached yet, bootstrap snapshot immediately
    if (!buffer) {
      const blizzard = new BlizzardService();
      const { snapshot } = await blizzard.fetchAuctionSnapshot(connectedRealmId);
      await AuctionAggregator.processSnapshot(connectedRealmId, snapshot, r2);
      buffer = await r2.getBin(stateKey);
    }

    if (!buffer) {
      return new NextResponse('State data not available', { status: 404 });
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `inline; filename="state.bin"`,
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
        'X-WoW-AH-Codec': 'UNDR-v1',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(`Failed to retrieve state.bin: ${message}`, { status: 500 });
  }
}
