import Image from 'next/image';
import { site } from '../../src/content/site';

export default function TravelPage() {
  return (
    <div className="relative overflow-hidden bg-ivory">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(219,184,184,0.18),transparent_52%),radial-gradient(circle_at_88%_22%,rgba(143,168,136,0.14),transparent_34%)]" />
      <div className="relative mx-auto max-w-6xl space-y-10 px-5 pb-20 pt-[84px]">
        <header className="rounded-3xl border border-stone/80 bg-ivory/80 px-6 py-10 text-center shadow-[0_18px_50px_rgba(58,53,48,0.07)] backdrop-blur-sm sm:px-10">
          <p className="text-xs uppercase tracking-[0.26em] text-mauve">Travel</p>
          <div className="mt-2 flex items-center gap-4 sm:gap-6">
            <Image src="/assets/divider-line-transparent.png" alt="" aria-hidden width={388} height={50} className="h-auto w-20 flex-1 opacity-70 sm:w-28" />
            <h1 className="font-heading text-4xl font-light tracking-[0.05em] text-charcoal sm:text-5xl">Plan Your Stay</h1>
            <Image src="/assets/divider-line-transparent.png" alt="" aria-hidden width={388} height={50} className="h-auto w-20 flex-1 opacity-70 sm:w-28" />
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted">
            The best way to get around Fermanagh is by car, with plenty of taxi options as well.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-stone bg-ivory/85 p-6 shadow-[0_10px_30px_rgba(58,53,48,0.05)]">
            <p className="text-[11px] uppercase tracking-[0.24em] text-mauve">Getting There</p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-charcoal/90">
              {site.travel.gettingThere.map((item) => (
                <li key={item} className="rounded-xl border border-stone/75 bg-ivory/80 px-4 py-3">{item}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-stone bg-ivory/85 p-6 shadow-[0_10px_30px_rgba(58,53,48,0.05)]">
            <p className="text-[11px] uppercase tracking-[0.24em] text-mauve">Taxi Contacts</p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-charcoal/90">
              {site.travel.taxiContacts.map((item) => (
                <li key={item} className="rounded-xl border border-stone/75 bg-ivory/80 px-4 py-3">{item}</li>
              ))}
            </ul>
          </section>
        </div>

        <section className="rounded-2xl border border-stone bg-ivory/85 p-6 shadow-[0_10px_30px_rgba(58,53,48,0.05)]">
          <p className="text-[11px] uppercase tracking-[0.24em] text-mauve">Accommodation</p>
          <p className="mt-3 text-sm leading-7 text-charcoal/85">
            There are rooms available in the Lough Erne. If you prefer another hotel or accommodation, there are
            plenty of options in and around Enniskillen, including AirBnB and local guest stays.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {site.travel.accommodations.map((stay) => (
              <article key={stay.name} className="rounded-xl border border-stone/75 bg-ivory/80 p-4">
                <h2 className="font-heading text-xl font-light text-charcoal">{stay.name}</h2>
                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted">{stay.distance} • {stay.price}</p>
                <p className="mt-2 text-sm leading-7 text-charcoal/85">{stay.notes}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-stone bg-ivory/85 p-6 shadow-[0_10px_30px_rgba(58,53,48,0.05)]">
          <p className="text-[11px] uppercase tracking-[0.24em] text-mauve">Things to Do in Fermanagh</p>
          <div className="mt-4 space-y-4">
            {site.travel.areaRecommendations.map((spot) => (
              <article key={spot.name} className="rounded-xl border border-stone/75 bg-ivory/80 p-4">
                <h2 className="font-heading text-xl font-light text-charcoal">{spot.name}</h2>
                <p className="mt-2 text-sm leading-7 text-charcoal/85">{spot.detail}</p>
              </article>
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
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-stone bg-ivory/85 p-6 text-center shadow-[0_10px_30px_rgba(58,53,48,0.05)]">
          <p className="text-sm leading-7 text-charcoal/90">
            If you have any issues or need any advice, just message Alannah or Rob for more details.
          </p>
        </section>
      </div>
    </div>
  );
}
