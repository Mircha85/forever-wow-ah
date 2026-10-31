import { gunzipSync, gzipSync } from 'node:zlib';

import {
  type ActiveAuctionLot,
  type TimeLeftCode,
} from '../types/auction';
import {
  ARCHIVE_VERSION,
  HISTORY_FORMAT,
  MAGIC_HISTORY,
  MAGIC_REALM,
  REALM_FORMAT,
} from '../utils/binaryFormat';

/**
 * Server-side reader for the two canonical per-realm archives.
 *
 * The browser never sees these. It sees a composed `UNDR v1` item blob,
 * exactly as it always did — the change is that the item blob is now
 * *derived* from a small number of per-realm objects instead of being
 * stored once per item.
 *
 * Both archives are stored gzipped. The history archive is the larger of
 * the two and compresses well (most records hold a handful of points),
 * and gzipping keeps the dashboard's per-item reads inside the platform's
 * monthly egress allowance.
 *
 * Both use variable-length records, so the reader walks the records to
 * build an index of item id → byte offset. Reading one item afterwards
 * touches only its own bytes.
 */

/** One item's aggregate and its auction lots. */
export interface RealmItemRecord {
  itemId: number;
  minPrice: number;
  medianPrice: number;
  meanPrice: number;
  quantity: number;
  numAuctions: number;
  marketCap: number;
  lots: ActiveAuctionLot[];
}

/** One hourly observation of an item. */
export interface HourlyPoint {
  timestamp: number;
  minPrice: number;
  medianPrice: number;
  quantity: number;
}

/** One daily observation of an item. */
export interface DailyPoint {
  timestamp: number;
  minPrice: number;
  medianPrice: number;
  meanPrice: number;
  quantity: number;
  numAuctions: number;
}

/** One item's observed series. */
export interface HistoryItemRecord {
  itemId: number;
  hourly: HourlyPoint[];
  daily: DailyPoint[];
}

export interface RealmArchiveIndex {
  connectedRealmId: number;
  generatedAt: number;
  totalAuctionsCount: number;
  itemCount: number;
  /** itemId → byte offset of the item record inside `buffer`. */
  offsets: Map<number, number>;
  buffer: Buffer;
}

export interface HistoryIndex {
  connectedRealmId: number;
  generatedAt: number;
  hourlyIntervalSec: number;
  dailyIntervalSec: number;
  maxHourlyPerItem: number;
  maxDailyPerItem: number;
  itemCount: number;
  offsets: Map<number, number>;
  buffer: Buffer;
}

/**
 * Decompresses a payload if it is gzipped, otherwise returns it as-is.
 *
 * The gzip magic number is 0x1f 0x8b. Payloads written before the
 * archives were compressed are still read correctly this way.
 */
export function maybeGunzip(raw: Buffer): Buffer {
  const isGzipped = raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b;
  return isGzipped ? gunzipSync(raw) : raw;
}

/** Compresses a payload for storage. */
export function gzipForStorage(raw: Buffer): Buffer {
  return gzipSync(raw);
}

/**
 * Indexes a `realm.bin` payload.
 *
 * The index is a map from item id to byte offset, so a reader can fetch one
 * item's record without materialising the other 15 000.
 */
export function decodeRealmArchive(raw: Buffer): RealmArchiveIndex {
  const buffer = maybeGunzip(raw);
  const { headerSize, field } = REALM_FORMAT;

  if (buffer.length < headerSize) {
    throw new Error(
      `Invalid realm.bin: buffer too small (${buffer.length} bytes, need ${headerSize})`
    );
  }

  const magic = buffer.readUInt32LE(field.magic);
  if (magic !== MAGIC_REALM) {
    throw new Error(
      `Invalid realm.bin magic: expected 0x${MAGIC_REALM.toString(16)}, got 0x${magic.toString(16)}`
    );
  }

  const version = buffer.readUInt16LE(field.version);
  if (version !== ARCHIVE_VERSION) {
    throw new Error(
      `Unsupported realm.bin version ${version}; this build reads version ${ARCHIVE_VERSION}. ` +
        'Re-run the ingestion pipeline to regenerate the archive.'
    );
  }

  const itemCount = buffer.readUInt32LE(field.itemCount);
  const offsets = new Map<number, number>();

  let offset = headerSize;
  for (let i = 0; i < itemCount; i++) {
    if (offset + REALM_FORMAT.itemHeaderSize > buffer.length) {
      throw new Error(
        `Truncated realm.bin: header declares ${itemCount} items but the payload ends at ` +
          `${buffer.length} bytes.`
      );
    }
    offsets.set(buffer.readUInt32LE(offset + REALM_FORMAT.item.itemId), offset);
    const lotsCount = buffer.readUInt16LE(offset + REALM_FORMAT.item.lotsCount);
    offset += REALM_FORMAT.itemHeaderSize + lotsCount * REALM_FORMAT.activeLotSize;
  }

  return {
    connectedRealmId: buffer.readUInt32LE(field.connectedRealmId),
    generatedAt: buffer.readUInt32LE(field.generatedAt),
    totalAuctionsCount: buffer.readUInt32LE(field.totalAuctions),
    itemCount,
    offsets,
    buffer,
  };
}

