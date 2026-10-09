'use client';

import React, { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error for diagnostics
    console.error('App Router Caught Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 text-xl font-bold">
          !
        </div>
        <h2 className="text-xl font-semibold text-white">Something went wrong</h2>
        <p className="text-sm text-slate-400">
          An error occurred while loading this section. You can try refreshing or resetting the state.
        </p>
        <button
          onClick={() => reset()}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-medium rounded-lg text-sm transition-colors cursor-pointer"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
