import Image from 'next/image';

export default function OurStoryPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-5 pb-20 pt-[84px]">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.25em] text-muted">Our Story</p>
        <h1 className="font-heading text-4xl font-semibold text-charcoal">From Galway to Fermanagh</h1>
        <p className="mx-auto max-w-2xl text-sm leading-7 text-muted">
          A short look at our journey so far, and the moments that led us here.
        </p>
      </header>

      <section className="grid gap-8 rounded-2xl border border-stone bg-ivory/80 p-6 md:grid-cols-[1.1fr_0.9fr] md:p-8">
        <div className="space-y-4">
          <h2 className="font-heading text-3xl text-mauve">How We Met</h2>
          <p className="text-sm leading-7 text-charcoal">
            We met in Galway in August 2020. What started as easy conversation and shared adventures quickly became
            something bigger, and we have been building a life together ever since.
          </p>
          <p className="text-sm leading-7 text-charcoal">
            Across road trips, family gatherings, and many cups of tea, we found home in each other. In 2024, Rob
            proposed on Dog&apos;s Bay in Connemara.
          </p>
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

      <section className="rounded-2xl border border-stone bg-ivory/80 p-6 md:p-8">
        <h2 className="font-heading text-3xl text-mauve">The Next Chapter</h2>
        <p className="mt-4 text-sm leading-7 text-charcoal">
          We cannot wait to celebrate this next chapter with the people who have supported us and shared in our lives.
          Thank you for being part of our story.
        </p>
      </section>
    </div>
  );
}
