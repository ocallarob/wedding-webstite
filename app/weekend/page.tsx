import { site } from '../../src/content/site';

const scheduleColumns = [
  {
    title: 'Mass + Drinks + Dinner',
    date: 'Friday, 28 August 2026',
    events: site.weekendSchedule[0]?.events.slice(0, 3) ?? [],
  },
  {
    title: 'Evening Guests + Buffet',
    date: 'Friday, 28 August 2026',
    events: site.weekendSchedule[0]?.events.slice(3, 5) ?? [],
  },
  {
    title: 'Day 2',
    date: 'Saturday, 29 August 2026',
    events: site.weekendSchedule[1]?.events.slice(0, 2) ?? [],
  },
];

export default function WeekendPage() {
  return (
    <div className="relative overflow-hidden bg-ivory">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(219,184,184,0.18),transparent_52%),radial-gradient(circle_at_88%_22%,rgba(143,168,136,0.14),transparent_34%)]" />
      <div className="relative mx-auto max-w-6xl space-y-10 px-5 pb-20 pt-[84px]">
        <header className="rounded-3xl border border-stone/80 bg-ivory/80 px-6 py-10 text-center shadow-[0_18px_50px_rgba(58,53,48,0.07)] backdrop-blur-sm sm:px-10">
          <p className="text-xs uppercase tracking-[0.26em] text-mauve">Weekend</p>
          <h1 className="mt-2 font-heading text-4xl font-light tracking-[0.05em] text-charcoal sm:text-5xl">Schedule</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted">
            Enjoy your night, we will see you on the dancefloor as the party continues in the Ross Suite.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          {scheduleColumns.map((day) => (
            <section key={day.title} className="rounded-2xl border border-stone bg-ivory/85 p-5 shadow-[0_10px_30px_rgba(58,53,48,0.05)]">
              <p className="text-[11px] uppercase tracking-[0.24em] text-mauve">{day.date}</p>
              <h2 className="mt-2 font-heading text-2xl font-light text-charcoal">{day.title}</h2>
              <div className="mt-4 space-y-4">
                {day.events.map((event) => (
                  <article key={event.title} className="rounded-xl border border-stone/75 bg-ivory/80 p-4">
                    <p className="font-heading text-xl font-light text-mauve">{event.time}</p>
                    <h3 className="mt-1 font-heading text-xl font-light text-charcoal">{event.title}</h3>
                    {event.locationUrl ? (
                      <a
                        href={event.locationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs uppercase tracking-[0.2em] text-muted decoration-mauve/30 underline-offset-4 hover:text-mauve hover:underline"
                      >
                        {event.location}
                        <span aria-hidden className="text-[10px] leading-none align-[0.08em]">↗︎</span>
                      </a>
                    ) : (
                      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted">{event.location}</p>
                    )}
                    <p className="mt-2 text-sm leading-7 text-charcoal/85">{event.description}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="rounded-2xl border border-stone bg-ivory/85 p-6 shadow-[0_10px_30px_rgba(58,53,48,0.05)]">
          <p className="text-[11px] uppercase tracking-[0.24em] text-mauve">Day Two Logistics</p>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-charcoal/90">
            {site.dayTwoLogistics.map((item) => (
              <li key={item} className="rounded-xl border border-stone/75 bg-ivory/80 px-4 py-3">{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
