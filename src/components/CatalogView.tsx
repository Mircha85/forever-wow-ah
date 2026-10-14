'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  X,
  ArrowUp,
  ArrowDown,
  Star,
} from 'lucide-react';
import { WoWMoney } from '@/src/components/WoWMoney';
import {
  getQualityBorderColor,
  getQualityColor,
} from '@/src/data/itemsCatalog';
import { WOW_AUCTION_CATEGORIES } from '@/src/data/categories';
import type { StateItemSummary, WowItemMetadata } from '@/src/types/auction';

export interface CatalogItem extends StateItemSummary {
  meta: WowItemMetadata;
}

interface LiveRealm {
  id: number;
  name: string;
  region: 'eu' | 'us';
  lastUpdated: string | null;
}

interface CategoryCount {
  [categoryId: string]: number;
}

type SortKey = 'minPrice' | 'name';

function SortIndicator({
  k,
  activeKey,
  dir,
}: {
  k: SortKey;
  activeKey: SortKey;
  dir: 'asc' | 'desc';
}) {
  if (activeKey !== k) return null;
  return dir === 'asc' ? (
    <ArrowUp className="w-3 h-3 inline ml-1" />
  ) : (
    <ArrowDown className="w-3 h-3 inline ml-1" />
  );
}

interface CatalogViewProps {
  _totalItemCount: number;
  categoryCounts: CategoryCount;
  processedItems: CatalogItem[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCategory: string;
  setSelectedCategory: (id: string) => void;
  selectedSubcategory: string;
  setSelectedSubcategory: (id: string) => void;
  selectedChildSubcategory: string;
  setSelectedChildSubcategory: (id: string) => void;
  selectedRealmId: number;
  setSelectedRealmId: (id: number) => void;
  favorites: number[];
  onToggleFavorite: (itemId: number) => void;
  loadingItemId: number | null;
  onSelectItem: (itemId: number) => void;
  isLoadingState: boolean;
  stateError: string | null;
  onRefresh: () => void;
  // Search-gate plumbing. Nothing renders in the table until
  // onTriggerSearch has been called. Picking a category only stages
  // the query; the press commits it.
  hasSearched: boolean;
  onTriggerSearch: () => void;
  onClearFilters: () => void;
}

export function CatalogView({
  _totalItemCount,
  categoryCounts,
  processedItems,
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  selectedSubcategory,
  setSelectedSubcategory,
  selectedChildSubcategory,
  setSelectedChildSubcategory,
  selectedRealmId,
  setSelectedRealmId,
  favorites,
  onToggleFavorite,
  loadingItemId,
  onSelectItem,
  isLoadingState,
  stateError,
  onRefresh,
  hasSearched,
  onTriggerSearch,
  onClearFilters,
}: CatalogViewProps) {
  // Fetch live realm list from R2 (via /api/realms). Names come from Blizzard
  // and are cached server-side; the first call costs ~1 HTTP request per
  // realm, subsequent calls are O(1) cache hits.
  const [liveRealms, setLiveRealms] = useState<LiveRealm[]>([]);
  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const res = await fetch('/api/realms?product=retail&region=eu', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as { realms: LiveRealm[] };
        if (!ignore) setLiveRealms(json.realms ?? []);
      } catch {
        // silent — dropdown will show the "Loading realms…" option until
        // a successful refetch lands.
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  // Live enumeration from /api/realms. No hardcoded fallback — we want
  // real names only. When the fetch hasn't landed yet the dropdown shows
  // a single disabled "Loading realms…" option.
  const realmOptions: LiveRealm[] = liveRealms;

  // Sort state. Click a header to set it as the sort key; click again to
  // flip asc/desc. Star column stays non-sortable.
  const [sortKey, setSortKey] = useState<SortKey>('minPrice');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sortedItems = useMemo(() => {
    const arr = [...processedItems];
    arr.sort((a, b) => {
      const cmp =
        sortKey === 'minPrice'
          ? a.minPrice - b.minPrice
          : a.meta.name.localeCompare(b.meta.name);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [processedItems, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="flex flex-col w-full gap-4">
      {/* Top row: Realm + Search - full width */}
      <div className="w-full flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5 p-2.5 sm:p-3 bg-slate-900/90 border border-slate-800 rounded-xl shadow-md">
        {/* Realm Picker - left side */}
        <div className="relative flex-shrink-0">
          <select
            value={selectedRealmId}
            onChange={(e) => setSelectedRealmId(Number(e.target.value))}
            className="appearance-none bg-slate-950 border border-slate-800 hover:border-slate-700 text-[11px] sm:text-xs text-slate-200 font-friz py-2 pl-2.5 sm:pl-3 pr-7 sm:pr-8 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500/50 cursor-pointer max-w-[140px] sm:max-w-[200px] truncate"
            title="Select server/realm"
          >
            {realmOptions.length === 0 ? (
              <option value="" disabled>
                Loading realms…
              </option>
            ) : (
              realmOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))
            )}
          </select>
          <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search items by name, ID, or material..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onTriggerSearch();
            }}
            className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs text-slate-200 pl-9 pr-4 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          />
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {selectedCategory !== 'all' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-400 text-[11px] font-narrow">
              <span>Filter:</span>
              <span className="font-bold text-amber-400">
                {WOW_AUCTION_CATEGORIES.find((c) => c.id === selectedCategory)?.label}
              </span>
              {selectedSubcategory !== 'all' && (
                <>
                  <ChevronRight className="w-3 h-3 text-slate-600" />
                  <span className="font-bold text-amber-300">
                    {WOW_AUCTION_CATEGORIES.find((c) => c.id === selectedCategory)?.subcategories.find(
                      (s) => s.id === selectedSubcategory
                    )?.label}
                  </span>
                </>
              )}
              {selectedChildSubcategory !== 'all' && (
                <>
                  <ChevronRight className="w-3 h-3 text-slate-600" />
                  <span className="font-bold text-amber-200">
                    {WOW_AUCTION_CATEGORIES.find((c) => c.id === selectedCategory)
                      ?.subcategories.find((s) => s.id === selectedSubcategory)
                      ?.children?.find((ch) => ch.id === selectedChildSubcategory)?.label ||
                      selectedChildSubcategory}
                  </span>
                </>
              )}
              <button
                onClick={onClearFilters}
                className="ml-1 text-[11px] text-slate-500 hover:text-rose-400 cursor-pointer"
                title="Clear filter"
              >
                <X className="w-3 h-3 inline" />
              </button>
            </div>
          )}

          <button
            onClick={onTriggerSearch}
            className="px-3 py-1.5 text-[11px] sm:text-xs font-friz font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors flex-shrink-0 cursor-pointer"
            title="Run the staged category + search query"
          >
            Search
          </button>

          <button
            onClick={onRefresh}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0 cursor-pointer"
            title="Reload state.bin"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingState ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start w-full">
        <div className="hidden md:block w-72 flex-shrink-0 bg-slate-900/90 border border-slate-800/80 p-3.5 rounded-xl space-y-3 shadow-xl sticky top-20">
        <div className="flex items-center justify-between font-friz font-bold text-xs uppercase tracking-wider text-slate-300 px-1 pb-1 border-b border-slate-800">
          <span className="flex items-center gap-1.5 text-amber-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Categories</span>
          </span>
        </div>
        <div className="space-y-1.5 max-h-[76vh] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700/80 scrollbar-track-transparent">
          {WOW_AUCTION_CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id;
            const hasSubs = cat.subcategories.length > 0;
            const _count = categoryCounts[cat.id];

            return (
              <div key={cat.id} className="space-y-1">
                <button
                  onClick={() => {
                    if (isActive) {
                      setSelectedCategory('all');
                      setSelectedSubcategory('all');
                      setSelectedChildSubcategory('all');
                    } else {
                      setSelectedCategory(cat.id);
                      setSelectedSubcategory('all');
                      setSelectedChildSubcategory('all');
                    }
                  }}
                  className={`w-full text-left font-friz text-[13px] font-bold py-2 px-2.5 transition-all duration-200 rounded-lg select-none cursor-pointer flex items-center justify-between group ${
                    isActive
                      ? 'bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-800 text-white shadow-[0_0_12px_rgba(99,102,241,0.35)] border border-indigo-400/50'
                      : 'bg-slate-950 border border-slate-800/80 text-amber-500 hover:text-amber-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cat.icon}
                      alt=""
                      className="w-4.5 h-4.5 rounded border border-slate-700/80 object-cover flex-shrink-0"
                    />
                    <span className="truncate">{cat.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {hasSubs && (
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          isActive ? 'rotate-180 text-white' : 'text-slate-500 group-hover:text-amber-400'
                        }`}
                      />
                    )}
                  </div>
                </button>

                {isActive && hasSubs && (
                  <div className="pl-2 py-1 space-y-1.5 border-l-2 border-indigo-500/40 ml-3 animate-in slide-in-from-top duration-150">
                    {cat.subcategories.map((sub) => {
                      const isSubActive = selectedSubcategory === sub.id;
                      const hasChildren = sub.children && sub.children.length > 0;

                      return (
                        <div key={sub.id} className="space-y-1">
                          <button
                            onClick={() => {
                              if (isSubActive) {
                                setSelectedSubcategory('all');
                                setSelectedChildSubcategory('all');
                              } else {
                                setSelectedSubcategory(sub.id);
                                setSelectedChildSubcategory('all');
                              }
                            }}
                            className={`w-full text-left py-2 px-2.5 text-[13px] sm:text-[13.5px] font-friz font-semibold transition-all duration-150 rounded-md cursor-pointer flex items-center justify-between ${
                              isSubActive
                                ? 'bg-slate-800 text-amber-300 font-bold border-l-2 border-amber-500 pl-2'
                                : 'text-slate-300 hover:text-white hover:bg-slate-800/50 pl-2'
                            }`}
                          >
                            <span className="truncate">{sub.label}</span>
                            {hasChildren && (
                              <ChevronDown
                                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                  isSubActive ? 'rotate-180 text-amber-400' : 'text-slate-500'
                                }`}
                              />
                            )}
                          </button>

                          {isSubActive && hasChildren && (
                            <div className="pl-3 py-1 space-y-1 border-l-2 border-amber-500/30 ml-2 animate-in slide-in-from-top duration-150">
                              {sub.children?.map((child) => {
                                const isChildActive = selectedChildSubcategory === child.id;
                                return (
                                  <button
                                    key={child.id}
                                    onClick={() => setSelectedChildSubcategory(child.id)}
                                    className={`w-full text-left py-1.5 px-2.5 text-[13px] sm:text-[13.5px] font-friz font-semibold rounded-md transition-all cursor-pointer flex items-center justify-between group ${
                                      isChildActive
                                        ? 'bg-amber-500/20 text-amber-300 font-bold border-l-2 border-amber-400 pl-2 shadow-sm'
                                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 pl-2'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span className={`text-xs ${isChildActive ? 'text-amber-400 font-bold' : 'text-slate-600 group-hover:text-slate-400'}`}>•</span>
                                      <span>{child.label}</span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="block md:hidden w-full bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl shadow-md">
        <details className="group">
          <summary className="font-friz font-bold text-xs uppercase tracking-wider text-slate-300 flex items-center justify-between cursor-pointer list-none select-none">
            <span className="flex items-center gap-1.5 text-amber-500">
              <Filter className="w-4 h-4" />
              <span>Filter by Category ({selectedCategory !== 'all' ? selectedCategory : 'All'})</span>
            </span>
            <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform duration-200" />
          </summary>
          <div className="mt-3.5 space-y-2 max-h-[60vh] overflow-y-auto no-scrollbar">
            {WOW_AUCTION_CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.id;
              const hasSubs = cat.subcategories.length > 0;
              return (
                <div key={`mob-cat-${cat.id}`} className="space-y-1 bg-slate-950/40 p-2 rounded-lg border border-slate-800/40">
                  <button
                    onClick={() => {
                      if (isActive) {
                        setSelectedCategory('all');
                        setSelectedSubcategory('all');
                        setSelectedChildSubcategory('all');
                      } else {
                        setSelectedCategory(cat.id);
                        setSelectedSubcategory('all');
                        setSelectedChildSubcategory('all');
                      }
                    }}
                    className={`w-full text-left font-friz text-xs font-bold py-2 px-2.5 rounded-md flex items-center justify-between cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-800 text-white'
                        : 'text-amber-500 hover:text-amber-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={cat.icon} alt="" className="w-4 h-4 rounded border border-slate-700 object-cover" />
                      <span>{cat.label}</span>
                    </div>
                    {hasSubs && <ChevronDown className={`w-3.5 h-3.5 ${isActive ? 'rotate-180' : ''}`} />}
                  </button>
                  {isActive && hasSubs && (
                    <div className="space-y-1.5 pt-1.5 pl-1">
                      {cat.subcategories.map((sub) => {
                        const isSubActive = selectedSubcategory === sub.id;
                        const hasChildren = sub.children && sub.children.length > 0;
                        return (
                          <div key={`mob-sub-${sub.id}`} className="space-y-1">
                            <button
                              onClick={() => {
                                if (isSubActive) {
                                  setSelectedSubcategory('all');
                                  setSelectedChildSubcategory('all');
                                } else {
                                  setSelectedSubcategory(sub.id);
                                  setSelectedChildSubcategory('all');
                                }
                              }}
                              className={`w-full text-left py-2 px-2.5 text-[13px] font-friz font-semibold rounded transition-all cursor-pointer flex items-center justify-between ${
                                isSubActive
                                  ? 'bg-slate-800 text-amber-300 font-bold border-l-2 border-amber-500 pl-2'
                                  : 'text-slate-300 hover:text-slate-100 bg-slate-900/30'
                              }`}
                            >
                              <span>{sub.label}</span>
                              {hasChildren && (
                                <ChevronDown
                                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                    isSubActive ? 'rotate-180 text-amber-400' : 'text-slate-500'
                                  }`}
                                />
                              )}
                            </button>

                            {isSubActive && hasChildren && (
                              <div className="pl-3 py-1 space-y-1 border-l-2 border-amber-500/30 ml-2">
                                {sub.children?.map((child) => {
                                  const isChildActive = selectedChildSubcategory === child.id;
                                  return (
                                    <button
                                      key={`mob-child-${child.id}`}
                                      onClick={() => setSelectedChildSubcategory(child.id)}
                                      className={`w-full text-left py-1.5 px-2 text-[13px] font-friz font-semibold rounded transition-all cursor-pointer flex items-center justify-between ${
                                        isChildActive
                                          ? 'bg-amber-500/20 text-amber-300 font-bold border-l-2 border-amber-400 pl-2'
                                          : 'text-slate-400 hover:text-slate-100 pl-2'
                                      }`}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <span className={`text-xs ${isChildActive ? 'text-amber-400 font-bold' : 'text-slate-600'}`}>•</span>
                                        <span>{child.label}</span>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      </div>

      <div className="flex-1 w-full">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          {isLoadingState ? (
            <div className="p-12 sm:p-16 text-center space-y-3">
              <RefreshCw className="w-7 h-7 sm:w-8 sm:h-8 text-amber-400 animate-spin mx-auto" />
              <div className="text-sm font-medium text-slate-300">Fetching and decoding state.bin from cache...</div>
              <div className="text-xs text-slate-500 font-mono">Decoded directly on client via JavaScript DataView</div>
            </div>
          ) : stateError ? (
            <div className="p-8 sm:p-12 text-center space-y-3">
              <div className="text-rose-400 font-semibold text-sm">Failed to load market state</div>
              <div className="text-xs text-slate-400">{stateError}</div>
              <button
                onClick={onRefresh}
                className="mt-2 px-4 py-2 bg-amber-500 text-slate-950 font-semibold text-xs rounded-lg hover:bg-amber-400 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : !hasSearched ? (
            <div className="p-8 sm:p-14 flex flex-col items-center text-center space-y-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://wow.zamimg.com/images/wow/icons/large/inv_misc_coin_01.jpg"
                alt=""
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 border-amber-500/40 shadow-[0_0_24px_rgba(245,158,11,0.25)]"
              />
              <div className="space-y-2 max-w-xl">
                <h2 className="font-friz text-2xl sm:text-3xl font-bold text-amber-400">
                  Scour the Auction House
                </h2>
                <p className="text-sm text-slate-300 font-narrow">
                  Press Search to browse auctions. Pick a category first.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-3xl pt-2">
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="font-friz font-bold text-sm text-slate-100">Browse Categories</div>
                  <div className="text-[13px] text-slate-400 font-narrow leading-relaxed">
                    Weapons, Armor, Trade Goods and more. All on the left.
                  </div>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="font-friz font-bold text-sm text-slate-100">Watch the Markets Move</div>
                  <div className="text-[13px] text-slate-400 font-narrow leading-relaxed">
                    See which auctions climb, which ones fall.
                  </div>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="font-friz font-bold text-sm text-slate-100">Professions & Crafting</div>
                  <div className="text-[13px] text-slate-400 font-narrow leading-relaxed">
                    Check what your crafts earn. Material costs and market prices side by side.
                  </div>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="font-friz font-bold text-sm text-slate-100">Flipping</div>
                  <div className="text-[13px] text-slate-400 font-narrow leading-relaxed">
                    Spot underpriced auctions. Buy low, sell high across every connected realm.
                  </div>
                </div>
              </div>
            </div>
          ) : processedItems.length === 0 ? (
            <div className="p-12 sm:p-16 text-center text-slate-500 text-xs">
              No items match your query &quot;{searchQuery}&quot;
            </div>
          ) : (
            <>
              <div className="block sm:hidden divide-y divide-slate-800/80">
                {sortedItems.map((item) => {
                  return (
                    <div
                      key={`mob-${item.itemId}`}
                      onClick={() => onSelectItem(item.itemId)}
                      className={`p-3 transition-colors cursor-pointer relative ${
                        loadingItemId === item.itemId
                          ? 'bg-amber-500/10 border-l-2 border-amber-400'
                          : 'hover:bg-slate-800/40 active:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div
                            className={`w-10 h-10 rounded-lg overflow-hidden border-2 flex-shrink-0 relative ${getQualityBorderColor(
                              item.meta.quality
                            )}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.meta.icon}
                              alt={item.meta.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  'https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg';
                              }}
                            />
                            {loadingItemId === item.itemId && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div
                              className={`font-narrow text-[17.8px] truncate ${getQualityColor(
                                item.meta.quality
                              )}`}
                            >
                              {item.meta.name}
                            </div>
                            <div className="text-[14.5px] text-slate-400 font-narrow">
                              {item.meta.subclass} · iLvl {item.meta.itemLevel}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(item.itemId);
                          }}
                          className="p-1.5 text-amber-400 hover:text-amber-300 transition-colors flex-shrink-0 cursor-pointer"
                          title={favorites.includes(item.itemId) ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star
                            className={`w-[18px] h-[18px] ${
                              favorites.includes(item.itemId) ? 'fill-amber-400 text-amber-400' : 'text-slate-600'
                            }`}
                          />
                        </button>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-800/60">
                        <div className="text-[14.5px] text-slate-500 uppercase tracking-tight font-friz">Min Buyout</div>
                        <WoWMoney copper={item.minPrice} size="xl" />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-base font-narrow border-collapse">
                  <thead>
                    <tr className="text-left text-[13.2px] uppercase tracking-wider text-slate-400 bg-slate-950/80 border-b border-slate-800">
                      <th className="py-2.5 pl-3 pr-6 font-friz font-bold text-right">
                        <button
                          onClick={() => toggleSort('minPrice')}
                          className="inline-flex items-center cursor-pointer hover:text-slate-200 transition-colors"
                          title="Sort by Min Buyout"
                        >
                          Min Buyout
                          <SortIndicator k="minPrice" activeKey={sortKey} dir={sortDir} />
                        </button>
                      </th>
                      <th className="py-2.5 pr-3 font-friz font-bold">
                        <button
                          onClick={() => toggleSort('name')}
                          className="inline-flex items-center cursor-pointer hover:text-slate-200 transition-colors"
                          title="Sort by Item name"
                        >
                          Item
                          <SortIndicator k="name" activeKey={sortKey} dir={sortDir} />
                        </button>
                      </th>
                      <th className="py-2.5 pr-3 font-friz font-bold w-14 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {sortedItems.map((item) => {
                      return (
                        <tr
                          key={`dsk-${item.itemId}`}
                          onClick={() => onSelectItem(item.itemId)}
                          className={`cursor-pointer transition-colors ${
                            loadingItemId === item.itemId
                              ? 'bg-amber-500/10'
                              : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-2 pl-3 pr-6 align-middle text-right">
                            <WoWMoney copper={item.minPrice} size="xl" className="text-slate-100" />
                          </td>
                          <td className="py-2 pr-3 align-middle">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-10 h-10 rounded-md overflow-hidden border-2 flex-shrink-0 relative ${getQualityBorderColor(
                                  item.meta.quality
                                )}`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={item.meta.icon}
                                  alt={item.meta.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src =
                                      'https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg';
                                  }}
                                />
                                {loadingItemId === item.itemId && (
                                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                    <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div
                                  className={`font-narrow text-[17.8px] truncate ${getQualityColor(
                                    item.meta.quality
                                  )}`}
                                >
                                  {item.meta.name}
                                </div>
                                <div className="text-[14.5px] text-slate-400 font-narrow truncate">
                                  {item.meta.subclass} · iLvl {item.meta.itemLevel}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2 pr-3 align-middle text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavorite(item.itemId);
                              }}
                              className="p-1 text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                              title={favorites.includes(item.itemId) ? 'Remove from favorites' : 'Add to favorites'}
                            >
                              <Star
                                className={`w-[18px] h-[18px] ${
                                  favorites.includes(item.itemId) ? 'fill-amber-400 text-amber-400' : 'text-slate-600'
                                }`}
                              />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
