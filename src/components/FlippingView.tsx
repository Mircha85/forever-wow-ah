'use client';

import { RefreshCw } from 'lucide-react';
import { WoWMoney } from '@/src/components/WoWMoney';
import { getQualityBorderColor, getQualityColor } from '@/src/data/itemsCatalog';
import type { FlippingOpportunity } from '@/src/types/dashboard';

interface FlippingViewProps {
  minFlippingProfit: number;
  setMinFlippingProfit: (n: number) => void;
  isLoadingAllRealms: boolean;
  activeRealmCount: number;
  onReloadAllRealms: () => void;
  flippingOpportunities: FlippingOpportunity[];
  onSelectItem: (itemId: number) => void;
}

export function FlippingView({
  minFlippingProfit,
  setMinFlippingProfit,
  isLoadingAllRealms,
  activeRealmCount,
  onReloadAllRealms,
  flippingOpportunities,
  onSelectItem,
}: FlippingViewProps) {
  return (
    <div className="space-y-6 animate-in fade-in duration-200 w-full font-narrow">
      <div className="p-4 sm:p-5 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
        <div className="space-y-1.5">
          <h2 className="font-friz font-bold text-base sm:text-lg text-emerald-400 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://wow.zamimg.com/images/wow/icons/large/inv_misc_coinbag_01.jpg"
              alt="Flipping"
              className="w-5.5 h-5.5 rounded border border-slate-700/60 object-cover flex-shrink-0"
            />
            <span>Real-Time AH Flipping &amp; Arbitrage Radar</span>
          </h2>
          <p className="text-sm text-slate-300">
            Displays intra-server flipping opportunities (under-market historical deviations) and cross-realm arbitrage opportunities (buy cheap on one server, sell higher on another).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="text-sm text-slate-300 flex items-center gap-1.5 bg-slate-950 px-3 py-2 border border-slate-800 rounded-lg">
            <div className={`w-2.5 h-2.5 rounded-full ${isLoadingAllRealms ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
            <span>
              {isLoadingAllRealms
                ? 'Loading cross-realm prices...'
                : `Synced: ${activeRealmCount} active realms`}
            </span>
          </div>
          <button
            onClick={onReloadAllRealms}
            disabled={isLoadingAllRealms}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 rounded-lg text-slate-300 transition-colors cursor-pointer"
            title="Reload all realm prices"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingAllRealms ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

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

      {isLoadingAllRealms && activeRealmCount === 0 ? (
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
          {flippingOpportunities.map((op, idx) => (
            <div
              key={`flip-${op.itemId}-${idx}`}
              onClick={() => onSelectItem(op.itemId)}
              className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-4 md:p-5 flex flex-col lg:flex-row items-stretch justify-between gap-6 transition-colors shadow-md cursor-pointer group"
              title="Click to inspect price history"
            >
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

              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center border-t sm:border-t-0 lg:border-l border-slate-800/80 pt-4 sm:pt-0 lg:pl-6">
                <div className="space-y-1.5">
                  <div className="text-xs text-slate-400 uppercase tracking-wide font-bold">🛒 1. Where to Buy (Low Price):</div>
                  <div className="text-sm font-bold text-slate-200 truncate">{op.buyRealm.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-xs text-slate-400">Price:</span>
                    <WoWMoney copper={op.buyPrice} size="md" />
                  </div>
                  {op.type === 'intra_realm' && (
                    <div className="text-xs text-amber-400/90 italic font-semibold">
                      ✨ {(100 - (op.buyPrice / op.sellPrice) * 100).toFixed(0)}% under market value!
                    </div>
                  )}
                </div>

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
          ))}
        </div>
      )}
    </div>
  );
}
