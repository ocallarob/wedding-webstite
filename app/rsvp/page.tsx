"use client";

import { FormEvent, useMemo, useState } from 'react';
import { site } from '../../src/content/site';

type FormState = {
  name: string;
  email: string;
  day1: boolean;
  day2: boolean;
  dietary: string;
  song: string;
  message: string;
  honeypot: string;
};

const initialState: FormState = {
  name: '',
  email: '',
  day1: true,
  day2: false,
  dietary: '',
  song: '',
  message: '',
  honeypot: '',
};

export default function RsvpPage() {
  const [form, setForm] = useState<FormState>(initialState);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string>('');

  const endpoint = useMemo(() => {
    if (!process.env.NEXT_PUBLIC_RSVP_API_BASE) return null;
    return `${process.env.NEXT_PUBLIC_RSVP_API_BASE.replace(/\/$/, '')}/rsvp`;
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('idle');
    setError('');

    if (form.honeypot.trim()) {
      setStatus('success');
      setForm(initialState);
      return;
    }

    if (!endpoint) {
      setError('RSVP endpoint is not configured. Add NEXT_PUBLIC_RSVP_API_BASE.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          day1: form.day1,
          day2: form.day2,
          dietary: form.dietary || undefined,
          song: form.song || undefined,
          message: form.message || undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data?.error || 'Something went wrong. Please try again.');
      }

      setStatus('success');
      setForm(initialState);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit right now.');
      setStatus('error');
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-5 pt-[72px] pb-20 space-y-10">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">RSVP</p>
        <h1 className="font-heading text-4xl font-semibold text-charcoal">We hope you can make it</h1>
        <p className="text-sm text-muted">{site.rsvpDeadline}</p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border border-stone bg-white/80 p-7"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="label-serif">Name</span>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-xl border border-stone bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-charcoal/40 focus:ring-offset-2 focus:ring-offset-ivory"
              placeholder="Your full name"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="label-serif">Email</span>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-xl border border-stone bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-charcoal/40 focus:ring-offset-2 focus:ring-offset-ivory"
              placeholder="you@example.com"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-2xl border border-stone bg-white/70 px-4 py-3 text-sm font-semibold text-charcoal">
            <input
              type="checkbox"
              checked={form.day1}
              onChange={(e) => setForm({ ...form, day1: e.target.checked })}
              className="h-4 w-4"
            />
            Attending Day 1 (ceremony & reception)
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-stone bg-white/70 px-4 py-3 text-sm font-semibold text-charcoal">
            <input
              type="checkbox"
              checked={form.day2}
              onChange={(e) => setForm({ ...form, day2: e.target.checked })}
              className="h-4 w-4"
            />
            Attending Day 2 (brunch / farewell)
          </label>
        </div>

        <label className="space-y-1 text-sm">
          <span className="label-serif">Dietary notes</span>
          <input
            type="text"
            value={form.dietary}
            onChange={(e) => setForm({ ...form, dietary: e.target.value })}
            className="w-full rounded-xl border border-stone bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-charcoal/40 focus:ring-offset-2 focus:ring-offset-ivory"
            placeholder="Allergies, preferences, etc."
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="label-serif">Song request</span>
          <input
            type="text"
            value={form.song}
            onChange={(e) => setForm({ ...form, song: e.target.value })}
            className="w-full rounded-xl border border-stone bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-charcoal/40 focus:ring-offset-2 focus:ring-offset-ivory"
            placeholder="We love great dance-floor picks"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="label-serif">Message to the couple</span>
          <textarea
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            className="min-h-[120px] w-full rounded-xl border border-stone bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-charcoal/40 focus:ring-offset-2 focus:ring-offset-ivory"
            placeholder="Any notes we should know?"
          />
        </label>

        {/* Honeypot */}
        <label className="hidden">
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
          {status === 'success' && <p className="text-sm font-semibold text-charcoal">Thank you! We got your RSVP.</p>}
          {status === 'error' && <p className="text-sm font-semibold text-red-700">{error}</p>}
        </div>
      </form>
    </div>
  );
}
