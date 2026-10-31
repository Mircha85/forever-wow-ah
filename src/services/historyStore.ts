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
    let baseline: Baseline | null = null;
    let closest = Number.POSITIVE_INFINITY;
    for (const point of hourly) {
      const distance = Math.abs(point.timestamp - baselineTs);
      if (distance < closest) {
        closest = distance;
        baseline = { medianPrice: point.medianPrice, quantity: point.quantity };
      }
    }
    // Only accept a baseline that is genuinely about a day old — a reading
    // from the same hour is not a 24 hour comparison.
    if (baseline && closest <= HOUR_SEC * 2) {
      baselines.set(observation.itemId, baseline);
    }

    merged.push({ itemId: observation.itemId, hourly, daily });
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
