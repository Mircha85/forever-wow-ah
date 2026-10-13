'use client';

import { Star } from 'lucide-react';
import { WoWMoney } from '@/src/components/WoWMoney';
import {
  getQualityColor,
  getQualityBorderColor,
} from '@/src/data/itemsCatalog';
import type { StateItemSummary, WowItemMetadata } from '@/src/types/auction';

export interface FavoriteItem extends StateItemSummary {
  meta: WowItemMetadata;
}

interface FavoritesViewProps {
  favoriteItems: FavoriteItem[];
  onSelectItem: (itemId: number) => void;
  onToggleFavorite: (itemId: number) => void;
}

export function FavoritesView({ favoriteItems, onSelectItem, onToggleFavorite }: FavoritesViewProps) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
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
                favoriteItems.map((item) => (
                  <tr
                    key={item.itemId}
                    onClick={() => onSelectItem(item.itemId)}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 font-narrow">
                      <WoWMoney copper={item.minPrice} size="md" />
                    </td>

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

                    <td className="py-3.5 px-4 text-slate-200 font-narrow text-[15.2px]">
                      <span className="font-bold">{item.quantity.toLocaleString()}</span>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(item.itemId);
                        }}
                        className="p-1 hover:scale-120 transition-transform text-amber-400 cursor-pointer"
                        title="Remove from favorites"
                      >
                        <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
