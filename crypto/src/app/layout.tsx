import type { Metadata } from 'next';
import Link from 'next/link';

import { Nav } from '@/components/nav';

import './globals.css';

export const metadata: Metadata = {
  title: 'CryptoRadar',
  description:
    'Marktanalyse, Social-Stimmung und Papierhandel für Kryptowährungen — mit sichtbarer Unsicherheit.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        {/*
          Fonts are linked rather than bundled so a build without network access
          still succeeds; every family has a real fallback stack in globals.css.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/*
          eslint-disable-next-line @next/next/no-page-custom-font --
          The rule targets the pages router: a font linked from `pages/_document`
          is per-page there. In the app router this head is the document head for
          every route, so the stylesheet loads once.
        */}
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=Public+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-dvh antialiased">
        <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col lg:flex-row">
          <header className="border-b border-rule bg-paper lg:w-52 lg:shrink-0 lg:border-r lg:border-b-0">
            <div className="flex items-baseline justify-between px-4 py-4 lg:block">
              <Link href="/" className="font-display text-lg font-semibold tracking-tight">
                CryptoRadar
              </Link>
              <p className="eyebrow mt-0.5 lg:mt-1">Messen statt raten</p>
            </div>
            <Nav />
          </header>

          <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</main>
        </div>

        <footer className="border-t border-rule px-4 py-4 text-xs text-ink-faint lg:px-8">
          Keine Anlageberatung. Alle Bewertungen sind automatisch erzeugte Schätzungen mit
          angegebener Unsicherheit — sie sagen keine Kurse voraus.
        </footer>
      </body>
    </html>
  );
}
