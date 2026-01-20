import Image from 'next/image';
import Link from 'next/link';
import SaveTheDatePage from './save-the-date/page';
import { site } from '../src/content/site';
import { Monogram } from '../src/components/Monogram';

const navLinks = [
  { href: '/weekend', label: 'Weekend' },
  { href: '/travel', label: 'Travel' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/rsvp', label: 'RSVP' },
];

const quickInfo = [
  { label: 'Date', value: site.dateText },
  { label: 'Location', value: site.locationText },
  { label: 'RSVP', value: site.rsvpDeadline },
];

export default function HomePage() {
  // Temporary: show Save the Date content while the main homepage is in progress.
  return <SaveTheDatePage />;
}

function LegacyHomePage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-20 px-5 py-24">
      <section className="flex flex-col items-center gap-8 text-center">
        <Monogram size={54} />
        <div className="space-y-4">
          <h1 className="font-heading text-5xl font-semibold leading-tight tracking-[0.08em] text-charcoal sm:text-6xl">
            {site.coupleNames}
          </h1>
          <p className="text-xs uppercase tracking-[0.28em] text-muted">
            {site.dateText} • {site.locationText}
          </p>
        </div>
        <nav className="flex flex-wrap justify-center gap-5 text-[11px] uppercase tracking-[0.26em] text-muted">
          {navLinks.map((item) => (
            <Link key={item.href} href={item.href} className="pb-1 hover:underline">
              {item.label}
            </Link>
          ))}
        </nav>
        <div id="header-sentinel" className="h-px w-full" />
        <div className="relative aspect-[4/5] w-full max-w-3xl overflow-hidden rounded-2xl border border-stone bg-white">
          <Image
            src={site.heroImage}
            alt="The happy couple"
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 40vw, 90vw"
            priority
          />
        </div>
        <div className="flex flex-col gap-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-center sm:gap-6">
          {quickInfo.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="label-serif">{item.label}</span>
              <span className="text-charcoal">{item.value}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/rsvp" className="btn btn-primary">RSVP</Link>
          <Link href="/weekend" className="btn btn-outline">Weekend Details</Link>
        </div>
      </section>

      <section className="space-y-6 text-center">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.25em] text-muted">The weekend</p>
          <h2 className="font-heading text-3xl font-semibold text-charcoal">A few highlights</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {site.weekendSchedule.slice(0, 3).map((day) => (
            <div key={day.title} className="space-y-3 border-t border-stone pt-4">
              <div className="text-xs uppercase tracking-[0.24em] text-muted">{day.date}</div>
              <div className="font-heading text-xl text-charcoal">{day.title}</div>
              <ul className="space-y-2 text-sm text-muted">
                {day.events.slice(0, 2).map((event) => (
                  <li key={event.title}>
                    <span className="font-semibold text-charcoal">{event.time}</span> — {event.title}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
