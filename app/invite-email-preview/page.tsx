import { buildInviteEmailHtml } from '../../src/lib/inviteEmailHtml';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{ name?: string; rsvp?: string }>;
};

export default async function InviteEmailPreviewPage({ searchParams }: Props) {
  const params = await searchParams;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const displayName = params.name?.trim() || 'Alannah & Rob';
  const rsvpUrl = params.rsvp?.trim() || `${baseUrl}/rsvp?token=preview-token`;
  const html = buildInviteEmailHtml(displayName, rsvpUrl, baseUrl);

  return (
    <div className="min-h-screen bg-stone/30 px-4 py-8">
      <div className="mx-auto mb-4 max-w-4xl rounded-xl border border-stone bg-white/90 p-4 text-xs text-muted">
        Preview URL params: <code>?name=Your%20Guest&amp;rsvp=https://example.com/rsvp?token=abc</code>
      </div>
      <iframe title="Invite email preview" srcDoc={html} className="mx-auto block h-[860px] w-full max-w-[680px] rounded-md border border-stone bg-white" />
    </div>
  );
}
