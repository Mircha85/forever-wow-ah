'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  DecodedStateBin,
  DecodedItemBin,
  StateItemSummary,
} from '@/src/types/auction';
import { BinaryDecoder } from '@/src/utils/binDecoder';
import {
  CONNECTED_REALMS,
  getItemMetadata,
  getQualityColor,
  getQualityBorderColor,
} from '@/src/data/itemsCatalog';
import { WoWMoney } from '@/src/components/WoWMoney';
import { ItemDetailModal } from '@/src/components/ItemDetailModal';
import { BinaryInspectorModal } from '@/src/components/BinaryInspectorModal';
import { PipelineRunnerModal } from '@/src/components/PipelineRunnerModal';
import {
  Search,
  Filter,
  RefreshCw,
  Coins,
  TrendingUp,
  TrendingDown,
  Layers,
  Database,
  Binary,
  Cpu,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  HardDrive,
  Info,
  SlidersHorizontal,
  ExternalLink,
  Star,
  X,
} from 'lucide-react';
import { WOW_AUCTION_CATEGORIES, matchesCategoryFilter } from '@/src/data/categories';

interface CraftingRecipe {
  productId: number;
  profession:
    | 'Alchemy'
    | 'Blacksmithing'
    | 'Enchanting'
    | 'Engineering'
    | 'Herbalism'
    | 'Inscription'
    | 'Jewelcrafting'
    | 'Leatherworking'
    | 'Tailoring';
  ingredients: {
    itemId: number;
    quantity: number;
  }[];
}

const PROFESSION_INFO: Record<string, { icon: string; description: string }> = {
  All: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_book_09.jpg',
    description: 'Explore crafting profit margins and item values across all professions.',
  },
  Alchemy: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_alchemy.jpg',
    description: 'Brews powerful potions, elixirs, and flasks, and transmutes rare materials.',
  },
  Blacksmithing: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_blacksmithing.jpg',
    description: 'Forges heavy mail, plate armor, and deadly weapons from raw bars and elemental essences.',
  },
  Enchanting: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_engraving.jpg',
    description: 'Enhances gear stats with magical enchants and breaks down unwanted items into dust (disenchanting).',
  },
  Engineering: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_engineering.jpg',
    description: 'Builds explosive devices, fun gadgets, mounts, and utility items.',
  },
  Herbalism: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_herbalism.jpg',
    description: 'Gathers herbs and plants used primarily by Alchemists and Scribes.',
  },
  Inscription: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_inscription_tradeskill01.jpg',
    description: 'Creates glyphs, off-hand items, darkmoon decks, and scrolls.',
  },
  Jewelcrafting: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_gem_01.jpg',
    description: 'Cuts gems to socket into gear and crafts rings and necklaces.',
  },
  Leatherworking: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_leatherworking.jpg',
    description: 'Crafts leather and mail armor along with drums and armor kits.',
  },
  Tailoring: {
    icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_tailoring.jpg',
    description: 'Weaves cloth into caster armor, bags, and special fabrics like Mooncloth.',
  },
};

const CRAFTING_RECIPES: CraftingRecipe[] = [
  // Alchemy
  {
    productId: 13511, // Flask of the Titans
    profession: 'Alchemy',
    ingredients: [
      { itemId: 13468, quantity: 1 },  // Black Lotus
      { itemId: 13467, quantity: 10 }, // Icecap
      { itemId: 13465, quantity: 10 }  // Mountain Silversage
    ]
  },
  {
    productId: 13512, // Flask of Supreme Power
    profession: 'Alchemy',
    ingredients: [
      { itemId: 13468, quantity: 1 },  // Black Lotus
      { itemId: 13466, quantity: 10 }, // Plaguebloom
      { itemId: 13463, quantity: 10 }  // Dreamfoil
    ]
  },
  {
    productId: 12360, // Arcanite Bar
    profession: 'Alchemy',
    ingredients: [
      { itemId: 12359, quantity: 1 },  // Thorium Ore
      { itemId: 12800, quantity: 1 }   // Azerothian Diamond
    ]
  },
  // Blacksmithing
  {
    productId: 12640, // Lionheart Helm
    profession: 'Blacksmithing',
    ingredients: [
      { itemId: 12360, quantity: 12 }, // Arcanite Bar
      { itemId: 12800, quantity: 4 },  // Azerothian Diamond
      { itemId: 12799, quantity: 4 }   // Large Opal
    ]
  },
  {
    productId: 19019, // Thunderfury
    profession: 'Blacksmithing',
    ingredients: [
      { itemId: 12360, quantity: 100 }, // Arcanite Bar
      { itemId: 17203, quantity: 1 },   // Sulfuron Ingot
      { itemId: 7078, quantity: 10 },   // Essence of Fire
      { itemId: 7082, quantity: 10 }    // Essence of Air
    ]
  },
  // Enchanting
  {
    productId: 16252, // Formula: Enchant Weapon - Crusader
    profession: 'Enchanting',
    ingredients: [
      { itemId: 14344, quantity: 4 },  // Large Brilliant Shard
      { itemId: 16204, quantity: 20 }, // Illusion Dust
      { itemId: 7076, quantity: 2 }    // Essence of Earth
    ]
  },
  {
    productId: 20748, // Brilliant Mana Oil
    profession: 'Enchanting',
    ingredients: [
      { itemId: 14344, quantity: 2 }, // Large Brilliant Shard
      { itemId: 16204, quantity: 4 }  // Illusion Dust
    ]
  },
  // Engineering
  {
    productId: 16008, // Arcanite Dragonling
    profession: 'Engineering',
    ingredients: [
      { itemId: 12360, quantity: 4 }, // Arcanite Bar
      { itemId: 12359, quantity: 6 }, // Thorium Ore
      { itemId: 7078, quantity: 2 }   // Essence of Fire
    ]
  },
  {
    productId: 18587, // Goblin Jumper Cables XL
    profession: 'Engineering',
    ingredients: [
      { itemId: 12359, quantity: 4 }, // Thorium Ore
      { itemId: 7082, quantity: 1 }   // Essence of Air
    ]
  },
  // Herbalism
  {
    productId: 13468, // Black Lotus
    profession: 'Herbalism',
    ingredients: [
      { itemId: 13464, quantity: 3 }, // Golden Sansam
      { itemId: 13465, quantity: 3 }, // Mountain Silversage
      { itemId: 13466, quantity: 3 }  // Plaguebloom
    ]
  },
  {
    productId: 13467, // Icecap
    profession: 'Herbalism',
    ingredients: [
      { itemId: 13464, quantity: 2 }, // Golden Sansam
      { itemId: 13465, quantity: 2 }  // Mountain Silversage
    ]
  },
  // Inscription
  {
    productId: 19288, // Darkmoon Card: Blue Dragon
    profession: 'Inscription',
    ingredients: [
      { itemId: 12799, quantity: 2 }, // Large Opal
      { itemId: 16204, quantity: 10 }, // Illusion Dust
      { itemId: 7080, quantity: 2 }   // Essence of Water
    ]
  },
  {
    productId: 10307, // Scroll of Strength IV
    profession: 'Inscription',
    ingredients: [
      { itemId: 16204, quantity: 2 }, // Illusion Dust
      { itemId: 13464, quantity: 2 }  // Golden Sansam
    ]
  },
  // Jewelcrafting
  {
    productId: 12080, // Aquamarine Signet
    profession: 'Jewelcrafting',
    ingredients: [
      { itemId: 12800, quantity: 1 }, // Azerothian Diamond
      { itemId: 12360, quantity: 1 }  // Arcanite Bar
    ]
  },
  {
    productId: 12084, // Ruby Crown of Restoration
    profession: 'Jewelcrafting',
    ingredients: [
      { itemId: 12799, quantity: 2 }, // Large Opal
      { itemId: 12800, quantity: 2 }, // Azerothian Diamond
      { itemId: 12360, quantity: 4 }  // Arcanite Bar
    ]
  },
  // Leatherworking
  {
    productId: 15062, // Devilsaur Gauntlets
    profession: 'Leatherworking',
    ingredients: [
      { itemId: 8170, quantity: 30 },  // Rugged Leather
      { itemId: 15407, quantity: 1 },  // Cured Rugged Hide
      { itemId: 7076, quantity: 2 }    // Essence of Earth
    ]
  },
  {
    productId: 15063, // Devilsaur Leggings
    profession: 'Leatherworking',
    ingredients: [
      { itemId: 8170, quantity: 30 },  // Rugged Leather
      { itemId: 15407, quantity: 1 },  // Cured Rugged Hide
      { itemId: 7078, quantity: 2 }    // Essence of Fire
    ]
  },
  // Tailoring
  {
    productId: 14155, // Mooncloth
    profession: 'Tailoring',
    ingredients: [
      { itemId: 7080, quantity: 2 }, // Essence of Water
      { itemId: 12799, quantity: 1 } // Large Opal
    ]
  },
  {
    productId: 14156, // Mooncloth Bag
    profession: 'Tailoring',
    ingredients: [
      { itemId: 14155, quantity: 4 }, // Mooncloth
      { itemId: 14344, quantity: 1 }  // Large Brilliant Shard
    ]
  }
];

