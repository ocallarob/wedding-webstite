import Image from 'next/image';
import { Monogram } from '../../src/components/Monogram';
import { site } from '../../src/content/site';

export default function SaveTheDatePage() {
  return (
    <div className="flex min-h-screen flex-col bg-ivory text-charcoal md:grid md:h-screen md:grid-cols-2 md:overflow-hidden">
      <div className="flex items-center justify-center px-4 py-8 md:h-screen md:px-6 md:py-10">
        <div className="relative w-full max-w-[520px]">
          <div className="relative mx-auto aspect-[3/4] w-full max-h-[90vh] overflow-hidden rounded-[26px] border border-stone/70 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.9),rgba(248,244,235,0.95))] shadow-[0_20px_60px_-45px_rgba(0,0,0,0.35)]">
            <div className="pointer-events-none absolute inset-6 rounded-[18px] border border-stone/60 opacity-50" aria-hidden />

            <div className="relative grid h-full grid-rows-[auto,1fr,auto] gap-6 px-8 py-10 text-center md:gap-8 md:px-10 md:py-12 md:text-left">
              <div className="flex flex-col items-center gap-4 md:items-start">
                <Monogram size={72} />
                <p className="text-xs uppercase tracking-[0.32em] text-muted md:text-sm">
                  Save the date
                </p>
              </div>

              <div className="flex flex-col items-center justify-center space-y-8 md:items-start md:space-y-10">
                <div className="space-y-3">
                  <h1 className="font-heading text-[clamp(2.3rem,4.3vw,3.5rem)] font-semibold tracking-[0.08em] text-charcoal">
                    {site.coupleNames}
                  </h1>
                  <p className="text-xs uppercase tracking-[0.28em] text-muted md:text-sm">{site.dateText}</p>
                  <a
                    href="https://www.lougherneresort.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm underline hover:text-charcoal/80"
                  >
                    {site.locationHotel}
                  </a>
                  <p className="text-sm text-muted">{site.locationText}</p>
                </div>
              </div>

              <div className="space-y-4 text-sm text-muted">
                <div className="border-t border-stone/50" />
                <div className="space-y-2">
                  <br/>
                  {/* <p className="rounded-xl border border-stone/60 bg-white/70 px-5 py-3 text-charcoal"> */}
                  {/* <p className="rounded-xl px-5 py-3 text-charcoal">
                    Formal invitation to follow.
                  </p> */}
                  <p className="text-[11px] uppercase tracking-[0.2em] text-charcoal/60">
                    More details soon
                  </p>
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
