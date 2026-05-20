import { sql } from '../../src/lib/db';
import { site } from '../../src/content/site';
import { RsvpForm } from './RsvpForm';
import Image from 'next/image';

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

  const rsvp = await sql`
    SELECT submitted_at, song, message
    FROM household_rsvps
    WHERE household_id = ${households[0].id}
  `;

  const initialMembers = members.map((m) => ({
    id: m.id,
    full_name: m.full_name,
    member_type: m.member_type,
    attending_day1: m.attending_day1,
    attending_day2: m.attending_day2,
    dietary: normaliseDietary(m.dietary),
  }));

  return (
    <div className="mx-auto max-w-2xl px-5 pt-[72px] pb-20 space-y-8">
      <header className="rounded-3xl border border-stone/80 bg-[#fffdf9] p-2 shadow-[0_22px_44px_rgba(89,70,80,0.08)]">
        <div className="rounded-[1.35rem] border border-blush/80 bg-gradient-to-b from-[#fffdf9] to-[#fff7f5] px-7 py-7 text-center">
          <div className="flex items-start justify-between">
            <Image src="/assets/menlo-castle-rsvp.png" alt="" width={116} height={58} className="h-14 w-auto opacity-80" />
            <Image src="/assets/devenish-tower-rsvp.png" alt="" width={116} height={58} className="h-14 w-auto opacity-80" />
          </div>
          <p className="mt-3 font-script text-[28px] leading-none text-[#95ad92]">le grá agus le háthas</p>
          <h1 className="mt-3 font-heading text-4xl font-medium text-[#9b7b8d]">RSVP</h1>
          <p className="mt-2 font-script text-[28px] leading-none text-[#d99d9d]">we hope you can join us</p>
          <div className="mx-auto mt-4 max-w-[360px]">
            <Image src="/assets/divider-line.svg" alt="" width={430} height={20} className="h-auto w-full opacity-70" />
          </div>
          <p className="mt-4 text-sm text-muted">{site.rsvpDeadline}</p>
        </div>
      </header>

      <RsvpForm
        token={token}
        householdLabel={(households[0].label as string | null) ?? null}
        initialMembers={initialMembers}
        alreadyRsvpd={rsvp.length > 0}
        initialSong={(rsvp[0]?.song as string | null) ?? ''}
        initialMessage={(rsvp[0]?.message as string | null) ?? ''}
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
