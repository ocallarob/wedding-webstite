'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { Monogram } from '../../src/components/Monogram';
import { site } from '../../src/content/site';

export default function SaveTheDatePage() {
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownText, setCountdownText] = useState<string | null>(null);

  const eventDate = useMemo(() => {
    const [day, month, year] = site.date.split('/').map(Number);
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, []);

  useEffect(() => {
    if (!eventDate || !showCountdown) return;

    const formatCountdown = (target: Date) => {
      const diffMs = target.getTime() - Date.now();
      if (diffMs <= 0) return 'Today is the day';

      const totalSeconds = Math.floor(diffMs / 1000);
      const days = Math.floor(totalSeconds / (60 * 60 * 24));
      const hours = Math.floor((totalSeconds % (60 * 60 * 24)) / (60 * 60));
      const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
      const seconds = totalSeconds % 60;

      return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    };

    const tick = () => setCountdownText(formatCountdown(eventDate));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [eventDate, showCountdown]);

  return (
    <main
      className="flex min-h-screen flex-col bg-ivory text-charcoal md:grid md:h-screen md:grid-cols-2 md:overflow-hidden"
      aria-labelledby="save-the-date-title"
    >
      <div className="flex items-center justify-center px-4 py-8 md:h-screen md:px-6 md:py-10">
        <div className="relative w-full max-w-[520px]">
          <article
            className="relative mx-auto aspect-[3/4] w-full max-h-[90vh] overflow-hidden rounded-[26px] border border-stone/70 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.9),rgba(248,244,235,0.95))] shadow-[0_20px_60px_-45px_rgba(0,0,0,0.35)]"
            aria-describedby="save-the-date-details"
          >
            <div className="pointer-events-none absolute inset-6 rounded-[18px] border border-stone/60 opacity-50" aria-hidden />

            <div className="relative grid h-full grid-rows-[auto,1fr,auto] gap-6 px-8 py-10 text-center md:gap-8 md:px-10 md:py-12 md:text-left">
              <div className="flex flex-col items-center gap-4 md:items-start">
                <Monogram size={72} />
                <p className="border-b border-stone/70 pb-1 text-sm font-semibold uppercase tracking-[0.22em] text-charcoal md:text-base">
                  Save the date
                </p>
              </div>

              <div className="flex flex-col items-center justify-center space-y-8 md:items-start md:space-y-10">
                <div className="space-y-4">
                  <h1
                    id="save-the-date-title"
                    className="font-heading text-[clamp(2.4rem,4vw,3.6rem)] font-semibold tracking-[0.08em] text-charcoal"
                  >
                    {site.coupleNames}
                  </h1>
                  <p
                    className="text-sm uppercase tracking-[0.18em] text-charcoal/80 transition-opacity md:text-base"
                    onClick={() => setShowCountdown((prev) => !prev)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setShowCountdown((prev) => !prev);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-live="polite"
                  >
                    {showCountdown && countdownText ? countdownText : site.dateText}
                  </p>
                  <a
                    href="https://www.lougherneresort.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-base underline decoration-2 decoration-charcoal underline-offset-6 hover:text-charcoal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-charcoal/50"
                    aria-label={`${site.locationHotel} (opens in new tab)`}
                  >
                    {site.locationHotel}
                    <span aria-hidden className="text-sm leading-none align-[0.08em]">↗︎</span>
                  </a>
                  <p className="text-base leading-relaxed text-charcoal/80">{site.locationText}</p>
                </div>
                <div className="space-y-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-charcoal/70">
                    + Join us for Day 2
                  </p>
                  <p className="leading-relaxed text-charcoal/80">
                    {site.day2DateText}
                  </p>
                </div>
              </div>

              <div className="space-y-4 text-base text-charcoal/80" id="save-the-date-details">
                <div className="border-t border-stone/50" />
                <div className="space-y-3">
                  <br/>
                  <p className="text-xs uppercase tracking-[0.16em] text-charcoal/70">
                    More details soon
                  </p>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>

      <div className="relative w-full aspect-[3/4] md:h-screen md:aspect-auto">
        <Image
          src={site.heroImage}
          alt={`Portrait of ${site.coupleNames}`}
          fill
          className="bg-sand object-cover object-bottom"
          priority
          sizes="(min-width: 768px) 50vw, 100vw"
        />
      </div>
    </main>
  );
}
