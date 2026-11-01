import {
  ARCHIVE_VERSION,
  HISTORY_FORMAT,
  MAGIC_HISTORY,
} from '../utils/binaryFormat';

import {
  decodeHistory,
  readHistoryItem,
  type DailyPoint,
  type HourlyPoint,
  type HistoryIndex,
} from './realmArchive';

/**
 * The rolling observation history.
 *
 * Every ingestion run observes each listed item once. This module keeps
 * those observations so the dashboard can show a price series that was
 * actually measured, and so the 24 h delta compares two real observations
 * instead of two invented ones.
 *
 * Points are keyed by the start of the hour (respectively the day) they
 * were observed in, so a second observation inside the same hour replaces
 * the first rather than stacking next to it. Nothing is modelled: a point
 * exists only because a run observed it.
 */

/** Hourly observations kept per item — seven days. */
export const HOURLY_BUCKETS = 168;

/** Daily observations kept per item — fourteen days. */
export const DAILY_BUCKETS = 14;

/**
 * Byte budget for one realm's history archive.
 *
 * The archive is rewritten in full on every run and read back in full on
 * every run, so its size is multiplied by the number of runs a month. At
 * 175 realms on a 30-minute schedule that is 8 400 read-modify-write
 * cycles; every extra megabyte here is ~16 GB of traffic a month across
 * the fleet.
 *
 * Measured on a real realm: an item that stays listed accrues one
 * observation an hour, so the hourly series alone reaches 2.6 million
 * points — 7.4 MB compressed — and the fleet's traffic reaches ~145 GB a
 * month, past Vercel Hobby's 100 GB allowance.
 *
 * The budget makes that impossible. When the archive would exceed it, the
 * hourly series is trimmed first (keeping each item's 24-hour anchor, which
 * is what the price delta is computed from), then the daily series. In the
 * ordinary case — where an item is listed for a few hours at a time and
 * the series stays small — nothing is trimmed at all.
 */
export const HISTORY_RAW_BUDGET_BYTES = 8 * 1024 * 1024;

/** Hourly caps tried in order until the archive fits the budget. */
const HOURLY_CAPS = [168, 96, 48, 24, 12, 6, 2];

/** Daily caps tried in order once the hourly series is not enough. */
const DAILY_CAPS = [14, 7, 3, 0];

const HOUR_SEC = 3600;
const DAY_SEC = 86400;

/** One observation of an item at a point in time. */
export interface Observation {
  itemId: number;
  minPrice: number;
  medianPrice: number;
  meanPrice: number;
  quantity: number;
  numAuctions: number;
}

/**
 * The observation ~24 hours earlier, when the history is old enough to
 * have one. `null` means there was nothing to compare against.
 */
export interface Baseline {
  medianPrice: number;
  quantity: number;
}

export interface HistoryArchive {
  /** The encoded, uncompressed archive. */
  buffer: Buffer;
  /** itemId → the observation ~24 h earlier. */
  baselines: Map<number, Baseline>;
  /** Timestamp of the hour the current run was recorded in. */
  currentHourlyTs: number;
  /** Timestamp of the day the current run was recorded in. */
  currentDailyTs: number;
}

interface MergedItem {
  itemId: number;
  hourly: HourlyPoint[];
  daily: DailyPoint[];
  /**
   * Index of the observation closest to 24 hours before the current run —
   * the one the price delta is computed from. It is preserved even when
   * the series is trimmed, because without it the delta would silently
   * become unmeasurable.
   */
  anchorIndex: number;
}

/**
 * Byte size a history archive would have for a given set of caps.
 */
function estimateRawBytes(
  itemCount: number,
  hourlyCap: number,
  dailyCap: number
): number {
  const perItem =
    HISTORY_FORMAT.item.hourlyBase +
    (hourlyCap + 1) * HISTORY_FORMAT.hourlyEntrySize +
    dailyCap * HISTORY_FORMAT.dailyEntrySize;
  return itemCount * perItem;
}

