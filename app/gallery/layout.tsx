import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasGalleryAccess } from '../../src/lib/galleryAuth';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// The real gate for every guest/admin gallery API is its own auth check;
// this layout only keeps the page itself from rendering (or being indexed)
// without a valid session. Navigation visibility is never treated as authorization.
export default async function GalleryLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasGalleryAccess())) notFound();
  return <>{children}</>;
}
