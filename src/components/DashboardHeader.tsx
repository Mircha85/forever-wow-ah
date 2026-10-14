'use client';

import { Star } from 'lucide-react';
import type { ViewMode } from '@/src/types/dashboard';

interface DashboardHeaderProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  favoritesCount: number;
}

export function DashboardHeader({
  viewMode,
  setViewMode,
  favoritesCount,
}: DashboardHeaderProps) {
  return (
    <>
      {/* Top WoW Forever AH Header */}
      <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center gap-2 sm:gap-4">
          {/* Logo & Identity */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-shrink-0">
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
            </div>
          </div>

          {/* View Tabs — centered in header row via flex-1 + justify-center */}
          </div>
          <div className="flex-1 flex justify-center">
            <div className="flex items-center bg-slate-950 p-1 border border-slate-800 rounded-lg">
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
            <Star className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${favoritesCount > 0 ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
            <span>Favorite ({favoritesCount})</span>
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
          </div>
      </header>
    </>
  );
}
