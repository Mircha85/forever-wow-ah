'use client';

import { useState } from 'react';
import { type DecodedItemBin, type WowItemMetadata, TIME_LEFT_LABELS } from '../types/auction';
import { getItemMetadata, getQualityColor, getQualityBorderColor } from '../data/itemsCatalog';
import { WoWMoney } from './WoWMoney';
import { AuctionChart } from './AuctionChart';
import { HourlyHeatMaps } from './HourlyHeatMaps';
import { MultiRealmPriceTable } from './MultiRealmPriceTable';
import {
  X,
  TrendingUp,
  TrendingDown,
  Layers,
  Clock,
  Coins,
  Scale,
  Binary,
  ExternalLink,
  Calendar,
  LineChart,
  LayoutGrid,
  Star,
} from 'lucide-react';

interface ItemDetailModalProps {
  itemData: DecodedItemBin;
  realmName?: string;
  onClose: () => void;
  onOpenBinaryInspector?: () => void;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
  onSelectRealm?: (realmId: number) => void;
  meta?: WowItemMetadata;
}

export function ItemDetailModal({
  itemData,
  realmName,
  onClose,
  onOpenBinaryInspector,
  isFavorited = false,
  onToggleFavorite,
  onSelectRealm,
  meta: metaProp,
}: ItemDetailModalProps) {
  const meta = metaProp ?? getItemMetadata(itemData.itemId);
  // Default to heatmaps so the 2 hourly heat maps are immediately displayed upon clicking an item!
  const [activeTab, setActiveTab] = useState<'heatmaps' | 'chart' | 'lots' | 'all'>('heatmaps');

  const resolvedRealmName =
    realmName ||
    // Caller passes `realmName` from page.tsx (already resolved via
    // /api/realms). Fall back to a generic label when missing.
    'Connected Realm';

  const priceDeltaPositive = itemData.priceDelta24h >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-3 md:p-6 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-5xl h-full sm:h-auto sm:max-h-[94vh] flex flex-col bg-slate-900 border-0 sm:border border-slate-700/80 rounded-none sm:rounded-2xl shadow-2xl overflow-hidden font-narrow"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Sticky for mobile */}
        <div className="flex items-center justify-between px-3.5 sm:px-6 py-3 sm:py-4 border-b border-slate-800 bg-slate-950/95 sticky top-0 z-30 flex-shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            {/* WoW Icon with Quality Glow Border */}
            <div
              className={`relative w-11 h-11 sm:w-13 sm:h-13 rounded-lg overflow-hidden border-2 shadow-lg flex-shrink-0 ${getQualityBorderColor(
                meta.quality
              )}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={meta.icon}
                alt={meta.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg';
                }}
              />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2
                  className={`font-friz text-[16px] sm:text-[19px] md:text-[21px] font-bold truncate ${getQualityColor(
                    meta.quality
                  )}`}
                >
                  {meta.name}
                </h2>
                {onToggleFavorite && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite();
                    }}
                    className="p-1 hover:scale-110 active:scale-95 transition-transform text-amber-400 hover:text-amber-300 cursor-pointer flex-shrink-0"
                    title={isFavorited ? "Remove from favorites" : "Add to favorites"}
                    aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Star
                      className={`w-5 h-5 ${isFavorited ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`}
                    />
                  </button>
                )}
                <a
                  href={`https://www.wowhead.com/item=${meta.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-400 hover:text-amber-400 transition-colors p-1 flex-shrink-0"
                  title="View on Wowhead"
                  aria-label="View on Wowhead"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              <div className="flex items-center gap-2 text-[14px] sm:text-[15.2px] text-slate-300 font-narrow truncate mt-0.5">
                <span className="font-friz font-semibold text-slate-200">{meta.itemClass}</span>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span>{meta.subclass}</span>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span className="font-bold text-amber-300">iLvl {meta.itemLevel}</span>
                <span aria-hidden="true" className="hidden sm:inline text-slate-500">·</span>
                <span className="font-narrow text-slate-400 hidden sm:inline">ID #{meta.id}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {onOpenBinaryInspector && (
              <button
                onClick={onOpenBinaryInspector}
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-[14px] font-friz font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                title="Inspect client-side ArrayBuffer/DataView raw bytes"
              >
                <Binary className="w-4 h-4 text-amber-400" />
                <span>Binary Spec</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-3.5 sm:p-6 space-y-5 sm:space-y-6">
          {/* Key Metrics Grid with ~15-15.2px text (2 columns on mobile, 4 on tablet/desktop) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="flex items-center gap-1.5 text-[14px] sm:text-[15px] text-slate-400 mb-1.5 font-friz">
                <Coins className="w-4 h-4 text-sky-400 flex-shrink-0" />
                <span className="truncate">Min Buyout</span>
              </div>
              <WoWMoney copper={itemData.minBuyout} size="md" />
            </div>

            <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="flex items-center gap-1.5 text-[14px] sm:text-[15px] text-slate-400 mb-1.5 font-friz">
                <Scale className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span className="truncate">Median Market</span>
              </div>
              <WoWMoney copper={itemData.medianPrice} size="md" />
            </div>

            <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="flex items-center gap-1.5 text-[14px] sm:text-[15px] text-slate-400 mb-1.5 font-friz">
                <Layers className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="truncate">Available Volume</span>
              </div>
              <div className="text-[15.5px] sm:text-[17px] font-bold text-slate-100 font-narrow">
                {itemData.totalQuantity.toLocaleString()}
                <span className="text-[14px] text-slate-400 font-normal ml-1.5">
                  ({itemData.numAuctions} lots)
                </span>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="flex items-center gap-1.5 text-[14px] sm:text-[15px] text-slate-400 mb-1.5 font-friz">
                {priceDeltaPositive ? (
                  <TrendingUp className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-rose-400 flex-shrink-0" />
                )}
                <span className="truncate">24h Price Delta</span>
              </div>
              <div
                className={`text-[15.5px] sm:text-[17px] font-bold font-narrow ${
                  priceDeltaPositive ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {priceDeltaPositive ? '+' : ''}
                {itemData.priceDelta24h.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Tab Selector & Navigation with ~15px text */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 border border-slate-800 rounded-lg overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveTab('heatmaps')}
                className={`flex items-center gap-2 px-3.5 py-2 text-[14.5px] sm:text-[15.2px] font-friz rounded-md transition-colors cursor-pointer flex-shrink-0 whitespace-nowrap ${
                  activeTab === 'heatmaps'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Calendar className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>Hourly Heat Maps</span>
              </button>

              <button
                onClick={() => setActiveTab('chart')}
                className={`flex items-center gap-2 px-3.5 py-2 text-[14.5px] sm:text-[15.2px] font-friz rounded-md transition-colors cursor-pointer flex-shrink-0 whitespace-nowrap ${
                  activeTab === 'chart'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LineChart className="w-4 h-4 text-sky-400 flex-shrink-0" />
                <span>Price Trends</span>
              </button>

              <button
                onClick={() => setActiveTab('lots')}
                className={`flex items-center gap-2 px-3.5 py-2 text-[14.5px] sm:text-[15.2px] font-friz rounded-md transition-colors cursor-pointer flex-shrink-0 whitespace-nowrap ${
                  activeTab === 'lots'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Active Lots ({itemData.activeLots.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('all')}
                className={`flex items-center gap-2 px-3.5 py-2 text-[14.5px] sm:text-[15.2px] font-friz rounded-md transition-colors cursor-pointer flex-shrink-0 whitespace-nowrap ${
                  activeTab === 'all'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="View Heat Maps, Chart, and Lots together"
              >
                <LayoutGrid className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <span>All In One</span>
              </button>
            </div>

            <div className="text-[14px] sm:text-[15px] text-slate-400 font-narrow flex items-center gap-2 justify-end">
              <span>Market Valuation:</span>
              <WoWMoney copper={itemData.marketCap} size="sm" />
            </div>
          </div>

          {/* Tab Contents: Heat Maps, Chart, Lots, or All In One */}
          {activeTab === 'heatmaps' ? (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Display the 2 Hourly Heat Maps */}
              <HourlyHeatMaps
                hourlyDeltas={itemData.hourlyDeltas}
                itemName={meta.name}
                realmName={resolvedRealmName}
                defaultOpen={true}
              />
            </div>
          ) : activeTab === 'chart' ? (
            <div className="space-y-6 animate-in fade-in duration-150">
              <AuctionChart
                dailyHistory={itemData.dailyHistory}
                hourlyDeltas={itemData.hourlyDeltas}
                itemName={meta.name}
              />

              {/* Multi-Realm Price Comparison Table (TUJ Cross-Realm View) */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-slate-300 font-friz px-1">
                  <span className="font-bold uppercase tracking-wider text-amber-400 text-[14.5px] sm:text-[15.2px] flex items-center gap-2">
                    <span>🌐</span>
                    <span>Cross-Realm Price & Stock Comparison</span>
                  </span>
                  <span className="text-[12px] text-slate-400 font-narrow">
                    Active: <span className="text-amber-300 font-semibold">{resolvedRealmName}</span>
                  </span>
                </div>
                <MultiRealmPriceTable
                  itemId={itemData.itemId}
                  currentRealmId={itemData.connectedRealmId}
                  currentPriceCopper={itemData.minBuyout || itemData.medianPrice}
                  currentQuantity={itemData.totalQuantity || itemData.activeLots.reduce((acc, l) => acc + l.quantity, 0)}
                  onSelectRealm={onSelectRealm}
                />
              </div>
            </div>
          ) : activeTab === 'lots' ? (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden font-narrow animate-in fade-in duration-150">
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full text-left font-narrow">
                  <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-200 font-friz font-bold text-[14.5px] sm:text-[15.2px] tracking-wider">
                    <tr>
                      <th className="py-3 px-3.5 sm:px-5">Lot ID</th>
                      <th className="py-3 px-3.5 sm:px-5">Quantity</th>
                      <th className="py-3 px-3.5 sm:px-5">Unit Price</th>
                      <th className="py-3 px-3.5 sm:px-5">Total Buyout</th>
                      <th className="py-3 px-3.5 sm:px-5">Bid</th>
                      <th className="py-3 px-3.5 sm:px-5">Time Left</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-narrow text-[14.5px] sm:text-[15.2px]">
                    {itemData.activeLots.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-slate-400 italic text-[15px]">
                          No active lots found for this snapshot
                        </td>
                      </tr>
                    ) : (
                      itemData.activeLots.map((lot, idx) => (
                        <tr
                          key={lot.auctionId || idx}
                          className="hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 px-3.5 sm:px-5 text-slate-400 font-narrow">#{lot.auctionId}</td>
                          <td className="py-3 px-3.5 sm:px-5 font-bold text-slate-100 font-narrow">
                            {lot.quantity}
                          </td>
                          <td className="py-3 px-3.5 sm:px-5">
                            <WoWMoney copper={lot.unitPrice} size="md" />
                          </td>
                          <td className="py-3 px-3.5 sm:px-5">
                            <WoWMoney copper={lot.buyout} size="md" />
                          </td>
                          <td className="py-3 px-3.5 sm:px-5">
                            <WoWMoney copper={lot.bid} size="md" />
                          </td>
                          <td className="py-3 px-3.5 sm:px-5">
                            <span className="inline-flex items-center gap-1.5 text-slate-200 font-narrow">
                              <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                              {TIME_LEFT_LABELS[lot.timeLeft] || 'Medium'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* All In One: Shows Heat Maps + Chart + Active Lots together! */
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Section 1: The 2 Hourly Heat Maps */}
              <HourlyHeatMaps
                hourlyDeltas={itemData.hourlyDeltas}
                itemName={meta.name}
                realmName={resolvedRealmName}
                defaultOpen={true}
              />

              {/* Section 2: Historical Price Chart */}
              <AuctionChart
                dailyHistory={itemData.dailyHistory}
                hourlyDeltas={itemData.hourlyDeltas}
                itemName={meta.name}
              />

              {/* Section 3: Multi-Realm Price Comparison Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-slate-300 font-friz px-1">
                  <span className="font-bold uppercase tracking-wider text-amber-400 text-[15px] sm:text-[15.5px] flex items-center gap-2">
                    <span>🌐</span>
                    <span>Cross-Realm Price & Stock Comparison</span>
                  </span>
                  <span className="text-[12px] text-slate-400 font-narrow">
                    Active: <span className="text-amber-300 font-semibold">{resolvedRealmName}</span>
                  </span>
                </div>
                <MultiRealmPriceTable
                  itemId={itemData.itemId}
                  currentRealmId={itemData.connectedRealmId}
                  currentPriceCopper={itemData.minBuyout || itemData.medianPrice}
                  currentQuantity={itemData.totalQuantity || itemData.activeLots.reduce((acc, l) => acc + l.quantity, 0)}
                  onSelectRealm={onSelectRealm}
                />
              </div>

              {/* Section 4: Active Lots Table */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-slate-300 font-friz px-1">
                  <span className="font-bold uppercase tracking-wider text-emerald-400 text-[15px] sm:text-[15.5px]">
                    Active Auction Lots ({itemData.activeLots.length})
                  </span>
                </div>
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden font-narrow">
                  <div className="overflow-x-auto max-h-[350px]">
                    <table className="w-full text-left font-narrow">
                      <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-200 font-friz font-bold text-[14.5px] sm:text-[15.2px] tracking-wider">
                        <tr>
                          <th className="py-3 px-3.5 sm:px-5">Lot ID</th>
                          <th className="py-3 px-3.5 sm:px-5">Quantity</th>
                          <th className="py-3 px-3.5 sm:px-5">Unit Price</th>
                          <th className="py-3 px-3.5 sm:px-5">Total Buyout</th>
                          <th className="py-3 px-3.5 sm:px-5">Bid</th>
                          <th className="py-3 px-3.5 sm:px-5">Time Left</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-narrow text-[14.5px] sm:text-[15.2px]">
                        {itemData.activeLots.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-10 text-center text-slate-400 italic text-[15px]">
                              No active lots found for this snapshot
                            </td>
                          </tr>
                        ) : (
                          itemData.activeLots.map((lot, idx) => (
                            <tr
                              key={lot.auctionId || idx}
                              className="hover:bg-slate-800/40 transition-colors"
                            >
                              <td className="py-3 px-3.5 sm:px-5 text-slate-400 font-narrow">#{lot.auctionId}</td>
                              <td className="py-3 px-3.5 sm:px-5 font-bold text-slate-100 font-narrow">
                                {lot.quantity}
                              </td>
                              <td className="py-3 px-3.5 sm:px-5">
                                <WoWMoney copper={lot.unitPrice} size="md" />
                              </td>
                              <td className="py-3 px-3.5 sm:px-5">
                                <WoWMoney copper={lot.buyout} size="md" />
                              </td>
                              <td className="py-3 px-3.5 sm:px-5">
                                <WoWMoney copper={lot.bid} size="md" />
                              </td>
                              <td className="py-3 px-3.5 sm:px-5">
                                <span className="inline-flex items-center gap-1.5 text-slate-200 font-narrow">
                                  <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                  {TIME_LEFT_LABELS[lot.timeLeft] || 'Medium'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
