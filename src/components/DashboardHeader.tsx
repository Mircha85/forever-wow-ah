'use client';

import { Star, Info, Cpu, Database, Binary, HardDrive } from 'lucide-react';
import type { ViewMode } from '@/src/types/dashboard';

interface DashboardHeaderProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  favoritesCount: number;
  showArchDocs: boolean;
  setShowArchDocs: (next: boolean | ((prev: boolean) => boolean)) => void;
  setShowPipelineModal: (show: boolean) => void;
}

export function DashboardHeader({
  viewMode,
  setViewMode,
  favoritesCount,
  showArchDocs,
  setShowArchDocs,
  setShowPipelineModal,
}: DashboardHeaderProps) {
  return (
    <>
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

          {/* Controls: View Tabs, Arch, Ingest */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
            {/* View Mode Toggle */}
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

            {/* Architecture Details button */}
            <button
              onClick={() => setShowArchDocs((prev: boolean) => !prev)}
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
                <span>1. Ingestion &amp; In-Memory DB</span>
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
                BinaryEncoder packs data into custom little-endian binary buffers. 28-byte item records in state.bin reduce payload size by ~97%.
              </p>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
              <div className="font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5" />
                <span>3. Cloudflare R2 Routing</span>
              </div>
              <p className="text-slate-400 leading-relaxed font-mono text-[10px] break-all">
                data/cached/&#123;region&#125;/&#123;realmId&#125;/&#123;itemId&amp;0xFF&#125;/&#123;itemId&#125;.bin
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
    </>
  );
}
