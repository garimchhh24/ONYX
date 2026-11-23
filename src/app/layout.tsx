import '@fontsource-variable/inter';
import '@fontsource-variable/sora';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers/Providers';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'CADENCE — Trade with intention', template: '%s · CADENCE' },
  description: 'CADENCE is an AI-powered futures trading journal: screenshot trade capture, 30-second smart journaling, advanced analytics and prop account tracking.',
  applicationName: 'CADENCE',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-64.png', sizes: '64x64', type: 'image/png' },
      { url: '/brand/cadence-symbol-small.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: 'Cadence', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
  openGraph: {
    title: 'CADENCE — Trade with intention',
    description: 'AI-powered futures trading journal.',
    images: [{ url: '/brand/og.png', width: 1200, height: 630 }],
    type: 'website',
  },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  themeColor: '#0B0B0F',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <div className="cadence-backdrop" aria-hidden />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
