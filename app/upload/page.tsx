import type { Metadata } from 'next';
import { isUploadPortalToken } from '../../src/lib/galleryConfig';
import { UploadPortalClient } from './UploadPortalClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

type Props = {
  searchParams: Promise<{ token?: string }>;
};

function InvalidUploadPortalLink() {
  return (
    <div className="mx-auto max-w-2xl px-5 pb-20 pt-[96px]">
      <div role="alert" className="rounded-3xl border border-red-200 bg-red-50/80 p-8 text-center">
        <p className="text-xs uppercase tracking-[0.24em] text-red-700">Upload portal unavailable</p>
        <h1 className="mt-3 font-heading text-4xl font-light text-charcoal">This Upload portal link is not valid</h1>
        <p className="mt-4 text-sm leading-7 text-red-700">
          Use the current link from the Gallery announcement, or ask the couple to generate a new one.
        </p>
      </div>
    </div>
  );
}

export default async function UploadPage({ searchParams }: Props) {
  const { token } = await searchParams;

  if (!isUploadPortalToken(token)) return <InvalidUploadPortalLink />;

  return (
    <div className="relative overflow-hidden bg-ivory">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(219,184,184,0.18),transparent_52%),radial-gradient(circle_at_88%_22%,rgba(143,168,136,0.14),transparent_34%)]" />
      <div className="relative mx-auto max-w-2xl space-y-8 px-5 pb-20 pt-[84px]">
        <header className="rounded-3xl border border-stone/80 bg-ivory/80 px-6 py-10 text-center shadow-[0_18px_50px_rgba(58,53,48,0.07)] backdrop-blur-sm sm:px-10">
          <p className="text-xs uppercase tracking-[0.26em] text-mauve">Upload portal</p>
          <h1 className="mt-3 font-heading text-4xl font-light tracking-[0.05em] text-charcoal sm:text-5xl">Share your memories</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-muted">
            Contribute photographs or videos to the event gallery. Every contribution is reviewed before it appears there.
          </p>
        </header>

        <section className="rounded-2xl border border-stone bg-ivory/85 p-6 shadow-[0_10px_30px_rgba(58,53,48,0.05)]" aria-labelledby="upload-portal-heading">
          <h2 id="upload-portal-heading" className="sr-only">Upload portal status</h2>
          <UploadPortalClient token={token} />
        </section>
      </div>
    </div>
  );
}
