'use client';

import { useState } from 'react';
import {
  X,
  Cpu,
  Terminal,
  ShieldCheck,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react';

interface PipelineRunnerModalProps {
  currentRealmId: number;
  onClose: () => void;
  /**
   * Kept for source compatibility with the previous in-browser runner. The
   * modal no longer triggers a pipeline run from the browser, so this is no
   * longer called. Callers can drop it once they stop relying on the modal
   * to refresh state for them.
   */
  onPipelineComplete?: (result: never) => void;
}

const CURL_TEMPLATE = (realmId: number): string =>
  `curl -X POST "$APP_URL/api/pipeline/run" \\\n` +
  `  -H "Authorization: Bearer $PIPELINE_RUN_TOKEN" \\\n` +
  `  -H "Content-Type: application/json" \\\n` +
  `  -d '{"connectedRealmId": ${realmId}}'`;

const POWERSHELL_TEMPLATE = (realmId: number): string =>
  `$headers = @{ Authorization = "Bearer $env:PIPELINE_RUN_TOKEN" }\n` +
  `Invoke-RestMethod -Method Post -Uri "$env:APP_URL/api/pipeline/run" ` +
  `-ContentType "application/json" -Headers $headers ` +
  `-Body '{"connectedRealmId": ${realmId}}'`;

export function PipelineRunnerModal({
  currentRealmId,
  onClose,
}: PipelineRunnerModalProps) {
  const [copied, setCopied] = useState(false);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure iframe); the operator can
      // select and copy manually. No error toast — silently falling back
      // is fine here.
    }
  };

  const curl = CURL_TEMPLATE(currentRealmId);
  const pwsh = POWERSHELL_TEMPLATE(currentRealmId);

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
                Realm #{currentRealmId} · Operator-Triggered Run
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-4 sm:space-y-5">
          {/* Why this is not a button */}
          <div className="flex items-start gap-3 p-3.5 sm:p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 text-amber-200">
            <ShieldCheck className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm leading-relaxed">
              <div className="font-semibold text-amber-100">
                Runs are no longer triggered from the browser.
              </div>
              <p className="mt-1 text-amber-200/90">
                The route is now gated by a bearer token compared with
                <code className="mx-1 px-1 py-0.5 rounded bg-amber-900/60 text-amber-100">
                  crypto.timingSafeEqual
                </code>
                so an attacker cannot drain the Battle.net quota or fill R2 with
                synthetic-shaped writes. Run the command below from a host that
                has the token; it never reaches this page.
              </p>
            </div>
          </div>

          {/* Prerequisites */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Prerequisites
            </h3>
            <ul className="text-xs sm:text-sm text-slate-300 space-y-1.5 list-disc list-inside">
              <li>
                <code className="px-1 py-0.5 rounded bg-slate-800 text-slate-100">
                  PIPELINE_RUN_TOKEN
                </code>{' '}
                is set in the host shell (32+ random bytes, see
                <code className="mx-1 px-1 py-0.5 rounded bg-slate-800 text-slate-100">
                  .env.example
                </code>
                ).
              </li>
              <li>
                <code className="px-1 py-0.5 rounded bg-slate-800 text-slate-100">
                  APP_URL
                </code>{' '}
                points at this deployment (e.g. your Cloud Run URL).
              </li>
              <li>
                The deployment&apos;s production env has the same token
                configured. Production refuses to start without it.
              </li>
            </ul>
          </section>

          {/* curl */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" /> Bash / Zsh
              </h3>
              <button
                type="button"
                onClick={() => copy(curl)}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-300 hover:text-slate-100 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </>
                )}
              </button>
            </div>
            <pre className="p-3 bg-black/90 border border-slate-800 rounded-xl overflow-x-auto font-mono text-[11px] sm:text-xs text-slate-200 whitespace-pre">
              {curl}
            </pre>
          </section>

          {/* PowerShell */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" /> PowerShell
            </h3>
            <pre className="p-3 bg-black/90 border border-slate-800 rounded-xl overflow-x-auto font-mono text-[11px] sm:text-xs text-slate-200 whitespace-pre">
              {pwsh}
            </pre>
          </section>

          {/* What happens server-side */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              What the server does
            </h3>
            <ol className="text-xs sm:text-sm text-slate-300 space-y-1.5 list-decimal list-inside">
              <li>
                Constant-time compares the bearer against
                <code className="mx-1 px-1 py-0.5 rounded bg-slate-800 text-slate-100">
                  PIPELINE_RUN_TOKEN
                </code>
                . Mismatch → 401 (opaque body, no probe signal).
              </li>
              <li>Rate-limits the authenticated call (5 / 5 s) so accidental loops stop fast.</li>
              <li>Fetches a full Battle.net snapshot, aggregates, encodes UNDR v1, writes to R2.</li>
              <li>Returns the per-item binary count and total auction count.</li>
            </ol>
          </section>

          {/* Caveat */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-950/25 border border-rose-900/60 text-rose-200/90 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Never paste the token into a public channel or commit it. The
              browser never needs to know it; rotate immediately if it leaks
              (see <code className="px-1 py-0.5 rounded bg-rose-900/40 text-rose-100">README.md</code>).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};