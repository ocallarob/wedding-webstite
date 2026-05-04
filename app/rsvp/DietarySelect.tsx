'use client';

export type DietaryValue = {
  options: string[];
  other: string;
};

export const DIETARY_OPTIONS = [
  { value: 'v',  label: 'Vegetarian' },
  { value: 've', label: 'Vegan' },
  { value: 'gf', label: 'Gluten Free' },
  { value: 'df', label: 'Dairy Free' },
  { value: 'n',  label: 'Nut Allergy' },
];

type Props = {
  label: string;
  value: DietaryValue;
  onChange: (val: DietaryValue) => void;
};

export function DietarySelect({ label, value, onChange }: Props) {
  const toggle = (option: string) => {
    const next = value.options.includes(option)
      ? value.options.filter((o) => o !== option)
      : [...value.options, option];
    onChange({ ...value, options: next });
  };

  return (
    <div className="space-y-2">
      <span className="label-serif text-sm">{label}</span>
      <div className="flex flex-wrap gap-2">
        {DIETARY_OPTIONS.map(({ value: opt, label: optLabel }) => {
          const checked = value.options.includes(opt);
          return (
            <label
              key={opt}
              className={[
                'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs cursor-pointer transition-colors',
                checked
                  ? 'border-mauve bg-mauve/10 text-mauve font-semibold'
                  : 'border-stone bg-white text-muted hover:border-mauve/50',
              ].join(' ')}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(opt)}
                className="sr-only"
              />
              {optLabel}
            </label>
          );
        })}
      </div>
      <input
        type="text"
        value={value.other}
        onChange={(e) => onChange({ ...value, other: e.target.value })}
        placeholder="Other requirements…"
        className="w-full rounded-xl border border-stone bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-charcoal/40 focus:ring-offset-2 focus:ring-offset-ivory"
      />
    </div>
  );
}
