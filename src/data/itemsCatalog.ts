/**
 * Item metadata helpers.
 *
 * The hardcoded `WOW_ITEMS_CATALOG` was removed in favour of the live
 * `BlizzardService.fetchItemMetadata` lookup plus the in-memory
 * `itemMetadataCache`. Until the cache is warm for an id, callers fall
 * through to the placeholder returned here so the UI renders something
 * legible instead of crashing.
 *
 * `CONNECTED_REALMS` is still hardcoded and will be replaced by
 * `GET /api/realms?region=eu|us` (R2-backed enumeration) in a
 * follow-up — kept here to avoid changing every component in one PR.
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

export const CONNECTED_REALMS: Array<{
  id: number;
  name: string;
  region: 'eu' | 'us';
  slug: string;
  population: string;
}> = [
  { id: 4401, name: 'Aegwynn', region: 'eu', slug: 'aegwynn', population: 'High' },
  { id: 4402, name: 'Aggramar', region: 'eu', slug: 'aggramar', population: 'High' },
  { id: 4403, name: 'AhnQiraj', region: 'eu', slug: 'ahnqiraj', population: 'Medium' },
  { id: 1305, name: 'Silvermoon', region: 'eu', slug: 'silvermoon', population: 'High' },
];

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