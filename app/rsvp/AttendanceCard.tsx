'use client';

type Day = 1 | 2;

const DAY_INFO: Record<Day, { date: string; label: string; detail: string }> = {
  1: { date: 'Friday, 28 August', label: 'Ceremony & Reception', detail: 'Lough Erne Resort' },
  2: { date: 'Saturday, 29 August', label: 'Afternoon Drinks', detail: "Charlie's Bar, Enniskillen" },
};

type Props = {
  day: Day;
  guestName?: string;
  value: boolean | null;
  onChange: (val: boolean) => void;
};

export function AttendanceCard({ day, guestName, value, onChange }: Props) {
  const info = DAY_INFO[day];

  return (
    <div className="space-y-3">
      {guestName && (
        <p className="text-[10px] uppercase tracking-[0.28em] text-mauve">{guestName}</p>
      )}

      <div className="rounded-2xl border border-stone bg-ivory/60 px-5 py-4 space-y-4">
        {/* Event info */}
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{info.date}</p>
          <p className="font-heading text-xl font-light text-charcoal mt-0.5">{info.label}</p>
          <p className="text-xs text-muted mt-0.5">{info.detail}</p>
        </div>

        {/* Accept / decline */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onChange(true)}
            className={[
              'w-full rounded-xl px-4 py-2.5 font-heading italic text-base transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-mauve/40 focus:ring-offset-2 focus:ring-offset-ivory',
              value === true
                ? 'bg-mauve text-ivory border border-mauve'
                : 'border border-stone text-muted hover:border-mauve/40 hover:text-charcoal',
            ].join(' ')}
          >
            Joyfully accepts
          </button>
          <button
            type="button"
            onClick={() => onChange(false)}
            className={[
              'w-full rounded-xl px-4 py-2.5 font-heading italic text-base transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-mauve/40 focus:ring-offset-2 focus:ring-offset-ivory',
              value === false
                ? 'bg-stone border border-stone text-charcoal'
                : 'border border-stone text-muted hover:border-mauve/40 hover:text-charcoal',
            ].join(' ')}
          >
            Regretfully declines
          </button>
        </div>
      </div>
    </div>
  );
}
