'use client';

import { RefreshCw } from 'lucide-react';
import { WoWMoney } from '@/src/components/WoWMoney';
import {
  getItemMetadata,
  getQualityBorderColor,
  getQualityColor,
} from '@/src/data/itemsCatalog';
import { PROFESSION_INFO, type CraftingRecipe } from '@/src/data/craftingRecipes';

interface ProfessionsViewProps {
  selectedProfession: string;
  setSelectedProfession: (name: string) => void;
  currentRealmName: string;
  recipes: CraftingRecipe[];
  getItemMinBuyout: (itemId: number) => number;
  getItemPrice: (itemId: number) => number;
  loadingItemId: number | null;
  onSelectItem: (itemId: number) => void;
}

const PROFESSION_LIST = [
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
];

export function ProfessionsView({
  selectedProfession,
  setSelectedProfession,
  currentRealmName,
  recipes,
  getItemMinBuyout,
  getItemPrice,
  loadingItemId,
  onSelectItem,
}: ProfessionsViewProps) {
  return (
    <div className="space-y-6 animate-in fade-in duration-200 w-full">
      <div className="p-4 sm:p-5 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
        <div className="space-y-1">
          <h2 className="font-friz font-bold text-base sm:text-lg text-amber-400 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://wow.zamimg.com/images/wow/icons/large/inv_misc_book_09.jpg"
              alt="Professions"
              className="w-5.5 h-5.5 rounded border border-slate-700/60 object-cover flex-shrink-0"
            />
            <span>Professions &amp; Crafting Profitability</span>
          </h2>
          <p className="text-xs text-slate-400 font-narrow">
            Calculates crafting margins in real-time based on current listings on{' '}
            <span className="font-bold text-slate-200">{currentRealmName}</span>.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 bg-slate-950 p-1.5 border border-slate-800 rounded-xl">
          {PROFESSION_LIST.map((prof) => {
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

      <div className="grid grid-cols-1 gap-4">
        {recipes.map((recipe) => {
          const productMeta = getItemMetadata(recipe.productId);
          const marketPrice = getItemMinBuyout(recipe.productId);

          let totalCost = 0;
          recipe.ingredients.forEach((ing) => {
            totalCost += getItemPrice(ing.itemId) * ing.quantity;
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
                    onClick={() => onSelectItem(recipe.productId)}
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
                        onClick={() => onSelectItem(ing.itemId)}
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
                            <span>
                              Qty: <span className="text-amber-400 font-bold">{ing.quantity}</span>
                            </span>
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
  );
}
