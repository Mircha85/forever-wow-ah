'use client';

import React, { useState, useMemo } from 'react';
import { type HourlyDelta } from '../types/auction';
import { WoWMoney } from './WoWMoney';
import { ChevronDown, ChevronUp, Clock, Calendar } from 'lucide-react';

interface HourlyHeatMapsProps {
  hourlyDeltas: HourlyDelta[];
  itemName: string;
  realmName: string;
  defaultOpen?: boolean;
}

interface CellData {
  timestamp: number;
  dateKey: string;
  dayLabel: string; // e.g. "25 Fri"
  hour: number;     // 0..23
  minPrice: number; // in copper
  quantity: number;
  hasData: boolean;
}

export const HourlyHeatMaps: React.FC<HourlyHeatMapsProps> = ({
  hourlyDeltas,
  itemName,
  realmName,
  defaultOpen = true,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [hoveredCell, setHoveredCell] = useState<CellData | null>(null);

  // Detect user's browser timezone string (e.g., "GMT+3" or "GMT+2")
  const timeZoneDisplay = useMemo(() => {
    try {
      const offsetMinutes = -new Date().getTimezoneOffset();
      const sign = offsetMinutes >= 0 ? '+' : '-';
      const hours = Math.floor(Math.abs(offsetMinutes) / 60);
      const mins = Math.abs(offsetMinutes) % 60;
      const gmtStr = `GMT${sign}${hours}${mins > 0 ? `:${mins.toString().padStart(2, '0')}` : ''}`;
      const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return `${gmtStr} (${tzName})`;
    } catch {
      return 'GMT';
    }
  }, []);

  const hoursLabels = [
    '12am', '1am', '2am', '3am', '4am', '5am', '6am', '7am',
    '8am', '9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm',
    '4pm', '5pm', '6pm', '7pm', '8pm', '9pm', '10pm', '11pm',
  ];

  // Organize hourlyDeltas into 7-8 day matrix (Day rows x 24 hour columns)
  const { matrix, minPriceEver, maxPriceEver, maxQtyEver } = useMemo(() => {
    const daysMap = new Map<string, { dayLabel: string; timestamp: number; hours: Map<number, HourlyDelta> }>();

    // Sort deltas ascending by timestamp
    const sorted = [...hourlyDeltas].sort((a, b) => a.timestamp - b.timestamp);

    let minP = Infinity;
    let maxP = 0;
    let maxQ = 0;

    for (const d of sorted) {
      if (d.minPrice > 0) {
        if (d.minPrice < minP) minP = d.minPrice;
        if (d.minPrice > maxP) maxP = d.minPrice;
      }
      if (d.quantity > maxQ) maxQ = d.quantity;

      const dateObj = new Date(d.timestamp * 1000);
      const dateKey = `${dateObj.getFullYear()}-${dateObj.getMonth() + 1}-${dateObj.getDate()}`;
      const dayNum = dateObj.getDate();
      const weekday = dateObj.toLocaleDateString([], { weekday: 'short' });
      const dayLabel = `${dayNum} ${weekday}`;
      const hour = dateObj.getHours();

      if (!daysMap.has(dateKey)) {
        daysMap.set(dateKey, {
          dayLabel,
          timestamp: d.timestamp,
          hours: new Map(),
        });
      }

      daysMap.get(dateKey)!.hours.set(hour, d);
    }

    // Convert to sorted rows (take up to 8 recent days)
    const dayEntries = Array.from(daysMap.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(-8);

    const rows: Array<{
      dateKey: string;
      dayLabel: string;
      cells: CellData[];
    }> = [];

    for (const [dateKey, dayData] of dayEntries) {
      const cells: CellData[] = [];
      for (let h = 0; h < 24; h++) {
        const delta = dayData.hours.get(h);
        if (delta && (delta.minPrice > 0 || delta.quantity > 0)) {
          cells.push({
            timestamp: delta.timestamp,
            dateKey,
            dayLabel: dayData.dayLabel,
            hour: h,
            minPrice: delta.minPrice,
            quantity: delta.quantity,
            hasData: true,
          });
        } else {
          cells.push({
            timestamp: 0,
            dateKey,
            dayLabel: dayData.dayLabel,
            hour: h,
            minPrice: 0,
            quantity: 0,
            hasData: false,
          });
        }
      }
      rows.push({
        dateKey,
        dayLabel: dayData.dayLabel,
        cells,
      });
    }

    return {
      matrix: rows,
      minPriceEver: minP === Infinity ? 0 : minP,
      maxPriceEver: maxP || 10000,
      maxQtyEver: maxQ || 50,
    };
  }, [hourlyDeltas]);

  // Color functions matching WoW AH palette
  const getPriceColor = (cell: CellData) => {
    if (!cell.hasData || cell.minPrice <= 0) {
      return 'bg-slate-950/80 text-transparent'; // Empty cell
    }

    const priceRange = maxPriceEver - minPriceEver || 1;
    const ratio = Math.max(0, Math.min(1, (cell.minPrice - minPriceEver) / priceRange));

    // Blue/Periwinkle gradient scale
    if (ratio < 0.2) return 'bg-[#2b3558] text-slate-200 font-normal';
    if (ratio < 0.4) return 'bg-[#3b4878] text-slate-100 font-normal';
    if (ratio < 0.6) return 'bg-[#4a5a94] text-slate-50 font-normal';
    if (ratio < 0.8) return 'bg-[#5e71b5] text-white font-normal';
    return 'bg-[#7487d6] text-white font-normal shadow-[inset_0_0_8px_rgba(255,255,255,0.2)]';
  };

  const getQuantityColor = (cell: CellData) => {
    if (!cell.hasData || cell.quantity <= 0) {
      return 'bg-slate-950/80 text-transparent';
    }

    const ratio = Math.max(0, Math.min(1, cell.quantity / (maxQtyEver || 1)));

    // Reddish-coral/Burgundy gradient scale
    if (ratio < 0.15) return 'bg-[#33171b] text-slate-300 font-normal';
    if (ratio < 0.35) return 'bg-[#4e1d24] text-slate-200 font-normal';
    if (ratio < 0.55) return 'bg-[#732933] text-slate-100 font-normal';
    if (ratio < 0.75) return 'bg-[#993644] text-white font-normal';
    if (ratio < 0.9) return 'bg-[#bf4355] text-white font-normal';
    return 'bg-[#e05367] text-white font-normal shadow-[inset_0_0_8px_rgba(255,255,255,0.2)]';
  };

  // Compact number string for quantities > 999: "1k", "1.1k", "5k", "10k", "800k", "1.2M"
  const formatCompactQuantity = (qty: number) => {
    if (!qty || qty <= 0) return '';
    if (qty > 999) {
      if (qty >= 1000000) {
        const m = qty / 1000000;
        return `${m >= 100 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, '')}M`;
      }
      const k = qty / 1000;
      return `${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
    }
    return Math.round(qty).toString();
  };

  // Compact price string (e.g., "1k", "1.1k", "5k", "10k", "800k", "145g", "32s") in AR Arial Narrow
  const formatCompactPrice = (copper: number) => {
    if (!copper || copper <= 0) return '';
    const gold = copper / 10000;

    if (gold > 999) {
      if (gold >= 1000000) {
        const m = gold / 1000000;
        return `${m >= 100 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, '')}M`;
      }
      const k = gold / 1000;
      return `${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
    }
    if (gold >= 10) {
      return `${Math.round(gold)}g`;
    }
    if (gold >= 1) {
      return `${gold.toFixed(1).replace(/\.0$/, '')}g`;
    }
    const silver = Math.round(copper / 100);
    return `${silver}s`;
  };

  return (
    <div className="bg-slate-950/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl font-narrow">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-3.5 bg-slate-900/95 border-b border-slate-800 select-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <Calendar className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <span className="font-friz text-[16px] sm:text-[17px] font-bold text-slate-100 truncate">
            Hourly Heat Maps for {realmName}
          </span>
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          title={isOpen ? 'Collapse Heat Maps' : 'Expand Heat Maps'}
          aria-label={isOpen ? 'Collapse Heat Maps' : 'Expand Heat Maps'}
        >
          {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {isOpen && (
        <div className="p-3.5 sm:p-6 space-y-6">
          {/* Subtitle description with ~15px readable text */}
          <div className="text-[14.5px] sm:text-[15.2px] text-slate-300 font-narrow leading-relaxed max-w-4xl">
            These heat maps show the <strong className="text-sky-300 font-bold font-friz">lowest buyout price</strong> and{' '}
            <strong className="text-rose-300 font-bold font-friz">total quantity</strong> available of{' '}
            <span className="text-amber-300 font-bold font-friz">{itemName}</span> on{' '}
            <span className="text-slate-100 font-friz font-semibold">{realmName}</span> each hour for the past week.
            <div className="text-[13.5px] sm:text-[14px] text-slate-400 mt-1">
              Time zone: <span className="font-narrow text-slate-200 font-semibold">{timeZoneDisplay}</span>.
            </div>
          </div>

          {/* Floating Hover Indicator Banner */}
          <div className="min-h-12 py-2 px-4 flex flex-wrap items-center justify-between gap-2.5 text-[15px] sm:text-[15.2px] bg-slate-900/95 border border-slate-700/80 rounded-xl font-narrow shadow-inner">
            {hoveredCell && hoveredCell.hasData ? (
              <>
                <div className="flex flex-wrap items-center gap-2.5 text-slate-200">
                  <span className="text-amber-300 font-bold font-friz text-[15px] sm:text-[15.5px]">
                    {hoveredCell.dayLabel} at {hoursLabels[hoveredCell.hour]}:
                  </span>
                  <span className="flex items-center gap-1.5 font-narrow">
                    <span className="text-slate-400 text-[14px]">Lowest Buyout:</span>
                    <WoWMoney copper={hoveredCell.minPrice} size="md" />
                  </span>
                </div>
                <div className="text-slate-200 font-narrow text-[15px]">
                  <span className="text-slate-400 mr-2">Available Quantity:</span>
                  <span className="text-rose-400 font-bold text-[15.5px]">
                    {hoveredCell.quantity.toLocaleString()}
                    {hoveredCell.quantity > 999 ? ` (${formatCompactQuantity(hoveredCell.quantity)})` : ''}
                  </span>
                </div>
              </>
            ) : (
              <span className="text-slate-400 text-[14px] sm:text-[15px] italic font-narrow flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500/80 flex-shrink-0" />
                <span>Hover or tap any hour cell to inspect exact buyout price and stock volume</span>
              </span>
            )}
          </div>

          {/* Heat Map 1: Lowest Price Grid (Blue/Indigo) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1">
              <span className="text-[15px] sm:text-[15.5px] font-friz font-bold uppercase tracking-wider text-sky-400">
                1. Lowest Buyout Price (Hourly)
              </span>
              <span className="text-[13px] sm:text-[13.5px] text-slate-400 font-narrow">Darker = lower / brighter = higher</span>
            </div>

            <div className="overflow-x-auto pb-2 scroll-smooth">
              <div className="text-[13px] text-amber-400/90 sm:hidden flex items-center gap-1 mb-2 px-1 font-narrow">
                <span>↔ Glisați orizontal pentru orele 00:00 - 23:00 · Atingeți celula pentru detalii</span>
              </div>

              <div className="min-w-[840px] sm:min-w-[920px] select-none">
                {/* Day Rows */}
                <div className="space-y-1.5">
                  {matrix.map((row) => (
                    <div key={`price-row-${row.dateKey}`} className="flex items-center">
                      {/* Sticky Day Label on Left for smooth mobile horizontal scroll */}
                      <div className="w-20 sm:w-24 flex-shrink-0 sticky left-0 z-20 bg-slate-950 py-1.5 text-right pr-2.5 text-[14px] sm:text-[15px] font-narrow font-bold text-slate-100 border-r border-slate-800">
                        {row.dayLabel}
                      </div>

                      {/* 24 Hour Cells */}
                      <div className="flex-1 grid grid-cols-24 gap-px bg-slate-900 border border-slate-800 rounded-md overflow-hidden ml-1.5">
                        {row.cells.map((cell, idx) => (
                          <div
                            key={`p-cell-${idx}`}
                            onClick={() => setHoveredCell(cell)}
                            onTouchStart={() => setHoveredCell(cell)}
                            onMouseEnter={() => setHoveredCell(cell)}
                            className={`h-8 sm:h-9 flex items-center justify-center text-[13.5px] sm:text-[15px] font-narrow font-normal transition-transform hover:scale-105 active:scale-95 hover:z-10 cursor-pointer ${getPriceColor(
                              cell
                            )}`}
                            title={
                              cell.hasData
                                ? `${row.dayLabel} @ ${hoursLabels[cell.hour]} - Min: ${formatCompactPrice(cell.minPrice)} (${cell.minPrice} copper)`
                                : `${row.dayLabel} @ ${hoursLabels[cell.hour]} - No Listings`
                            }
                          >
                            {cell.hasData ? formatCompactPrice(cell.minPrice) : ''}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Hour Labels on Bottom (12am .. 11pm) */}
                <div className="flex items-center pt-2 text-[13px] sm:text-[14.5px] text-slate-300 font-narrow font-medium">
                  <div className="w-20 sm:w-24 flex-shrink-0 sticky left-0 z-20 bg-slate-950" />
                  <div className="flex-1 grid grid-cols-24 text-center ml-1.5">
                    {hoursLabels.map((h, i) => (
                      <div key={`h-label-${i}`} className="truncate px-0.5">
                        {h}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Heat Map 2: Total Quantity Grid (Red/Coral) */}
          <div className="space-y-2 pt-4 border-t border-slate-800/80">
            <div className="flex items-center justify-between pb-1">
              <span className="text-[15px] sm:text-[15.5px] font-friz font-bold uppercase tracking-wider text-rose-400">
                2. Total Available Quantity (Hourly)
              </span>
              <span className="text-[13px] sm:text-[13.5px] text-slate-400 font-narrow">Darker = low stock / brighter = high supply</span>
            </div>

            <div className="overflow-x-auto pb-2 scroll-smooth">
              <div className="min-w-[840px] sm:min-w-[920px] select-none">
                {/* Day Rows */}
                <div className="space-y-1.5">
                  {matrix.map((row) => (
                    <div key={`qty-row-${row.dateKey}`} className="flex items-center">
                      {/* Sticky Day Label on Left for smooth mobile horizontal scroll */}
                      <div className="w-20 sm:w-24 flex-shrink-0 sticky left-0 z-20 bg-slate-950 py-1.5 text-right pr-2.5 text-[14px] sm:text-[15px] font-narrow font-bold text-slate-100 border-r border-slate-800">
                        {row.dayLabel}
                      </div>

                      {/* 24 Hour Cells */}
                      <div className="flex-1 grid grid-cols-24 gap-px bg-slate-900 border border-slate-800 rounded-md overflow-hidden ml-1.5">
                        {row.cells.map((cell, idx) => (
                          <div
                            key={`q-cell-${idx}`}
                            onClick={() => setHoveredCell(cell)}
                            onTouchStart={() => setHoveredCell(cell)}
                            onMouseEnter={() => setHoveredCell(cell)}
                            className={`h-8 sm:h-9 flex items-center justify-center text-[13.5px] sm:text-[15px] font-narrow font-normal transition-transform hover:scale-105 active:scale-95 hover:z-10 cursor-pointer ${getQuantityColor(
                              cell
                            )}`}
                            title={
                              cell.hasData
                                ? `${row.dayLabel} @ ${hoursLabels[cell.hour]} - Quantity: ${cell.quantity.toLocaleString()}${
                                    cell.quantity > 999 ? ` (${formatCompactQuantity(cell.quantity)})` : ''
                                  }`
                                : `${row.dayLabel} @ ${hoursLabels[cell.hour]} - No Listings`
                            }
                          >
                            {cell.hasData ? formatCompactQuantity(cell.quantity) : ''}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Hour Labels on Bottom */}
                <div className="flex items-center pt-2 text-[13px] sm:text-[14.5px] text-slate-300 font-narrow font-medium">
                  <div className="w-20 sm:w-24 flex-shrink-0 sticky left-0 z-20 bg-slate-950" />
                  <div className="flex-1 grid grid-cols-24 text-center ml-1.5">
                    {hoursLabels.map((h, i) => (
                      <div key={`hq-label-${i}`} className="truncate px-0.5">
                        {h}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