export default function WowForeverAhDashboard() {
  const [selectedRealmId, setSelectedRealmId] = useState<number>(4401);
  const [stateData, setStateData] = useState<DecodedStateBin | null>(null);
  const [isLoadingState, setIsLoadingState] = useState<boolean>(true);
  const [stateError, setStateError] = useState<string | null>(null);
  const [decodingTimeMs, setDecodingTimeMs] = useState<number>(0);

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

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all');
  const [selectedChildSubcategory, setSelectedChildSubcategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'price_desc' | 'price_asc' | 'qty_desc' | 'delta_desc' | 'delta_asc'>('qty_desc');

  // Modals
  const [selectedItemBin, setSelectedItemBin] = useState<DecodedItemBin | null>(null);
  const [rawItemBuffer, setRawItemBuffer] = useState<ArrayBuffer | undefined>(undefined);
  const [isLoadingItem, setIsLoadingItem] = useState<boolean>(false);
  const [loadingItemId, setLoadingItemId] = useState<number | null>(null);
  const [showBinaryInspector, setShowBinaryInspector] = useState<boolean>(false);
  const [showPipelineModal, setShowPipelineModal] = useState<boolean>(false);
  const [showArchDocs, setShowArchDocs] = useState<boolean>(false);

  // Load state.bin from static cache/API
  const loadStateBin = React.useCallback(async (realmId: number) => {
    setIsLoadingState(true);
    setStateError(null);
    try {
      const startTime = performance.now();
      const res = await fetch(`/api/data/cached/${realmId}/state.bin`, {
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`Failed to load state.bin: HTTP ${res.status}`);
      }

      const buffer = await res.arrayBuffer();
      // Decode 100% Client-side via DataView!
      const decoded = BinaryDecoder.decodeState(buffer);
      const elapsed = Math.round((performance.now() - startTime) * 10) / 10;

      setStateData(decoded);
      setDecodingTimeMs(elapsed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStateError(msg);
    } finally {
      setIsLoadingState(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    const execute = async () => {
      try {
        const startTime = performance.now();
        const res = await fetch(`/api/data/cached/${selectedRealmId}/state.bin`, {
          cache: 'no-store',
        });

        if (!res.ok) {
          throw new Error(`Failed to load state.bin: HTTP ${res.status}`);
        }

        const buffer = await res.arrayBuffer();
        if (ignore) return;

        const decoded = BinaryDecoder.decodeState(buffer);
        const elapsed = Math.round((performance.now() - startTime) * 10) / 10;

        setStateData(decoded);
        setDecodingTimeMs(elapsed);
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

    execute();

    return () => {
      ignore = true;
    };
  }, [selectedRealmId]);

  const loadAllRealmsStates = React.useCallback(async () => {
    setIsLoadingAllRealms(true);
    const updatedStates: Record<number, DecodedStateBin> = {};
    try {
      await Promise.all(
        CONNECTED_REALMS.map(async (realm) => {
          try {
            const res = await fetch(`/api/data/cached/${realm.id}/state.bin`, {
              cache: 'no-store',
            });
            if (res.ok) {
              const buffer = await res.arrayBuffer();
              const decoded = BinaryDecoder.decodeState(buffer);
              updatedStates[realm.id] = decoded;
            }
          } catch (e) {
            console.error(`Failed to load realm ${realm.id}`, e);
          }
        })
      );
      setAllRealmsStates(updatedStates);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingAllRealms(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    if (viewMode === 'flipping') {
      const execute = async () => {
        if (ignore) return;
        await loadAllRealmsStates();
      };
      execute();
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
    try {
      if (targetRealmId && targetRealmId !== selectedRealmId) {
        setSelectedRealmId(targetRealmId);
      }
      const shard = itemId & 0xff;
      const res = await fetch(`/api/data/cached/${realmToLoad}/${shard}/${itemId}.bin`, {
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`Could not load binary data for item #${itemId}`);
      }

      const buffer = await res.arrayBuffer();
      // Client-side DataView decoding
      const decoded = BinaryDecoder.decodeItem(buffer);
      setRawItemBuffer(buffer);
      setSelectedItemBin(decoded);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingItem(false);
      setLoadingItemId(null);
    }
  };

  // Filtered & Sorted items
  const processedItems = useMemo(() => {
    if (!stateData) return [];

    let list = stateData.items.map((it) => {
      const meta = getItemMetadata(it.itemId);
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

    return list;
  }, [stateData, searchQuery, selectedCategory, selectedSubcategory, selectedChildSubcategory, sortBy]);

  // Dynamic category item count badges
  const categoryCounts = useMemo(() => {
    if (!stateData) return {};
    const counts: Record<string, number> = { all: stateData.items.length };
    for (const it of stateData.items) {
      const meta = getItemMetadata(it.itemId);
      for (const cat of WOW_AUCTION_CATEGORIES) {
        if (cat.id !== 'all' && matchesCategoryFilter(meta, cat.id, 'all')) {
          counts[cat.id] = (counts[cat.id] || 0) + 1;
        }
      }
    }
    return counts;
  }, [stateData]);

  // Favorite items (sorted by price ascending as indicated by "Price ⬆" in screenshot)
  const favoriteItems = useMemo(() => {
    if (!stateData) return [];
    return stateData.items
      .filter((it) => favorites.includes(it.itemId))
      .map((it) => ({
        ...it,
        meta: getItemMetadata(it.itemId),
      }))
      .sort((a, b) => a.minPrice - b.minPrice);
  }, [stateData, favorites]);

  // Key totals
  const totalMarketCap = useMemo(() => {
    if (!stateData) return 0;
    return stateData.items.reduce((acc, it) => acc + it.medianPrice * it.quantity, 0);
  }, [stateData]);

  // Top Gainers & Movers
  const topMovers = useMemo(() => {
    if (!stateData) return [];
    return [...stateData.items]
      .sort((a, b) => Math.abs(b.priceDelta24h) - Math.abs(a.priceDelta24h))
      .slice(0, 4)
      .map((it) => ({
        ...it,
        meta: getItemMetadata(it.itemId),
      }));
  }, [stateData]);

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

  const currentRealm =
    CONNECTED_REALMS.find((r) => r.id === selectedRealmId) || CONNECTED_REALMS[0];

  const flippingOpportunities = useMemo(() => {
    const list: Array<{
      itemId: number;
      name: string;
      icon: string;
      quality: number;
      type: 'intra_realm' | 'cross_realm';
      buyRealm: { id: number; name: string };
      sellRealm: { id: number; name: string };
      buyPrice: number;
      sellPrice: number;
      ahFee: number;
      netProfit: number;
      roi: number;
      volume: number;
    }> = [];

    const minProfitCopper = minFlippingProfit * 10000; // 1 gold = 10000 copper

    // 1. Intra-Realm Flips (Using currently selected realm)
    if (stateData) {
      stateData.items.forEach((it) => {
        const meta = getItemMetadata(it.itemId);
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
            const buyRealmName = CONNECTED_REALMS.find((r) => r.id === bestBuyRealmId)?.name || 'Realm';
            const sellRealmName = CONNECTED_REALMS.find((r) => r.id === bestSellRealmId)?.name || 'Realm';

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
  }, [stateData, allRealmsStates, minFlippingProfit, selectedRealmId, currentRealm]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top WoW Forever AH Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo & Identity */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-slate-950 border border-amber-500/40 p-1 flex items-center justify-center shadow-lg shadow-amber-500/20 flex-shrink-0 group overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/wow-forever-logo-small.png"
                alt="WoW Forever Logo"
                className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://warcraft.wiki.gg/images/thumb/WoW_Forever_Logo.png/250px-WoW_Forever_Logo.png';
                }}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-friz font-extrabold tracking-wider text-sm sm:text-lg bg-gradient-to-r from-amber-200 via-amber-400 to-amber-100 bg-clip-text text-transparent truncate">
                  WoW Forever AH
                </span>
                <span className="text-[9px] sm:text-[10px] font-mono font-semibold tracking-wider text-amber-500/90 uppercase hidden xs:inline">
                  Live
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-400 font-narrow truncate">
                <span>Binary Engine</span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-400 font-mono">ArrayBuffer</span>
              </div>
            </div>
          </div>

          {/* Controls: Realm Selector & Ingestion Action */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
            {/* View Mode Toggle Tab (Catalog vs Favorites) */}
            <div className="flex items-center bg-slate-950 p-1 border border-slate-800 rounded-lg mr-1 sm:mr-1.5">
              <button
                onClick={() => setViewMode('catalog')}
                className={`px-2.5 py-1 text-[11px] sm:text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                  viewMode === 'catalog'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Catalog
              </button>
              <button
                onClick={() => setViewMode('favorites')}
                className={`px-2.5 py-1 text-[11px] sm:text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                  viewMode === 'favorites'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Star className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${isMounted && favorites.length > 0 ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
                <span>Favorite ({isMounted ? favorites.length : 0})</span>
              </button>
              <button
                onClick={() => setViewMode('professions')}
                className={`px-2.5 py-1 text-[11px] sm:text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                  viewMode === 'professions'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://wow.zamimg.com/images/wow/icons/large/inv_misc_book_09.jpg"
                  alt="Professions"
                  className="w-4 h-4 rounded border border-slate-700/60 object-cover"
                />
                <span>Professions</span>
              </button>
              <button
                onClick={() => setViewMode('flipping')}
                className={`px-2.5 py-1 text-[11px] sm:text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                  viewMode === 'flipping'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://wow.zamimg.com/images/wow/icons/large/inv_misc_coinbag_01.jpg"
                  alt="Flipping"
                  className="w-4 h-4 rounded border border-slate-700/60 object-cover"
                />
                <span>Flipping</span>
              </button>
            </div>

            {/* Realm Picker */}
            <div className="relative">
              <select
                value={selectedRealmId}
                onChange={(e) => setSelectedRealmId(Number(e.target.value))}
                className="appearance-none bg-slate-950 border border-slate-800 hover:border-slate-700 text-[11px] sm:text-xs text-slate-200 font-medium py-1.5 sm:py-2 pl-2 sm:pl-3 pr-6 sm:pr-8 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500/50 cursor-pointer max-w-[130px] sm:max-w-[210px] truncate"
              >
                {CONNECTED_REALMS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 absolute right-1.5 sm:right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Architecture Details button */}
            <button
              onClick={() => setShowArchDocs(!showArchDocs)}
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-colors"
              title="View binary encoding architecture and R2 storage specifications"
            >
              <Info className="w-3.5 h-3.5 text-amber-400" />
              <span>Architecture</span>
            </button>

            {/* Run Ingestion Trigger */}
            <button
              onClick={() => setShowPipelineModal(true)}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Ingest<span className="hidden sm:inline"> Pipeline</span></span>
            </button>
          </div>
        </div>
      </header>

      {/* Architecture Briefing Drawer */}
      {showArchDocs && (
        <div className="bg-slate-900/95 border-b border-amber-500/30 px-3 sm:px-6 py-4 animate-in slide-in-from-top duration-200">
          <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-xs">
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
              <div className="font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                <span>1. Ingestion & In-Memory DB</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Ingests Blizzard JSON stream, processes through temporary table in memory, aggregates min, median, mean, and 24h delta percentages.
              </p>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
              <div className="font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
                <Binary className="w-3.5 h-3.5" />
                <span>2. Binary Encoding (.bin)</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                `BinaryEncoder` packs data into custom little-endian binary buffers. 28-byte item records in `state.bin` reduce payload size by ~97%.
              </p>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
              <div className="font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5" />
                <span>3. Cloudflare R2 Routing</span>
              </div>
              <p className="text-slate-400 leading-relaxed font-mono text-[10px] break-all">
                data/cached/&#123;realmId&#125;/&#123;itemId&0xFF&#125;/&#123;itemId&#125;.bin
              </p>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
              <div className="font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                <span>4. Client DataView Parsing</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Browser fetches raw ArrayBuffer, and JavaScript DataView decodes directly in client memory with zero server JSON overhead.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Market KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Active Auctions</span>
              <Layers className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-slate-100">
              {isLoadingState
                ? '...'
                : (stateData?.totalAuctionsCount || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Realm: {currentRealm.name.split(' ')[0]}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Monitored Commodities</span>
              <Database className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-slate-100">
              {isLoadingState
                ? '...'
                : (stateData?.totalItemsCount || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Encoded into sharded .bin files
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Total Market Valuation</span>
              <Coins className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-lg sm:text-xl font-bold font-mono text-amber-200 truncate">
              {isLoadingState ? '...' : <WoWMoney copper={totalMarketCap} size="sm" />}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Sum of (Median × Volume)</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Client Decoding Speed</span>
              <Binary className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-400">
              {isLoadingState ? '...' : `${decodingTimeMs} ms`}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Direct DataView ArrayBuffer parse
            </div>
          </div>
        </div>

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
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Click entry instructions styled exactly like the screenshot */}
            <div className="text-center py-4 bg-slate-900/40 border border-slate-800 rounded-xl">
              <div className="inline-flex items-center gap-2.5 text-sm sm:text-base font-friz text-amber-300 font-bold select-none uppercase tracking-wide">
                <span>📈</span>
                <span>Click an entry for more information.</span>
                <span>📈</span>
              </div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl font-narrow">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-narrow">
                  <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-friz font-bold tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4 w-36">Price ⬆</th>
                      <th className="py-3.5 px-4">Name</th>
                      <th className="py-3.5 px-4 w-44">Available</th>
                      <th className="py-3.5 px-4 w-14 text-center">★</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-narrow">
                    {favoriteItems.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-16 text-center text-slate-500 italic text-[14px]">
                          You haven&apos;t selected any favorite items yet. Click the star icon on any item in the catalog or detail view to add them here!
                        </td>
                      </tr>
                    ) : (
                      favoriteItems.map((item) => {
                        return (
                          <tr
                            key={item.itemId}
                            onClick={() => handleSelectItem(item.itemId)}
                            className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                          >
                            {/* Price */}
                            <td className="py-3.5 px-4 font-narrow">
                              <WoWMoney copper={item.minPrice} size="md" />
                            </td>

                            {/* Name & Icon */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-9 h-9 rounded-lg overflow-hidden border flex-shrink-0 ${getQualityBorderColor(
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
                                </div>
                                <span
                                  className={`font-friz font-bold text-[15.2px] group-hover:underline ${getQualityColor(
                                    item.meta.quality
                                  )}`}
                                >
                                  {item.meta.name}
                                </span>
                              </div>
                            </td>

                            {/* Available volume */}
                            <td className="py-3.5 px-4 text-slate-200 font-narrow text-[15.2px]">
                              <span className="font-bold">{item.quantity.toLocaleString()}</span>
                            </td>

                            {/* Unfavorite Star */}
                            <td className="py-3.5 px-4 text-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavorite(item.itemId);
                                }}
                                className="p-1 hover:scale-120 transition-transform text-amber-400 cursor-pointer"
                                title="Remove from favorites"
                              >
                                <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : viewMode === 'professions' ? (
          <div className="space-y-6 animate-in fade-in duration-200 w-full">
            {/* Professions Sub-header */}
            <div className="p-4 sm:p-5 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
              <div className="space-y-1">
                <h2 className="font-friz font-bold text-base sm:text-lg text-amber-400 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://wow.zamimg.com/images/wow/icons/large/inv_misc_book_09.jpg"
                    alt="Professions"
                    className="w-5.5 h-5.5 rounded border border-slate-700/60 object-cover flex-shrink-0"
                  />
                  <span>Professions & Crafting Profitability</span>
                </h2>
                <p className="text-xs text-slate-400 font-narrow">
                  Calculates crafting margins in real-time based on current listings on{' '}
                  <span className="font-bold text-slate-200">{currentRealm.name}</span>.
                </p>
              </div>

              {/* Profession Filter Pills */}
              <div className="flex flex-wrap gap-1.5 bg-slate-950 p-1.5 border border-slate-800 rounded-xl">
                {[
                  'All',
                  'Alchemy',
                  'Blacksmithing',
                  'Enchanting',
                  'Engineering',
                  'Herbalism',
                  'Inscription',
                  'Jewelcrafting',
                  'Leatherworking',
                  'Tailoring',
                ].map((prof) => {
                  const isSelected = selectedProfession === prof;
                  const info = PROFESSION_INFO[prof];
                  return (
                    <button
                      key={prof}
                      onClick={() => setSelectedProfession(prof)}
                      className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 select-none ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent hover:border-slate-800'
                      }`}
                      title={info?.description}
                    >
                      {info?.icon && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={info.icon}
                          alt={prof}
                          className="w-4 h-4 rounded object-cover flex-shrink-0"
                        />
                      )}
                      <span>{prof}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Profession Description Banner */}
            <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-900/60 border border-slate-800/80 rounded-xl text-xs sm:text-sm font-narrow">
              {PROFESSION_INFO[selectedProfession]?.icon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={PROFESSION_INFO[selectedProfession].icon}
                  alt={selectedProfession}
                  className="w-5 h-5 rounded object-cover flex-shrink-0 border border-slate-700/60"
                />
              )}
              <div className="min-w-0">
                <span className="font-bold text-amber-400 mr-2">{selectedProfession}:</span>
                <span className="text-slate-300">
                  {PROFESSION_INFO[selectedProfession]?.description ||
                    'Explore live crafting costs, auction house market payouts, and net ROI for all items.'}
                </span>
              </div>
            </div>

            {/* Recipes Grid */}
            <div className="grid grid-cols-1 gap-4">
              {filteredRecipes.map((recipe) => {
                const productMeta = getItemMetadata(recipe.productId);
                const marketPrice = getItemMinBuyout(recipe.productId);
                
                // Calculate total crafting cost
                let totalCost = 0;
                let hasAllPrices = true;
                
                recipe.ingredients.forEach((ing) => {
                  const ingPrice = getItemPrice(ing.itemId);
                  if (ingPrice === 0) hasAllPrices = false;
                  totalCost += ingPrice * ing.quantity;
                });

                const ahFee = Math.round(marketPrice * 0.05);
                const netPayout = marketPrice - ahFee;
                const profit = netPayout - totalCost;
                const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;
                const isProfitable = profit > 0;

                return (
                  <div
                    key={recipe.productId}
                    className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 md:p-5 flex flex-col lg:flex-row items-stretch justify-between gap-6 hover:border-slate-700 transition-colors shadow-md"
                  >
                    {/* 1. Final Product */}
                    <div className="flex items-center gap-4 lg:w-1/4">
                      <div
                        className={`w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden border-2 flex-shrink-0 relative ${getQualityBorderColor(
                          productMeta.quality
                        )}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={productMeta.icon}
                          alt={productMeta.name}
                          className="w-full h-full object-cover"
                        />
                        {loadingItemId === recipe.productId && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <RefreshCw className="w-5 h-5 text-amber-400 animate-spin" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs sm:text-[13px] uppercase font-friz text-amber-500 font-bold tracking-wider">
                          {recipe.profession}
                        </span>
                        <h3
                          onClick={() => handleSelectItem(recipe.productId)}
                          className={`font-friz font-bold text-base sm:text-lg lg:text-xl cursor-pointer hover:underline whitespace-normal break-words leading-tight ${getQualityColor(
                            productMeta.quality
                          )}`}
                          title="Click to Inspect Product"
                        >
                          {productMeta.name}
                        </h3>
                        <div className="mt-1 font-narrow flex items-center gap-1.5 flex-wrap">
                          <span className="text-slate-300 text-[13px] sm:text-sm font-medium">Sell Price:</span>
                          {marketPrice > 0 ? (
                            <WoWMoney copper={marketPrice} size="sm" />
                          ) : (
                            <span className="text-slate-500 italic text-xs">No active listings</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 2. Ingredients List */}
                    <div className="flex-1 bg-slate-950/50 border border-slate-800/60 rounded-xl p-4 sm:p-5 space-y-2 lg:max-w-2xl">
                      <div className="text-xs sm:text-[13px] uppercase font-bold text-slate-300 tracking-wider mb-2.5 font-friz">
                        Materials Needed
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {recipe.ingredients.map((ing) => {
                          const ingMeta = getItemMetadata(ing.itemId);
                          const ingPrice = getItemPrice(ing.itemId);
                          const lineCost = ingPrice * ing.quantity;

                           return (
                            <div
                              key={ing.itemId}
                              onClick={() => handleSelectItem(ing.itemId)}
                              className="flex items-start gap-3 p-2 hover:bg-slate-800/40 rounded-lg transition-colors cursor-pointer"
                              title={`Click to Inspect ${ingMeta.name}`}
                            >
                              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded overflow-hidden border border-slate-800 flex-shrink-0 mt-0.5">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={ingMeta.icon}
                                  alt={ingMeta.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm sm:text-[14.5px] font-bold text-slate-100 whitespace-nowrap overflow-visible leading-tight">
                                  {ingMeta.name}
                                </div>
                                <div className="text-xs text-slate-400 font-narrow flex items-center gap-1.5 flex-wrap mt-0.5">
                                  <span>Qty: <span className="text-amber-400 font-bold">{ing.quantity}</span></span>
                                  <span className="text-slate-600 font-sans">·</span>
                                  {ingPrice > 0 ? (
                                    <>
                                      {ing.quantity > 1 ? (
                                        <>
                                          <WoWMoney copper={ingPrice} size="xs" />
                                          <span className="text-slate-500">each</span>
                                          <span className="text-slate-600 font-sans">·</span>
                                          <span className="text-slate-300 font-medium">Total:</span>
                                          <WoWMoney copper={lineCost} size="xs" />
                                        </>
                                      ) : (
                                        <>
                                          <span>Price:</span>
                                          <WoWMoney copper={ingPrice} size="xs" />
                                        </>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-xs text-slate-600 italic">No price data</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 3. Margins / ROI Summary */}
                    <div className="lg:w-1/4 flex flex-col justify-center items-stretch sm:items-end lg:items-center text-right lg:text-center border-t lg:border-t-0 lg:border-l border-slate-800/80 pt-4 lg:pt-0 pl-0 lg:pl-6">
                      <div className="space-y-2 w-full">
                        <div className="flex justify-between sm:justify-end lg:justify-between items-center gap-3 text-sm text-slate-300 font-narrow">
                          <span>Total Craft Cost:</span>
                          <WoWMoney copper={totalCost} size="sm" />
                        </div>
                        <div className="flex justify-between sm:justify-end lg:justify-between items-center gap-3 text-sm text-slate-300 font-narrow">
                          <span>Market Sell Price:</span>
                          {marketPrice > 0 ? (
                            <WoWMoney copper={marketPrice} size="sm" />
                          ) : (
                            <span className="text-slate-500">N/A</span>
                          )}
                        </div>
                        {marketPrice > 0 && (
                          <div className="flex justify-between sm:justify-end lg:justify-between items-center gap-3 text-xs text-slate-500 font-narrow">
                            <span>AH Commission (5%):</span>
                            <span>-<WoWMoney copper={ahFee} size="xs" /></span>
                          </div>
                        )}

                        {marketPrice > 0 ? (
                          <div
                            className={`mt-4 p-3 rounded-lg border text-center font-narrow flex flex-col items-center justify-center gap-1.5 ${
                              isProfitable
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                            }`}
                          >
                            <span className="text-xs sm:text-[13px] uppercase tracking-wider font-bold">
                              {isProfitable ? '✨ Profitable' : '⚠️ Deficit'}
                            </span>
                            <span className="font-bold text-base sm:text-lg flex items-center justify-center gap-0.5">
                              <span>{isProfitable ? '+' : '-'}</span>
                              <WoWMoney copper={Math.abs(profit)} size="sm" />
                            </span>
                            <span className="text-xs sm:text-[13.5px] font-semibold">
                              ROI: {isProfitable ? '+' : ''}
                              {roi.toFixed(1)}%
                            </span>
                          </div>
                        ) : (
                          <div className="mt-4 p-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-500 text-center font-narrow text-xs">
                            Cannot calculate margin (No listings)
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : viewMode === 'flipping' ? (
          <div className="space-y-6 animate-in fade-in duration-200 w-full font-narrow">
            {/* Header Block */}
            <div className="p-4 sm:p-5 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
              <div className="space-y-1.5">
                <h2 className="font-friz font-bold text-base sm:text-lg text-emerald-400 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://wow.zamimg.com/images/wow/icons/large/inv_misc_coinbag_01.jpg"
                    alt="Flipping"
                    className="w-5.5 h-5.5 rounded border border-slate-700/60 object-cover flex-shrink-0"
                  />
                  <span>Real-Time AH Flipping & Arbitrage Radar</span>
                </h2>
                <p className="text-sm text-slate-300">
                  Displays intra-server flipping opportunities (under-market historical deviations) and cross-realm arbitrage opportunities (buy cheap on one server, sell higher on another).
                </p>
              </div>

              {/* Reload & Status Info */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-sm text-slate-300 flex items-center gap-1.5 bg-slate-950 px-3 py-2 border border-slate-800 rounded-lg">
                  <div className={`w-2.5 h-2.5 rounded-full ${isLoadingAllRealms ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                  <span>
                    {isLoadingAllRealms
                      ? 'Loading cross-realm prices...'
                      : `Synced: ${Object.keys(allRealmsStates).length} active realms`}
                  </span>
                </div>
                <button
                  onClick={loadAllRealmsStates}
                  disabled={isLoadingAllRealms}
                  className="p-2.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 rounded-lg text-slate-300 transition-colors cursor-pointer"
                  title="Reload all realm prices"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingAllRealms ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Profit Filters & Quick Stats */}
            <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <span className="text-sm font-bold text-slate-200 whitespace-nowrap self-center">
                  Minimum required profit:
                </span>
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg p-1">
                  {[1, 5, 10, 50, 100].map((gold) => (
                    <button
                      key={gold}
                      onClick={() => setMinFlippingProfit(gold)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                        minFlippingProfit === gold
                          ? 'bg-emerald-500 text-slate-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {gold}g
                    </button>
                  ))}
                  <div className="flex items-center gap-1 px-2 border-l border-slate-800 ml-1">
                    <input
                      type="number"
                      value={minFlippingProfit}
                      onChange={(e) => setMinFlippingProfit(Math.max(1, Number(e.target.value)))}
                      className="w-12 bg-transparent text-center text-xs font-bold text-amber-300 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Gold</span>
                  </div>
                </div>
              </div>

              <div className="text-sm text-slate-300 font-narrow flex items-center gap-2 justify-end">
                <span>Opportunities found:</span>
                <span className="font-bold text-emerald-400 text-base">{flippingOpportunities.length}</span>
              </div>
            </div>

            {/* Opportunities List */}
            {isLoadingAllRealms && Object.keys(allRealmsStates).length === 0 ? (
              <div className="p-16 text-center space-y-3 bg-slate-900/40 border border-slate-800 rounded-xl">
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
                <div className="text-base font-semibold text-slate-200">Decrypting sharded binary databases for all active realms...</div>
                <div className="text-sm text-slate-400">Scanning sharded binary blocks (.bin) from Cloudflare R2 in real-time</div>
              </div>
            ) : flippingOpportunities.length === 0 ? (
              <div className="p-16 text-center space-y-2 bg-slate-900/40 border border-slate-800 rounded-xl italic text-slate-400 text-sm">
                <div>No flipping opportunities found matching the minimum profit threshold of {minFlippingProfit} Gold (after deducting Auction House commission fees).</div>
                <div className="text-xs text-slate-500">Try lowering the minimum profit threshold or refreshing the database snapshot.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {flippingOpportunities.map((op, idx) => {
                  return (
                    <div
                      key={`flip-${op.itemId}-${idx}`}
                      onClick={() => handleSelectItem(op.itemId)}
                      className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-4 md:p-5 flex flex-col lg:flex-row items-stretch justify-between gap-6 transition-colors shadow-md cursor-pointer group"
                      title="Click to inspect price history"
                    >
                      {/* Left: Product metadata & Type tag */}
                      <div className="flex items-center gap-4 lg:w-1/3 min-w-0">
                        <div
                          className={`w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden border-2 flex-shrink-0 relative ${getQualityBorderColor(
                            op.quality
                          )}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={op.icon}
                            alt={op.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <span
                            className={`inline-block px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider mb-2 ${
                              op.type === 'cross_realm'
                                ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {op.type === 'cross_realm' ? '✈️ Cross-Realm Arbitrage' : '⚖️ Intra-Server Discount'}
                          </span>
                          <h3
                            className={`font-friz font-bold text-sm sm:text-base group-hover:underline truncate leading-snug ${getQualityColor(
                              op.quality
                            )}`}
                          >
                            {op.name}
                          </h3>
                        </div>
                      </div>

                      {/* Middle: Locations & Action details */}
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center border-t sm:border-t-0 lg:border-l border-slate-800/80 pt-4 sm:pt-0 lg:pl-6">
                        {/* BUY target */}
                        <div className="space-y-1.5">
                          <div className="text-xs text-slate-400 uppercase tracking-wide font-bold">🛒 1. Where to Buy (Low Price):</div>
                          <div className="text-sm font-bold text-slate-200 truncate">{op.buyRealm.name}</div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="text-xs text-slate-400">Price:</span>
                            <WoWMoney copper={op.buyPrice} size="md" />
                          </div>
                          {op.type === 'intra_realm' && (
                            <div className="text-xs text-amber-400/90 italic font-semibold">✨ {(100 - (op.buyPrice / op.sellPrice) * 100).toFixed(0)}% under market value!</div>
                          )}
                        </div>

                        {/* SELL target */}
                        <div className="space-y-1.5">
                          <div className="text-xs text-slate-400 uppercase tracking-wide font-bold">⚖️ 2. Where to Sell (High Price):</div>
                          <div className="text-sm font-bold text-slate-200 truncate">{op.sellRealm.name}</div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="text-xs text-slate-400">Target price:</span>
                            <WoWMoney copper={op.sellPrice} size="md" />
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-1 font-semibold">
                            <span>AH fee (5%):</span>
                            <span>-<WoWMoney copper={op.ahFee} size="xs" /></span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Net profit badge */}
                      <div className="lg:w-1/4 flex flex-col justify-center items-stretch sm:items-end lg:items-center text-right lg:text-center border-t lg:border-t-0 lg:border-l border-slate-800/80 pt-4 lg:pt-0 lg:pl-6">
                        <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-xl text-center font-narrow flex flex-col items-center justify-center gap-1.5 w-full lg:max-w-[210px]">
                          <span className="text-xs uppercase tracking-wider font-bold text-emerald-400">📊 Estimated Net Profit:</span>
                          <span className="font-extrabold text-base sm:text-lg text-emerald-300">
                            +<WoWMoney copper={op.netProfit} size="md" />
                          </span>
                          <span className="text-xs sm:text-sm text-slate-300">
                            ROI: <span className="text-emerald-400 font-bold">+{op.roi.toFixed(1)}%</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-6 items-start w-full">
            {/* LEFT SIDEBAR: Classic WoW Categories/Subcategories Menu (Visible on md and larger) */}
            <div className="hidden md:block w-72 flex-shrink-0 bg-slate-900/90 border border-slate-800/80 p-3.5 rounded-xl space-y-3 shadow-xl sticky top-20">
              <div className="flex items-center justify-between font-friz font-bold text-xs uppercase tracking-wider text-slate-300 px-1 pb-1 border-b border-slate-800">
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Filter className="w-3.5 h-3.5" />
                  <span>Categories</span>
                </span>
                <span className="text-[11px] font-mono text-slate-500 font-normal">
                  {stateData?.items.length || 0} items
                </span>
              </div>
              <div className="space-y-1.5 max-h-[76vh] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700/80 scrollbar-track-transparent">
                {WOW_AUCTION_CATEGORIES.map((cat) => {
                  const isActive = selectedCategory === cat.id;
                  const hasSubs = cat.subcategories.length > 0;
                  const count = categoryCounts[cat.id];

                  return (
                    <div key={cat.id} className="space-y-1">
                      <button
                        onClick={() => {
                          setSelectedCategory(cat.id);
                          setSelectedSubcategory('all');
                          setSelectedChildSubcategory('all');
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
                          {count !== undefined && count > 0 && (
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                isActive
                                  ? 'bg-indigo-900/60 text-indigo-200 border border-indigo-500/40'
                                  : 'bg-slate-900 text-slate-400 border border-slate-800'
                              }`}
                            >
                              {count}
                            </span>
                          )}
                          {hasSubs && (
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                isActive ? 'rotate-180 text-white' : 'text-slate-500 group-hover:text-amber-400'
                              }`}
                            />
                          )}
                        </div>
                      </button>

                      {/* Expanded Subcategories */}
                      {isActive && hasSubs && (
                        <div className="pl-2 py-1 space-y-1.5 border-l-2 border-indigo-500/40 ml-3 animate-in slide-in-from-top duration-150">
                          {cat.subcategories.map((sub) => {
                            const isSubActive = selectedSubcategory === sub.id;
                            const hasChildren = sub.children && sub.children.length > 0;

                            return (
                              <div key={sub.id} className="space-y-1">
                                <button
                                  onClick={() => {
                                    setSelectedSubcategory(sub.id);
                                    setSelectedChildSubcategory('all');
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

                                {/* Sub-subcategories: Vertically stacked (una sub alta) with font equal to subcategory */}
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
                                            <span
                                              className={`text-xs ${
                                                isChildActive
                                                  ? 'text-amber-400 font-bold'
                                                  : 'text-slate-600 group-hover:text-slate-400'
                                              }`}
                                            >
                                              •
                                            </span>
                                            <span>{child.label}</span>
                                          </div>
                                          {isChildActive && (
                                            <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                              Active
                                            </span>
                                          )}
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

            {/* Mobile/Tablet Category Accordion selector (hidden on md screens and larger) */}
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
                            setSelectedCategory(cat.id);
                            setSelectedSubcategory('all');
                            setSelectedChildSubcategory('all');
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
                                      setSelectedSubcategory(sub.id);
                                      setSelectedChildSubcategory('all');
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

                                  {/* Mobile Sub-subcategories: Vertically stacked with font equal to subcategory */}
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
                                              <span className={`text-xs ${isChildActive ? 'text-amber-400 font-bold' : 'text-slate-600'}`}>
                                                •
                                              </span>
                                              <span>{child.label}</span>
                                            </div>
                                            {isChildActive && (
                                              <span className="text-[9px] uppercase font-bold text-amber-400">
                                                Active
                                              </span>
                                            )}
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

            {/* RIGHT COLUMN: Search Bar & Item Grid/Table */}
            <div className="flex-1 w-full space-y-4">
              {/* Filter, Search & Controls Bar */}
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 p-2.5 sm:p-3 bg-slate-900/90 border border-slate-800 rounded-xl shadow-md">
                {/* Search Input */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search items by name, ID, or material..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs text-slate-200 pl-9 pr-4 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  {/* Current Active Category / Subcategory Badge indicator */}
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
                        onClick={() => {
                          setSelectedCategory('all');
                          setSelectedSubcategory('all');
                          setSelectedChildSubcategory('all');
                        }}
                        className="ml-1 text-[11px] text-slate-500 hover:text-rose-400 cursor-pointer"
                        title="Clear filter"
                      >
                        <X className="w-3 h-3 inline" />
                      </button>
                    </div>
                  )}

                  {/* Sort Selector & Refresh */}
                  <div className="flex items-center gap-1.5">
                    <select
                      value={sortBy}
                      onChange={(e) =>
                        setSortBy(
                          e.target.value as 'price_desc' | 'price_asc' | 'qty_desc' | 'delta_desc' | 'delta_asc'
                        )
                      }
                      className="flex-1 sm:flex-none bg-slate-950 border border-slate-800 text-[11px] sm:text-xs text-slate-300 py-1.5 sm:py-2 px-2.5 sm:px-3 rounded-lg focus:outline-none cursor-pointer"
                    >
                      <option value="qty_desc">Highest Volume</option>
                      <option value="price_desc">Highest Median Price</option>
                      <option value="price_asc">Lowest Median Price</option>
                      <option value="delta_desc">Biggest 24h Gainers (+%)</option>
                      <option value="delta_asc">Biggest 24h Drops (-%)</option>
                    </select>

                    <button
                      onClick={() => loadStateBin(selectedRealmId)}
                      className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0 cursor-pointer"
                      title="Reload state.bin"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoadingState ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Items Container */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                {isLoadingState ? (
                  <div className="p-12 sm:p-16 text-center space-y-3">
                    <RefreshCw className="w-7 h-7 sm:w-8 sm:h-8 text-amber-400 animate-spin mx-auto" />
                    <div className="text-sm font-medium text-slate-300">
                      Fetching and decoding state.bin from cache...
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      Decoded directly on client via JavaScript DataView
                    </div>
                  </div>
                ) : stateError ? (
                  <div className="p-8 sm:p-12 text-center space-y-3">
                    <div className="text-rose-400 font-semibold text-sm">Failed to load market state</div>
                    <div className="text-xs text-slate-400">{stateError}</div>
                    <button
                      onClick={() => loadStateBin(selectedRealmId)}
                      className="mt-2 px-4 py-2 bg-amber-500 text-slate-950 font-semibold text-xs rounded-lg hover:bg-amber-400 transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                ) : processedItems.length === 0 ? (
                  <div className="p-12 sm:p-16 text-center text-slate-500 text-xs">
                    No items match your query &quot;{searchQuery}&quot;
                  </div>
                ) : (
                  <>
                    {/* Mobile View: Touch-Friendly Responsive Cards (sm:hidden) */}
                    <div className="block sm:hidden divide-y divide-slate-800/80">
                      {processedItems.map((item) => {
                        const isPos = item.priceDelta24h >= 0;
                        return (
                          <div
                            key={`mob-${item.itemId}`}
                            onClick={() => handleSelectItem(item.itemId)}
                            className={`p-3 transition-colors cursor-pointer relative ${
                              loadingItemId === item.itemId
                                ? 'bg-amber-500/10 border-l-2 border-amber-400'
                                : 'hover:bg-slate-800/40 active:bg-slate-800/60'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2.5">
                              <div className="flex items-center gap-2 min-w-0">
                                {/* Favorite Star */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFavorite(item.itemId);
                                  }}
                                  className="p-1.5 text-amber-400 hover:text-amber-300 transition-colors flex-shrink-0 cursor-pointer"
                                  title={favorites.includes(item.itemId) ? "Remove from favorites" : "Add to favorites"}
                                >
                                  <Star
                                    className={`w-4.5 h-4.5 ${
                                      favorites.includes(item.itemId) ? 'fill-amber-400 text-amber-400' : 'text-slate-600'
                                    }`}
                                  />
                                </button>

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
                                    className={`font-friz font-bold text-[13.5px] truncate ${getQualityColor(
                                      item.meta.quality
                                    )}`}
                                  >
                                    {item.meta.name}
                                  </div>
                                  <div className="text-[11.2px] text-slate-400 font-narrow">
                                    {item.meta.subclass} · iLvl {item.meta.itemLevel}
                                  </div>
                                </div>
                              </div>

                              <span
                                className={`inline-flex items-center gap-0.5 text-[13.2px] font-narrow font-bold flex-shrink-0 ${
                                  isPos ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {isPos ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                                <span>{isPos ? '+' : ''}{item.priceDelta24h.toFixed(1)}%</span>
                              </span>
                            </div>

                            <div className="mt-2.5 pt-2 border-t border-slate-800/60 grid grid-cols-3 gap-1 text-[12.2px] font-narrow">
                              <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-tight font-friz">Min Buyout</div>
                                <WoWMoney copper={item.minPrice} size="xs" className="text-[13.2px]" />
                              </div>
                              <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-tight font-friz">Median</div>
                                <WoWMoney copper={item.medianPrice} size="xs" className="text-[13.2px]" />
                              </div>
                              <div className="text-right">
                                <div className="text-[11px] text-slate-500 uppercase tracking-tight font-friz">Volume</div>
                                <span className="font-narrow font-bold text-slate-200 text-[13.2px]">
                                  {item.quantity.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Tablet & Desktop View: Full Table (hidden sm:block) */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-left text-[13.5px] font-narrow">
                        <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-300 font-friz font-semibold tracking-wider text-[13px]">
                          <tr>
                            <th className="py-3.5 px-3 w-10 text-center">★</th>
                            <th className="py-3.5 px-4">Item Name</th>
                            <th className="py-3.5 px-4">Min Buyout</th>
                            <th className="py-3.5 px-4">Median Price</th>
                            <th className="py-3.5 px-4">Available Volume</th>
                            <th className="py-3.5 px-4">24h Delta</th>
                            <th className="py-3.5 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-narrow text-[13.5px]">
                          {processedItems.map((item) => {
                            const isPos = item.priceDelta24h >= 0;
                            return (
                              <tr
                                key={item.itemId}
                                onClick={() => handleSelectItem(item.itemId)}
                                className="hover:bg-slate-800/40 transition-colors cursor-pointer group text-[13.5px]"
                              >
                                {/* Favorite Star */}
                                <td className="py-3.5 px-3 text-center">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFavorite(item.itemId);
                                    }}
                                    className="p-1 hover:scale-120 transition-all text-amber-400 cursor-pointer"
                                    title={favorites.includes(item.itemId) ? "Remove from favorites" : "Add to favorites"}
                                  >
                                    <Star
                                      className={`w-4.5 h-4.5 ${
                                        favorites.includes(item.itemId)
                                          ? 'fill-amber-400 text-amber-400'
                                          : 'text-slate-600 group-hover:text-slate-400'
                                      }`}
                                    />
                                  </button>
                                </td>

                                {/* Item Name & Icon */}
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={`w-10 h-10 rounded-lg overflow-hidden border flex-shrink-0 ${getQualityBorderColor(
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
                                    </div>
                                    <div className="min-w-0">
                                      <div
                                        className={`font-friz font-bold text-[13.5px] sm:text-[15.5px] truncate group-hover:underline ${getQualityColor(
                                          item.meta.quality
                                        )}`}
                                      >
                                        {item.meta.name}
                                      </div>
                                      <div className="text-[12.2px] text-slate-400 font-narrow">
                                        iLvl {item.meta.itemLevel} · #{item.itemId}
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                {/* Min Buyout */}
                                <td className="py-3.5 px-4 font-narrow text-[13.5px]">
                                  <WoWMoney copper={item.minPrice} size="sm" className="text-[15.5px]" />
                                </td>

                                {/* Median Price */}
                                <td className="py-3.5 px-4 font-narrow text-[13.5px]">
                                  <WoWMoney copper={item.medianPrice} size="sm" className="text-[15.5px]" />
                                </td>

                                {/* Quantity */}
                                <td className="py-3.5 px-4 text-slate-200 font-narrow text-[13.5px]">
                                  <span className="font-bold text-[14.5px]">{item.quantity.toLocaleString()}</span>
                                  <span className="text-[12.2px] text-slate-400 ml-1.5">
                                    ({item.numAuctions} lots)
                                  </span>
                                </td>

                                {/* 24h Delta */}
                                <td className="py-3.5 px-4 font-narrow text-[13.5px]">
                                  <span
                                    className={`inline-flex items-center gap-1 font-bold text-[14px] ${
                                      isPos ? 'text-emerald-400' : 'text-rose-400'
                                    }`}
                                  >
                                    {isPos ? (
                                      <TrendingUp className="w-3.5 h-3.5" />
                                    ) : (
                                      <TrendingDown className="w-3.5 h-3.5" />
                                    )}
                                    <span>{isPos ? '+' : ''}{item.priceDelta24h.toFixed(1)}%</span>
                                  </span>
                                </td>

                                {/* Action buttons */}
                                <td className="py-3.5 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelectItem(item.itemId);
                                      }}
                                      className="font-friz px-3 py-1.5 text-[12.2px] font-semibold rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                                    >
                                      {loadingItemId === item.itemId && (
                                        <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                                      )}
                                      <span>Inspect</span>
                                    </button>
                                  </div>
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
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-5 sm:py-6 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">WoW Forever AH</span>
            <span>·</span>
            <span>Live Binary Auction Intelligence</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-end">
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
            <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500">
              <span>Encoding: LITTLE_ENDIAN UNDR-v1</span>
              <span>·</span>
              <span>Storage: Cloudflare R2</span>
            </div>
          </div>
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

      {/* Item Detail Modal */}
      {selectedItemBin && (
        <ItemDetailModal
          itemData={selectedItemBin}
          realmName={currentRealm.name}
          onClose={() => setSelectedItemBin(null)}
          onOpenBinaryInspector={() => setShowBinaryInspector(true)}
          isFavorited={favorites.includes(selectedItemBin.itemId)}
          onToggleFavorite={() => toggleFavorite(selectedItemBin.itemId)}
          onSelectRealm={(targetRealmId) => {
            handleSelectItem(selectedItemBin.itemId, targetRealmId);
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

      {/* Pipeline Ingestion Modal */}
      {showPipelineModal && (
        <PipelineRunnerModal
          currentRealmId={selectedRealmId}
          onClose={() => setShowPipelineModal(false)}
          onPipelineComplete={() => {
            loadStateBin(selectedRealmId);
          }}
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
