'use client';

import React, { useState, useRef, useMemo } from 'react';
import { type HistoryPoint, type HourlyDelta } from '../types/auction';
import { WoWMoney } from './WoWMoney';

interface AuctionChartProps {
  dailyHistory: HistoryPoint[];
  hourlyDeltas: HourlyDelta[];
  /**
   * Accepted for context at the call site but not currently rendered.
   * Optional so new callers are not forced to supply a value we ignore.
   */
  itemName?: string;
}

export function AuctionChart({
  dailyHistory,
  hourlyDeltas,
}: AuctionChartProps) {
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '14d'>('14d');
  const [showMin, setShowMin] = useState(true);
  const [showMedian, setShowMedian] = useState(true);
  const [showMean, setShowMean] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize points based on timeframe
  const points = useMemo(() => {
    if (timeframe === '24h') {
      // Exactly the last 24 hours (24 hourly snapshots)
      const last24Hours = hourlyDeltas.slice(-24);
      return last24Hours.map((h) => ({
        timestamp: h.timestamp,
        minPrice: h.minPrice,
        medianPrice: h.medianPrice,
        meanPrice: Math.round((h.minPrice + h.medianPrice) / 2),
        quantity: h.quantity,
      }));
    } else if (timeframe === '7d') {
      return dailyHistory.slice(-7);
    } else {
      return dailyHistory;
    }
  }, [timeframe, hourlyDeltas, dailyHistory]);

  const { minVal, maxVal, maxQty } = useMemo(() => {
    if (points.length === 0) {
      return { minVal: 0, maxVal: 10000, maxQty: 100 };
    }
    let minP = Infinity;
    let maxP = -Infinity;
    let maxQ = 0;

    for (const p of points) {
      if (p.minPrice < minP) minP = p.minPrice;
      if (p.medianPrice > maxP) maxP = p.medianPrice;
      if (p.meanPrice > maxP) maxP = p.meanPrice;
      if (p.quantity > maxQ) maxQ = p.quantity;
    }

    if (minP === Infinity) minP = 0;
    if (maxP === -Infinity) maxP = 10000;

    // Add 10% vertical padding
    const padding = (maxP - minP) * 0.1 || maxP * 0.1 || 1000;
    return {
      minVal: Math.max(0, minP - padding),
      maxVal: maxP + padding,
      maxQty: Math.max(10, Math.ceil(maxQ * 1.15)),
    };
  }, [points]);

  const chartHeight = 270;
  const chartWidth = 740;
  const paddingLeft = 82; // expanded for 15px font labels
  const paddingRight = 24;
  const paddingTop = 22;
  const paddingBottom = 48; // expanded for 15px date labels

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;

  // Calculate coordinates
  const getX = (index: number) => {
    if (points.length <= 1) return paddingLeft + innerWidth / 2;
    return paddingLeft + (index / (points.length - 1)) * innerWidth;
  };

  const getY = (val: number) => {
    const range = maxVal - minVal || 1;
    const ratio = (val - minVal) / range;
    return paddingTop + innerHeight - ratio * innerHeight;
  };

  const getVolY = (qty: number) => {
    const barMaxH = 50; // max bar height at bottom
    const ratio = qty / (maxQty || 1);
    return paddingTop + innerHeight - ratio * barMaxH;
  };

  // Build SVG Paths
  const buildLinePath = (key: 'minPrice' | 'medianPrice' | 'meanPrice') => {
    if (points.length === 0) return '';
    return points
      .map((p, idx) => {
        const x = getX(idx);
        const y = getY(p[key]);
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const buildAreaPath = () => {
    if (points.length === 0) return '';
    const line = buildLinePath('medianPrice');
    const lastX = getX(points.length - 1);
    const firstX = getX(0);
    const bottomY = paddingTop + innerHeight;
    return `${line} L ${lastX.toFixed(1)} ${bottomY} L ${firstX.toFixed(1)} ${bottomY} Z`;
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * chartWidth;
    const boundedX = Math.max(paddingLeft, Math.min(paddingLeft + innerWidth, mouseX));
    const ratio = (boundedX - paddingLeft) / innerWidth;
    const nearestIndex = Math.round(ratio * (points.length - 1));
    setHoverIndex(nearestIndex);
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (points.length === 0 || !e.touches[0]) return;
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const touchX = ((touch.clientX - rect.left) / rect.width) * chartWidth;
    const boundedX = Math.max(paddingLeft, Math.min(paddingLeft + innerWidth, touchX));
    const ratio = (boundedX - paddingLeft) / innerWidth;
    const nearestIndex = Math.round(ratio * (points.length - 1));
    setHoverIndex(nearestIndex);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const activePoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;

  // Format fixed hour helper (e.g., "8AM", "9AM", "12PM", "3PM")
  const formatFixedHour = (d: Date) => {
    const hours = d.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${h12}${ampm}`;
  };

  // Format date helper
  const formatDate = (epochSec: number, detailed = false) => {
    const d = new Date(epochSec * 1000);
    if (timeframe === '24h') {
      const fixedHour = formatFixedHour(d);
      if (detailed) {
        return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${fixedHour}`;
      }
      return fixedHour;
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex flex-col bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 sm:p-5 shadow-xl select-none font-narrow">
      {/* Controls & Legend Bar with ~15px sizing */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3.5 pb-3.5 border-b border-slate-800/80">
        <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 border border-slate-800 rounded-lg">
          <button
            onClick={() => setTimeframe('24h')}
            className={`px-3 py-1 text-[14px] sm:text-[15px] font-friz font-semibold rounded-md transition-colors cursor-pointer ${
              timeframe === '24h'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            24h
          </button>
          <button
            onClick={() => setTimeframe('7d')}
            className={`px-3 py-1 text-[14px] sm:text-[15px] font-friz font-semibold rounded-md transition-colors cursor-pointer ${
              timeframe === '7d'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            7D
          </button>
          <button
            onClick={() => setTimeframe('14d')}
            className={`px-3 py-1 text-[14px] sm:text-[15px] font-friz font-semibold rounded-md transition-colors cursor-pointer ${
              timeframe === '14d'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            14D
          </button>
        </div>

        {/* Legend toggles with ~15px text */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-[14px] sm:text-[15.2px] font-narrow">
          <button
            onClick={() => setShowMedian(!showMedian)}
            className={`flex items-center gap-1.5 cursor-pointer transition-opacity ${
              showMedian ? 'opacity-100' : 'opacity-40 line-through'
            }`}
          >
            <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
            <span className="text-amber-200 font-semibold font-friz">Median</span>
          </button>
          <button
            onClick={() => setShowMin(!showMin)}
            className={`flex items-center gap-1.5 cursor-pointer transition-opacity ${
              showMin ? 'opacity-100' : 'opacity-40 line-through'
            }`}
          >
            <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-sky-400" />
            <span className="text-sky-300 font-semibold font-friz">Min</span>
          </button>
          <button
            onClick={() => setShowMean(!showMean)}
            className={`flex items-center gap-1.5 cursor-pointer transition-opacity ${
              showMean ? 'opacity-100' : 'opacity-40 line-through'
            }`}
          >
            <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-purple-400" />
            <span className="text-purple-300 font-semibold font-friz">Mean</span>
          </button>
          <button
            onClick={() => setShowVolume(!showVolume)}
            className={`flex items-center gap-1.5 cursor-pointer transition-opacity ${
              showVolume ? 'opacity-100' : 'opacity-40 line-through'
            }`}
          >
            <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-emerald-500/70" />
            <span className="text-emerald-300 font-semibold font-friz">Volume</span>
          </button>
        </div>
      </div>

      {/* Hover Info Banner with ~15-15.2px text */}
      <div className="min-h-10 flex flex-wrap items-center justify-between text-[14px] sm:text-[15.2px] px-3.5 py-1.5 mb-2 bg-slate-950/80 border border-slate-800 rounded-lg gap-2 font-narrow">
        {activePoint ? (
          <>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-amber-400 font-bold font-friz">{formatDate(activePoint.timestamp, true)}:</span>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-slate-300 flex items-center gap-1">
                  <span className="text-amber-400 font-medium">Med:</span>
                  <WoWMoney copper={activePoint.medianPrice} size="md" />
                </span>
                <span className="text-slate-300 flex items-center gap-1">
                  <span className="text-sky-400 font-medium">Min:</span>
                  <WoWMoney copper={activePoint.minPrice} size="md" />
                </span>
                <span className="text-slate-300 flex items-center gap-1 hidden xs:flex">
                  <span className="text-purple-400 font-medium">Mean:</span>
                  <WoWMoney copper={activePoint.meanPrice} size="md" />
                </span>
              </div>
            </div>
            <div className="text-slate-300 font-narrow text-[14px] sm:text-[15px]">
              Stock Qty: <span className="text-emerald-400 font-bold text-[15.2px]">{activePoint.quantity.toLocaleString()}</span>
            </div>
          </>
        ) : (
          <span className="text-slate-400 italic text-[14px] font-narrow">
            Hover or drag across chart to inspect price history and volume
          </span>
        )}
      </div>

      {/* Interactive SVG Chart with ~15px readable SVG axis texts */}
      <div ref={containerRef} className="relative w-full aspect-[7/2.6] min-h-[220px]">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-full overflow-visible touch-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onTouchMove={handleTouchMove}
          onTouchStart={handleTouchMove}
        >
          <defs>
            <linearGradient id="medianGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="volBarGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const y = paddingTop + innerHeight * (1 - pct);
            const val = minVal + pct * (maxVal - minVal);
            return (
              <g key={pct}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="#334155"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  opacity="0.4"
                />
                {/* Y-axis price label (~15px font size for clear reading) */}
                <text
                  x={paddingLeft - 8}
                  y={y + 5}
                  textAnchor="end"
                  fill="#cbd5e1"
                  fontSize="14.5"
                  fontWeight="600"
                  fontFamily="'AR Arial Narrow', 'Arial Narrow', 'Nimbus Sans Narrow', 'Roboto Condensed', sans-serif"
                >
                  {Math.round(val / 10000)}g
                </text>
              </g>
            );
          })}

          {/* Volume Bars */}
          {showVolume &&
            points.map((p, idx) => {
              const x = getX(idx);
              const barW = Math.max(4, innerWidth / points.length - 2.5);
              const topY = getVolY(p.quantity);
              const bottomY = paddingTop + innerHeight;
              const barH = bottomY - topY;
              return (
                <rect
                  key={`vol-${idx}`}
                  x={x - barW / 2}
                  y={topY}
                  width={barW}
                  height={barH}
                  fill="url(#volBarGrad)"
                  rx="1"
                />
              );
            })}

          {/* Area under median */}
          {showMedian && (
            <path d={buildAreaPath()} fill="url(#medianGlow)" />
          )}

          {/* Min Price line */}
          {showMin && (
            <path
              d={buildLinePath('minPrice')}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Mean Price line */}
          {showMean && (
            <path
              d={buildLinePath('meanPrice')}
              fill="none"
              stroke="#c084fc"
              strokeWidth="2"
              strokeDasharray="4 2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Median Price line (primary) */}
          {showMedian && (
            <path
              d={buildLinePath('medianPrice')}
              fill="none"
              stroke="#fbbf24"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* X Axis Time Labels (~15px font size for clear reading) */}
          {points.map((p, idx) => {
            const step = timeframe === '24h' ? 4 : points.length > 15 ? 3 : 2;
            if (idx % step !== 0 && idx !== points.length - 1) return null;
            const x = getX(idx);
            return (
              <text
                key={`label-${idx}`}
                x={x}
                y={paddingTop + innerHeight + 22}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="14"
                fontWeight="500"
                fontFamily="'AR Arial Narrow', 'Arial Narrow', 'Nimbus Sans Narrow', 'Roboto Condensed', sans-serif"
              >
                {formatDate(p.timestamp)}
              </text>
            );
          })}

          {/* Hover Crosshair */}
          {hoverIndex !== null && points[hoverIndex] && (
            <g>
              <line
                x1={getX(hoverIndex)}
                y1={paddingTop}
                x2={getX(hoverIndex)}
                y2={paddingTop + innerHeight}
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
              {showMedian && (
                <circle
                  cx={getX(hoverIndex)}
                  cy={getY(points[hoverIndex].medianPrice)}
                  r="5"
                  fill="#fbbf24"
                  stroke="#0f172a"
                  strokeWidth="2"
                />
              )}
              {showMin && (
                <circle
                  cx={getX(hoverIndex)}
                  cy={getY(points[hoverIndex].minPrice)}
                  r="4"
                  fill="#38bdf8"
                  stroke="#0f172a"
                  strokeWidth="2"
                />
              )}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};
