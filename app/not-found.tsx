import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-xl font-bold">
          404
        </div>
        <h2 className="text-xl font-semibold text-white">Page Not Found</h2>
        <p className="text-sm text-slate-400">
          The requested page or auction house realm view could not be located.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-medium rounded-lg text-sm transition-colors cursor-pointer"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
