'use client';

import { useState, useMemo } from 'react';
import { WoWMoney } from './WoWMoney';

// TODO: Replace with live WoW: Forever realm list and real-time ingestion when moving to production

export interface MultiRealmPriceEntry {
  realmId: number;
  realmName: string;
  region: 'eu' | 'us';
  population: 'Low' | 'Medium' | 'High' | 'Full';
  priceCopper: number; // in copper (10000 = 1g)
  quantity: number;
  lastSeenText?: string; // e.g., '31 hours ago', '3 days ago', '12 days ago'
}

interface MultiRealmPriceTableProps {
  itemId: number;
  currentRealmId?: number;
  currentPriceCopper?: number;
  currentQuantity?: number;
  onSelectRealm?: (realmId: number) => void;
  className?: string;
}

// Complete mock realm database matching TUJ / WoW classic multi-realm ecosystem
// Includes live WoW: Forever connected realms and classic server references
const MOCK_MULTI_REALM_CATALOG: Array<{
  id: number;
  name: string;
  region: 'eu' | 'us';
  population: 'Low' | 'Medium' | 'High' | 'Full';
  priceFactor: number; // Variance multiplier around base price
  qtyFactor: number;
  lastSeenOffsetHours?: number;
}> = [
  { id: 4401, name: 'WoW: Forever Classic (Main)', region: 'eu', population: 'Full', priceFactor: 1.0, qtyFactor: 1.0 },
  { id: 4402, name: 'WoW: Forever Hardcore', region: 'eu', population: 'High', priceFactor: 1.45, qtyFactor: 0.6 },
  { id: 1001, name: 'Aegwynn', region: 'eu', population: 'Low', priceFactor: 0.85, qtyFactor: 0, lastSeenOffsetHours: 31 },
  { id: 1002, name: 'Aggramar', region: 'eu', population: 'Low', priceFactor: 0.42, qtyFactor: 0, lastSeenOffsetHours: 72 },
  { id: 1003, name: "Al'Akir", region: 'eu', population: 'High', priceFactor: 1.15, qtyFactor: 2 },
  { id: 1004, name: 'Alexstrasza', region: 'eu', population: 'Medium', priceFactor: 2.1, qtyFactor: 0, lastSeenOffsetHours: 288 },
  { id: 1005, name: 'Anetheron', region: 'eu', population: 'Low', priceFactor: 1.75, qtyFactor: 0, lastSeenOffsetHours: 216 },
  { id: 1006, name: 'Antonidas', region: 'eu', population: 'Full', priceFactor: 0.92, qtyFactor: 5 },
  { id: 1007, name: 'Arak-arahm', region: 'eu', population: 'Low', priceFactor: 2.4, qtyFactor: 1 },
  { id: 1008, name: 'Archimonde', region: 'eu', population: 'High', priceFactor: 0.98, qtyFactor: 12 },
  { id: 1009, name: 'Argent Dawn', region: 'eu', population: 'Full', priceFactor: 1.28, qtyFactor: 0, lastSeenOffsetHours: 16 },
  { id: 1010, name: 'Arthas', region: 'eu', population: 'Medium', priceFactor: 1.62, qtyFactor: 1 },
  { id: 1011, name: 'Arygos', region: 'eu', population: 'Low', priceFactor: 1.9, qtyFactor: 0, lastSeenOffsetHours: 168 },
  { id: 1012, name: 'Ashenvale / Ясеневый лес', region: 'eu', population: 'Low', priceFactor: 1.25, qtyFactor: 1 },
  { id: 1013, name: 'Aszune', region: 'eu', population: 'Low', priceFactor: 1.25, qtyFactor: 1 },
  { id: 1014, name: 'Azjol-Nerub', region: 'eu', population: 'Medium', priceFactor: 1.1, qtyFactor: 3 },
  { id: 1015, name: 'Bloodhoof', region: 'us', population: 'Medium', priceFactor: 1.35, qtyFactor: 4 },
  { id: 1305, name: 'Silvermoon / Tarren Mill (Connected)', region: 'eu', population: 'High', priceFactor: 0.95, qtyFactor: 8 },
  { id: 1403, name: 'Draenor / Kazzak (Connected)', region: 'eu', population: 'High', priceFactor: 0.9, qtyFactor: 14 },
  { id: 3678, name: 'Illidan / Area 52 (Connected)', region: 'us', population: 'Full', priceFactor: 0.88, qtyFactor: 18 },
  { id: 3680, name: 'Stormrage (Connected)', region: 'us', population: 'High', priceFactor: 1.05, qtyFactor: 11 },
];

