'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { DateEasterEgg } from './DateEasterEgg';
import { Monogram } from '../components/Monogram';
import { site } from '../content/site';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/our-story', label: 'Our Story' },
  { href: '/wedding-party', label: 'Wedding Party' },
  { href: '/weekend', label: 'Weekend' },
  { href: '/travel', label: 'Travel' },
  { href: '/faq', label: 'FAQ' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const hideHeader = pathname === '/save-the-date';
  const [mobileOpen, setMobileOpen] = useState(false);

  if (hideHeader) return null;

  return (
    <header
      className={[
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        'pointer-events-auto opacity-100 translate-y-0 border-b border-stone/80 bg-ivory/95 backdrop-blur',
      ].join(' ')}
    >
      <div className="mx-auto max-w-6xl px-5 py-4">
        <div className="flex items-center">
        <Link href="/" className="relative z-10 flex items-center gap-3 text-sm uppercase tracking-[0.2em] text-muted">
          <Monogram />
          <span className="sr-only">Home</span>
        </Link>

        <nav className="relative z-20 mx-4 hidden flex-1 items-center justify-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted sm:flex md:gap-3 md:text-[11px] md:tracking-[0.22em]">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-2 py-1 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-charcoal/40"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="relative z-10 hidden font-heading italic text-xl leading-none tracking-[0.18em] text-muted lg:block">
          <DateEasterEgg defaultText={site.date} targetDate={site.countdownDateTime} className="inline" />
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="ml-auto inline-flex items-center rounded border border-stone/80 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted sm:hidden"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-menu"
          aria-label="Toggle navigation menu"
        >
          Menu
        </button>
        </div>

        {mobileOpen && (
          <nav
            id="mobile-nav-menu"
            className="mt-3 grid gap-1 rounded-xl border border-stone/80 bg-ivory/95 p-2 text-[10px] uppercase tracking-[0.2em] text-muted sm:hidden"
          >
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="rounded px-2 py-2 no-underline hover:bg-mauve/10 hover:text-mauve focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal/40"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
