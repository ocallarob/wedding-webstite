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
      { url: '/photos/ar-monogram.png', media: '(prefers-color-scheme: light)' },
      { url: '/photos/ar-monogram-white.png', media: '(prefers-color-scheme: dark)' },
    ],
    shortcut: '/photos/ar-monogram.png',
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