/**
 * Picks the series lengths that keep the archive inside its budget.
 *
 * The hourly series is sacrificed first because the daily series is what
 * the 14-day chart draws, while the heat map degrades gracefully to a
 * shorter window.
 */
function chooseCaps(itemCount: number): { hourly: number; daily: number } {
  for (const hourly of HOURLY_CAPS) {
    for (const daily of DAILY_CAPS) {
      if (estimateRawBytes(itemCount, hourly, daily) <= HISTORY_RAW_BUDGET_BYTES) {
        return { hourly, daily };
      }
    }
  }
  return { hourly: HOURLY_CAPS[HOURLY_CAPS.length - 1], daily: DAILY_CAPS[DAILY_CAPS.length - 1] };
}

/**
 * Trims an item's series to the chosen caps, keeping the 24-hour anchor.
 */
function trimItem(item: MergedItem, hourlyCap: number, dailyCap: number): void {
  if (item.hourly.length > hourlyCap) {
    const anchor =
      item.anchorIndex >= 0 && item.anchorIndex < item.hourly.length
        ? item.hourly[item.anchorIndex]
        : null;
    const kept = item.hourly.slice(-hourlyCap);
    if (anchor && !kept.includes(anchor)) {
      kept.push(anchor);
      kept.sort((a, b) => a.timestamp - b.timestamp);
    }
    item.hourly = kept;
  }
  if (item.daily.length > dailyCap) {
    item.daily = item.daily.slice(-dailyCap);
  }
}

/**
 * Merges the current run's observations into the previous archive and
 * returns the new archive.
 */
