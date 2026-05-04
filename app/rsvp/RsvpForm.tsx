'use client';

import { FormEvent, useMemo, useState } from 'react';
import { AttendanceCard } from './AttendanceCard';
import { DietarySelect, type DietaryValue } from './DietarySelect';

type Member = {
  id: string;
  full_name: string;
  member_type: string;
  attending_day1: boolean | null;
  attending_day2: boolean | null;
  dietary: DietaryValue;
};

type Props = {
  token: string;
  householdLabel: string | null;
  initialMembers: Member[];
  alreadyRsvpd: boolean;
};

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={i + 1 === current ? 'text-mauve text-base' : 'text-stone text-base'}>
          ◇
        </span>
      ))}
    </div>
  );
}

export function RsvpForm({ token, householdLabel, initialMembers, alreadyRsvpd }: Props) {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [song, setSong] = useState('');
  const [message, setMessage] = useState('');
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(alreadyRsvpd);
  const [error, setError] = useState('');

  const totalSteps = 3;
  const title = householdLabel?.trim() || initialMembers.map((m) => m.full_name).join(' & ');

  const attendanceChosen = useMemo(
    () => members.every((m) => m.attending_day1 !== null && m.attending_day2 !== null),
    [members]
  );

  const anyAttending = useMemo(
    () => members.some((m) => m.attending_day1 || m.attending_day2),
    [members]
  );

  const updateMember = (id: string, patch: Partial<Member>) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, song: song || undefined, message: message || undefined, members }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error ?? 'Unable to submit RSVP right now.');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit RSVP right now.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-stone bg-white/80 px-8 py-12 text-center space-y-5">
        <p className="font-heading text-3xl font-light text-charcoal">Thank you, {title}</p>
        <p className="text-sm text-muted leading-7">
          {anyAttending
            ? "We've received your RSVP and cannot wait to celebrate with you."
            : "We're sorry you can't make it, but we appreciate you letting us know."}
        </p>
        <p className="font-heading italic text-mauve text-lg">Le grá agus le háthas</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone bg-white/80 overflow-hidden">
      <div className="px-7 pt-7 pb-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <p className="font-heading text-2xl font-light text-charcoal truncate">{title}</p>
          <StepIndicator current={step} total={totalSteps} />
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {step === 1 && (
          <div className="px-7 pb-7 space-y-6">
            <div className="space-y-1">
              <p className="label-serif text-sm">Will your household be joining us?</p>
              <p className="text-xs text-muted">Select attendance for each person, for each event.</p>
            </div>

            <div className="space-y-6">
              {members.map((member) => (
                <div key={member.id} className="rounded-2xl border border-stone/60 bg-white/70 p-4 space-y-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-muted">
                    {member.full_name}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <AttendanceCard
                      day={1}
                      value={member.attending_day1}
                      onChange={(v) => updateMember(member.id, { attending_day1: v })}
                    />
                    <AttendanceCard
                      day={2}
                      value={member.attending_day2}
                      onChange={(v) => updateMember(member.id, { attending_day2: v })}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button type="button" disabled={!attendanceChosen} onClick={() => setStep(2)} className="btn btn-primary disabled:opacity-40">
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="px-7 pb-7 space-y-6">
            <div className="space-y-1">
              <p className="label-serif text-sm">Dietary requirements</p>
              <p className="text-xs text-muted">Choose all that apply for each person, or leave blank.</p>
            </div>

            <div className="space-y-5">
              {members.map((member) => (
                <DietarySelect
                  key={member.id}
                  label={member.full_name}
                  value={member.dietary}
                  onChange={(val) => updateMember(member.id, { dietary: val })}
                />
              ))}
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

        {step === 3 && (
          <div className="px-7 pb-7 space-y-6">
            <div className="space-y-1">
              <p className="label-serif text-sm">Final touches</p>
              <p className="text-xs text-muted">Both optional — we would love to hear from you.</p>
            </div>

            <label className="space-y-1.5 text-sm block">
              <span className="label-serif">Song request</span>
              <input
                type="text"
                value={song}
                onChange={(e) => setSong(e.target.value)}
                className="w-full rounded-xl border border-stone bg-white px-3 py-2.5"
                placeholder="We love great dance-floor picks"
              />
            </label>

            <label className="space-y-1.5 text-sm block">
              <span className="label-serif">Message to the couple</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[90px] w-full rounded-xl border border-stone bg-white px-3 py-2.5"
                placeholder="Any notes we should know?"
              />
            </label>

            <div className="flex items-center justify-between pt-2">
              <button type="button" onClick={() => setStep(2)} className="text-xs text-muted hover:text-charcoal underline-offset-4 hover:underline transition-colors">
                Back
              </button>
              <div className="flex items-center gap-4">
                {error && <p className="text-xs text-red-700">{error}</p>}
                <button type="submit" disabled={submitting} className="btn btn-primary disabled:opacity-80">
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
