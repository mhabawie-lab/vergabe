import type { Metadata, Viewport } from 'next';
import { THEME_INIT_SCRIPT } from '@/components/layout/theme-toggle';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'SicherVergabe',
    template: '%s · SicherVergabe',
  },
  description:
    'Intelligente Plattform für öffentliche und private Ausschreibungen: sammeln, vereinheitlichen, analysieren und bewerten.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f6f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0d13' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint — prevents a flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-surface-base text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
