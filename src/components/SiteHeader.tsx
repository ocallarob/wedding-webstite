'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Monogram } from '../components/Monogram';
import { site } from '../content/site';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/weekend', label: 'Weekend' },
  { href: '/travel', label: 'Travel' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/rsvp', label: 'RSVP' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const isHome = pathname === '/';
  const hideHeader = pathname === '/save-the-date';
  const [show, setShow] = useState(!isHome);

  useEffect(() => {
    if (hideHeader) return;

    if (!isHome) {
      setShow(true);
      return;
    }

    const el = document.getElementById('header-sentinel');
    if (!el) {
      // fallback: show header if sentinel is missing
      setShow(true);
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        // When sentinel is NOT visible, we've scrolled past it -> show header
        setShow(!entry.isIntersecting);
      },
      { root: null, threshold: 0, rootMargin: '-8px 0px 0px 0px' }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [hideHeader, isHome]);

  if (hideHeader) return null;

  return (
    <header
      className={[
        'fixed top-0 left-0 right-0 z-30 transition-all duration-300',
        show
          ? 'opacity-100 translate-y-0 border-b border-stone/80 bg-ivory/95 backdrop-blur'
          : 'opacity-0 -translate-y-2 pointer-events-none',
      ].join(' ')}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-3 text-sm uppercase tracking-[0.2em] text-muted">
          <Monogram />
          <span className="sr-only">Home</span>
        </Link>

        <nav className="hidden gap-3 text-[11px] uppercase tracking-[0.24em] text-muted sm:flex">
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

        <div className="font-heading italic text-xl leading-none tracking-[0.18em] text-muted">
          {site.date}
        </div>
      </div>
    </header>
  );
}
