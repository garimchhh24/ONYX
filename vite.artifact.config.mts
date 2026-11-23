/**
 * Builds the claude.ai preview of CADENCE: one self-contained HTML page (npm run build:preview).
 * Next.js-only modules are swapped for small shims; nothing server-side is included.
 */
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  publicDir: false,
  resolve: {
    alias: [
      { find: /^next\/link$/, replacement: here('./src/artifact/next-link.tsx') },
      { find: /^next\/navigation$/, replacement: here('./src/artifact/next-navigation.ts') },
      { find: /^@supabase\/supabase-js$/, replacement: here('./src/artifact/supabase-stub.ts') },
      { find: '@', replacement: here('./src') },
    ],
  },
  define: {
    'process.env.NEXT_PUBLIC_CADENCE_RUNTIME': JSON.stringify('artifact'),
    'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(''),
    'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(''),
    'process.env.NEXT_PUBLIC_SW_DEV': JSON.stringify(''),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: here('./artifact-dist'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      input: here('./artifact.html'),
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return; // 'use client'
        warn(warning);
      },
    },
  },
});
