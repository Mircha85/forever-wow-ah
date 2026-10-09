import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WoW Forever AH - Real-Time Auction House Intelligence',
  description: 'High-performance auction house intelligence dashboard and binary data processing pipeline for WoW: Forever with client-side ArrayBuffer/DataView decoding.',
  openGraph: {
    title: 'WoW Forever AH - Real-Time Auction House Intelligence',
    description: 'High-performance auction house intelligence dashboard and binary data processing pipeline for WoW: Forever with client-side ArrayBuffer/DataView decoding.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WoW Forever AH - Real-Time Auction House Intelligence',
    description: 'High-performance auction house intelligence dashboard and binary data processing pipeline for WoW: Forever with client-side ArrayBuffer/DataView decoding.',
  },
  icons: {
    icon: '/wow-forever-logo-small.png',
    shortcut: '/wow-forever-logo-small.png',
    apple: '/wow-forever-logo-small.png',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className="bg-slate-950 text-slate-100 min-h-screen antialiased selection:bg-amber-500/30 selection:text-amber-200 font-sans">
        {children}
      </body>
    </html>
  );
}
