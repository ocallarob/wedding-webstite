import Link from 'next/link';
import { CopyButton } from '../../src/components/CopyButton';
import { site } from '../../src/content/site';

export default function TravelPage() {
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.locationText)}`;

  return (
    <div className="mx-auto max-w-5xl px-5 pt-[72px] pb-20 space-y-12">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Travel</p>
        <h1 className="font-heading text-4xl font-semibold text-charcoal">Getting here</h1>
        <p className="text-sm text-muted">Where to stay, how to arrive, and things to do nearby.</p>
      </header>

      <section className="rounded-2xl border border-stone bg-white/70 p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading text-2xl text-charcoal">Venue address</h2>
            <p className="text-sm text-muted">123 Celebration Lane, {site.locationText}</p>
          </div>
          <div className="flex gap-2">
            <Link href={mapUrl} className="btn btn-outline" target="_blank" rel="noreferrer">
              Open map
            </Link>
            <CopyButton text={`${site.locationText}\n123 Celebration Lane`} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 rounded-2xl border border-stone bg-white/70 p-7 md:grid-cols-2">
        <div>
          <h3 className="font-heading text-xl text-charcoal">Getting there</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {site.travel.gettingThere.map((item) => (
              <li key={item} className="rounded-2xl bg-white/60 p-3 border border-stone/60">{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-heading text-xl text-charcoal">Area guide</h3>
          <ul className="mt-3 space-y-3 text-sm text-muted">
            {site.travel.areaRecommendations.map((rec) => (
              <li key={rec.name} className="rounded-2xl border border-stone p-3">
                <div className="font-semibold text-charcoal">{rec.name}</div>
                <p className="text-muted">{rec.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-stone bg-white/70 p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-heading text-xl text-charcoal">Accommodations</h3>
          <p className="text-sm text-muted">Distances are approximate; book early for best rates.</p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {site.travel.accommodations.map((stay) => (
            <div key={stay.name} className="rounded-2xl border border-stone bg-white/70 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-charcoal">{stay.name}</div>
                  <div className="text-xs uppercase tracking-wide text-muted">{stay.distance}</div>
                </div>
                <div className="rounded-full bg-white/80 px-2 py-1 text-xs font-medium text-charcoal">{stay.price}</div>
              </div>
              <p className="mt-2 text-sm text-muted">{stay.notes}</p>
              {stay.link && (
                <Link href={stay.link} className="mt-3 inline-block text-sm font-semibold text-charcoal underline-offset-4 hover:underline" target="_blank" rel="noreferrer">
                  View site →
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-stone bg-white/70 p-7">
        <h3 className="font-heading text-xl text-charcoal">FAQ</h3>
        <div className="mt-4 space-y-3">
          {site.travel.faq.map((item) => (
            <div key={item.question} className="rounded-2xl border border-stone bg-white/80 p-4">
              <div className="font-semibold text-charcoal">{item.question}</div>
              <p className="text-sm text-muted">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
