'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { DateEasterEgg } from './DateEasterEgg';
import { Monogram } from './Monogram';
import { SiteHeader } from './SiteHeader';
import { site } from '../content/site';

type Props = {
  coupleNames: string;
  dateText: string;
  locationText: string;
  children: React.ReactNode;
};

export function SiteFrame({ coupleNames, dateText, locationText, children }: Props) {
  const pathname = usePathname();
  const hideChrome = pathname === '/save-the-date' || pathname === '/';

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
            <div className="text-xs uppercase tracking-[0.25em]">
              <DateEasterEgg defaultText={dateText} targetDate={site.date} className="inline" /> • {locationText}
            </div>
            <Image
              src="/assets/heart.svg"
              alt="Heart motif"
              width={54}
              height={54}
              className="mt-2 h-auto w-8 opacity-85"
            />
          </div>
        </footer>
      )}
    </div>
  );
}
