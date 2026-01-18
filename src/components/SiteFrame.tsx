'use client';

import { usePathname } from 'next/navigation';
import { Monogram } from './Monogram';
import { SiteHeader } from './SiteHeader';

type Props = {
  coupleNames: string;
  dateText: string;
  locationText: string;
  children: React.ReactNode;
};

export function SiteFrame({ coupleNames, dateText, locationText, children }: Props) {
  const pathname = usePathname();
  const hideChrome = pathname === '/save-the-date';

  return (
    <div className="min-h-screen flex flex-col bg-ivory text-charcoal">
      {!hideChrome && <SiteHeader />}
      <main className="flex-1">{children}</main>
      {!hideChrome && (
        <footer className="border-t border-stone bg-ivory/70">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-5 py-12 text-sm text-muted">
            <Monogram />
            <div className="font-heading text-lg text-charcoal tracking-[0.15em] uppercase text-center">
              {coupleNames}
            </div>
            <div className="text-xs uppercase tracking-[0.25em]">{dateText} • {locationText}</div>
          </div>
        </footer>
      )}
    </div>
  );
}
