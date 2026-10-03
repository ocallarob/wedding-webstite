'use client';

import Link from 'next/link';
import { useEffect, useState, type MouseEventHandler } from 'react';
import {
  clearGalleryToken,
  GALLERY_ACCESS_EVENT,
  getStoredGalleryToken,
} from '../lib/galleryAccess';

export function useGalleryAccessToken(): string | null {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setToken(getStoredGalleryToken());
    sync();

    window.addEventListener(GALLERY_ACCESS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(GALLERY_ACCESS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return token;
}

type GalleryAccessLinkProps = {
  className: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export function GalleryAccessLink({ className, onClick }: GalleryAccessLinkProps) {
  const token = useGalleryAccessToken();
  if (!token) return null;

  return (
    <Link
      href={`/gallery?token=${encodeURIComponent(token)}`}
      onClick={onClick}
      className={className}
    >
      Gallery
    </Link>
  );
}

export function GalleryAccessReset({ token }: { token?: string }) {
  useEffect(() => {
    if (token) clearGalleryToken(token);
  }, [token]);

  return null;
}
