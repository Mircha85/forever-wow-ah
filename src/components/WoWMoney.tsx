'use client';

interface WoWMoneyProps {
  copper: number;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showZeroSilverCopper?: boolean;
}

export function WoWMoney({
  copper,
  className = '',
  size = 'md',
  showZeroSilverCopper = false,
}: WoWMoneyProps) {
  const safeCopper = Math.max(0, Math.floor(copper || 0));

  const gold = Math.floor(safeCopper / 10000);
  const silver = Math.floor((safeCopper % 10000) / 100);
  const cop = safeCopper % 100;

  const sizeClasses = {
    xs: {
      text: 'text-[13px] font-narrow font-medium',
      coin: 'w-2.5 h-2.5 ml-0.5',
      gap: 'gap-1',
    },
    sm: {
      text: 'text-[14px] font-narrow font-medium',
      coin: 'w-3 h-3 ml-0.5',
      gap: 'gap-1',
    },
    md: {
      text: 'text-[15.2px] font-narrow font-medium',
      coin: 'w-3.5 h-3.5 ml-1',
      gap: 'gap-1.5',
    },
    lg: {
      text: 'text-[17px] font-narrow font-semibold',
      coin: 'w-4 h-4 ml-1',
      gap: 'gap-2',
    },
  }[size];

  // Format gold with thousand separators (e.g., 14,500g)
  const formattedGold = gold.toLocaleString('en-US');

  // If gold > 0 and showZeroSilverCopper is false, we can show gold only if silver & copper are 0
  const showGold = gold > 0 || (silver === 0 && cop === 0);
  const showSilver = silver > 0 || (gold > 0 && showZeroSilverCopper);
  const showCop = cop > 0 || ((gold > 0 || silver > 0) && showZeroSilverCopper);

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap select-none ${sizeClasses.gap} ${className}`}
      title={`${safeCopper.toLocaleString('en-US')} copper`}
    >
      {showGold && (
        <span className={`inline-flex items-center whitespace-nowrap text-amber-200 ${sizeClasses.text}`}>
          <span>{formattedGold}</span>
          <span
            className={`inline-block flex-shrink-0 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7),0_1px_2px_rgba(0,0,0,0.6)] border border-amber-300/60 ${sizeClasses.coin}`}
            aria-hidden="true"
          />
        </span>
      )}

      {showSilver && (
        <span className={`inline-flex items-center whitespace-nowrap text-slate-200 ${sizeClasses.text}`}>
          <span>{silver.toString().padStart(showGold ? 2 : 1, '0')}</span>
          <span
            className={`inline-block flex-shrink-0 rounded-full bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_1px_2px_rgba(0,0,0,0.6)] border border-slate-300/60 ${sizeClasses.coin}`}
            aria-hidden="true"
          />
        </span>
      )}

      {showCop && (
        <span className={`inline-flex items-center whitespace-nowrap text-amber-500 ${sizeClasses.text}`}>
          <span>{cop.toString().padStart(showGold || showSilver ? 2 : 1, '0')}</span>
          <span
            className={`inline-block flex-shrink-0 rounded-full bg-gradient-to-br from-orange-400 via-amber-700 to-amber-900 shadow-[inset_0_1px_1px_rgba(255,255,255,0.5),0_1px_2px_rgba(0,0,0,0.6)] border border-amber-600/70 ${sizeClasses.coin}`}
            aria-hidden="true"
          />
        </span>
      )}
    </span>
  );
};
