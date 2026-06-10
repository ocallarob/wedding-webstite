'use client';

import { FormEvent, useState } from 'react';

type Match = {
  token: string;
  label: string | null;
  address_line_one: string | null;
  member_names: string[];
};

type Props = {
  code: string;
};

export function PaperRsvpLookup({ code }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [match, setMatch] = useState<Match | null>(null);

  async function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/rsvp/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? 'Unable to search right now.');
      setMatch(data?.match && typeof data.match === 'object' ? data.match : null);
    } catch (err) {
      setMatch(null);
      setError(err instanceof Error ? err.message : 'Unable to search right now.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-3xl border border-stone/80 bg-[#fffdf9] p-2 shadow-[0_22px_44px_rgba(89,70,80,0.08)]">
      <div className="rounded-[1.35rem] border border-blush/80 px-7 py-7 space-y-5 bg-gradient-to-b from-[#fffdf9] to-[#fff7f5]">
        <form onSubmit={onSearch} className="space-y-3">
          <label className="space-y-1.5 text-sm block">
            <span className="label-serif">Find your household</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, surname, or address"
              className="w-full rounded-xl border border-stone bg-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-mauve/35 focus:ring-offset-1 focus:ring-offset-[#fffaf8]"
            />
          </label>
          <div className="flex items-center gap-4">
            <button type="submit" disabled={loading} className="btn btn-primary disabled:opacity-80">
              {loading ? 'Searching…' : 'Find household'}
            </button>
            {error && <p className="text-xs text-red-700">{error}</p>}
          </div>
        </form>

        {match && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Found your household?</p>
            <a
              href={`/rsvp?token=${encodeURIComponent(match.token)}`}
              className="block rounded-2xl border border-stone/70 bg-white/85 p-4 hover:border-mauve/60 transition-colors"
            >
              <p className="font-heading text-xl text-charcoal">
                {match.label?.trim() || match.member_names.join(' & ')}
              </p>
              <p className="mt-1 text-xs text-muted">{match.member_names.join(', ')}</p>
              {match.address_line_one && (
                <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-muted">{match.address_line_one}</p>
              )}
            </a>
          </div>
        )}

        {!loading && !match && (
          <p className="text-xs text-muted">
            No household found. Please check spelling or contact us and we will RSVP with you.
          </p>
        )}
      </div>
    </div>
  );
}
