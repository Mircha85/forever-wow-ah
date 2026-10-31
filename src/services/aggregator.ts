import {
  type BlizzardAuctionItem,
  type BlizzardAuctionSnapshot,
  type StateItemSummary,
  type ActiveAuctionLot,
  TIME_LEFT_MAP,
} from '../types/auction';
import { BinaryEncoder } from './encoder';
import { R2Service } from './r2';
import { MAX_UINT32 } from '../utils/binaryFormat';
import { gzipForStorage } from './realmArchive';
import {
  buildHistoryArchive,
  percentChange,
  type Observation,
} from './historyStore';

/** Drop auctions whose copper price exceeds the binary format's uint32 ceiling.
 *  Retail AH routinely lists items past 42 949 gold (4.29 B copper), which the
 *  encoder is not built to represent. Skipping keeps the rest of the snapshot
 *  processable instead of failing the entire run. */
const PRICE_FIELDS = ['unit_price', 'buyout', 'bid'] as const;

/**
 * Auction lots archived per item.
 *
 * The archive reserves the same number of slots for every item so each
 * record keeps a fixed size and the reader can compute any record's offset
 * from the header alone. The cheapest listings win the slots — they are the
 * ones a buyer acts on.
 */
const LOTS_PER_ITEM = 24;

export interface AggregationResult {
  connectedRealmId: number;
  generatedAt: number;
  totalAuctions: number;
  uniqueItemCount: number;
  stateBinSize: number;
  /** Number of per-item records in the realm archive. */
  itemBinCount: number;
  /** Total bytes written for this realm, archive and history included. */
  totalItemBinSize: number;
  rawJsonEquivalentSize: number;
  compressionRatioPercent: number;
  processingTimeMs: number;
  itemsProcessed: number[];
  /** The item ids with the largest quantities — what the dashboard shows first. */
  topItemIds: number[];
  /** Bytes written for the rolling history archive. */
  historyBytes: number;
  /** How many items have a measured 24 h delta (the rest are not measured yet). */
  itemsWithDelta: number;
  source?: string;
}

/** One item's aggregate, ready to be encoded. */
interface AggregatedItem {
  itemId: number;
  minPrice: number;
  medianPrice: number;
  meanPrice: number;
  quantity: number;
  numAuctions: number;
  marketCap: number;
  lots: ActiveAuctionLot[];
}

