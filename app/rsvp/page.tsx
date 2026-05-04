import { sql } from '../../src/lib/db';
import { site } from '../../src/content/site';
import { RsvpForm } from './RsvpForm';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{ token?: string }>;
};

type Member = {
  id: string;
  full_name: string;
  member_type: string;
  attending_day1: boolean | null;
  attending_day2: boolean | null;
  dietary: unknown;
};

function normaliseDietary(input: unknown): { options: string[]; other: string } {
  if (!input || typeof input !== 'object') return { options: [], other: '' };
  const src = input as { options?: unknown; other?: unknown };
  return {
    options: Array.isArray(src.options) ? src.options.filter((v): v is string => typeof v === 'string') : [],
    other: typeof src.other === 'string' ? src.other : '',
  };
}

export default async function RsvpPage({ searchParams }: Props) {
  const { token } = await searchParams;
  if (!token) return <InvalidLink />;

  const households = await sql`SELECT id, label, contact_email FROM households WHERE invite_token = ${token}`;
  if (!households[0]) return <InvalidLink />;

  const members = (await sql`
    SELECT id, full_name, member_type, attending_day1, attending_day2, dietary, sort_order
    FROM household_members
    WHERE household_id = ${households[0].id}
    ORDER BY sort_order, created_at
  `) as Member[];

  const rsvp = await sql`SELECT submitted_at FROM household_rsvps WHERE household_id = ${households[0].id}`;

  const initialMembers = members.map((m) => ({
    id: m.id,
    full_name: m.full_name,
    member_type: m.member_type,
    attending_day1: m.attending_day1,
    attending_day2: m.attending_day2,
    dietary: normaliseDietary(m.dietary),
  }));

  return (
    <div className="mx-auto max-w-2xl px-5 pt-[72px] pb-20 space-y-10">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">RSVP</p>
        <h1 className="font-heading text-4xl font-semibold text-charcoal">We hope you can make it</h1>
        <p className="text-sm text-muted">{site.rsvpDeadline}</p>
      </header>

      <RsvpForm
        token={token}
        householdLabel={(households[0].label as string | null) ?? null}
        initialMembers={initialMembers}
        alreadyRsvpd={rsvp.length > 0}
      />
    </div>
  );
}

function InvalidLink() {
  return (
    <div className="mx-auto max-w-xl px-5 pt-[72px] pb-20 text-center space-y-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">RSVP</p>
      <h1 className="font-heading text-3xl font-light text-charcoal">Invalid invite link</h1>
      <p className="text-sm text-muted leading-7">This link does not look right. Please use the RSVP button from your invite email.</p>
    </div>
  );
}