export function buildHistoryArchive(params: {
  /** The previous archive, gzipped or not. `null` on the very first run. */
  previous: Buffer | null;
  observations: Observation[];
  connectedRealmId: number;
  generatedAt: number;
}): HistoryArchive {
  const { previous, observations, connectedRealmId, generatedAt } = params;

  const currentHourlyTs = Math.floor(generatedAt / HOUR_SEC) * HOUR_SEC;
  const currentDailyTs = Math.floor(generatedAt / DAY_SEC) * DAY_SEC;

  let previousIndex: HistoryIndex | null = null;
  if (previous) {
    try {
      previousIndex = decodeHistory(previous);
    } catch {
      // A previous archive we cannot read is treated as "no history". The
      // run still succeeds; it just starts collecting again.
      previousIndex = null;
    }
  }

  const merged: MergedItem[] = [];
  const baselines = new Map<number, Baseline>();

  for (const observation of observations) {
    const hourlyByTs = new Map<number, HourlyPoint>();
    const dailyByTs = new Map<number, DailyPoint>();

    // Carry the previous observations over.
    if (previousIndex) {
      const previousItem = readHistoryItem(previousIndex, observation.itemId);
      if (previousItem) {
        for (const point of previousItem.hourly) hourlyByTs.set(point.timestamp, point);
        for (const point of previousItem.daily) dailyByTs.set(point.timestamp, point);
      }
    }

    // Record this run's observation. It replaces anything already recorded
    // for the same hour or day — the later reading of the same window is
    // the closing state of that window.
    hourlyByTs.set(currentHourlyTs, {
      timestamp: currentHourlyTs,
      minPrice: observation.minPrice,
      medianPrice: observation.medianPrice,
      quantity: observation.quantity,
    });
    dailyByTs.set(currentDailyTs, {
      timestamp: currentDailyTs,
      minPrice: observation.minPrice,
      medianPrice: observation.medianPrice,
      meanPrice: observation.meanPrice,
      quantity: observation.quantity,
      numAuctions: observation.numAuctions,
    });

    const hourly = [...hourlyByTs.values()]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-HOURLY_BUCKETS);
    const daily = [...dailyByTs.values()]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-DAILY_BUCKETS);

    // The baseline is the observation closest to 24 hours before now. If
    // there is none, the delta is not measured yet.
    const baselineTs = currentHourlyTs - 24 * HOUR_SEC;
    let anchorIndex = -1;
    let closest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < hourly.length; i++) {
      const distance = Math.abs(hourly[i].timestamp - baselineTs);
      if (distance < closest) {
        closest = distance;
        anchorIndex = i;
      }
    }
    // Only accept a baseline that is genuinely about a day old — a reading
    // from the same hour is not a 24 hour comparison.
    if (anchorIndex >= 0 && closest <= HOUR_SEC * 2) {
      const point = hourly[anchorIndex];
      baselines.set(observation.itemId, {
        medianPrice: point.medianPrice,
        quantity: point.quantity,
      });
    } else {
      anchorIndex = -1;
    }

    merged.push({ itemId: observation.itemId, hourly, daily, anchorIndex });
  }

  // Trim the series to the budget. The 24-hour anchor of every item is
  // kept, so trimming shortens the charts without making the price delta
  // unmeasurable.
  const caps = chooseCaps(merged.length);
  for (const item of merged) {
    trimItem(item, caps.hourly, caps.daily);
  }

  const totalSize =
    HISTORY_FORMAT.headerSize +
    merged.reduce(
      (sum, item) =>
        sum +
        HISTORY_FORMAT.item.hourlyBase +
        item.hourly.length * HISTORY_FORMAT.hourlyEntrySize +
        item.daily.length * HISTORY_FORMAT.dailyEntrySize,
      0
    );
  const buffer = Buffer.alloc(totalSize);

  let offset = 0;
  buffer.writeUInt32LE(MAGIC_HISTORY, offset); offset += 4;
  buffer.writeUInt16LE(ARCHIVE_VERSION, offset); offset += 2;
  buffer.writeUInt16LE(0, offset); offset += 2; // Reserved
  buffer.writeUInt32LE(connectedRealmId, offset); offset += 4;
  buffer.writeUInt32LE(generatedAt, offset); offset += 4;
  buffer.writeUInt32LE(merged.length, offset); offset += 4;
  buffer.writeUInt32LE(0, offset); offset += 4; // Reserved
  buffer.writeUInt32LE(HOUR_SEC, offset); offset += 4;
  buffer.writeUInt32LE(DAY_SEC, offset); offset += 4;
  buffer.writeUInt32LE(HOURLY_BUCKETS, offset); offset += 4;
  buffer.writeUInt32LE(DAILY_BUCKETS, offset); offset += 4;
  buffer.writeUInt32LE(0, offset); offset += 4; // Reserved
  buffer.writeUInt32LE(0, offset); offset += 4; // Reserved

  for (const item of merged) {
    buffer.writeUInt32LE(item.itemId, offset); offset += 4;
    buffer.writeUInt16LE(item.hourly.length, offset); offset += 2;
    buffer.writeUInt16LE(item.daily.length, offset); offset += 2;

    for (const point of item.hourly) {
      buffer.writeUInt32LE(point.timestamp, offset); offset += 4;
      buffer.writeUInt32LE(point.minPrice, offset); offset += 4;
      buffer.writeUInt32LE(point.medianPrice, offset); offset += 4;
      buffer.writeUInt32LE(point.quantity, offset); offset += 4;
    }

    for (const point of item.daily) {
      buffer.writeUInt32LE(point.timestamp, offset); offset += 4;
      buffer.writeUInt32LE(point.minPrice, offset); offset += 4;
      buffer.writeUInt32LE(point.medianPrice, offset); offset += 4;
      buffer.writeUInt32LE(point.meanPrice, offset); offset += 4;
      buffer.writeUInt32LE(point.quantity, offset); offset += 4;
      buffer.writeUInt32LE(point.numAuctions, offset); offset += 4;
    }
  }

  return {
    buffer,
    baselines,
    currentHourlyTs,
    currentDailyTs,
  };
}

/**
 * Percentage change from `baseline` to `current`, or `null` when there is
 * no baseline to compare against.
 */
export function percentChange(current: number, baseline: number): number | null {
  if (!Number.isFinite(baseline) || baseline <= 0) return null;
  if (!Number.isFinite(current)) return null;
  return Math.round(((current - baseline) / baseline) * 1000) / 10;
}