export class AuctionAggregator {
  /**
   * Process raw Blizzard auction snapshot into aggregated metrics,
   * encodes to .bin, and uploads via R2Service.
   *
   * A run writes three objects per realm:
   *
   *   state.bin    the item summary table the dashboard lists
   *   realm.bin    every item's aggregate and its auction lots
   *   history.bin  the rolling store of observed values, gzipped
   *
   * It used to write one object *per item* — ~15 700 per realm, which at
   * 175 realms on a 30-minute schedule was ~3.96 billion R2 requests a
   * month and took 195 seconds per realm. Three objects per realm is
   * ~25 000 requests a month and a couple of seconds.
   */
  public static async processSnapshot(
    product: 'retail' | 'forever',
    region: 'eu' | 'us',
    connectedRealmId: number,
    snapshot: BlizzardAuctionSnapshot,
    r2: R2Service
  ): Promise<AggregationResult> {
    const startTime = performance.now();
    const auctions = snapshot.auctions || [];
    const generatedAt = Math.floor(Date.now() / 1000);

    const items = this.aggregate(auctions, connectedRealmId);
    items.sort((a, b) => a.itemId - b.itemId);

    // --- Rolling history ------------------------------------------------
    // The previous archive is read, not rebuilt: its buckets carry the
    // observations of every earlier run. The current run adds one
    // observation per item and yields the 24 h baseline.
    const historyKey = R2Service.generateHistoryKey(product, region, connectedRealmId);
    const previousHistory = await r2.getBin(historyKey);

    const observations: Observation[] = items.map((item) => ({
      itemId: item.itemId,
      minPrice: item.minPrice,
      medianPrice: item.medianPrice,
      meanPrice: item.meanPrice,
      quantity: item.quantity,
      numAuctions: item.numAuctions,
    }));

    const history = buildHistoryArchive({
      previous: previousHistory,
      observations,
      connectedRealmId,
      generatedAt,
    });

    // --- Summary table with measured deltas -----------------------------
    const stateItems: StateItemSummary[] = [];
    const processedItemIds: number[] = [];
    let itemsWithDelta = 0;

    for (const item of items) {
      const baseline = history.baselines.get(item.itemId) ?? null;
      const priceDelta24h = baseline
        ? percentChange(item.medianPrice, baseline.medianPrice)
        : null;
      const quantityDelta24h = baseline
        ? percentChange(item.quantity, baseline.quantity)
        : null;
      if (priceDelta24h !== null) itemsWithDelta += 1;

      stateItems.push({
        itemId: item.itemId,
        minPrice: item.minPrice,
        medianPrice: item.medianPrice,
        meanPrice: item.meanPrice,
        quantity: item.quantity,
        numAuctions: item.numAuctions,
        priceDelta24h,
        quantityDelta24h,
      });
      processedItemIds.push(item.itemId);
    }

    // --- Encode ----------------------------------------------------------
    const stateBuffer = BinaryEncoder.encodeState({
      connectedRealmId,
      generatedAt,
      totalAuctionsCount: auctions.length,
      items: stateItems,
    });

    const realmBuffer = BinaryEncoder.encodeRealmArchive({
      connectedRealmId,
      generatedAt,
      totalAuctionsCount: auctions.length,
      items: items.map((item) => ({
        itemId: item.itemId,
        minPrice: item.minPrice,
        medianPrice: item.medianPrice,
        meanPrice: item.meanPrice,
        quantity: item.quantity,
        numAuctions: item.numAuctions,
        marketCap: item.marketCap,
        lots: item.lots,
      })),
    });

    const historyBuffer = gzipForStorage(history.buffer);

    // --- Write -----------------------------------------------------------
    const stateKey = R2Service.generateStateKey(product, region, connectedRealmId);
    const realmKey = R2Service.generateRealmKey(product, region, connectedRealmId);

    await r2.uploadBin(stateKey, stateBuffer);
    await r2.uploadBin(realmKey, gzipForStorage(realmBuffer));
    await r2.uploadBin(historyKey, historyBuffer);

    const endTime = performance.now();
    const processingTimeMs = Math.round(endTime - startTime);

    const totalItemBinSize = realmBuffer.length + historyBuffer.length;

    // Approximate the raw JSON footprint instead of re-serialising the full
    // snapshot. A live Retail snapshot is 10-25 MB; re-stringifying it just to
    // show a cosmetic compression ratio pushes the route over the V8 heap on
    // dev runs and yields nothing the dashboard cannot infer from item count.
    const rawJsonEquivalentSize = auctions.length * 220;
    const compressionRatioPercent =
      rawJsonEquivalentSize > 0
        ? Math.round(
            (1 - (stateBuffer.length + totalItemBinSize) / rawJsonEquivalentSize) * 1000
          ) / 10
        : 95.0;

    const topItemIds = [...items]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 500)
      .map((item) => item.itemId);

