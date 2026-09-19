import { buildGalleryAnnouncementEmailHtml } from '../../src/lib/galleryAnnouncementEmailHtml';

export const dynamic = 'force-dynamic';

export default function GalleryAnnouncementPreviewPage() {
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL ?? 'https://alannah-rob.ie').replace(/\/$/, '');
  const html = buildGalleryAnnouncementEmailHtml(
    'Anne & Brian',
    `${baseUrl}/gallery?token=example-gallery-token`,
    `${baseUrl}/upload?token=example-upload-token`,
  );

  return (
    <main className="min-h-screen bg-ivory px-4 py-8">
      <div className="mx-auto mb-4 flex max-w-[680px] items-center justify-between text-sm text-muted">
        <span>Gallery announcement preview — no email will be sent</span>
        <a href="/dashboard" className="text-mauve underline">Back to dashboard</a>
      </div>
      <iframe title="Gallery announcement preview" srcDoc={html} className="mx-auto block h-[860px] w-full max-w-[680px] rounded-md border border-stone bg-white" />
    </main>
  );
}
