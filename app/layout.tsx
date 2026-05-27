import type { Metadata } from 'next';
import { Charmonman, Cormorant_Garamond, Jost } from 'next/font/google';
import './globals.css';
import { site } from '../src/content/site';
import { SiteFrame } from '../src/components/SiteFrame';

const heading = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-heading',
  display: 'swap',
});

const body = Jost({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-body',
  display: 'swap',
});

const script = Charmonman({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '700'],
  variable: '--font-script',
  display: 'swap',
});

export const metadata: Metadata = {
  title: `${site.coupleNames} | Wedding Weekend`,
  description: `${site.coupleNames} celebrate at ${site.locationText} on ${site.dateText}.`,
  icons: {
    icon: [
      {
        url: '/assets/monogram-transparent.png',
        sizes: '16x16',
        type: 'image/png',
      },
      {
        url: '/assets/monogram-transparent.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: '/assets/monogram-transparent.png',
        sizes: '64x64',
        type: 'image/png',
      },
      {
        url: '/assets/monogram-transparent.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: {
      url: '/assets/monogram.png',
      sizes: '180x180',
      type: 'image/png',
    },

    // shortcut: '/assets/monogram-transparent.png',
  },

};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} ${script.variable}`}>
      <body className="font-body">
        <SiteFrame coupleNames={site.coupleNames} dateText={site.dateText} locationText={site.locationText}>
          {children}
        </SiteFrame>
      </body>
    </html>
  );
}
