/**
 * Item metadata helpers.
 *
 * The hardcoded `WOW_ITEMS_CATALOG` and `CONNECTED_REALMS` were removed in
 * favour of live lookups:
 *   - item metadata: `itemMetadataCache.getCachedMetadata(id)` +
 *     `warmMetadataForIds` (Blizzard-backed).
 *   - connected realms: `GET /api/realms?region=eu|us` (R2-backed
 *     enumeration, Blizzard-resolved labels).
 *
 * `getItemMetadata` stays as the synchronous fallback that returns a
 * placeholder until the cache is warm, so the UI renders something
 * legible instead of crashing.
 */

import { type WowItemMetadata } from '../types/auction';

const PLACEHOLDER_ICON =
  'https://wow.zamimg.com/images/wow/icons/large/inv_misc_coin_01.jpg';

/**
 * Empty stub kept for source compatibility. New code should call
 * `getCachedMetadata(id)` from `itemMetadataCache` directly.
 *
 * @deprecated use `itemMetadataCache.getCachedMetadata` + `warmMetadataForIds`
 */
export const WOW_ITEMS_CATALOG: Record<number, WowItemMetadata> = {};

export function getItemMetadata(id: number): WowItemMetadata {
  // Synchronous fallback for components that need an immediate answer.
  // Returns the placeholder until the cache is warm for this id.
  return {
    id,
    name: `Item #${id}`,
    icon: PLACEHOLDER_ICON,
    quality: 1,
    itemClass: 'Miscellaneous',
    subclass: 'Junk',
    itemLevel: 0,
    requiredLevel: 0,
  };
}

export function getQualityColor(quality: number): string {
  switch (quality) {
    case 0: return '#9d9d9d';
    case 1: return '#ffffff';
    case 2: return '#1eff00';
    case 3: return '#0070dd';
    case 4: return '#a335ee';
    case 5: return '#ff8000';
    case 6: return '#e6cc80';
    case 7: return '#00ccff';
    default: return '#ffffff';
  }
}

export function getQualityBorderColor(quality: number): string {
  return getQualityColor(quality);
}