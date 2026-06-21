import { buildReminderEmailHtml } from '../../src/lib/reminderEmailHtml';

type Props = {
  searchParams: Promise<{ name?: string; evening?: string }>;
};

export default async function ReminderEmailPreviewPage({ searchParams }: Props) {
  const { name = 'Anne & Brian', evening } = await searchParams;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://alannah-rob.ie';
  const html = buildReminderEmailHtml(
    name,
    `${baseUrl}/rsvp?token=example-preview-only`,
    baseUrl,
    evening === '1',
  );

  return (
    <main className="min-h-screen bg-ivory px-4 py-8">
      <div className="mx-auto mb-4 flex max-w-[680px] items-center justify-between text-sm text-muted">
        <span>Reminder email preview — no email will be sent</span>
        <a href={evening === '1' ? '/reminder-email-preview' : '/reminder-email-preview?evening=1'} className="text-mauve underline">
          View {evening === '1' ? 'day' : 'evening'} version
        </a>
      </div>
      <iframe title="Reminder email preview" srcDoc={html} className="mx-auto block h-[860px] w-full max-w-[680px] rounded-md border border-stone bg-white" />
    </main>
  );
}
