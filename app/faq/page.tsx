import Image from 'next/image';
import Link from 'next/link';
import { site } from '../../src/content/site';

export default function FaqPage() {
  return (
    <div className="relative overflow-hidden bg-ivory">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(219,184,184,0.18),transparent_52%),radial-gradient(circle_at_88%_22%,rgba(143,168,136,0.14),transparent_34%)]" />
      <div className="relative mx-auto max-w-6xl space-y-10 px-5 pb-20 pt-[84px]">
        <header className="rounded-3xl border border-stone/80 bg-ivory/80 px-6 py-10 text-center shadow-[0_18px_50px_rgba(58,53,48,0.07)] backdrop-blur-sm sm:px-10">
          <p className="text-xs uppercase tracking-[0.26em] text-mauve">FAQ</p>
          <div className="mt-2 flex items-center gap-4 sm:gap-6">
            <Image src="/assets/divider-line-transparent.png" alt="" aria-hidden width={388} height={50} className="hidden h-auto w-20 flex-1 opacity-70 sm:block sm:w-28" />
            <h1 className="font-heading text-4xl font-light tracking-[0.05em] text-charcoal sm:text-5xl">Questions & Answers</h1>
            <Image src="/assets/divider-line-transparent.png" alt="" aria-hidden width={388} height={50} className="hidden h-auto w-20 flex-1 opacity-70 sm:block sm:w-28" />
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted">
            Everything you might need before the big weekend.
          </p>
        </header>

        <section className="rounded-2xl border border-stone bg-ivory/85 p-6 shadow-[0_10px_30px_rgba(58,53,48,0.05)] md:p-8">
          <div className="space-y-3">
            {site.travel.faq.map((item) => (
              <details key={item.question} className="group rounded-xl border border-stone/70 bg-ivory/90 p-4">
                <summary className="cursor-pointer list-none pr-8 text-sm font-medium tracking-[0.01em] text-charcoal">
                  {item.question}
                </summary>
                <p className="mt-3 text-sm leading-7 text-muted">{item.answer}</p>
                {'linkHref' in item && 'linkLabel' in item && item.linkHref && item.linkLabel && (
                  <Link
                    href={item.linkHref}
                    className="mt-2 inline-flex items-center gap-1 text-xs uppercase tracking-[0.18em] text-mauve no-underline hover:underline"
                  >
                    {item.linkLabel}
                  </Link>
                )}
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