function formatTimeAgo(hours?: number): string | undefined {
  if (hours === undefined || hours <= 0) return undefined;
  if (hours < 48) {
    return `${hours} hours ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

export function MultiRealmPriceTable({
  itemId,
  currentRealmId = 4401,
  currentPriceCopper = 100000, // default 10g
  currentQuantity = 10,
  onSelectRealm,
  className = '',
}: MultiRealmPriceTableProps) {
  const [sortField, setSortField] = useState<'name' | 'population' | 'price' | 'quantity'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Deterministically generate cross-realm price differences based on itemId & realm metadata
  const realmEntries = useMemo<MultiRealmPriceEntry[]>(() => {
    return MOCK_MULTI_REALM_CATALOG.map((realm) => {
      // If it's the current realm, use the active item's live price and quantity
      if (realm.id === currentRealmId) {
        return {
          realmId: realm.id,
          realmName: realm.name,
          region: realm.region,
          population: realm.population,
          priceCopper: currentPriceCopper,
          quantity: currentQuantity,
          lastSeenText: currentQuantity === 0 ? 'Just now' : undefined,
        };
      }

      // Generate consistent pseudo-random price variation based on itemId hash
      const hash = ((itemId * 2654435761 + realm.id * 805306457) >>> 0) % 1000;
      const variation = 0.85 + (hash / 1000) * 0.4; // +/- 20%
      const baseCalculated = Math.max(100, Math.round(currentPriceCopper * realm.priceFactor * variation));
      
      // Keep copper and silver realistic (round to nearest silver/copper)
      const adjustedPrice = Math.max(50, baseCalculated);
      const adjustedQty = realm.qtyFactor === 0 ? 0 : Math.max(0, Math.round((currentQuantity || 5) * realm.qtyFactor * (0.6 + (hash % 100) / 120)));

      return {
        realmId: realm.id,
        realmName: realm.name,
        region: realm.region,
        population: realm.population,
        priceCopper: adjustedPrice,
        quantity: adjustedQty,
        lastSeenText: adjustedQty === 0 ? formatTimeAgo(realm.lastSeenOffsetHours || 24) : undefined,
      };
    });
  }, [itemId, currentRealmId, currentPriceCopper, currentQuantity]);

  // Handle column header sort toggle
  const handleSort = (field: 'name' | 'population' | 'price' | 'quantity') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sort entries
  const sortedEntries = useMemo(() => {
    const popWeight: Record<string, number> = {
      Low: 1,
      Medium: 2,
      High: 3,
      Full: 4,
    };

    return [...realmEntries].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.realmName.localeCompare(b.realmName);
          break;
        case 'population':
          comparison = (popWeight[a.population] || 0) - (popWeight[b.population] || 0);
          break;
        case 'price':
          comparison = a.priceCopper - b.priceCopper;
          break;
        case 'quantity':
          comparison = a.quantity - b.quantity;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [realmEntries, sortField, sortDirection]);

  const getPopColor = (pop: string) => {
    switch (pop) {
      case 'Low':
        return 'text-emerald-400 font-medium'; // green as in TUJ
      case 'Medium':
        return 'text-amber-400 font-medium'; // yellow/gold
      case 'High':
        return 'text-red-500 font-medium'; // red
      case 'Full':
        return 'text-red-600 font-bold'; // strong red
      default:
        return 'text-slate-400';
    }
  };

  return (
    <div className={`space-y-2 select-none ${className}`}>
      {/* Container styled matching the classic TUJ multi-realm table screenshot */}
      <div className="bg-[#111114] border border-slate-800/90 rounded-lg overflow-hidden shadow-2xl font-narrow">
        <div className="overflow-x-auto max-h-[380px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          <table className="w-full text-left font-narrow border-collapse text-[16px]">
            {/* Table Header */}
            <thead className="sticky top-0 bg-[#141418] border-b border-slate-800 text-slate-200 font-friz text-[15.5px] tracking-wide z-10 shadow-sm">
              <tr>
                {/* Realm Column */}
                <th
                  onClick={() => handleSort('name')}
                  className="py-3 px-4 sm:px-5 cursor-pointer hover:text-amber-300 transition-colors select-none"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold">Realm</span>
                    {sortField === 'name' ? (
                      <span className="text-amber-400 font-bold text-[16px]">{sortDirection === 'asc' ? '⬆' : '⬇'}</span>
                    ) : (
                      <span className="text-slate-500 text-[13px]">↕</span>
                    )}
                  </div>
                </th>

                {/* Pop Column */}
                <th
                  onClick={() => handleSort('population')}
                  className="py-3 px-4 text-right cursor-pointer hover:text-amber-300 transition-colors w-28 sm:w-32 select-none"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="font-bold">Pop</span>
                    {sortField === 'population' && (
                      <span className="text-amber-400 font-bold text-[16px]">{sortDirection === 'asc' ? '⬆' : '⬇'}</span>
                    )}
                  </div>
                </th>

                {/* Price Column */}
                <th
                  onClick={() => handleSort('price')}
                  className="py-3 px-4 text-right cursor-pointer hover:text-amber-300 transition-colors w-36 sm:w-48 select-none"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="font-bold">Price</span>
                    {sortField === 'price' && (
                      <span className="text-amber-400 font-bold text-[16px]">{sortDirection === 'asc' ? '⬆' : '⬇'}</span>
                    )}
                  </div>
                </th>

                {/* Quantity Column */}
                <th
                  onClick={() => handleSort('quantity')}
                  className="py-3 px-4 text-right cursor-pointer hover:text-amber-300 transition-colors w-40 sm:w-52 select-none"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="font-bold">Quantity</span>
                    {sortField === 'quantity' && (
                      <span className="text-amber-400 font-bold text-[16px]">{sortDirection === 'asc' ? '⬆' : '⬇'}</span>
                    )}
                  </div>
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-800/50 font-narrow text-[16px]">
              {sortedEntries.map((entry) => {
                const isSelected = entry.realmId === currentRealmId;
                return (
                  <tr
                    key={entry.realmId}
                    onClick={() => {
                      if (onSelectRealm) {
                        onSelectRealm(entry.realmId);
                      }
                    }}
                    className={`transition-colors cursor-pointer group ${
                      isSelected
                        ? 'bg-amber-500/15 border-l-2 border-amber-400'
                        : 'hover:bg-slate-800/50'
                    }`}
                    title={
                      isSelected
                        ? `Currently viewing ${entry.realmName}`
                        : `Click to switch view to ${entry.realmName}`
                    }
                  >
                    {/* Realm Name */}
                    <td className="py-2.5 px-4 sm:px-5 text-slate-100 font-sans text-[16px] truncate max-w-[220px] sm:max-w-none">
                      <div className="flex items-center gap-2">
                        <span className="group-hover:text-amber-300 transition-colors font-medium">
                          {entry.realmName}
                        </span>
                        {isSelected && (
                          <span className="text-[11.5px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Active
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Population Badge */}
                    <td className="py-2.5 px-4 text-right">
                      <span className={`text-[15.5px] ${getPopColor(entry.population)}`}>
                        {entry.population}
                      </span>
                    </td>

                    {/* Price in Gold / Silver / Copper */}
                    <td className="py-2.5 px-4 text-right">
                      <WoWMoney copper={entry.priceCopper} size="md" className="justify-end text-[16.2px]" />
                    </td>

                    {/* Quantity with relative timestamp */}
                    <td className="py-2.5 px-4 text-right font-narrow">
                      <div className="flex items-center justify-end gap-2.5 text-[15.5px]">
                        {entry.lastSeenText && (
                          <span className="text-slate-400 text-[13.5px] tracking-tight whitespace-nowrap">
                            {entry.lastSeenText}
                          </span>
                        )}
                        <span
                          className={`font-bold text-[16px] ${
                            entry.quantity === 0
                              ? 'text-slate-500'
                              : entry.quantity > 5
                              ? 'text-emerald-400'
                              : 'text-slate-200'
                          }`}
                        >
                          {entry.quantity}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[13px] text-slate-400 px-1 italic">
        💡 Click on any realm row to switch and load price trends & auction lots for that specific realm.
      </p>
    </div>
  );
};
