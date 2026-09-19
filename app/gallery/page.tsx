import type { Metadata } from 'next';
import Image from 'next/image';
import { GalleryClient } from './GalleryClient';
import { isValidGalleryCapability } from '../../src/lib/galleryCapabilities';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

function InvalidGalleryLink() {
  return (
    <div className="mx-auto max-w-2xl px-5 pb-20 pt-[96px]">
      <div className="rounded-3xl border border-red-200 bg-red-50/80 p-8 text-center">
        <p className="text-xs uppercase tracking-[0.24em] text-red-700">Gallery link unavailable</p>
        <h1 className="mt-3 font-heading text-4xl font-light text-charcoal">This Gallery link is not valid</h1>
        <p className="mt-4 text-sm leading-7 text-red-700">
          Use the link from the Gallery announcement, or ask the couple for a current link.
        </p>
      </div>
    </div>
  );
}

type Props = {
  searchParams: Promise<{ token?: string }>;
};

export default async function GalleryPage({ searchParams }: Props) {
  const { token } = await searchParams;

  if (!token || !(await isValidGalleryCapability(token))) {
    return <InvalidGalleryLink />;
  }

  return (
    <div className="relative overflow-hidden bg-ivory">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(219,184,184,0.18),transparent_52%),radial-gradient(circle_at_88%_22%,rgba(143,168,136,0.14),transparent_34%)]" />
      <div className="relative mx-auto max-w-6xl space-y-10 px-5 pb-20 pt-[84px]">
        <header className="rounded-3xl border border-stone/80 bg-ivory/80 px-6 py-10 text-center shadow-[0_18px_50px_rgba(58,53,48,0.07)] backdrop-blur-sm sm:px-10">
          <p className="text-xs uppercase tracking-[0.26em] text-mauve">Gallery</p>
          <div className="mt-2 flex items-center gap-4 sm:gap-6">
            <Image
              src="/assets/divider-line-transparent.png"
              alt=""
              aria-hidden
              width={388}
              height={50}
              className="hidden h-auto w-20 flex-1 opacity-70 sm:block sm:w-28"
            />
            <h1 className="font-heading text-4xl font-light tracking-[0.05em] text-charcoal sm:text-5xl">Our Moments</h1>
            <Image
              src="/assets/divider-line-transparent.png"
              alt=""
              aria-hidden
              width={388}
              height={50}
              className="hidden h-auto w-20 flex-1 opacity-70 sm:block sm:w-28"
            />
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted">
            Published memories from our wedding weekend.
          </p>
        </header>

        <section className="rounded-2xl border border-stone bg-ivory/85 p-6 shadow-[0_10px_30px_rgba(58,53,48,0.05)]" aria-labelledby="published-gallery-heading">
          <h2 id="published-gallery-heading" className="sr-only">Published event gallery assets</h2>
          <GalleryClient token={token} />
        </section>
      </div>
    </div>
  );
}
