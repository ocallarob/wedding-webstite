import Image from 'next/image';
import { Monogram } from '../../src/components/Monogram';
import { site } from '../../src/content/site';

export default function SaveTheDatePage() {
  return (
    <div className="flex min-h-screen flex-col bg-ivory text-charcoal md:grid md:h-screen md:grid-cols-2 md:overflow-hidden">
      <div className="flex items-center justify-center px-6 py-10 md:h-screen">
        <div className="relative w-full max-w-[520px]">
          <div className="relative mx-auto aspect-[3/4] h-full max-h-[90vh] overflow-hidden rounded-[26px] border border-stone/70 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.9),rgba(248,244,235,0.95))] shadow-[0_20px_60px_-45px_rgba(0,0,0,0.35)]">
            <div className="pointer-events-none absolute inset-6 rounded-[18px] border border-stone/60 opacity-50" aria-hidden />

            <div className="relative flex h-full flex-col px-10 py-12 text-center md:text-left">
              <div className="basis-1/6 flex flex-col items-center gap-4 md:items-start">
                <Monogram size={72} />
                <p className="text-1xl uppercase tracking-[0.32em] text-muted">
                  Save the date
                </p>
              </div>

              <div className="basis-1/6" />

              <div className="basis-3/6 flex flex-col space-y-10">
                <div className="basis-1/3 space-y-3">
                  <h1 className="font-heading text-5xl font-semibold tracking-[0.08em] text-charcoal">
                    {site.coupleNames}
                  </h1>
                  <p className="text-sm uppercase tracking-[0.28em] text-muted">{site.dateText}</p>
                  <a href='https://www.lougherneresort.com/' target='_blank' rel='noopener noreferrer' className="underline hover:text-charcoal/80 text-sm">{site.locationHotel}</a>
                  <p className="text-sm text-muted">{site.locationText}</p>
                </div>

                <div className="basis-1/3"/>

                <div className="basis-1/3 space-y-6">
                  <div className="border-t border-stone/50" />
                  <div className="space-y-2 text-sm text-muted">
                    <p className="rounded-xl border border-stone/60 bg-white/70 px-5 py-3">
                      Formal invitation to follow.
                    </p>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-charcoal/60">
                      More details soon
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative w-full aspect-[3/4] md:h-screen md:aspect-auto">
        <Image
          src={site.heroImage}
          alt="The happy couple"
          fill
          className="bg-sand object-contain md:object-cover"
          priority
          sizes="(min-width: 768px) 50vw, 100vw"
        />
      </div>
    </div>
  );
}
