'use client';

import React, { useState } from 'react';
import {
  X,
  Play,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Database,
  Cpu,
  Cloud,
  FileCode2,
  HardDrive,
} from 'lucide-react';
import { type AggregationResult } from '../services/aggregator';

interface PipelineRunnerModalProps {
  currentRealmId: number;
  onClose: () => void;
  onPipelineComplete: (result: AggregationResult) => void;
}

export const PipelineRunnerModal: React.FC<PipelineRunnerModalProps> = ({
  currentRealmId,
  onClose,
  onPipelineComplete,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [result, setResult] = useState<AggregationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs((prev) => [...prev, `[${time}] ${msg}`]);
  };

  const startPipeline = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);
    setLogs([]);
    setCurrentStep(1);

    addLog(`Initiating Blizzard Ingestion pipeline for Connected Realm #${currentRealmId}...`);

    try {
      addLog('Verifying Blizzard API OAuth2 client_credentials token and Last-Modified header...');
      setCurrentStep(2);

      const res = await fetch('/api/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectedRealmId: currentRealmId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setCurrentStep(3);
      addLog('Parsing auction house snapshot JSON stream...');

      setCurrentStep(4);
      addLog('Running SQLite / In-Memory mathematical aggregations (Min, Median, Mean, Quantities)...');

      setCurrentStep(5);
      addLog('Generating optimized little-endian binary buffers (.bin) for state and items...');

      const data = await res.json();
      const pipelineResult: AggregationResult = data.result;

      setCurrentStep(6);
      addLog(`Writing binary payloads to Cloudflare R2 (${pipelineResult.source || 'storage'})...`);
      addLog(`Successfully processed ${pipelineResult.totalAuctions.toLocaleString()} auctions in ${pipelineResult.processingTimeMs}ms.`);
      addLog(`Raw JSON: ${(pipelineResult.rawJsonEquivalentSize / 1024).toFixed(1)} KB -> Binary: ${( (pipelineResult.stateBinSize + pipelineResult.totalItemBinSize) / 1024).toFixed(1)} KB (${pipelineResult.compressionRatioPercent}% compression ratio!).`);

      setResult(pipelineResult);
      onPipelineComplete(pipelineResult);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addLog(`[ERROR] Pipeline aborted: ${msg}`);
    } finally {
      setIsRunning(false);
    }
  };

  const steps = [
    { label: 'Blizzard OAuth2 & Header Check', icon: Cpu },
    { label: 'Ingest Auction Snapshot Stream', icon: Cloud },
    { label: 'SQLite / In-Memory Aggregations', icon: Database },
    { label: 'Binary Encoding (.bin Generator)', icon: FileCode2 },
    { label: 'Cloudflare R2 Bucket Sync', icon: HardDrive },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 md:p-6 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-3xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col bg-slate-900 border-0 sm:border border-slate-700 rounded-none sm:rounded-2xl shadow-2xl overflow-hidden font-narrow"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 sm:px-6 py-3 sm:py-4 border-b border-slate-800 bg-slate-950 flex-shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 flex-shrink-0">
              <Cpu className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-friz text-sm sm:text-base font-bold text-slate-100 truncate">
                WoW Forever AH Ingestion Pipeline
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate font-narrow">
                Realm #{currentRealmId} · Ingestion Task
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-4 sm:space-y-6">
          {/* Action Trigger */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-xl bg-slate-950/70 border border-slate-800">
            <div>
              <div className="text-xs sm:text-sm font-semibold text-slate-200">
                Trigger Manual Ingestion Cycle
              </div>
              <div className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                Executes the full pipeline: Fetch → SQLite / In-Memory Aggregate → Binary Encode → Storage.
              </div>
            </div>

            <button
              onClick={startPipeline}
              disabled={isRunning}
              className={`w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg shadow-md transition-all cursor-pointer ${
                isRunning
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20 hover:shadow-amber-500/30'
              }`}
            >
              {isRunning ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Run Ingestion Now</span>
                </>
              )}
            </button>
          </div>

          {/* Pipeline Step Progress */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Pipeline Stages
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {steps.map((st, i) => {
                const stepNum = i + 1;
                const Icon = st.icon;
                const isComplete = currentStep > stepNum;
                const isActive = currentStep === stepNum && isRunning;

                return (
                  <div
                    key={st.label}
                    className={`p-2.5 rounded-lg border text-xs flex flex-col items-center text-center transition-colors ${
                      isComplete
                        ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                        : isActive
                        ? 'bg-amber-950/40 border-amber-500/60 text-amber-300 animate-pulse'
                        : 'bg-slate-950/50 border-slate-800 text-slate-500'
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-1" />
                    <span className="text-[11px] leading-tight font-medium">{st.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Results Summary if completed */}
          {result && (
            <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/60 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>Ingestion & Binary Packaging Complete!</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-slate-400">Auctions Processed</div>
                  <div className="font-mono font-bold text-slate-200">
                    {result.totalAuctions.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Execution Time</div>
                  <div className="font-mono font-bold text-slate-200">
                    {result.processingTimeMs} ms
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Unique Item .bins</div>
                  <div className="font-mono font-bold text-slate-200">
                    {result.uniqueItemCount} files
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Bandwidth Saved</div>
                  <div className="font-mono font-bold text-emerald-400">
                    {result.compressionRatioPercent}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/60 flex items-start gap-3 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Pipeline Execution Failed</div>
                <div className="text-rose-400/90 mt-0.5">{error}</div>
              </div>
            </div>
          )}

          {/* Realtime Terminal Console Output */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Live Execution Terminal
            </h3>
            <div className="p-3 bg-black/90 border border-slate-800 rounded-xl max-h-48 overflow-y-auto font-mono text-[11px] text-slate-300 space-y-1">
              {logs.length === 0 ? (
                <div className="text-slate-600 italic">
                  Press &quot;Run Ingestion Now&quot; to execute the pipeline...
                </div>
              ) : (
                logs.map((log, idx) => (
                  <div
                    key={idx}
                    className={
                      log.includes('[ERROR]')
                        ? 'text-rose-400 font-bold'
                        : log.includes('Successfully')
                        ? 'text-emerald-400 font-semibold'
                        : 'text-slate-300'
                    }
                  >
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