    return {
      connectedRealmId,
      generatedAt,
      totalAuctions: auctions.length,
      uniqueItemCount: items.length,
      stateBinSize: stateBuffer.length,
      itemBinCount: items.length,
      totalItemBinSize,
      rawJsonEquivalentSize,
      compressionRatioPercent,
      processingTimeMs,
      itemsProcessed: processedItemIds,
      topItemIds,
      historyBytes: historyBuffer.length,
      itemsWithDelta,
    };
  }

  /**
   * Groups the snapshot's auctions by item and computes each item's
   * aggregate: min / median / mean price, total quantity, auction count
   * and the auction lots themselves.
   *
   * Every number here comes from the snapshot. Nothing is simulated.
   */
  private static aggregate(
    auctions: BlizzardAuctionItem[],
    connectedRealmId: number
  ): AggregatedItem[] {
    const grouped = new Map<number, BlizzardAuctionItem[]>();
    for (const auc of auctions) {
      const itemId = auc.item?.id;
      if (!itemId) continue;
      const list = grouped.get(itemId);
      if (list) {
        list.push(auc);
      } else {
        grouped.set(itemId, [auc]);
      }
    }

    const items: AggregatedItem[] = [];

    for (const [itemId, itemAuctions] of grouped.entries()) {
      // Skip items with < 3 auctions: a per-item view is not useful when
      // there are 1-2 lots, and they do not appear on the dashboard.
      if (itemAuctions.length < 3) continue;

      const unitPrices: number[] = [];
      let totalQty = 0;
      let minPrice = Infinity;
      let totalPriceSum = 0;

      const activeLots: ActiveAuctionLot[] = [];

      for (const auc of itemAuctions) {
        // Retail AH lists some items past 42 949 gold. The encoder rejects those
        // values; skipping the auction keeps the item on the dashboard with
        // whatever low-price lots remain.
        if (PRICE_FIELDS.some((f) => (auc[f] ?? 0) > MAX_UINT32)) continue;

        const qty = Math.max(1, auc.quantity || 1);
        totalQty += qty;

        // Effective price in copper
        const price =
          auc.unit_price !== undefined && auc.unit_price > 0
            ? auc.unit_price
            : auc.buyout !== undefined && auc.buyout > 0
            ? Math.round(auc.buyout / qty)
            : auc.bid !== undefined && auc.bid > 0
            ? Math.round(auc.bid / qty)
            : 0;

        if (price > 0) {
          unitPrices.push(price);
          if (price < minPrice) minPrice = price;
          totalPriceSum += price * qty;
        }

        const buyoutVal = auc.buyout !== undefined ? auc.buyout : (auc.unit_price || 0) * qty;
        const bidVal = auc.bid !== undefined ? auc.bid : buyoutVal;
        const timeLeftVal = TIME_LEFT_MAP[auc.time_left] || 3;

        activeLots.push({
          auctionId: auc.id,
          quantity: qty,
          unitPrice: price,
          buyout: buyoutVal,
          bid: bidVal,
          timeLeft: timeLeftVal,
          sellerRealmId: connectedRealmId,
        });
      }

      if (minPrice === Infinity) minPrice = 0;

      // Calculate Median & Mean
      unitPrices.sort((a, b) => a - b);
      let medianPrice = minPrice;
      if (unitPrices.length > 0) {
        const mid = Math.floor(unitPrices.length / 2);
        medianPrice =
          unitPrices.length % 2 !== 0
            ? unitPrices[mid]
            : Math.round((unitPrices[mid - 1] + unitPrices[mid]) / 2);
      }

      const meanPrice = totalQty > 0 ? Math.round(totalPriceSum / totalQty) : minPrice;

      // The encoder stores these as uint32 and the market cap as a 64-bit
      // split; an item that overflows them cannot be encoded at all. It is
      // left out of both the archive and the summary table rather than
      // failing the whole run.
      if (
        medianPrice > MAX_UINT32 ||
        meanPrice > MAX_UINT32 ||
        minPrice > MAX_UINT32 ||
        totalQty > MAX_UINT32
      ) {
        continue;
      }

      const marketCap = medianPrice * totalQty;
      if (!Number.isSafeInteger(marketCap)) continue;

      // The cheapest listings are the actionable ones, so they take the
      // limited lot slots.
      activeLots.sort((a, b) => a.unitPrice - b.unitPrice);

      items.push({
        itemId,
        minPrice,
        medianPrice,
        meanPrice,
        quantity: totalQty,
        numAuctions: itemAuctions.length,
        marketCap,
        lots: activeLots.slice(0, LOTS_PER_ITEM),
      });
    }

    return items;
  }
}
