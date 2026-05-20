export default function GalleryPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 pt-[72px] pb-20">
      <div className="rounded-3xl border border-stone/80 bg-[#fffdf9] p-2 shadow-[0_22px_44px_rgba(89,70,80,0.08)]">
        <div className="rounded-[1.35rem] border border-blush/80 bg-gradient-to-b from-[#fffdf9] to-[#fff7f5] px-8 py-14 text-center space-y-4">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Gallery</p>
          <h1 className="font-heading text-4xl font-semibold text-charcoal">Coming Soon</h1>
          <p className="text-sm leading-7 text-muted">
            We&rsquo;ll share photos and favorite moments here after the celebrations.
          </p>
        </div>
      </div>
    </div>
  );
}
