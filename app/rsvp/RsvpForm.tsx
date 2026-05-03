'use client';

import { FormEvent, useState } from 'react';

type Props = {
  token: string;
  guestName: string;
  alreadyRsvpd: boolean;
};

type FormState = {
  day1: boolean;
  day2: boolean;
  dietary: string;
  song: string;
  message: string;
  honeypot: string;
};

const initialState: FormState = {
  day1: true,
  day2: false,
  dietary: '',
  song: '',
  message: '',
  honeypot: '',
};

export function RsvpForm({ token, guestName, alreadyRsvpd }: Props) {
  const [form, setForm] = useState<FormState>(initialState);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    alreadyRsvpd ? 'success' : 'idle'
  );
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (form.honeypot.trim()) { setStatus('success'); return; }

    setStatus('loading');
    setError('');

    try {
      const res = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          attending_day1: form.day1,
          attending_day2: form.day2,
          dietary: form.dietary || undefined,
          song: form.song || undefined,
          message: form.message || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error ?? 'Something went wrong.');

      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit right now.');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="rounded-2xl border border-stone bg-white/80 p-10 text-center space-y-3">
        <p className="font-heading text-3xl font-light text-charcoal">Thank you, {guestName}!</p>
        <p className="text-sm text-muted">We have received your RSVP and cannot wait to celebrate with you.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-stone bg-white/80 p-7">
      {/* Guest name — read-only */}
      <div className="space-y-1 text-sm">
        <span className="label-serif">Your name</span>
        <p className="w-full rounded-xl border border-stone bg-stone/30 px-3 py-2 text-charcoal">{guestName}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-3 rounded-2xl border border-stone bg-white/70 px-4 py-3 text-sm font-semibold text-charcoal cursor-pointer">
          <input
            type="checkbox"
            checked={form.day1}
            onChange={(e) => setForm({ ...form, day1: e.target.checked })}
            className="h-4 w-4"
          />
          Attending Day 1 — ceremony &amp; reception
        </label>
        <label className="flex items-center gap-3 rounded-2xl border border-stone bg-white/70 px-4 py-3 text-sm font-semibold text-charcoal cursor-pointer">
          <input
            type="checkbox"
            checked={form.day2}
            onChange={(e) => setForm({ ...form, day2: e.target.checked })}
            className="h-4 w-4"
          />
          Attending Day 2 — afternoon drinks
        </label>
      </div>

      <label className="space-y-1 text-sm block">
        <span className="label-serif">Dietary notes</span>
        <input
          type="text"
          value={form.dietary}
          onChange={(e) => setForm({ ...form, dietary: e.target.value })}
          className="w-full rounded-xl border border-stone bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-charcoal/40 focus:ring-offset-2 focus:ring-offset-ivory"
          placeholder="Allergies, preferences, etc."
        />
      </label>

      <label className="space-y-1 text-sm block">
        <span className="label-serif">Song request</span>
        <input
          type="text"
          value={form.song}
          onChange={(e) => setForm({ ...form, song: e.target.value })}
          className="w-full rounded-xl border border-stone bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-charcoal/40 focus:ring-offset-2 focus:ring-offset-ivory"
          placeholder="We love great dance-floor picks"
        />
      </label>

      <label className="space-y-1 text-sm block">
        <span className="label-serif">Message to the couple</span>
        <textarea
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          className="min-h-[100px] w-full rounded-xl border border-stone bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-charcoal/40 focus:ring-offset-2 focus:ring-offset-ivory"
          placeholder="Any notes we should know?"
        />
      </label>

      {/* Honeypot */}
      <label className="hidden" aria-hidden="true">
        Leave this empty
        <input
          type="text"
          value={form.honeypot}
          onChange={(e) => setForm({ ...form, honeypot: e.target.value })}
          tabIndex={-1}
          autoComplete="off"
        />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="submit"
          disabled={status === 'loading'}
          className="btn btn-primary min-w-[140px] disabled:opacity-80"
        >
          {status === 'loading' ? 'Sending…' : 'Send RSVP'}
        </button>
        {status === 'error' && (
          <p className="text-sm font-semibold text-red-700">{error}</p>
        )}
      </div>
    </form>
  );
}
