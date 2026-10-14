'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  type DecodedStateBin,
  type DecodedItemBin,
  type WowItemMetadata,
} from '@/src/types/auction';
import { BinaryDecoder } from '@/src/utils/binDecoder';
import {
  getItemMetadata,
  getQualityColor,
  getQualityBorderColor,
} from '@/src/data/itemsCatalog';
import { WoWMoney } from '@/src/components/WoWMoney';
import { ItemDetailModal } from '@/src/components/ItemDetailModal';
import { BinaryInspectorModal } from '@/src/components/BinaryInspectorModal';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Star,
  X,
  AlertCircle,
} from 'lucide-react';
import { WOW_AUCTION_CATEGORIES, matchesCategoryFilter } from '@/src/data/categories';
import { CRAFTING_RECIPES } from '@/src/data/craftingRecipes';
import { DashboardHeader } from '@/src/components/DashboardHeader';
import { FavoritesView, type FavoriteItem } from '@/src/components/FavoritesView';
import { ProfessionsView } from '@/src/components/ProfessionsView';
import { FlippingView } from '@/src/components/FlippingView';
import { CatalogView, type CatalogItem } from '@/src/components/CatalogView';
import type { FlippingOpportunity } from '@/src/types/dashboard';

export default function WowForeverAhDashboard() {
  const [selectedRealmId, setSelectedRealmId] = useState<number>(1305);
  const [stateData, setStateData] = useState<DecodedStateBin | null>(null);
  const [isLoadingState, setIsLoadingState] = useState<boolean>(true);
  const [stateError, setStateError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState<number>(0);
  // Real-item metadata fetched lazily from Blizzard for items not in
  // the hardcoded `WOW_ITEMS_CATALOG`. Hydrated in batches after each
  // state.bin load via `/api/items-meta`; the display layer reads from
  // this map first, then falls back to the hardcoded catalog.
  const [metaMap, setMetaMap] = useState<Map<number, WowItemMetadata>>(new Map());

  // Favorites & View Mode
  const [favorites, setFavorites] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<'catalog' | 'favorites' | 'professions' | 'flipping'>('catalog');
  const [selectedProfession, setSelectedProfession] = useState<string>('All');
  const [isMounted, setIsMounted] = useState(false);

  // Flipping State Variables
  const [minFlippingProfit, setMinFlippingProfit] = useState<number>(5); // Default 5 gold
  const [allRealmsStates, setAllRealmsStates] = useState<Record<number, DecodedStateBin>>({});
  const [isLoadingAllRealms, setIsLoadingAllRealms] = useState<boolean>(false);

  // Feedback State Variables
  const [showFeedbackModal, setShowFeedbackModal] = useState<boolean>(false);
  const [feedbackEmail, setFeedbackEmail] = useState<string>('');
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<boolean>(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsMounted(true);
      try {
        const stored = localStorage.getItem('wow-forever-ah-favorites');
        if (stored) {
          setFavorites(JSON.parse(stored));
        }
      } catch (err) {
        console.error('Failed to load favorites from localStorage', err);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  /**
   * Hydrate real Blizzard metadata for items in the current snapshot that
   * are not in the hardcoded `WOW_ITEMS_CATALOG`. Without this, every
   * unknown row falls back to "Unknown Item #X" with itemClass
   * "Miscellaneous" / subclass "Junk", which is filtered out of every
   * category the user clicks. The server-side BlizzardService caches its
   * lookups in process memory, so this hydration is a one-shot cost per
   * itemId until the process restarts.
   */
  const META_BATCH = 200;
  const MAX_HYDRATE = 500;
  const hydratedForRealmRef = React.useRef<number | null>(null);
  const getMeta = React.useCallback(
    (itemId: number): WowItemMetadata =>
      metaMap.get(itemId) ?? getItemMetadata(itemId),
    [metaMap]
  );

  useEffect(() => {
    if (!stateData) return;
    if (hydratedForRealmRef.current === selectedRealmId) return;
    hydratedForRealmRef.current = selectedRealmId;

    const topIds = [...stateData.items]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, MAX_HYDRATE)
      .map((it) => it.itemId);

    void (async () => {
      for (let i = 0; i < topIds.length; i += META_BATCH) {
        const batch = topIds.slice(i, i + META_BATCH);
        if (batch.length === 0) continue;
        try {
          const params = new URLSearchParams({
            ids: batch.join(','),
            realmId: String(selectedRealmId),
          });
          const res = await fetch(`/api/items-meta?${params.toString()}`, {
            cache: 'no-store',
          });
          if (!res.ok) continue;
          const data = (await res.json()) as { items?: WowItemMetadata[] };
          if (!Array.isArray(data.items)) continue;
          const incoming = data.items;
          setMetaMap((prev) => {
            const next = new Map(prev);
            for (const m of incoming) {
              if (m && typeof m.id === 'number') next.set(m.id, m);
            }
            return next;
          });
        } catch (err) {
          console.error('[metadata hydrate]', err);
        }
      }
    })();
  }, [stateData, selectedRealmId]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all');
  const [selectedChildSubcategory, setSelectedChildSubcategory] = useState<string>('all');
  const [sortBy] = useState<'price_desc' | 'price_asc' | 'qty_desc' | 'delta_desc' | 'delta_asc'>('qty_desc');
  // Gate: nothing in the catalog table renders until the user explicitly
  // presses the Search button. Picking a category only stages the query -
  // the press commits it. Reset on realm switch and on clearing filters
  // so stale results never bleed across contexts.
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // Modals
  const [selectedItemBin, setSelectedItemBin] = useState<DecodedItemBin | null>(null);
  const [rawItemBuffer, setRawItemBuffer] = useState<ArrayBuffer | undefined>(undefined);
  const [isLoadingItem, setIsLoadingItem] = useState<boolean>(false);
  const [loadingItemId, setLoadingItemId] = useState<number | null>(null);
  const [selectionError, setSelectionError] = useState<{ itemId: number; message: string } | null>(null);
  const [showBinaryInspector, setShowBinaryInspector] = useState<boolean>(false);

  // Region — kept so the state.bin URL stays region-aware. The realm
  // dropdown (CatalogView) enumerates from /api/realms and there's no
  // separate realm picker here.
  const [region] = useState<'eu' | 'us'>('eu');

  // Live realm id → name map. Populated from /api/realms so the dashboard
  // header, modal, and flipping comparisons show real Blizzard-resolved
  // labels (Khadgar, Dentarg, Kazzak, …) instead of hardcoded values.
  const [realmNames, setRealmNames] = useState<Record<number, string>>({});
  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const res = await fetch(`/api/realms?product=retail&region=${region}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = (await res.json()) as { realms: Array<{ id: number; name: string }> };
        if (ignore) return;
        const map: Record<number, string> = {};
        for (const r of json.realms ?? []) map[r.id] = r.name;
        setRealmNames(map);
      } catch {
        // silent — names fall back to `#${id}` until next refetch.
      }
    })();
    return () => {
      ignore = true;
    };
  }, [region]);

  // Load state.bin from static cache/API. Refresh by changing realm
  // or by bumping refreshTick (used after pipeline ingestion).
  useEffect(() => {
    let ignore = false;

    const execute = async () => {
      try {
        const res = await fetch(`/api/data/cached/retail/${region}/${selectedRealmId}/state.bin`, {
          cache: 'no-store',
        });

        if (!res.ok) {
          throw new Error(`Failed to load state.bin: HTTP ${res.status}`);
        }

        const buffer = await res.arrayBuffer();
        if (ignore) return;

        const decoded = BinaryDecoder.decodeState(buffer);

        setStateData(decoded);
      } catch (err: unknown) {
        if (ignore) return;
        const msg = err instanceof Error ? err.message : String(err);
        setStateError(msg);
      } finally {
        if (!ignore) {
          setIsLoadingState(false);
        }
      }
    };

    void execute();

    return () => {
      ignore = true;
    };
    // region is read inside `execute` but intentionally excluded: state.bin is
    // keyed by selectedRealmId and we already refetch when refreshTick bumps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRealmId, refreshTick]);

  const loadAllRealmsStates = React.useCallback(async () => {
    setIsLoadingAllRealms(true);
    const updatedStates: Record<number, DecodedStateBin> = {};
    try {
      // Enumerate realms live — same source CatalogView uses. As new
      // R2 folders appear, they show up here too.
      const listRes = await fetch(`/api/realms?product=retail&region=${region}`, {
        cache: 'no-store',
      });
      const listJson = listRes.ok
        ? ((await listRes.json()) as { realms: Array<{ id: number }> })
        : { realms: [] };
      const realmIds = listJson.realms.map((r) => r.id);

      await Promise.all(
        realmIds.map(async (realmId) => {
          try {
            const res = await fetch(`/api/data/cached/retail/${region}/${realmId}/state.bin`, {
              cache: 'no-store',
            });
            if (res.ok) {
              const buffer = await res.arrayBuffer();
              const decoded = BinaryDecoder.decodeState(buffer);
              updatedStates[realmId] = decoded;
            }
          } catch (e) {
            console.error(`Failed to load realm ${realmId}`, e);
          }
        })
      );
      setAllRealmsStates(updatedStates);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingAllRealms(false);
    }
  }, [region]);

  useEffect(() => {
    let ignore = false;
    if (viewMode === 'flipping') {
      const execute = async () => {
        if (ignore) return;
        await loadAllRealmsStates();
      };
      void execute();
    }
    return () => {
      ignore = true;
    };
  }, [viewMode, loadAllRealmsStates]);

  const toggleFavorite = (itemId: number) => {
    setFavorites((prev) => {
      const next = prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId];
      try {
        localStorage.setItem('wow-forever-ah-favorites', JSON.stringify(next));
      } catch (err) {
        console.error('Failed to save favorites to localStorage', err);
      }
      return next;
    });
  };

  // Load individual item.bin
  const handleSelectItem = async (itemId: number, targetRealmId?: number) => {
    const realmToLoad = targetRealmId || selectedRealmId;
    setIsLoadingItem(true);
    setLoadingItemId(itemId);
    setSelectionError(null);
    const controller = new AbortController();
    // 20s: covers a single Blizzard cache-miss fetch; anything longer
    // is almost certainly a hung upstream and the user should be told.
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);
    try {
      if (targetRealmId && targetRealmId !== selectedRealmId) {
        setSelectedRealmId(targetRealmId);
      }
      const shard = itemId & 0xff;
      const res = await fetch(`/api/data/cached/retail/${region}/${realmToLoad}/${shard}/${itemId}.bin`, {
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Could not load binary data for item #${itemId} (HTTP ${res.status})`);
      }

      const buffer = await res.arrayBuffer();
      // Client-side DataView decoding
      const decoded = BinaryDecoder.decodeItem(buffer);
      setRawItemBuffer(buffer);
      setSelectedItemBin(decoded);
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      if (!isAbort) {
        console.error(err);
      }
      const message =
        err instanceof Error
          ? err.message
          : 'Network request failed. Check your connection and try again.';
      setSelectionError({
        itemId,
        message: isAbort
          ? `Request for item #${itemId} timed out after 20s. The server may be under load - retry.`
          : message,
      });
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoadingItem(false);
      setLoadingItemId(null);
    }
  };

  // Filtered & Sorted items. Until the user presses Search, return an
  // empty list no matter what category/subcategory is staged — this is
  // the single gate that turns catalog clicks into "pending" state.
  const processedItems = useMemo<CatalogItem[]>(() => {
    if (!stateData) return [];
    if (!hasSearched) return [];

    let list = stateData.items.map<CatalogItem>((it) => {
      const meta = getMeta(it.itemId);
      return {
        ...it,
        meta,
      };
    });

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (it) =>
          it.meta.name.toLowerCase().includes(q) ||
          it.itemId.toString().includes(q) ||
          it.meta.itemClass.toLowerCase().includes(q) ||
          it.meta.subclass.toLowerCase().includes(q)
      );
    }

    // Category & Subcategory filter using authentic WoW AH matching
    if (selectedCategory !== 'all') {
      list = list.filter((it) =>
        matchesCategoryFilter(it.meta, selectedCategory, selectedSubcategory, selectedChildSubcategory)
      );
    }

    // Sort
    list.sort((a, b) => {
      switch (sortBy) {
        case 'price_desc':
          return b.medianPrice - a.medianPrice;
        case 'price_asc':
          return a.medianPrice - b.medianPrice;
        case 'qty_desc':
          return b.quantity - a.quantity;
        case 'delta_desc':
          return b.priceDelta24h - a.priceDelta24h;
        case 'delta_asc':
          return a.priceDelta24h - b.priceDelta24h;
        default:
          return 0;
      }
    });

    // Hard cap so a live Retail snapshot (15k+ items) doesn't lock the
    // browser tab rendering every row at once. Sort and filter have already
    // produced the canonical list; the cap is the last step.
    return list.slice(0, 500);
    // getMeta identity is captured via metaMap; adding it directly double-fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateData, searchQuery, selectedCategory, selectedSubcategory, selectedChildSubcategory, sortBy, metaMap, hasSearched]);

  // Dynamic category item count badges
  const categoryCounts = useMemo(() => {
    if (!stateData) return {};
    const counts: Record<string, number> = { all: stateData.items.length };
    for (const it of stateData.items) {
      const meta = getMeta(it.itemId);
      for (const cat of WOW_AUCTION_CATEGORIES) {
        if (cat.id !== 'all' && matchesCategoryFilter(meta, cat.id, 'all')) {
          counts[cat.id] = (counts[cat.id] || 0) + 1;
        }
      }
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateData, metaMap]);

  // Favorite items (sorted by price ascending as indicated by "Price ⬆" in screenshot)
  const favoriteItems = useMemo<FavoriteItem[]>(() => {
    if (!stateData) return [];
    return stateData.items
      .filter((it) => favorites.includes(it.itemId))
      .map((it) => ({
        ...it,
        meta: getMeta(it.itemId),
      }))
      .sort((a, b) => a.minPrice - b.minPrice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateData, favorites, metaMap]);

  // Top Gainers & Movers
  const topMovers = useMemo(() => {
    if (!stateData) return [];
    return [...stateData.items]
      .sort((a, b) => Math.abs(b.priceDelta24h) - Math.abs(a.priceDelta24h))
      .slice(0, 4)
      .map((it) => ({
        ...it,
        meta: getMeta(it.itemId),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateData, metaMap]);

  // Crafting helpers
  const getItemPrice = React.useCallback((itemId: number) => {
    if (!stateData) return 0;
    const match = stateData.items.find((it) => it.itemId === itemId);
    return match ? match.minPrice : 0;
  }, [stateData]);

  const getItemMinBuyout = React.useCallback((itemId: number) => {
    if (!stateData) return 0;
    const match = stateData.items.find((it) => it.itemId === itemId);
    return match ? match.minPrice : 0;
  }, [stateData]);

  const filteredRecipes = useMemo(() => {
    if (selectedProfession === 'All') return CRAFTING_RECIPES;
    return CRAFTING_RECIPES.filter((r) => r.profession === selectedProfession);
  }, [selectedProfession]);

  // Reset gate when the user changes realm: queries are realm-scoped
  // (state.bin is per-realm) so old results must never carry over.
  const handleRealmChange = React.useCallback((id: number) => {
    setSelectedRealmId(id);
    setHasSearched(false);
  }, []);

  // Commit the staged category/subcategory/search into an actual render
  // of processedItems. Called by the Search button in CatalogView.
  const handleTriggerSearch = React.useCallback(() => {
    setHasSearched(true);
  }, []);

  // Clear all staged filters and drop the gate back to closed.
  const handleClearFilters = React.useCallback(() => {
    setSelectedCategory('all');
    setSelectedSubcategory('all');
    setSelectedChildSubcategory('all');
    setHasSearched(false);
  }, []);

  // Every staged query mutation closes the gate again. Picking a category,
  // changing subcategory/child, or typing a search term all invalidate the
  // previously-applied results, so the user must press Search to commit
  // the new query. Without this, the filter clicks re-render instantly
  // and the gate effectively disappears after the first press.
  const handleSetSelectedCategory = React.useCallback((id: string) => {
    setSelectedCategory(id);
    setHasSearched(false);
  }, []);
  const handleSetSelectedSubcategory = React.useCallback((id: string) => {
    setSelectedSubcategory(id);
    setHasSearched(false);
  }, []);
  const handleSetSelectedChildSubcategory = React.useCallback((id: string) => {
    setSelectedChildSubcategory(id);
    setHasSearched(false);
  }, []);
  const handleSetSearchQuery = React.useCallback((q: string) => {
    setSearchQuery(q);
    setHasSearched(false);
  }, []);

  interface RealmView { id: number; lastUpdated: string | null; name: string }
const currentRealm: RealmView = {
  id: selectedRealmId,
  lastUpdated: null,
  name: realmNames[selectedRealmId] ?? `#${selectedRealmId}`,
};

  const flippingOpportunities = useMemo<FlippingOpportunity[]>(() => {
    const list: FlippingOpportunity[] = [];

    const minProfitCopper = minFlippingProfit * 10000; // 1 gold = 10000 copper

    // 1. Intra-Realm Flips (Using currently selected realm)
    if (stateData) {
      stateData.items.forEach((it) => {
        const meta = getMeta(it.itemId);
        const pMin = it.minPrice;
        const pMed = it.medianPrice;

        if (pMin > 0 && pMed > pMin) {
          // Historical deviation of at least 25% (buy at <= 75% of median market price)
          if (pMin <= 0.75 * pMed) {
            const ahFee = Math.round(pMed * 0.05);
            const netProfit = Math.round(pMed * 0.95) - pMin;

            if (netProfit >= minProfitCopper) {
              const roi = pMin > 0 ? (netProfit / pMin) * 100 : 0;
              list.push({
                itemId: it.itemId,
                name: meta.name,
                icon: meta.icon,
                quality: meta.quality,
                type: 'intra_realm',
                buyRealm: { id: selectedRealmId, name: currentRealm.name },
                sellRealm: { id: selectedRealmId, name: currentRealm.name },
                buyPrice: pMin,
                sellPrice: pMed,
                ahFee,
                netProfit,
                roi,
                volume: it.quantity,
              });
            }
          }
        }
      });
    }

    // 2. Cross-Realm Arbitrage
    const loadedRealmIds = Object.keys(allRealmsStates).map(Number);
    if (loadedRealmIds.length > 1) {
      // Collect items from catalog
      const catalogItemIds = [
        13468, 12360, 12359, 13464, 13465, 13466, 13467, 12800, 12799, 17203, 7078, 7080, 7082
      ];

      catalogItemIds.forEach((itemId) => {
        const meta = getItemMetadata(itemId);

        let bestBuyPrice = Infinity;
        let bestBuyRealmId = -1;
        let buyVolume = 0;

        let bestSellPrice = -1;
        let bestSellRealmId = -1;

        loadedRealmIds.forEach((rId) => {
          const rState = allRealmsStates[rId];
          if (!rState) return;
          const rItem = rState.items.find((it) => it.itemId === itemId);
          if (!rItem || rItem.minPrice <= 0) return;

          if (rItem.minPrice < bestBuyPrice) {
            bestBuyPrice = rItem.minPrice;
            bestBuyRealmId = rId;
            buyVolume = rItem.quantity;
          }

          if (rItem.minPrice > bestSellPrice) {
            bestSellPrice = rItem.minPrice;
            bestSellRealmId = rId;
          }
        });

        if (bestBuyRealmId !== -1 && bestSellRealmId !== -1 && bestBuyRealmId !== bestSellRealmId) {
          const ahFee = Math.round(bestSellPrice * 0.05);
          const netProfit = Math.round(bestSellPrice * 0.95) - bestBuyPrice;

          if (netProfit >= minProfitCopper) {
            const roi = bestBuyPrice > 0 ? (netProfit / bestBuyPrice) * 100 : 0;
            const buyRealmName = realmNames[bestBuyRealmId] || 'Realm';
            const sellRealmName = realmNames[bestSellRealmId] || 'Realm';

            list.push({
              itemId,
              name: meta.name,
              icon: meta.icon,
              quality: meta.quality,
              type: 'cross_realm',
              buyRealm: { id: bestBuyRealmId, name: buyRealmName },
              sellRealm: { id: bestSellRealmId, name: sellRealmName },
              buyPrice: bestBuyPrice,
              sellPrice: bestSellPrice,
              ahFee,
              netProfit,
              roi,
              volume: buyVolume,
            });
          }
        }
      });
    }

    return list.sort((a, b) => b.netProfit - a.netProfit);
    // getMeta identity captured via metaMap; realmNames snapshotted via currentRealm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateData, allRealmsStates, minFlippingProfit, selectedRealmId, currentRealm, metaMap]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <DashboardHeader
        viewMode={viewMode}
        setViewMode={setViewMode}
        favoritesCount={isMounted ? favorites.length : 0}
              />
        {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Market Movers Strip */}
        {topMovers.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-friz font-bold uppercase tracking-wider text-amber-300">
                24h Market Movers & High Volatility
              </span>
              <span className="text-slate-500 font-narrow">Real-time deltas</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {topMovers.map((it) => {
                const isPos = it.priceDelta24h >= 0;
                return (
                  <button
                    key={it.itemId}
                    onClick={() => handleSelectItem(it.itemId)}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 hover:bg-slate-800/70 border border-slate-800 hover:border-slate-700 transition-all text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg overflow-hidden border flex-shrink-0 ${getQualityBorderColor(
                          it.meta.quality
                        )}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={it.meta.icon}
                          alt={it.meta.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              'https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg';
                          }}
                        />
                      </div>
                      <div className="min-w-0">
                        <div
                          className={`font-friz text-xs font-bold truncate group-hover:text-amber-300 transition-colors ${getQualityColor(
                            it.meta.quality
                          )}`}
                        >
                          {it.meta.name}
                        </div>
                        <div className="text-[11px] text-slate-400 font-narrow">
                          <WoWMoney copper={it.medianPrice} size="xs" />
                        </div>
                      </div>
                    </div>

                    <div
                      className={`flex items-center gap-1 text-xs font-narrow font-bold pl-2 ${
                        isPos ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isPos ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      <span>{isPos ? '+' : ''}{it.priceDelta24h.toFixed(1)}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {viewMode === 'favorites' ? (
          <FavoritesView
            favoriteItems={favoriteItems}
            onSelectItem={(id: number) => void handleSelectItem(id)}
            onToggleFavorite={toggleFavorite}
          />
        ) : viewMode === 'professions' ? (
          <ProfessionsView
            selectedProfession={selectedProfession}
            setSelectedProfession={setSelectedProfession}
            currentRealmName={currentRealm.name}
            recipes={filteredRecipes}
            getItemMinBuyout={getItemMinBuyout}
            getItemPrice={getItemPrice}
            loadingItemId={loadingItemId}
            onSelectItem={(id: number) => void handleSelectItem(id)}
          />
        ) : viewMode === 'flipping' ? (
          <FlippingView
            minFlippingProfit={minFlippingProfit}
            setMinFlippingProfit={setMinFlippingProfit}
            isLoadingAllRealms={isLoadingAllRealms}
            activeRealmCount={Object.keys(allRealmsStates).length}
            onReloadAllRealms={() => void loadAllRealmsStates()}
            flippingOpportunities={flippingOpportunities}
            onSelectItem={(id: number) => void handleSelectItem(id)}
          />
        ) : (
          <CatalogView
            _totalItemCount={stateData?.items.length || 0}
            categoryCounts={categoryCounts}
            processedItems={processedItems}
            searchQuery={searchQuery}
            setSearchQuery={handleSetSearchQuery}
            selectedCategory={selectedCategory}
            setSelectedCategory={handleSetSelectedCategory}
            selectedSubcategory={selectedSubcategory}
            setSelectedSubcategory={handleSetSelectedSubcategory}
            selectedChildSubcategory={selectedChildSubcategory}
            setSelectedChildSubcategory={handleSetSelectedChildSubcategory}
            selectedRealmId={selectedRealmId}
            setSelectedRealmId={handleRealmChange}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            loadingItemId={loadingItemId}
            onSelectItem={(id) => void handleSelectItem(id)}
            isLoadingState={isLoadingState}
            stateError={stateError}
            onRefresh={() => setRefreshTick((t) => t + 1)}
            hasSearched={hasSearched}
            onTriggerSearch={handleTriggerSearch}
            onClearFilters={handleClearFilters}
          />
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-5 sm:py-6 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-3">
          <span className="font-semibold text-slate-300">WoW Forever AH</span>
          <button
            onClick={() => {
              setFeedbackSubmitted(false);
              setShowFeedbackModal(true);
            }}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span>💬</span>
            <span>Send Feedback</span>
          </button>
        </div>
      </footer>

      {/* Item Binary Decoding Toast */}
      {isLoadingItem && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex items-center gap-2.5 px-3.5 py-2 sm:px-4 sm:py-2.5 bg-slate-900/95 border border-amber-500/50 rounded-xl shadow-2xl text-xs font-narrow animate-in fade-in slide-in-from-bottom-2">
          <RefreshCw className="w-4 h-4 text-amber-400 animate-spin flex-shrink-0" />
          <span className="text-slate-200">
            Decoding binary stream for item <span className="font-friz font-bold text-amber-300">#{loadingItemId}</span>...
          </span>
        </div>
      )}

      {/* Item Selection Error Banner */}
      {selectionError && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex items-start gap-2.5 px-3.5 py-2.5 sm:px-4 sm:py-3 bg-slate-900/95 border border-rose-500/60 rounded-xl shadow-2xl text-xs font-narrow max-w-[min(420px,calc(100vw-2rem))] animate-in fade-in slide-in-from-bottom-2"
        >
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-friz font-bold text-rose-300 text-[12.5px]">
              Could not load item #{selectionError.itemId}
            </p>
            <p className="text-slate-300 mt-0.5 break-words">{selectionError.message}</p>
          </div>
          <div className="flex flex-col gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                void handleSelectItem(selectionError.itemId);
              }}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 transition-colors cursor-pointer"
              title="Retry fetch"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => setSelectionError(null)}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
              title="Dismiss"
              aria-label="Dismiss error"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Item Detail Modal */}
      {selectedItemBin && (
        <ItemDetailModal
          itemData={selectedItemBin}
          meta={getMeta(selectedItemBin.itemId)}
          realmName={currentRealm.name}
          onClose={() => setSelectedItemBin(null)}
          onOpenBinaryInspector={() => setShowBinaryInspector(true)}
          isFavorited={favorites.includes(selectedItemBin.itemId)}
          onToggleFavorite={() => toggleFavorite(selectedItemBin.itemId)}
          onSelectRealm={(targetRealmId) => {
            void handleSelectItem(selectedItemBin.itemId, targetRealmId);
          }}
        />
      )}

      {/* Binary Inspector Modal */}
      {showBinaryInspector && selectedItemBin && (
        <BinaryInspectorModal
          itemData={selectedItemBin}
          rawBuffer={rawItemBuffer}
          onClose={() => setShowBinaryInspector(false)}
        />
      )}

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-friz font-bold text-lg text-amber-400 flex items-center gap-2">
                <span>💬</span>
                <span>Share Your Feedback</span>
              </h3>
              <button
                onClick={() => setShowFeedbackModal(false)}
                className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {feedbackSubmitted ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
                <h4 className="text-emerald-400 font-bold text-base">Thank you!</h4>
                <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                  Your feedback has been successfully submitted. We appreciate your input to improve WoW Forever AH!
                </p>
                <button
                  onClick={() => setShowFeedbackModal(false)}
                  className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Close Window
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setFeedbackSubmitted(true);
                  setFeedbackEmail('');
                  setFeedbackText('');
                }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400">Your Email (Optional):</label>
                  <input
                    type="email"
                    value={feedbackEmail}
                    onChange={(e) => setFeedbackEmail(e.target.value)}
                    placeholder="e.g. champion@azeroth.com"
                    className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs text-slate-200 px-3 py-2 rounded-lg focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400">Satisfaction Rating:</label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setFeedbackRating(star)}
                        className="p-1 hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                      >
                        <Star
                          className={`w-6 h-6 ${
                            star <= feedbackRating ? 'fill-amber-400 text-amber-400' : 'text-slate-600'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400">Message / Suggestions:</label>
                  <textarea
                    required
                    rows={4}
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="What did you like? What features would you like to see next?"
                    className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs text-slate-200 px-3 py-2 rounded-lg focus:outline-none resize-none leading-relaxed"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowFeedbackModal(false)}
                    className="px-4 py-2 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-extrabold rounded-lg shadow-md transition-all cursor-pointer"
                  >
                    Submit Feedback
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
