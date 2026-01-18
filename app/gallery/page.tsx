"use client";

import Image from 'next/image';
import { useState } from 'react';
import { site } from '../../src/content/site';

export default function GalleryPage() {
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-5xl px-5 pt-[72px] pb-20">
      <div className="mb-12 text-center space-y-3">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Gallery</p>
        <h1 className="font-heading text-4xl font-semibold text-charcoal">Favorite moments</h1>
        <p className="text-sm text-muted">Tap a photo to enlarge. Add your own by replacing files in /public/photos.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {site.galleryImages.map((src) => (
          <button
            type="button"
            key={src}
            onClick={() => setActive(src)}
            className="group relative aspect-square overflow-hidden rounded-2xl border border-stone bg-white focus:outline-none focus:ring-2 focus:ring-charcoal/30"
          >
            <Image
              src={src}
              alt="Wedding memory"
              fill
              sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
              className="object-cover transition duration-300 group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      {active && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setActive(null)}
        >
          <div className="relative max-h-[90vh] max-w-4xl w-full overflow-hidden rounded-2xl bg-white border border-stone">
            <button
              type="button"
              onClick={() => setActive(null)}
              className="absolute right-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-charcoal shadow-sm"
            >
              Close
            </button>
            <div className="relative aspect-[4/3]">
              <Image
                src={active}
                alt="Wedding memory enlarged"
                fill
                className="object-contain bg-sand"
                sizes="100vw"
                priority
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
