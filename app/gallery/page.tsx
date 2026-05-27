import Image from 'next/image';

const galleryPlaceholders = [
  '/photos/1.svg',
  '/photos/2.svg',
  '/photos/3.svg',
  '/photos/4.svg',
  '/photos/5.svg',
  '/photos/6.svg',
  '/photos/7.svg',
  '/photos/8.svg',
  '/photos/9.svg',
];

export default function GalleryPage() {
  return (
    <div className="relative overflow-hidden bg-ivory">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(219,184,184,0.18),transparent_52%),radial-gradient(circle_at_88%_22%,rgba(143,168,136,0.14),transparent_34%)]" />
      <div className="relative mx-auto max-w-6xl space-y-10 px-5 pb-20 pt-[84px]">
        <header className="rounded-3xl border border-stone/80 bg-ivory/80 px-6 py-10 text-center shadow-[0_18px_50px_rgba(58,53,48,0.07)] backdrop-blur-sm sm:px-10">
          <p className="text-xs uppercase tracking-[0.26em] text-mauve">Gallery</p>
          <div className="mt-2 flex items-center gap-4 sm:gap-6">
            <Image src="/assets/divider-line-transparent.png" alt="" aria-hidden width={388} height={50} className="h-auto w-20 flex-1 opacity-70 sm:w-28" />
            <h1 className="font-heading text-4xl font-light tracking-[0.05em] text-charcoal sm:text-5xl">Our Moments</h1>
            <Image src="/assets/divider-line-transparent.png" alt="" aria-hidden width={388} height={50} className="h-auto w-20 flex-1 opacity-70 sm:w-28" />
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted">
            A few favorites from our journey so far.
          </p>
        </header>

        <section className="rounded-2xl border border-stone bg-ivory/85 p-6 shadow-[0_10px_30px_rgba(58,53,48,0.05)]">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {galleryPlaceholders.map((imageSrc, index) => (
              <div key={imageSrc} className="overflow-hidden rounded-xl border border-stone/75 bg-ivory/80 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageSrc}
                  alt={`Gallery placeholder ${index + 1}`}
                  className="h-56 w-full rounded-lg object-contain"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
