import { NextRequest, NextResponse } from 'next/server';
import { BlizzardService } from '@/src/services/blizzard';
import { R2Service } from '@/src/services/r2';
import { AuctionAggregator } from '@/src/services/aggregator';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const connectedRealmId = Number(body.connectedRealmId) || 4401;

    const blizzard = new BlizzardService();
    const r2 = new R2Service();

    // Fetch snapshot
    const { snapshot, source } = await blizzard.fetchAuctionSnapshot(connectedRealmId);

    // Process & Aggregate in SQLite/in-memory, encode to binary, save to R2
    const result = await AuctionAggregator.processSnapshot(connectedRealmId, snapshot, r2);

    return NextResponse.json({
      success: true,
      source,
      result: {
        ...result,
        source: r2.hasCloudflareR2() ? 'Cloudflare R2 Bucket' : 'Fast Local/Memory Cache',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