/** Reads one item's record out of an indexed archive. */
export function readRealmItem(
  index: RealmArchiveIndex,
  itemId: number
): RealmItemRecord | null {
  const offset = index.offsets.get(itemId);
  if (offset === undefined) return null;

  const { item, lot } = REALM_FORMAT;
  const buf = index.buffer;

  const capLow = buf.readUInt32LE(offset + item.marketCapLow);
  const capHigh = buf.readUInt32LE(offset + item.marketCapHigh);
  const lotsCount = buf.readUInt16LE(offset + item.lotsCount);

  const lots: ActiveAuctionLot[] = [];
  let lotOffset = offset + REALM_FORMAT.itemHeaderSize;
  for (let i = 0; i < lotsCount; i++) {
    lots.push({
      auctionId: buf.readUInt32LE(lotOffset + lot.auctionId),
      quantity: buf.readUInt32LE(lotOffset + lot.quantity),
      unitPrice: buf.readUInt32LE(lotOffset + lot.unitPrice),
      buyout: buf.readUInt32LE(lotOffset + lot.buyout),
      bid: buf.readUInt32LE(lotOffset + lot.bid),
      timeLeft: buf.readUint8(lotOffset + lot.timeLeft) as TimeLeftCode,
      sellerRealmId: buf.readUInt16LE(lotOffset + lot.sellerRealmId),
    });
    lotOffset += REALM_FORMAT.activeLotSize;
  }

  return {
    itemId,
    minPrice: buf.readUInt32LE(offset + item.minPrice),
    medianPrice: buf.readUInt32LE(offset + item.medianPrice),
    meanPrice: buf.readUInt32LE(offset + item.meanPrice),
    quantity: buf.readUInt32LE(offset + item.quantity),
    numAuctions: buf.readUInt32LE(offset + item.numAuctions),
    marketCap: Number(BigInt(capLow) + (BigInt(capHigh) << BigInt(32))),
    lots,
  };
}

/** Indexes a `history.bin` payload. */
export function decodeHistory(raw: Buffer): HistoryIndex {
  const buffer = maybeGunzip(raw);
  const { headerSize, field } = HISTORY_FORMAT;

  if (buffer.length < headerSize) {
    throw new Error(
      `Invalid history.bin: buffer too small (${buffer.length} bytes, need ${headerSize})`
    );
  }

  const magic = buffer.readUInt32LE(field.magic);
  if (magic !== MAGIC_HISTORY) {
    throw new Error(
      `Invalid history.bin magic: expected 0x${MAGIC_HISTORY.toString(16)}, got 0x${magic.toString(16)}`
    );
  }

  const version = buffer.readUInt16LE(field.version);
  if (version !== ARCHIVE_VERSION) {
    throw new Error(
      `Unsupported history.bin version ${version}; this build reads version ${ARCHIVE_VERSION}. ` +
        'Re-run the ingestion pipeline to regenerate the history.'
    );
  }

  const itemCount = buffer.readUInt32LE(field.itemCount);
  const offsets = new Map<number, number>();

  let offset = headerSize;
  for (let i = 0; i < itemCount; i++) {
    if (offset + HISTORY_FORMAT.item.hourlyBase > buffer.length) {
      throw new Error(
        `Truncated history.bin: header declares ${itemCount} items but the payload ends at ` +
          `${buffer.length} bytes.`
      );
    }
    offsets.set(buffer.readUInt32LE(offset + HISTORY_FORMAT.item.itemId), offset);
    const hourlyCount = buffer.readUInt16LE(offset + HISTORY_FORMAT.item.hourlyCount);
    const dailyCount = buffer.readUInt16LE(offset + HISTORY_FORMAT.item.dailyCount);
    offset +=
      HISTORY_FORMAT.item.hourlyBase +
      hourlyCount * HISTORY_FORMAT.hourlyEntrySize +
      dailyCount * HISTORY_FORMAT.dailyEntrySize;
  }

  return {
    connectedRealmId: buffer.readUInt32LE(field.connectedRealmId),
    generatedAt: buffer.readUInt32LE(field.generatedAt),
    hourlyIntervalSec: buffer.readUInt32LE(field.hourlyIntervalSec),
    dailyIntervalSec: buffer.readUInt32LE(field.dailyIntervalSec),
    maxHourlyPerItem: buffer.readUInt32LE(field.maxHourlyPerItem),
    maxDailyPerItem: buffer.readUInt32LE(field.maxDailyPerItem),
    itemCount,
    offsets,
    buffer,
  };
}

/** Reads one item's observed series out of an indexed history. */
export function readHistoryItem(
  index: HistoryIndex,
  itemId: number
): HistoryItemRecord | null {
  const offset = index.offsets.get(itemId);
  if (offset === undefined) return null;

  const buf = index.buffer;
  const hourlyCount = buf.readUInt16LE(offset + HISTORY_FORMAT.item.hourlyCount);
  const dailyCount = buf.readUInt16LE(offset + HISTORY_FORMAT.item.dailyCount);

  const hourly: HourlyPoint[] = [];
  let cursor = offset + HISTORY_FORMAT.item.hourlyBase;
  for (let i = 0; i < hourlyCount; i++) {
    hourly.push({
      timestamp: buf.readUInt32LE(cursor),
      minPrice: buf.readUInt32LE(cursor + 4),
      medianPrice: buf.readUInt32LE(cursor + 8),
      quantity: buf.readUInt32LE(cursor + 12),
    });
    cursor += HISTORY_FORMAT.hourlyEntrySize;
  }

  const daily: DailyPoint[] = [];
  for (let i = 0; i < dailyCount; i++) {
    daily.push({
      timestamp: buf.readUInt32LE(cursor),
      minPrice: buf.readUInt32LE(cursor + 4),
      medianPrice: buf.readUInt32LE(cursor + 8),
      meanPrice: buf.readUInt32LE(cursor + 12),
      quantity: buf.readUInt32LE(cursor + 16),
      numAuctions: buf.readUInt32LE(cursor + 20),
    });
    cursor += HISTORY_FORMAT.dailyEntrySize;
  }

  return { itemId, hourly, daily };
}
