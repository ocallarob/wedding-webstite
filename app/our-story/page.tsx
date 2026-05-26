import Image from 'next/image';
import { site } from '../../src/content/site';

export default function OurStoryPage() {
  return (
    <div className="relative overflow-hidden bg-ivory">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(219,184,184,0.18),transparent_52%),radial-gradient(circle_at_88%_22%,rgba(143,168,136,0.14),transparent_34%)]" />
      <div className="relative mx-auto max-w-6xl space-y-10 px-5 pb-20 pt-[84px]">
        <header className="rounded-3xl border border-stone/80 bg-ivory/80 px-6 py-10 text-center shadow-[0_18px_50px_rgba(58,53,48,0.07)] backdrop-blur-sm sm:px-10">
          <p className="text-xs uppercase tracking-[0.26em] text-mauve">Our Story</p>
          <h1 className="mt-2 font-heading text-4xl font-light tracking-[0.05em] text-charcoal sm:text-5xl">From Galway to Fermanagh</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted">
            We met on the slip in Galway, did long distance, moved to London, travelled a lot, and got engaged on Dog&apos;s Bay.
          </p>
        </header>

        <section className="grid gap-8 rounded-2xl border border-stone bg-ivory/85 p-6 shadow-[0_10px_30px_rgba(58,53,48,0.05)] md:grid-cols-[1.1fr_0.9fr] md:p-8">
          <div className="space-y-4">
            <h2 className="font-heading text-3xl text-mauve">How We Met</h2>
            <ol className="relative ml-1 space-y-4 border-l border-stone/80 pl-6">
              {site.ourStoryTimeline.map((item, index) => (
                <li key={item} className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-[31px] top-5 h-2.5 w-2.5 rounded-full border border-mauve/70 bg-ivory"
                  />
                  <div className="rounded-xl border border-stone/70 bg-ivory/75 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-mauve/85">
                      {index === 0 ? '2020' : index === 1 ? '2021' : index === 2 ? '2022' : index === 3 ? '2022-2024' : '2024'}
                    </p>
                    <p className="mt-1 text-sm leading-7 text-charcoal">{item}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="overflow-hidden rounded-xl border border-stone/70 bg-ivory/70 p-3">
            <Image
              src="/photos/dogs-bay.png"
              alt="Sketch of Dog's Bay"
              width={1536}
              height={2048}
              className="h-auto w-full rounded-lg object-cover"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-stone bg-ivory/85 p-6 shadow-[0_10px_30px_rgba(58,53,48,0.05)] md:p-8">
          <h2 className="font-heading text-3xl text-mauve">Photos</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {site.galleryImages.slice(0, 6).map((imageSrc, index) => (
              <div key={imageSrc} className="overflow-hidden rounded-xl border border-stone/75 bg-ivory/80 p-2">
                <Image
                  src={imageSrc}
                  alt={`Our story photo ${index + 1}`}
                  width={1200}
                  height={900}
                  className="h-52 w-full rounded-lg object-cover"
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
