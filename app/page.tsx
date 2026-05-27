import Image from 'next/image';
import Link from 'next/link';
import { site } from '../src/content/site';
import { Monogram } from '../src/components/Monogram';
import { DateEasterEgg } from '../src/components/DateEasterEgg';

const quickInfo = [
  { label: 'Date', value: site.dateText },
  { label: 'Location', value: 'Lough Erne Resort, Co. Fermanagh', href: 'https://www.lougherneresort.com/' },
  { label: 'RSVP', value: 'By 28 June 2026' },
];

type WeekendEvent = {
  time: string;
  title: string;
  location: string;
  locationUrl?: string;
};

type WeekendDay = {
  title: string;
  date: string;
  events: WeekendEvent[];
};

const weekendSchedule: WeekendDay[] = site.weekendSchedule.map((day) => ({
  title: day.title,
  date: day.date,
  events: day.events.map((event) => ({
    time: event.time,
    title: event.title,
    location: event.location,
    locationUrl: event.locationUrl,
  })),
}));

const homeWeekendCards: WeekendDay[] = [
  {
    title: 'Day 1 • Ceremony',
    date: 'Friday Afternoon',
    events: [
      {
        time: '1:00 PM',
        title: 'Wedding Mass',
        location: "St. Mary's Church, Arney",
        locationUrl:
          'https://www.google.com/maps/place/St.+Mary%E2%80%99s+Catholic+Church/@54.2911654,-7.7823194,16823m/data=!3m1!1e3!4m10!1m2!2m1!1sSt+Marys+Church+Cleenish+Arney+Enniskillen+BT92+2DL!3m6!1s0x485e441da76136fd:0xe454921a3932c4f7!8m2!3d54.2911654!4d-7.6704973!15sCjNTdCBNYXJ5cyBDaHVyY2ggQ2xlZW5pc2ggQXJuZXkgRW5uaXNraWxsZW4gQlQ5MiAyREySAQ9jYXRob2xpY19jaHVyY2jgAQA!16s%2Fg%2F11g8xgfn9n?entry=ttu&g_ep=EgoyMDI2MDUyNS4wIKXMDSoASAFQAw%3D%3D',
      },
    ],
  },
  {
    title: 'Day 1 • Reception',
    date: 'Friday Evening',
    events: [
      {
        time: '3:00 PM',
        title: 'Cocktails & Canapés',
        location: 'The Ross Foyer, Lough Erne Resort',
        locationUrl: 'https://www.lougherneresort.com/',
      },
      {
        time: '6:00 PM',
        title: 'Reception',
        location: 'The Ross Suite, Lough Erne Resort',
        locationUrl: 'https://www.lougherneresort.com/',
      },
    ],
  },
  {
    title: 'Day 2 • Drinks & Music',
    date: 'Saturday',
    events: [
      {
        time: '3:00 PM',
        title: 'Afternoon Drinks',
        location: "Charlie's Bar",
        locationUrl: 'https://www.google.com/maps/search/?api=1&query=Charlie%27s+Bar+1+Church+St+Enniskillen+BT74+7DW',
      },
    ],
  },
];

const homeNavItems = [
  { href: '/our-story', label: 'Our Story' },
  { href: '/wedding-party', label: 'Wedding Party' },
  { href: '/weekend', label: 'Weekend' },
  { href: '/travel', label: 'Travel' },
  { href: '/gallery', label: 'Gallery' },
];

const footerNavItems = [
  { href: '/', label: 'Home' },
  { href: '/our-story', label: 'Our Story' },
  { href: '/wedding-party', label: 'Wedding Party' },
  { href: '/weekend', label: 'Weekend' },
  { href: '/travel', label: 'Travel' },
  { href: '/gallery', label: 'Gallery' },
];

