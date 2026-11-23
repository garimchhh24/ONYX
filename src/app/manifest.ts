import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'CADENCE — Trade with intention',
    short_name: 'Cadence',
    description: 'AI-powered futures trading journal.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0B0B0F',
    theme_color: '#0B0B0F',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Analyze a trade', short_name: 'Analyze', url: '/analyze', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Journal', url: '/journal', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
