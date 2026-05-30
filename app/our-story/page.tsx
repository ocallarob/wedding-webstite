import Image from 'next/image';
import { unstable_noStore as noStore } from 'next/cache';
import { site } from '../../src/content/site';

const timelineYears = ['2020', '2021', '2022', '2022-2024', '2024'] as const;
const STORY_PHOTO_COUNT = 6;
const FEATURE_PHOTO = '/photos/couple-ourstory.jpg';
const STORY_EXCLUDED_PHOTOS = new Set([FEATURE_PHOTO]);

function pickRandomPhotos(images: readonly string[], count: number): string[] {
  const shuffled = [...images];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export default function OurStoryPage() {
  noStore();
  const storyPhotoPool = site.galleryImages.filter((image) => !STORY_EXCLUDED_PHOTOS.has(image));
  const storyPhotos = pickRandomPhotos(storyPhotoPool, STORY_PHOTO_COUNT);

  return (
    <div className="relative overflow-hidden bg-ivory">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(219,184,184,0.18),transparent_52%),radial-gradient(circle_at_88%_22%,rgba(143,168,136,0.14),transparent_34%)]" />
      <div className="relative mx-auto max-w-6xl space-y-10 px-5 pb-20 pt-[84px]">
        <header className="rounded-3xl border border-stone/80 bg-ivory/80 px-6 py-10 text-center shadow-[0_18px_50px_rgba(58,53,48,0.07)] backdrop-blur-sm sm:px-10">
          <p className="text-xs uppercase tracking-[0.26em] text-mauve">Our Story</p>
          <div className="mt-2 flex items-center gap-4 sm:gap-6">
            <Image src="/assets/divider-line-transparent.png" alt="" aria-hidden width={388} height={50} className="hidden h-auto w-20 flex-1 opacity-70 sm:block sm:w-28" />
            <h1 className="font-heading text-4xl font-light tracking-[0.05em] text-charcoal sm:text-5xl">From Galway to Fermanagh</h1>
            <Image src="/assets/divider-line-transparent.png" alt="" aria-hidden width={388} height={50} className="hidden h-auto w-20 flex-1 opacity-70 sm:block sm:w-28" />
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted">
            We met on the slip in Galway, did long distance, moved to London, travelled a lot, and got engaged on Dog&apos;s Bay.
          </p>
        </header>

        <section className="grid gap-8 rounded-2xl border border-stone bg-ivory/85 p-6 shadow-[0_10px_30px_rgba(58,53,48,0.05)] md:grid-cols-[1.1fr_0.9fr] md:p-8">
          <div className="space-y-4">
            <h2 className="font-heading text-3xl font-light tracking-[0.04em] text-mauve">Alannah & Rob</h2>
            <ol className="relative ml-1 space-y-6 border-l border-stone/80 pl-7">
              {site.ourStoryTimeline.map((item, index) => (
                <li key={item} className="relative pb-1">
                  <span
                    aria-hidden
                    className="absolute -left-[34px] top-1 h-3 w-3 rounded-full border border-mauve/80 bg-ivory shadow-[0_0_0_4px_rgba(255,250,245,0.95)]"
                  />
                  <p className="text-xs uppercase tracking-[0.24em] text-mauve/90">
                    {timelineYears[index] ?? ''}
                  </p>
                  <p className="mt-2 max-w-[34ch] text-sm leading-7 text-charcoal/95">
                    {item}
                  </p>
                </li>
              ))}
            </ol>
          </div>
          <div className="overflow-hidden rounded-xl bg-ivory/70">
            <Image
              src={FEATURE_PHOTO}
              alt="Alannah and Rob together outdoors"
              width={1536}
              height={1536}
              className="aspect-square w-full rounded-xl border border-stone/65 object-cover object-[52%_40%]"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-stone bg-ivory/85 p-6 shadow-[0_10px_30px_rgba(58,53,48,0.05)] md:p-8">
          <h2 className="font-heading text-3xl text-mauve">Photos</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {storyPhotos.map((imageSrc, index) => (
              <div key={imageSrc} className="overflow-hidden rounded-xl border border-stone/75 bg-ivory/80 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageSrc}
                  alt={`Our story photo ${index + 1}`}
                  className={`aspect-[3/4] w-full rounded-lg ${
                    imageSrc === '/photos/couple-01.jpg' ? 'bg-ivory object-contain' : 'object-cover'
                  }`}
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-stone bg-ivory/85 p-6 shadow-[0_10px_30px_rgba(58,53,48,0.05)] md:p-8">
          <h2 className="font-heading text-3xl text-mauve">The Next Chapter</h2>
          <p className="mt-4 text-sm leading-7 text-charcoal">
            We cannot wait to celebrate this next chapter with the people who have supported us and shared in our lives.
            Thank you for being part of our story.
          </p>
        </section>
      </div>
    </div>
  );
}
