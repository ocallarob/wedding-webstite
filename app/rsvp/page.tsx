import { sql } from '../../src/lib/db';
import { site } from '../../src/content/site';
import { RsvpForm } from './RsvpForm';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{ token?: string }>;
};

export default async function RsvpPage({ searchParams }: Props) {
  const { token } = await searchParams;

  if (!token) {
    return <InvalidLink />;
  }

  const rows = await sql`SELECT name, partner_name FROM guests WHERE token = ${token}`;
  if (!rows[0]) {
    return <InvalidLink />;
  }

  const rsvps = await sql`
    SELECT attending_day1, attending_day2, partner_attending_day1, partner_attending_day2
    FROM rsvps WHERE token = ${token}
  `;
  const alreadyRsvpd = rsvps.length > 0;
  const wasAttending = alreadyRsvpd
    ? !!(rsvps[0].attending_day1 || rsvps[0].attending_day2 ||
         rsvps[0].partner_attending_day1 || rsvps[0].partner_attending_day2)
    : false;
  const guestName = rows[0].name as string;
  const partnerName = (rows[0].partner_name as string | null) ?? null;

  return (
    <div className="mx-auto max-w-xl px-5 pt-[72px] pb-20 space-y-10">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">RSVP</p>
        <h1 className="font-heading text-4xl font-semibold text-charcoal">We hope you can make it</h1>
        <p className="text-sm text-muted">{site.rsvpDeadline}</p>
      </header>

      <RsvpForm token={token} guestName={guestName} partnerName={partnerName} alreadyRsvpd={alreadyRsvpd} wasAttending={wasAttending} />
    </div>
  );
}

function InvalidLink() {
  return (
    <div className="mx-auto max-w-xl px-5 pt-[72px] pb-20 text-center space-y-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">RSVP</p>
      <h1 className="font-heading text-3xl font-light text-charcoal">Invalid invite link</h1>
      <p className="text-sm text-muted leading-7">
        This link does not look right. Please check the email you received from Rob &amp; Alannah and use the RSVP button there.
      </p>
    </div>
  );
}
