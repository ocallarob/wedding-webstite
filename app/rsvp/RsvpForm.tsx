'use client';

import { FormEvent, useState } from 'react';
import { DietarySelect, type DietaryValue } from './DietarySelect';
import { AttendanceCard } from './AttendanceCard';

type Props = {
  token: string;
  guestName: string;
  partnerName: string | null;
  alreadyRsvpd: boolean;
};

type FormState = {
  day1: boolean | null;
  day2: boolean | null;
  partnerDay1: boolean | null;
  partnerDay2: boolean | null;
  dietary: DietaryValue;
  partnerDietary: DietaryValue;
  song: string;
  message: string;
  honeypot: string;
};

const emptyDietary: DietaryValue = { options: [], other: '' };

const initialState: FormState = {
  day1: null,
  day2: null,
  partnerDay1: null,
  partnerDay2: null,
  dietary: emptyDietary,
  partnerDietary: emptyDietary,
  song: '',
  message: '',
  honeypot: '',
};


function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={i + 1 === current ? 'text-mauve text-base' : 'text-stone text-base'}
        >
          ◇
        </span>
      ))}
    </div>
  );
}

export function RsvpForm({ token, guestName, partnerName, alreadyRsvpd }: Props) {
  const [form, setForm] = useState<FormState>(initialState);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(alreadyRsvpd);
  const [submittedAttending, setSubmittedAttending] = useState(false);
  const [error, setError] = useState('');

  const isCouple = !!partnerName;
  const totalSteps = 3;

  const attendanceChosen = isCouple
    ? form.day1 !== null && form.day2 !== null && form.partnerDay1 !== null && form.partnerDay2 !== null
    : form.day1 !== null && form.day2 !== null;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (form.honeypot.trim()) { setDone(true); return; }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          attending_day1: form.day1 ?? false,
          attending_day2: form.day2 ?? false,
          ...(isCouple && {
            partner_attending_day1: form.partnerDay1 ?? false,
            partner_attending_day2: form.partnerDay2 ?? false,
            partner_dietary: form.partnerDietary,
          }),
          dietary: form.dietary,
          song: form.song || undefined,
          message: form.message || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error ?? 'Something went wrong.');

      const anyAttending = form.day1 || form.day2 ||
        (isCouple && (form.partnerDay1 || form.partnerDay2));
      setSubmittedAttending(!!anyAttending);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit right now.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    const displayName = partnerName ? `${guestName} & ${partnerName}` : guestName;
    return (
      <div className="rounded-2xl border border-stone bg-white/80 px-8 py-12 text-center space-y-5">
        <p className="font-heading text-3xl font-light text-charcoal">
          Thank you, {displayName}
        </p>
        <p className="text-sm text-muted leading-7">
          {submittedAttending || alreadyRsvpd
            ? "We've received your RSVP and cannot wait to celebrate with you."
            : "We're sorry you can't make it, but we appreciate you letting us know."}
        </p>
        <p className="font-heading italic text-mauve text-lg">Le grá agus le háthas</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone bg-white/80 overflow-hidden">
      {/* Header */}
      <div className="px-7 pt-7 pb-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-heading text-2xl font-light text-charcoal">
            {isCouple ? `${guestName} & ${partnerName}` : guestName}
          </p>
          <StepIndicator current={step} total={totalSteps} />
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Step 1 — Attendance */}
        {step === 1 && (
          <div className="px-7 pb-7 space-y-6">
            <div className="space-y-1">
              <p className="label-serif text-sm">Will you be joining us?</p>
              <p className="text-xs text-muted">Select your attendance for each event.</p>
            </div>

            {isCouple ? (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <AttendanceCard day={1} guestName={guestName} value={form.day1} onChange={(v) => setForm({ ...form, day1: v })} />
                  <AttendanceCard day={2} guestName={guestName} value={form.day2} onChange={(v) => setForm({ ...form, day2: v })} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <AttendanceCard day={1} guestName={partnerName!} value={form.partnerDay1} onChange={(v) => setForm({ ...form, partnerDay1: v })} />
                  <AttendanceCard day={2} guestName={partnerName!} value={form.partnerDay2} onChange={(v) => setForm({ ...form, partnerDay2: v })} />
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <AttendanceCard day={1} value={form.day1} onChange={(v) => setForm({ ...form, day1: v })} />
                <AttendanceCard day={2} value={form.day2} onChange={(v) => setForm({ ...form, day2: v })} />
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={!attendanceChosen}
                onClick={() => setStep(2)}
                className="btn btn-primary disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Dietary */}
        {step === 2 && (
          <div className="px-7 pb-7 space-y-6">
            <div className="space-y-1">
              <p className="label-serif text-sm">Dietary requirements</p>
              <p className="text-xs text-muted">Select all that apply, or leave blank if none.</p>
            </div>

            <div className="space-y-5">
              <DietarySelect
                label={isCouple ? guestName : ''}
                value={form.dietary}
                onChange={(val) => setForm({ ...form, dietary: val })}
              />
              {isCouple && (
                <DietarySelect
                  label={partnerName!}
                  value={form.partnerDietary}
                  onChange={(val) => setForm({ ...form, partnerDietary: val })}
                />
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button type="button" onClick={() => setStep(1)} className="text-xs text-muted hover:text-charcoal underline-offset-4 hover:underline transition-colors">
                Back
              </button>
              <button type="button" onClick={() => setStep(3)} className="btn btn-primary">
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Song + message + submit */}
        {step === 3 && (
          <div className="px-7 pb-7 space-y-6">
            <div className="space-y-1">
              <p className="label-serif text-sm">Final touches</p>
              <p className="text-xs text-muted">Both optional — but we&apos;d love to hear from you.</p>
            </div>

            <div className="space-y-5">
              <label className="space-y-1.5 text-sm block">
                <span className="label-serif">Song request</span>
                <input
                  type="text"
                  value={form.song}
                  onChange={(e) => setForm({ ...form, song: e.target.value })}
                  className="w-full rounded-xl border border-stone bg-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-charcoal/40 focus:ring-offset-2 focus:ring-offset-ivory"
                  placeholder="We love great dance-floor picks"
                />
              </label>

              <label className="space-y-1.5 text-sm block">
                <span className="label-serif">Message to the couple</span>
                <textarea
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="min-h-[90px] w-full rounded-xl border border-stone bg-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-charcoal/40 focus:ring-offset-2 focus:ring-offset-ivory"
                  placeholder="Any notes we should know?"
                />
              </label>
            </div>

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

            <div className="flex items-center justify-between pt-2">
              <button type="button" onClick={() => setStep(2)} className="text-xs text-muted hover:text-charcoal underline-offset-4 hover:underline transition-colors">
                Back
              </button>
              <div className="flex items-center gap-4">
                {error && <p className="text-xs text-red-700">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary disabled:opacity-80"
                >
                  {submitting ? 'Sending…' : 'Send RSVP'}
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
