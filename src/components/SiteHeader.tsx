'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DateEasterEgg } from './DateEasterEgg';
import { Monogram } from '../components/Monogram';
import { site } from '../content/site';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/our-story', label: 'Our Story' },
  { href: '/wedding-party', label: 'Wedding Party' },
  { href: '/weekend', label: 'Weekend' },
  { href: '/travel', label: 'Travel' },
  { href: '/gallery', label: 'Gallery' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const hideHeader = pathname === '/save-the-date';

  if (hideHeader) return null;

  return (
    <header
      className={[
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        'pointer-events-auto opacity-100 translate-y-0 border-b border-stone/80 bg-ivory/95 backdrop-blur',
      ].join(' ')}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <Link href="/" className="relative z-10 flex items-center gap-3 text-sm uppercase tracking-[0.2em] text-muted">
          <Monogram />
          <span className="sr-only">Home</span>
        </Link>

        <nav className="relative z-20 hidden gap-3 text-[11px] uppercase tracking-[0.24em] text-muted sm:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-2 py-1 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-charcoal/40"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="relative z-10 font-heading italic text-xl leading-none tracking-[0.18em] text-muted">
          <DateEasterEgg defaultText={site.date} targetDate={site.countdownDateTime} className="inline" />
        </div>
      </div>
    </header>
  );
}
