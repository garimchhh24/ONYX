'use client';

import { MotionConfig } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { isArtifactRuntime } from '@/lib/runtime';
import { ToastProvider } from '../ui/overlay';

function ServiceWorker() {
  useEffect(() => {
    if (isArtifactRuntime || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production' && !process.env.NEXT_PUBLIC_SW_DEV) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <AuthProvider>
          <ServiceWorker />
          {children}
        </AuthProvider>
      </ToastProvider>
    </MotionConfig>
  );
}
