import { BinaryEncoder } from './encoder';
import { percentChange } from './historyStore';
import type {
  HistoryIndex,
  HistoryItemRecord,
  RealmArchiveIndex,
  RealmItemRecord,
} from './realmArchive';

/**
 * Composes the `UNDR v1` item blob the dashboard consumes, from the
 * canonical per-realm archives.
 *
 * The browser's decoder is unchanged: it still receives the same binary
 * layout it always received. What changed is where the bytes come from —
 * a per-item object that the pipeline had to write for every item of
 * every realm is now derived, on demand, from two objects per realm.
 *
 * Everything in the composed blob is measured. The price series comes from
 * the observation history; the 24 h delta comes from comparing two
 * observations about a day apart; when there is no second observation far
 * enough apart, the delta is left unmeasured rather than filled in.
 */

const HOUR_SEC = 3600;

/** How far from exactly 24 h a baseline may be and still count as one. */
const BASELINE_TOLERANCE_SEC = 2 * HOUR_SEC;

/**
 * Finds the observation about a day before the most recent one.
 *
 * Returns `null` when the history does not reach back that far — which is
 * the normal state for the first day after a deployment.
 */
export function findBaseline(
  historyItem: HistoryItemRecord | null
): { medianPrice: number; quantity: number } | null {
  if (!historyItem || historyItem.hourly.length === 0) return null;

  const latest = historyItem.hourly[historyItem.hourly.length - 1];
  const target = latest.timestamp - 24 * HOUR_SEC;

  let best: { medianPrice: number; quantity: number } | null = null;
  let closest = Number.POSITIVE_INFINITY;
  for (const point of historyItem.hourly) {
    const distance = Math.abs(point.timestamp - target);
    if (distance < closest) {
      closest = distance;
      best = { medianPrice: point.medianPrice, quantity: point.quantity };
    }
  }

  if (!best || closest > BASELINE_TOLERANCE_SEC) return null;
  return best;
}

/**
 * Builds the item blob for one item of one realm.
 *
 * Returns `null` when the item is not in the realm's archive, which is
 * the caller's signal to answer 404.
 */
export function composeItemBin(params: {
  realm: RealmArchiveIndex;
  item: RealmItemRecord;
  history: HistoryIndex | null;
  historyItem: HistoryItemRecord | null;
}): Buffer | null {
  const { realm, item, historyItem } = params;

  const baseline = findBaseline(historyItem);
  const priceDelta24h = baseline
    ? percentChange(item.medianPrice, baseline.medianPrice)
    : null;
  const quantityDelta24h = baseline
    ? percentChange(item.quantity, baseline.quantity)
    : null;

  return BinaryEncoder.encodeItem({
    itemId: item.itemId,
    connectedRealmId: realm.connectedRealmId,
    lastUpdated: realm.generatedAt,
    totalQuantity: item.quantity,
    numAuctions: item.numAuctions,
    minBuyout: item.minPrice,
    medianPrice: item.medianPrice,
    meanPrice: item.meanPrice,
    marketCap: item.marketCap,
    priceDelta24h,
    quantityDelta24h,
    // Only observed points are included. A point exists because a run saw
    // the item; there is no modelled series and no empty slots.
    dailyHistory: (historyItem?.daily ?? []).map((point) => ({
      timestamp: point.timestamp,
      minPrice: point.minPrice,
      medianPrice: point.medianPrice,
      meanPrice: point.meanPrice,
      quantity: point.quantity,
      numAuctions: point.numAuctions,
    })),
    hourlyDeltas: (historyItem?.hourly ?? []).map((point) => ({
      timestamp: point.timestamp,
      minPrice: point.minPrice,
      medianPrice: point.medianPrice,
      quantity: point.quantity,
    })),
    activeLots: item.lots,
  });
}
