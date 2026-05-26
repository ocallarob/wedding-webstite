import Image from 'next/image';
import { site } from '../../../src/content/site';
import { PaperRsvpLookup } from './PaperRsvpLookup';

type Props = {
  searchParams: Promise<{ code?: string }>;
};

export default async function PaperRsvpPage({ searchParams }: Props) {
  const params = await searchParams;
  const code = params.code?.trim() ?? '';
  const expectedCode = process.env.PAPER_RSVP_CODE?.trim() ?? '';
  const allowed = !!code && !!expectedCode && code === expectedCode;

  if (!allowed) {
    return (
      <div className="mx-auto max-w-xl px-5 pt-[72px] pb-20 text-center space-y-4">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">RSVP</p>
        <h1 className="font-heading text-3xl font-light text-charcoal">Private RSVP page</h1>
        <p className="text-sm text-muted leading-7">
          This page is only available through the paper invite QR code.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 pt-[72px] pb-20 space-y-8">
      <header className="rounded-3xl border border-stone/80 bg-[#fffdf9] p-2 shadow-[0_22px_44px_rgba(89,70,80,0.08)]">
        <div className="rounded-[1.35rem] border border-blush/80 bg-gradient-to-b from-[#fffdf9] to-[#fff7f5] px-7 py-7 text-center">
          <div className="flex items-start justify-between">
            <Image src="/assets/menlo-castle-rsvp.png" alt="" width={116} height={58} className="h-14 w-auto opacity-80" />
            <Image src="/assets/devenish-tower-rsvp.png" alt="" width={116} height={58} className="h-14 w-auto opacity-80" />
          </div>
          <p className="mt-3 font-script text-[28px] leading-none text-[#95ad92]">le grá agus le háthas</p>
          <h1 className="mt-3 font-heading text-4xl font-medium text-[#9b7b8d]">RSVP</h1>
          <p className="mt-2 font-script text-[28px] leading-none text-[#d99d9d]">paper invite lookup</p>
          <div className="mx-auto mt-4 max-w-[360px]">
            <Image src="/assets/divider-line.svg" alt="" width={430} height={20} className="h-auto w-full opacity-70" />
          </div>
          <p className="mt-4 text-sm text-muted">{site.rsvpDeadline}</p>
        </div>
      </header>

      <PaperRsvpLookup code={code} />
    </div>
  );
}
