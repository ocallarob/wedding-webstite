import type { Metadata } from 'next';
import { Inter, Cormorant_Garamond } from 'next/font/google';
import './globals.css';
import { site } from '../src/content/site';
import { SiteFrame } from '../src/components/SiteFrame';

const heading = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-heading',
  display: 'swap',
});

const body = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: `${site.coupleNames} | Wedding Weekend`,
  description: `${site.coupleNames} celebrate at ${site.locationText} on ${site.dateText}.`,
  icons: {
    icon: [
      // Light mode
      {
        url: '/photos/ar-monogram-16.png',
        sizes: '16x16',
        type: 'image/png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/photos/ar-monogram-32.png',
        sizes: '32x32',
        type: 'image/png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/photos/ar-monogram-64.png',
        sizes: '64x64',
        type: 'image/png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/photos/ar-monogram.png',
        sizes: '512x512',
        type: 'image/png',
        media: '(prefers-color-scheme: light)',
      },

      // Dark mode
      {
        url: '/photos/ar-monogram-white-16.png',
        sizes: '16x16',
        type: 'image/png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/photos/ar-monogram-white-32.png',
        sizes: '32x32',
        type: 'image/png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/photos/ar-monogram-white-64.png',
        sizes: '64x64',
        type: 'image/png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/photos/ar-monogram-white.png',
        sizes: '512x512',
        type: 'image/png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    apple: {
      url: '/photos/ar-monogram-180.png',
      sizes: '180x180',
      type: 'image/png',
    },

    // shortcut: '/photos/ar-monogram-32.png',
  },

};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body className="font-body">
        <SiteFrame coupleNames={site.coupleNames} dateText={site.dateText} locationText={site.locationText}>
          {children}
        </SiteFrame>
      </body>
    </html>
  );
}
