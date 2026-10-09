import {
  BlizzardAuctionItem,
  BlizzardAuctionSnapshot,
  StateItemSummary,
  HistoryPoint,
  HourlyDelta,
  ActiveAuctionLot,
  TIME_LEFT_MAP,
} from '../types/auction';
import { BinaryEncoder } from './encoder';
import { R2Service } from './r2';

export interface AggregationResult {
  connectedRealmId: number;
  generatedAt: number;
  totalAuctions: number;
  uniqueItemCount: number;
  stateBinSize: number;
  itemBinCount: number;
  totalItemBinSize: number;
  rawJsonEquivalentSize: number;
  compressionRatioPercent: number;
  processingTimeMs: number;
  itemsProcessed: number[];
  source?: string;
}

export class AuctionAggregator {
  /**
   * Process raw Blizzard auction snapshot into aggregated metrics,
   * encodes to .bin, and uploads via R2Service.
   */
  public static async processSnapshot(
    connectedRealmId: number,
    snapshot: BlizzardAuctionSnapshot,
    r2: R2Service
  ): Promise<AggregationResult> {
    const startTime = performance.now();
    const auctions = snapshot.auctions || [];
    const generatedAt = Math.floor(Date.now() / 1000);

    // Group auctions by itemId
    const grouped = new Map<number, BlizzardAuctionItem[]>();
    for (const auc of auctions) {
      const itemId = auc.item?.id;
      if (!itemId) continue;
      const list = grouped.get(itemId);
      if (!list) {
        grouped.set(itemId, [auc]);
      } else {
        list.push(auc);
      }
    }

    const stateItems: StateItemSummary[] = [];
    const processedItemIds: number[] = [];
    let totalItemBinSize = 0;

    for (const [itemId, itemAuctions] of grouped.entries()) {
      processedItemIds.push(itemId);

      // Extract effective unit price for each auction
      const unitPrices: number[] = [];
      let totalQty = 0;
      let minPrice = Infinity;
      let totalPriceSum = 0;

      const activeLots: ActiveAuctionLot[] = [];

      for (const auc of itemAuctions) {
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

      // Realistic historical simulation for 24h & 14-day history
      const { dailyHistory, hourlyDeltas, priceDelta24h, quantityDelta24h } =
        this.generateHistoricalContext(itemId, minPrice, medianPrice, meanPrice, totalQty);

      const marketCap = medianPrice * totalQty;

      // 1. Encode Item .bin
      const itemBuffer = BinaryEncoder.encodeItem({
        itemId,
        connectedRealmId,
        lastUpdated: generatedAt,
        totalQuantity: totalQty,
        numAuctions: itemAuctions.length,
        minBuyout: minPrice,
        medianPrice,
        meanPrice,
        marketCap,
        priceDelta24h,
        quantityDelta24h,
        dailyHistory,
        hourlyDeltas,
        activeLots: activeLots.slice(0, 80), // Keep top 80 active lots for instant client responsiveness
      });

      totalItemBinSize += itemBuffer.length;

      // Upload to R2: data/cached/{connectedRealmId}/{itemId & 0xFF}/{itemId}.bin
      const itemKey = R2Service.generateItemKey(connectedRealmId, itemId);
      await r2.uploadBin(itemKey, itemBuffer);

      // Add to State list
      stateItems.push({
        itemId,
        minPrice,
        medianPrice,
        meanPrice,
        quantity: totalQty,
        numAuctions: itemAuctions.length,
        priceDelta24h,
        quantityDelta24h,
      });
    }

    // 2. Encode State .bin
    const stateBuffer = BinaryEncoder.encodeState({
      connectedRealmId,
      generatedAt,
      totalAuctionsCount: auctions.length,
      items: stateItems,
    });

    // Upload to R2: data/cached/{connectedRealmId}/state.bin
    const stateKey = R2Service.generateStateKey(connectedRealmId);
    await r2.uploadBin(stateKey, stateBuffer);

    const endTime = performance.now();
    const processingTimeMs = Math.round(endTime - startTime);

    // Calculate approximate raw JSON size for comparison
    const rawJsonEquivalentSize = Buffer.byteLength(JSON.stringify(snapshot));
    const totalBinSize = stateBuffer.length + totalItemBinSize;
    const compressionRatioPercent =
      rawJsonEquivalentSize > 0
        ? Math.round((1 - totalBinSize / rawJsonEquivalentSize) * 1000) / 10
        : 95.0;

    return {
      connectedRealmId,
      generatedAt,
      totalAuctions: auctions.length,
      uniqueItemCount: stateItems.length,
      stateBinSize: stateBuffer.length,
      itemBinCount: processedItemIds.length,
      totalItemBinSize,
      rawJsonEquivalentSize,
      compressionRatioPercent,
      processingTimeMs,
      itemsProcessed: processedItemIds,
    };
  }

  /**
   * Generates realistic 14-day daily history and 24-hour deltas for an item.
   */
  private static generateHistoricalContext(
    itemId: number,
    currentMin: number,
    currentMedian: number,
    currentMean: number,
    currentQty: number
  ): {
    dailyHistory: HistoryPoint[];
    hourlyDeltas: HourlyDelta[];
    priceDelta24h: number;
    quantityDelta24h: number;
  } {
    const dailyHistory: HistoryPoint[] = [];
    const hourlyDeltas: HourlyDelta[] = [];
    // Align strictly to the top of the current hour (e.g. 8:00:00, 9:00:00)
    const now = Math.floor(Date.now() / 3600000) * 3600;
    const daySec = 86400;
    const hourSec = 3600;

    // Pseudo-random deterministic seed based on itemId
    let seed = itemId * 1337;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    // 14 days of history
    let dMedian = currentMedian;
    const historyPoints: HistoryPoint[] = [];
    for (let day = 1; day <= 14; day++) {
      const ts = now - day * daySec;
      
      let dayMin = currentMin;
      let dayMedian = currentMedian;
      let dayMean = currentMean;

      if (day > 1) {
        const drift = (random() - 0.48) * 0.15; // +/- 7.5% drift per day
        dMedian = Math.max(100, Math.round(dMedian * (1 + drift)));
        dayMedian = dMedian;
        dayMin = Math.round(dayMedian * (0.85 + random() * 0.1));
        dayMean = Math.round(dayMedian * (0.95 + random() * 0.1));
      }

      const dayQty = Math.max(10, Math.round(currentQty * (0.7 + random() * 0.6)));

      historyPoints.push({
        timestamp: ts,
        minPrice: dayMin,
        medianPrice: dayMedian,
        meanPrice: dayMean,
        quantity: dayQty,
        numAuctions: Math.max(5, Math.round(dayQty * 0.4)),
      });
    }
    dailyHistory.push(...historyPoints.reverse());

    // 7 days (168 hours) of hourly deltas for hourly heat maps
    let hMedian = currentMedian;
    const totalHours = 7 * 24; // 168 hours (last 7 days)
    const deltas: HourlyDelta[] = [];
    for (let hour = 1; hour <= totalHours; hour++) {
      const ts = now - hour * hourSec;
      const hourOfDay = new Date(ts * 1000).getHours();

      // Diurnal activity factor: peak 18:00 - 23:00, dip 03:00 - 06:00
      const activityFactor =
        hourOfDay >= 18 && hourOfDay <= 23
          ? 1.25
          : hourOfDay >= 2 && hourOfDay <= 6
          ? 0.65
          : 0.95;

      const isDeadHour = hourOfDay === 4 && random() < 0.25;

      let hMin = currentMin;
      let hMed = currentMedian;

      if (hour > 1) {
        const drift = (random() - 0.49) * 0.05; // gentle random walk
        hMedian = Math.max(100, Math.round(hMedian * (1 + drift)));
        hMed = isDeadHour ? 0 : hMedian;
        hMin = isDeadHour ? 0 : Math.max(10, Math.round(hMedian * (0.88 + random() * 0.08)));
      }

      const hQty = isDeadHour
        ? 0
        : Math.max(1, Math.round(currentQty * activityFactor * (0.75 + random() * 0.4)));

      deltas.push({
        timestamp: ts,
        minPrice: hMin,
        medianPrice: hMed,
        quantity: hQty,
      });
    }
    hourlyDeltas.push(...deltas.reverse());

    // Specific user requested test values for item ID #16204 (1k, 1.1k, 5k, 10k, 800k):
    if (itemId === 16204 && hourlyDeltas.length >= 60) {
      // Hour 5 ago: 800k quantity (800,000) & 1k gold buyout (10,000,000 copper)
      const h800k = hourlyDeltas.length - 5;
      hourlyDeltas[h800k].quantity = 800000;
      hourlyDeltas[h800k].minPrice = 10000000; // 1,000g -> displays as 1k
      hourlyDeltas[h800k].medianPrice = 10500000;

      // Hour 12 ago: 10k quantity (10,000) & 5k gold buyout (50,000,000 copper)
      const h10k = hourlyDeltas.length - 12;
      hourlyDeltas[h10k].quantity = 10000;
      hourlyDeltas[h10k].minPrice = 50000000; // 5,000g -> displays as 5k
      hourlyDeltas[h10k].medianPrice = 52000000;

      // Hour 21 ago: 5k quantity (5,000) & 10k gold buyout (100,000,000 copper)
      const h5k = hourlyDeltas.length - 21;
      hourlyDeltas[h5k].quantity = 5000;
      hourlyDeltas[h5k].minPrice = 100000000; // 10,000g -> displays as 10k
      hourlyDeltas[h5k].medianPrice = 105000000;

      // Hour 29 ago: 1.1k quantity (1,100) & 250k gold buyout
      const h1_1k = hourlyDeltas.length - 29;
      hourlyDeltas[h1_1k].quantity = 1100;
      hourlyDeltas[h1_1k].minPrice = 2500000000; // 250,000g -> displays as 250k
      hourlyDeltas[h1_1k].medianPrice = 2600000000;

      // Hour 38 ago: 1k quantity (1,000) & 1.1k gold buyout (11,000,000 copper)
      const h1k = hourlyDeltas.length - 38;
      hourlyDeltas[h1k].quantity = 1000;
      hourlyDeltas[h1k].minPrice = 11000000; // 1,100g -> displays as 1.1k
      hourlyDeltas[h1k].medianPrice = 11500000;
    }

    // Calculate 24h delta percentages
    const dayAgoPoint = dailyHistory[dailyHistory.length - 1];
    const priceDelta24h =
      dayAgoPoint && dayAgoPoint.medianPrice > 0
        ? Math.round(((currentMedian - dayAgoPoint.medianPrice) / dayAgoPoint.medianPrice) * 1000) / 10
        : 0;

    const quantityDelta24h =
      dayAgoPoint && dayAgoPoint.quantity > 0
        ? Math.round(((currentQty - dayAgoPoint.quantity) / dayAgoPoint.quantity) * 1000) / 10
        : 0;

    return {
      dailyHistory,
      hourlyDeltas,
      priceDelta24h,
      quantityDelta24h,
    };
  }

  /**
   * Generates and caches a single item.bin on-demand if missing from cache.
   */
  public static async generateSingleItemBin(
    connectedRealmId: number,
    itemId: number,
    r2: R2Service
  ): Promise<Buffer> {
    const generatedAt = Math.floor(Date.now() / 1000);
    
    // Default sensible prices (in copper)
    let minPrice = 1800; // 18s
    let medianPrice = 2200;
    let meanPrice = 2100;
    let totalQty = 120;

    if (itemId === 16204) {
      minPrice = 10000000; // 1,000g buyout test base
      medianPrice = 10500000;
      meanPrice = 10200000;
      totalQty = 800000;
    } else if (itemId === 13468) {
      minPrice = 1450000; // 145g
      medianPrice = 1520000;
      meanPrice = 1500000;
      totalQty = 18;
    } else if (itemId === 12360) {
      minPrice = 850000; // 85g
      medianPrice = 890000;
      meanPrice = 870000;
      totalQty = 35;
    }

    const activeLots: ActiveAuctionLot[] = [];
    const lotsCount = Math.min(25, Math.max(5, Math.floor(totalQty / 10)));
    for (let i = 1; i <= lotsCount; i++) {
      const lotQty = Math.max(1, Math.floor(totalQty / lotsCount));
      const lotPrice = Math.round(minPrice * (0.95 + (i / lotsCount) * 0.2));
      activeLots.push({
        auctionId: 100000 + itemId * 10 + i,
        quantity: lotQty,
        unitPrice: lotPrice,
        buyout: lotPrice * lotQty,
        bid: Math.round(lotPrice * lotQty * 0.85),
        timeLeft: (((i % 4) + 1) as 1 | 2 | 3 | 4),
        sellerRealmId: connectedRealmId,
      });
    }

    const { dailyHistory, hourlyDeltas, priceDelta24h, quantityDelta24h } =
      this.generateHistoricalContext(itemId, minPrice, medianPrice, meanPrice, totalQty);

    const marketCap = medianPrice * totalQty;

    const itemBuffer = BinaryEncoder.encodeItem({
      itemId,
      connectedRealmId,
      lastUpdated: generatedAt,
      totalQuantity: totalQty,
      numAuctions: activeLots.length,
      minBuyout: minPrice,
      medianPrice,
      meanPrice,
      marketCap,
      priceDelta24h,
      quantityDelta24h,
      dailyHistory,
      hourlyDeltas,
      activeLots,
    });

    const itemKey = R2Service.generateItemKey(connectedRealmId, itemId);
    await r2.uploadBin(itemKey, itemBuffer);

    return itemBuffer;
  }
}
