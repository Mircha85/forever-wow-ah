'use client';

import React, { useMemo } from 'react';
import { X, Download, Binary, CheckCircle2, ShieldCheck } from 'lucide-react';
import { DecodedItemBin } from '../types/auction';

interface BinaryInspectorModalProps {
  itemData: DecodedItemBin;
  rawBuffer?: ArrayBuffer;
  onClose: () => void;
}

export const BinaryInspectorModal: React.FC<BinaryInspectorModalProps> = ({
  itemData,
  rawBuffer,
  onClose,
}) => {
  // Generate hex dump from rawBuffer or fallback representation
  const hexDump = useMemo(() => {
    if (!rawBuffer) return [];
    const view = new Uint8Array(rawBuffer);
    const lines: Array<{ offset: string; hex: string; ascii: string }> = [];
    const maxBytes = Math.min(view.length, 512); // preview first 512 bytes

    for (let i = 0; i < maxBytes; i += 16) {
      const chunk = view.slice(i, i + 16);
      const offset = i.toString(16).padStart(8, '0');
      const hexParts: string[] = [];
      let ascii = '';

      for (let j = 0; j < 16; j++) {
        if (j < chunk.length) {
          const byte = chunk[j];
          hexParts.push(byte.toString(16).padStart(2, '0'));
          ascii += byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
        } else {
          hexParts.push('  ');
          ascii += ' ';
        }
      }

      lines.push({
        offset,
        hex: hexParts.slice(0, 8).join(' ') + '  ' + hexParts.slice(8).join(' '),
        ascii,
      });
    }

    return lines;
  }, [rawBuffer]);

  const bufferSize = rawBuffer ? rawBuffer.byteLength : 1240;
  const jsonApproxSize = 34500;
  const savingsPercent = Math.round((1 - bufferSize / jsonApproxSize) * 1000) / 10;

  const downloadBin = () => {
    if (!rawBuffer) return;
    const blob = new Blob([rawBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${itemData.itemId}.bin`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 md:p-6 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl h-full sm:h-auto sm:max-h-[92vh] flex flex-col bg-slate-900 border-0 sm:border border-slate-700 rounded-none sm:rounded-2xl shadow-2xl overflow-hidden font-narrow"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 sm:px-6 py-3 sm:py-4 border-b border-slate-800 bg-slate-950 flex-shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 flex-shrink-0">
              <Binary className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-friz text-sm sm:text-base font-bold text-slate-100 flex items-center gap-1.5 truncate">
                <span className="truncate">Binary Inspector: #{itemData.itemId}.bin</span>
                <span className="px-1.5 py-0.5 text-[9px] font-narrow bg-emerald-950 text-emerald-400 border border-emerald-800/80 rounded-full flex-shrink-0 hidden xs:inline">
                  LE
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 font-narrow truncate">
                JavaScript DataView / ArrayBuffer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {rawBuffer && (
              <button
                onClick={downloadBin}
                className="font-friz flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Download</span> .bin
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-4 sm:space-y-6">
          {/* Compression & Efficiency Stat */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-slate-400">Binary Buffer Size</div>
              <div className="text-lg font-bold font-mono text-amber-400">
                {(bufferSize / 1024).toFixed(2)} KB
                <span className="text-xs text-slate-500 font-normal ml-1">
                  ({bufferSize} bytes)
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Raw Blizzard JSON Equivalent</div>
              <div className="text-lg font-bold font-mono text-slate-300">
                {(jsonApproxSize / 1024).toFixed(2)} KB
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Network Bandwidth Saved</div>
              <div className="text-lg font-bold font-mono text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>{savingsPercent}% Savings</span>
              </div>
            </div>
          </div>

          {/* Binary Specification Schema */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Binary Header Schema (Exact Offsets & Types)
            </h3>
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto text-xs font-mono">
                <table className="w-full text-left">
                  <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3">Offset</th>
                      <th className="py-2 px-3">Field</th>
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3">Decoded Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    <tr>
                      <td className="py-2 px-3 text-amber-400">0x00..0x03</td>
                      <td className="py-2 px-3 font-semibold">magic</td>
                      <td className="py-2 px-3 text-sky-400">Uint32 (0x554E4452)</td>
                      <td className="py-2 px-3 text-emerald-400">UNDR (0x{itemData.magic.toString(16)})</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-amber-400">0x04..0x05</td>
                      <td className="py-2 px-3 font-semibold">version</td>
                      <td className="py-2 px-3 text-sky-400">Uint16</td>
                      <td className="py-2 px-3">{itemData.version}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-amber-400">0x08..0x0B</td>
                      <td className="py-2 px-3 font-semibold">itemId</td>
                      <td className="py-2 px-3 text-sky-400">Uint32</td>
                      <td className="py-2 px-3">{itemData.itemId}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-amber-400">0x0C..0x0F</td>
                      <td className="py-2 px-3 font-semibold">connectedRealmId</td>
                      <td className="py-2 px-3 text-sky-400">Uint32</td>
                      <td className="py-2 px-3">{itemData.connectedRealmId}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-amber-400">0x10..0x13</td>
                      <td className="py-2 px-3 font-semibold">lastUpdated</td>
                      <td className="py-2 px-3 text-sky-400">Uint32 (epoch)</td>
                      <td className="py-2 px-3">{itemData.lastUpdated}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-amber-400">0x14..0x17</td>
                      <td className="py-2 px-3 font-semibold">totalQuantity</td>
                      <td className="py-2 px-3 text-sky-400">Uint32</td>
                      <td className="py-2 px-3">{itemData.totalQuantity}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-amber-400">0x1C..0x1F</td>
                      <td className="py-2 px-3 font-semibold">minBuyout</td>
                      <td className="py-2 px-3 text-sky-400">Uint32 (copper)</td>
                      <td className="py-2 px-3">{itemData.minBuyout} copper</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-amber-400">0x20..0x23</td>
                      <td className="py-2 px-3 font-semibold">medianPrice</td>
                      <td className="py-2 px-3 text-sky-400">Uint32 (copper)</td>
                      <td className="py-2 px-3">{itemData.medianPrice} copper</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-amber-400">0x34..0x35</td>
                      <td className="py-2 px-3 font-semibold">dailyCount</td>
                      <td className="py-2 px-3 text-sky-400">Uint16</td>
                      <td className="py-2 px-3">{itemData.dailyHistory.length} entries</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-amber-400">0x36..0x37</td>
                      <td className="py-2 px-3 font-semibold">hourlyCount</td>
                      <td className="py-2 px-3 text-sky-400">Uint16</td>
                      <td className="py-2 px-3">{itemData.hourlyDeltas.length} entries</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-amber-400">0x38..0x39</td>
                      <td className="py-2 px-3 font-semibold">activeLotsCount</td>
                      <td className="py-2 px-3 text-sky-400">Uint16</td>
                      <td className="py-2 px-3">{itemData.activeLots.length} lots</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Hex Dump Section */}
          {hexDump.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Raw Byte View (First 512 bytes)
              </h3>
              <div className="p-3 bg-black/90 border border-slate-800 rounded-xl overflow-x-auto">
                <pre className="font-mono text-[11px] leading-relaxed text-slate-300">
                  {hexDump.map((line) => (
                    <div key={line.offset} className="flex gap-4">
                      <span className="text-amber-500/80 select-none">{line.offset}:</span>
                      <span className="text-sky-300">{line.hex}</span>
                      <span className="text-slate-500 select-none">|</span>
                      <span className="text-emerald-400 select-none">{line.ascii}</span>
                    </div>
                  ))}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
