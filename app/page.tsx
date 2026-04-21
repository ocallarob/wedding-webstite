import Image from 'next/image';
import { site } from '../src/content/site';
import { Monogram } from '../src/components/Monogram';

const quickInfo = [
  { label: 'Date', value: site.dateText },
  { label: 'Location', value: 'Lough Erne Resort, Co. Fermanagh', href: 'https://www.lougherneresort.com/' },
  { label: 'RSVP', value: 'Coming soon' },
];

export default function HomePage() {
  return (
    <div className="relative overflow-hidden bg-ivory">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(219,184,184,0.22),transparent_50%),radial-gradient(circle_at_85%_20%,rgba(143,168,136,0.15),transparent_35%)]" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-16 px-5 pb-20 pt-10 sm:pt-14">
        <section className="space-y-8 rounded-3xl border border-stone/80 bg-ivory/80 px-6 py-10 text-center shadow-[0_24px_80px_rgba(58,53,48,0.08)] backdrop-blur-sm sm:px-10">
          <Monogram size={58} />
          <div className="space-y-4">
            <p className="text-xs uppercase tracking-[0.3em] text-mauve">28 August 2026 ◇ Lough Erne Resort</p>
            <h1 className="font-heading text-5xl font-light leading-tight tracking-[0.1em] text-charcoal sm:text-6xl">
              {site.coupleNames}
            </h1>
            <p className="font-heading text-2xl font-light italic tracking-[0.03em] text-mauve">Le grá agus le háthas</p>
          </div>
          <div id="header-sentinel" className="h-px w-full" />
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-stretch">
            <div className="relative min-h-[25rem] overflow-hidden rounded-2xl border border-gold/60">
              <Image
                src={site.heroImage}
                alt="Rob and Alannah in warm evening light"
                fill
                className="object-cover object-[50%_68%]"
                sizes="(min-width: 1024px) 45vw, 92vw"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal/40 via-charcoal/15 to-transparent" />
            </div>
            <div className="flex flex-col justify-between gap-5 rounded-2xl border border-stone bg-ivory/70 p-6 text-left">
              <p className="font-heading text-3xl font-light leading-tight text-charcoal">
                We are so excited to welcome you to the Lough Erne for a weekend full of love, laughter, and lasting memories.
              </p>
              <p className="text-sm leading-7 text-muted">
                From Galway to Fermanagh, this day carries both of our homes with it, and we cannot wait to celebrate
                with all of you.
              </p>
              <WaveDivider />
              <div className="grid gap-3 text-sm sm:grid-cols-3 sm:text-center">
                {quickInfo.map((item) => (
                  <div key={item.label} className="rounded-xl border border-stone bg-ivory/85 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-mauve">{item.label}</p>
                    {item.href ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-sm leading-6 text-charcoal decoration-mauve/30 underline-offset-4 hover:text-mauve hover:underline"
                      >
                        {item.value}
                        <span aria-hidden className="text-[10px] leading-none align-[0.08em]">↗︎</span>
                      </a>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-charcoal">{item.value}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-8 rounded-3xl border border-stone bg-stone/40 px-6 py-10 sm:px-10 md:grid-cols-2">
          <div className="space-y-4">
            <p className="text-xs uppercase tracking-[0.27em] text-mauve">Our Story</p>
            <h2 className="font-heading text-4xl font-light tracking-[0.05em] text-charcoal">Galway to Fermanagh</h2>
            <p className="text-base leading-8 text-muted">
              We met in Galway on 14 August 2020, got engaged on Dog&apos;s Bay in Connemara in 2024, and now we
              cannot wait to celebrate with you in one of our favourite places on the island.
            </p>
            <p className="font-heading text-2xl font-light italic text-blush">Fáilte romhaibh</p>
          </div>
          <div className="rounded-2xl border border-gold/70 bg-ivory/90 p-6">
            <DogBaySketch />
          </div>
        </section>

        <section className="space-y-6">
          <div className="space-y-2 text-center">
            <SectionMonogramMark />
            <h2 className="font-heading text-4xl font-light tracking-[0.05em] text-charcoal">Our Wedding Weekend</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {site.weekendSchedule.slice(0, 3).map((day) => (
              <div key={day.title} className="rounded-2xl border border-stone bg-ivory/80 p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-mauve">{day.date}</p>
                <h3 className="mt-2 font-heading text-2xl font-light text-charcoal">{day.title}</h3>
                <div className="mt-4 space-y-3">
                  {day.events.slice(0, 2).map((event) => (
                    <div key={event.title}>
                      <p className="font-heading text-xl font-light text-mauve">{event.time}</p>
                      <p className="text-sm leading-6 text-charcoal">{event.title}</p>
                      {event.locationUrl ? (
                        <a
                          href={event.locationUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.2em] text-muted decoration-mauve/30 underline-offset-4 hover:text-mauve hover:underline"
                        >
                          {event.location}
                          <span aria-hidden className="text-[10px] leading-none align-[0.08em]">↗︎</span>
                        </a>
                      ) : (
                        <p className="text-xs uppercase tracking-[0.2em] text-muted">{event.location}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function WaveDivider() {
  return (
    <div aria-hidden className="py-2">
      <svg viewBox="0 0 240 22" className="h-5 w-full text-gold" fill="none">
        <path
          d="M2 7C22 7 22 15 42 15C62 15 62 7 82 7C102 7 102 15 122 15C142 15 142 7 162 7C182 7 182 15 202 15C222 15 222 7 238 7"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M2 12C22 12 22 20 42 20C62 20 62 12 82 12C102 12 102 20 122 20C142 20 142 12 162 12C182 12 182 20 202 20C222 20 222 12 238 12"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </svg>
    </div>
  );
}

function SectionMonogramMark() {
  return (
    <div aria-hidden className="py-1">
      <p className="font-heading text-xl font-light uppercase tracking-[0.35em] text-mauve/85">
        A ◇ R
      </p>
    </div>
  );
}

function DogBaySketch() {
  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-stone/70 bg-ivory/70 p-3">
      <Image
        src="/photos/dogs-bay.png"
        alt="Pencil sketch coastline at Dog's Bay"
        width={1536}
        height={1130}
        className="h-auto w-full rounded-md"
        sizes="(min-width: 768px) 40vw, 100vw"
      />
    </div>
  );
}