export default function HomePage() {
  return (
    <div className="relative overflow-hidden bg-ivory">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(219,184,184,0.22),transparent_50%),radial-gradient(circle_at_85%_20%,rgba(143,168,136,0.15),transparent_35%)]" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-16 px-5 pb-20 pt-10 sm:pt-14">
        <section className="relative space-y-8 rounded-3xl border border-stone/80 bg-ivory/80 px-6 pb-10 pt-8 text-center shadow-[0_24px_80px_rgba(58,53,48,0.08)] backdrop-blur-sm sm:px-10 sm:pt-10">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="block w-fit shrink-0 no-underline" aria-label="Home">
              <Monogram size={58} />
            </Link>
            <MobileHomeMenu />
            <HomeHeroNav />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/devenish-tower-rsvp.png"
              alt=""
              aria-hidden
              className="h-auto w-20 shrink-0 opacity-75 md:w-[120px]"
            />
          </div>
          <div className="space-y-4">
            <p className="text-xs uppercase text-mauve sm:tracking-[0.3em]">
              <DateEasterEgg
                defaultText="28 August 2026"
                targetDate={site.countdownDateTime}
                className="mx-auto block w-fit text-center tracking-[0.22em] sm:mx-0 sm:inline sm:w-auto sm:text-left sm:tracking-[0.3em]"
              />
              <span className="block py-1 text-center tracking-[0.2em] sm:inline sm:px-2 sm:py-0 sm:tracking-[0.3em]">◇</span>
              <span className="block text-center tracking-[0.22em] sm:inline sm:tracking-[0.3em]">Lough Erne Resort</span>
            </p>
            <h1 className="font-heading text-5xl font-light leading-tight tracking-[0.1em] text-mauve sm:text-6xl">
              {site.coupleNames}
            </h1>
            <IrishPhrase
              phrase="fáilte romhaibh"
              translation="Welcome"
              className="text-[1.8rem] tracking-[0.01em] sm:text-[2.2rem]"
            />
            <p className="mx-auto max-w-2xl text-sm leading-7 text-muted">{site.welcomeMessage}</p>
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
                We are so excited to have you as part of our day.
              </p>
              <p className="text-sm leading-7 text-muted">
                From Galway to Fermanagh, this day carries both of our families with it, and we cannot wait to celebrate
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
                    ) : item.label === 'Date' ? (
                      <DateEasterEgg
                        defaultText={item.value}
                        targetDate={site.countdownDateTime}
                        className="mt-2 text-sm leading-6 text-charcoal"
                      />
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
            <h2 className="font-heading text-4xl font-light tracking-[0.04em] text-mauve">
              <span className="font-script mr-2 text-[0.95em] text-blush" style={{ fontFamily: 'var(--font-script), cursive' }}>from</span>
              Galway to Fermanagh
            </h2>
            <p className="text-base leading-8 text-muted">
              We met on 14 August 2020 on the slip in Galway, had a year of long distance in 2021, moved to London in January
              2022, and got engaged on Dog&apos;s Bay on 22 August 2024.
            </p>
            <IrishPhrase
              phrase="le chéile"
              translation="Together"
              className="text-[1.75rem] sm:text-[2rem]"
            />
            <WaveDivider />
          </div>
          <div className="rounded-2xl border border-gold/70 bg-ivory/90 p-6">
            <DogBaySketch />
          </div>
        </section>

        <section className="relative space-y-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/menlo-castle-rsvp.png"
            alt=""
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-auto w-24 -translate-x-1/2 opacity-70 md:left-5 md:top-[-0.75rem] md:w-[120px] md:translate-x-0"
          />
          <div className="space-y-2 pt-20 text-center md:pt-0">
            <SectionMonogramMark />
            <span className="group relative inline-grid place-items-center">
              <h2
                tabIndex={0}
                className="peer font-heading text-4xl font-light tracking-[0.04em] text-mauve opacity-100 outline-none transition-opacity duration-150 group-hover:opacity-0 peer-focus-visible:opacity-0"
                style={{ gridArea: '1 / 1' }}
              >
                <span className="font-script mr-2 text-[0.95em] text-blush" style={{ fontFamily: 'var(--font-script), cursive' }}>ár</span>
                Clár na Bainise
              </h2>
              <h2
                className="pointer-events-none font-heading text-4xl font-light tracking-[0.04em] text-mauve opacity-0 transition-opacity duration-150 group-hover:opacity-100 peer-focus-visible:opacity-100"
                style={{ gridArea: '1 / 1' }}
              >
                <span className="font-script mr-2 text-[0.95em] text-blush" style={{ fontFamily: 'var(--font-script), cursive' }}>Our</span>
                wedding schedule
              </h2>
            </span>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {homeWeekendCards.map((day) => (
              (() => {
                const panelUrl = day.events.find((event) => event.locationUrl)?.locationUrl;
                const PanelTag = panelUrl ? 'a' : 'div';
                const panelProps = panelUrl
                  ? { href: panelUrl, target: '_blank', rel: 'noreferrer' }
                  : {};

                return (
                  <PanelTag
                    key={day.title}
                    {...panelProps}
                    className={`rounded-2xl border border-stone bg-ivory/80 p-5 ${panelUrl ? 'block transition hover:border-mauve/60 hover:shadow-[0_12px_26px_rgba(58,53,48,0.08)]' : ''}`}
                  >
                    <p className="text-[11px] uppercase tracking-[0.24em] text-mauve">{day.date}</p>
                    <h3 className="mt-2 font-heading text-2xl font-light text-charcoal">{day.title}</h3>
                    <div className="mt-4 space-y-3">
                      {day.events.slice(0, 2).map((event) => (
                        <div key={event.title}>
                          <p className="font-heading text-xl font-light text-mauve">{event.time}</p>
                          <p className="text-sm leading-6 text-charcoal">{event.title}</p>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted">
                            {event.location}
                            {panelUrl ? <span aria-hidden className="ml-1 text-[10px] leading-none align-[0.08em]">↗︎</span> : null}
                          </p>
                        </div>
                      ))}
                    </div>
                  </PanelTag>
                );
              })()
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-stone bg-ivory/85 p-6 shadow-[0_10px_30px_rgba(58,53,48,0.05)]">
          <p className="text-[11px] uppercase tracking-[0.24em] text-mauve">FAQs</p>
          <div className="mt-4 space-y-4">
            {site.travel.faq.map((item) => (
              <article key={item.question} className="rounded-xl border border-stone/75 bg-ivory/80 p-4">
                <h2 className="font-heading text-xl font-light text-charcoal">{item.question}</h2>
                <p className="mt-2 text-sm leading-7 text-charcoal/85">{item.answer}</p>
                {'linkHref' in item && item.linkHref ? (
                  <Link
                    href={item.linkHref}
                    className="mt-2 inline-flex text-xs uppercase tracking-[0.2em] text-mauve underline underline-offset-4"
                  >
                    {'linkLabel' in item && item.linkLabel ? item.linkLabel : 'Read more'}
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <div className="space-y-3 pb-2 text-center">
          <p className="text-sm text-muted">
            Any issues? Contact Rob or Alannah.
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] uppercase tracking-[0.2em] text-muted">
            {footerNavItems.map((item) => (
              <Link key={item.href} href={item.href} className="no-underline hover:text-mauve hover:underline">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex justify-center">
            <Image
              src="/assets/heart-transparent.png"
              alt=""
              aria-hidden
              width={88}
              height={81}
              className="h-auto w-12 opacity-85"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeHeroNav() {
  return (
    <nav className="hidden flex-1 flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[11px] uppercase tracking-[0.24em] text-muted lg:flex lg:gap-x-10">
      {homeNavItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="px-1 py-1 no-underline transition-colors hover:text-mauve"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function MobileHomeMenu() {
  return (
    <details className="group relative lg:hidden">
      <summary className="list-none rounded-full border border-stone/80 px-4 py-1 text-[10px] uppercase tracking-[0.22em] text-muted [&::-webkit-details-marker]:hidden">
        Menu
      </summary>
      <nav className="absolute left-1/2 top-[calc(100%+8px)] z-30 w-44 -translate-x-1/2 rounded-xl border border-stone bg-ivory/95 p-2 shadow-[0_10px_30px_rgba(58,53,48,0.12)] backdrop-blur-sm">
        {homeNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded px-2 py-2 text-center text-[10px] uppercase tracking-[0.22em] text-muted no-underline hover:bg-mauve/10 hover:text-mauve"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </details>
  );
}

function WaveDivider() {
  return (
    <div aria-hidden className="py-2">
      <Image
        src="/assets/divider-line-transparent.png"
        alt=""
        width={388}
        height={50}
        className="h-auto w-full opacity-75"
      />
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

function IrishPhrase({ phrase, translation, className }: { phrase: string; translation: string; className?: string }) {
  return (
    <span className="group relative inline-grid place-items-center">
      <span
        tabIndex={0}
        className={`peer font-script leading-none text-blush opacity-100 outline-none transition-opacity duration-150 group-hover:opacity-0 peer-focus-visible:opacity-0 ${className ?? ''}`}
        style={{ fontFamily: 'var(--font-script), cursive', gridArea: '1 / 1' }}
      >
        {phrase}
      </span>
      <span
        className={`pointer-events-none font-script leading-none text-blush opacity-0 transition-opacity duration-150 group-hover:opacity-100 peer-focus-visible:opacity-100 ${className ?? ''}`}
        style={{ fontFamily: 'var(--font-script), cursive', gridArea: '1 / 1' }}
      >
        {translation}
      </span>
    </span>
  );
}
