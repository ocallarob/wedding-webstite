import { site } from '../../src/content/site';

export default function WeekendPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 pt-[72px] pb-20 space-y-12">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.25em] text-muted">Weekend</p>
        <h1 className="font-heading text-4xl font-semibold text-charcoal">Schedule</h1>
        <p className="text-sm text-muted">Subject to small tweaks. Check back for updates closer to the date.</p>
      </header>

      <div className="grid gap-10">
        {site.weekendSchedule.map((day) => (
          <section key={day.title} className="space-y-4 border-t border-stone pt-6">
            <div className="text-xs uppercase tracking-[0.24em] text-muted">{day.date}</div>
            <h2 className="font-heading text-2xl font-semibold text-charcoal">{day.title}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {day.events.map((event) => (
                <div key={event.title} className="space-y-1">
                  <div className="text-sm font-semibold text-charcoal">{event.time}</div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">{event.location}</div>
                  <div className="text-lg font-heading text-charcoal">{event.title}</div>
                  <p className="text-sm text-muted">{event.description}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
