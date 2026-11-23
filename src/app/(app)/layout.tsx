'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { FullScreenLoader } from '@/components/brand/Logo';
import { AppShell } from '@/components/shell/AppShell';
import { useAuth } from '@/lib/auth/AuthProvider';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { enabled, ready, user, localMode } = useAuth();
  const router = useRouter();
  const blocked = enabled && ready && !user && !localMode;
  useEffect(() => {
    if (blocked) router.replace('/login');
  }, [blocked, router]);
  if (!ready || blocked) return <FullScreenLoader />;
  return <AppShell>{children}</AppShell>;
}
